import OpenAI from "openai";
import { decode as decodeHtml } from "he";
import { getPocketBaseClient } from "@/lib/pocketbase";

const OG_FETCH_TIMEOUT_MS = 3500;
const ENRICH_CONCURRENCY = 6;

const EXTRACTION_PROMPT = `Core task: Extract media recommendations from Hinglish chat.
Output: Strict JSON array [{title, type, sender, timestamp}]

Types: book | movie | tv_show | song | youtube

Classification rules:
- Link with Spotify/Apple Music → song
- Link with YouTube → youtube
- Text-only songs:
    - Require high confidence that the message is actually a song.
    - Do NOT classify ambiguous words or messages as songs.
    - Neutral/positive mentions still count as recommendations; clearly negative mentions are excluded.
- Movies/TV: STRICT. Need explicit recommendation or very enthusiastic intent. Series title only, no season/episode.
- Books: Include intent to read
- EXCLUDE: sports events, generic activities or anything that cannot be mapped to a specific book/movie/tv_show/song/youtube.

Title formatting:
- Canonical English title with articles (The/A/An)
- Songs: "Title — Artist" or URL if unknown
- Fix typos: 'social network' → 'The Social Network'

Copy timestamp exactly from message.`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res
        .status(500)
        .json({ ok: false, error: "Missing OPENAI_API_KEY" });
    }

    const { batch } = req.body || {};
    if (!Array.isArray(batch) || batch.length === 0) {
      return res.status(400).json({ ok: false, error: "Missing batch" });
    }

    const extracted = await extractWithLLM(batch, apiKey);

    const enriched = await enrichRecommendations(extracted);

    const saved = await saveToPocketBase(enriched);

    const progressTimestamp = batch[batch.length - 1]?.timestamp || "";
    if (progressTimestamp) {
      try {
        await upsertProgressTimestamp(progressTimestamp);
      } catch (e) {
        console.error("Failed updating progress_timestamp:", e);
      }
    }

    return res.status(200).json({ ok: true, items: saved, progressTimestamp });
  } catch (e) {
    console.error("Extract recommendations error:", e);
    return res.status(500).json({ ok: false, error: "Unexpected error" });
  }
}

async function extractWithLLM(batch, apiKey) {
  const client = new OpenAI({ apiKey });

  const completion = await client.chat.completions.create({
    model: "gpt-5-mini",
    messages: [
      {
        role: "system",
        content:
          "You are a precise data extractor. Respond only with valid JSON.",
      },
      {
        role: "user",
        content: `${EXTRACTION_PROMPT}\n\nMessages (JSON):\n${JSON.stringify(
          batch
        )}`,
      },
    ],
  });

  const rawResponse =
    completion?.choices?.[0]?.message?.content?.trim() || "[]";

  try {
    const items = JSON.parse(rawResponse);
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

async function enrichRecommendations(items) {
  async function enrichRecommendation(item) {
    const { type, sender, timestamp, title: rawTitle } = item;

    let title = String(rawTitle || "").trim();
    let link = null;
    let image_url = null;

    const url = extractUrl(title);

    if (url) {
      link = url;
      const ogData = await fetchOGMeta(url, OG_FETCH_TIMEOUT_MS);

      if (!ogData.title) return null;

      title = cleanTitle(decodeHtml(ogData.title));
      image_url = ogData.image || null;
    } else if (type === "movie" || type === "tv_show") {
      const tmdbData = await fetchTmdbMetadata(title, type);
      if (tmdbData) {
        title = tmdbData.title;
        image_url = tmdbData.image_url;
      }
    }

    return {
      title,
      type: String(type || "").trim(),
      mentioned_by: {
        sender: String(sender || "").trim(),
        timestamp: String(timestamp || "").trim(),
      },
      link,
      image_url,
    };
  }

  const results = [];
  for (let i = 0; i < items.length; i += ENRICH_CONCURRENCY) {
    const batch = items.slice(i, i + ENRICH_CONCURRENCY);
    const settled = await Promise.allSettled(batch.map(enrichRecommendation));

    for (const result of settled) {
      if (result.status === "fulfilled" && result.value?.title) {
        results.push(result.value);
      }
    }
  }

  return results;
}

async function saveToPocketBase(items) {
  if (!items?.length) return [];

  const pb = await getPocketBaseClient();
  const collection = pb.collection("chatrex_data_test");

  const groupedByTitle = groupAndDedupeMentions(items);
  const existingRecords = await batchFetchExisting(
    collection,
    Object.keys(groupedByTitle)
  );

  const writes = [];
  for (const [title, data] of Object.entries(groupedByTitle)) {
    const existing = existingRecords.get(title);

    if (existing) {
      const updatedMentions = mergeMentions(
        existing.mentioned_by,
        data.mentions
      );
      if (updatedMentions.length > existing.mentioned_by.length) {
        writes.push({
          type: "update",
          id: existing.id,
          data: { mentioned_by: updatedMentions },
          originalItem: data,
        });
      }
    } else {
      writes.push({
        type: "create",
        data: {
          title,
          type: data.type,
          mentioned_by: data.mentions,
          link: data.link || "",
          image_url: data.image_url || "",
        },
        originalItem: data,
      });
    }
  }

  const results = await executeWrites(collection, writes);

  return results;
}

function groupAndDedupeMentions(items) {
  const grouped = {};

  for (const item of items) {
    const { title, type, mentioned_by, link, image_url } = item;

    if (!grouped[title]) {
      grouped[title] = {
        title,
        type,
        link,
        image_url,
        mentions: [],
      };
    }

    // Check if this mention is a duplicate (same sender + date)
    const newDate = extractDate(mentioned_by.timestamp);
    const isDuplicate = grouped[title].mentions.some((m) => {
      const existingDate = extractDate(m.timestamp);
      return m.sender === mentioned_by.sender && existingDate === newDate;
    });

    if (!isDuplicate) {
      grouped[title].mentions.push(mentioned_by);
    }
  }

  return grouped;
}

async function batchFetchExisting(collection, titles) {
  if (!titles.length) return new Map();

  const filters = titles.map((t) => `title="${escapeForFilter(t)}"`);
  const filter = filters.join(" || ");

  try {
    const records = await collection.getFullList({ filter });
    const map = new Map();
    for (const record of records) {
      map.set(record.title, record);
    }
    return map;
  } catch (err) {
    console.error("Error batch fetching from PocketBase:", err);
    return new Map();
  }
}

function mergeMentions(existing, newMentions) {
  const existingList = Array.isArray(existing) ? existing : [];
  const merged = [...existingList];

  for (const newMention of newMentions) {
    const newDate = extractDate(newMention.timestamp);
    const isDuplicate = existingList.some((m) => {
      const existingDate = extractDate(m.timestamp);
      return m.sender === newMention.sender && existingDate === newDate;
    });

    if (!isDuplicate) {
      merged.push(newMention);
    }
  }

  return merged;
}

async function executeWrites(collection, writes) {
  const results = [];
  for (const write of writes) {
    try {
      if (write.type === "create") {
        const created = await collection.create(write.data);
        results.push({ ...write.originalItem, id: created.id });
      } else if (write.type === "update") {
        await collection.update(write.id, write.data);
        results.push({ ...write.originalItem, id: write.id });
      }
    } catch (e) {
      // Skip failed write but continue others
      console.error("Write failed", e);
    }
  }
  return results;
}

// Utility functions

function extractUrl(text) {
  const match = String(text || "").match(/https?:\/\/\S+/i);
  if (!match) return null;
  return match[0].replace(/[)\],.]+$/, "");
}

function cleanTitle(title) {
  return title.replace(/\s+on\s+Apple\s+Music\s*$/i, "").trim();
}

function extractDate(timestamp) {
  const match = String(timestamp || "").match(/^(\d{2}\/\d{2}\/\d{2})/);
  return match ? match[1] : "";
}

function escapeForFilter(str) {
  return String(str).replace(/"/g, '\\"');
}

async function fetchOGMeta(url, timeoutMs = 0) {
  const controller = new AbortController();
  const timer =
    timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Twitterbot/1.0)",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: controller.signal,
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const html = await response.text();
    const titleMatch = html.match(
      /<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i
    );
    const imageMatch = html.match(
      /<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i
    );

    return {
      title: titleMatch ? titleMatch[1] : null,
      image: imageMatch ? imageMatch[1] : null,
    };
  } catch {
    return { title: null, image: null };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function fetchTmdbMetadata(title, type) {
  try {
    const isTvShow = type === "tv_show";
    const endpoint = isTvShow ? "tv" : "movie";
    const query = encodeURIComponent(title);
    const apiKey = process.env.TMDB_API_KEY || "";

    const response = await fetch(
      `https://api.themoviedb.org/3/search/${endpoint}?api_key=${apiKey}&query=${query}&language=en-US&include_adult=false`
    );

    if (!response.ok) return null;

    const data = await response.json();
    const results = Array.isArray(data?.results) ? data.results : [];
    if (results.length === 0) return null;

    const normalize = (s) =>
      String(s || "")
        .trim()
        .toLowerCase();
    const normInput = normalize(title);

    let chosen = results.find(
      (r) => normalize(isTvShow ? r.name : r.title) === normInput
    );
    if (!chosen) {
      chosen = results.reduce((best, r) => {
        if (!best) return r;
        return (Number(r.popularity) || 0) > (Number(best.popularity) || 0)
          ? r
          : best;
      }, null);
    }
    if (!chosen) return null;

    const img = chosen.poster_path || chosen.backdrop_path || null;
    return {
      title: isTvShow ? chosen.name || title : chosen.title || title,
      image_url: img ? `https://image.tmdb.org/t/p/w185${img}` : null,
    };
  } catch {
    return null;
  }
}

async function upsertProgressTimestamp(value) {
  const pb = await getPocketBaseClient();
  const col = pb.collection("chatrex_meta_test");
  const key = "progress_timestamp";
  try {
    const existing = await col
      .getFirstListItem(`key = "${key}"`)
      .catch(() => null);
    if (existing) {
      await col.update(existing.id, { value });
    } else {
      await col.create({ key, value });
    }
  } catch (e) {
    console.error("Failed updating progress_timestamp:", e);
  }
}

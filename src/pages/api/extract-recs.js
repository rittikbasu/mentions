import OpenAI from "openai";
import { decode as decodeHtml } from "he";
import { getPocketBaseClient } from "@/lib/pocketbase";
import {
  COLLECTION_NAMES,
  OG_FETCH_TIMEOUT_MS,
  ENRICH_CONCURRENCY,
  OPENAI_MODEL,
  EXTRACTION_PROMPT,
} from "@/lib/constants";
import {
  extractUrl,
  cleanTitle,
  escapeForFilter,
  extractDate,
} from "@/lib/utils";
import { fetchOGMeta } from "@/lib/fetchOgMeta";
import { fetchTmdbMetadata } from "@/lib/fetchTmdb";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  try {
    const { batch } = req.body || {};
    if (!Array.isArray(batch) || batch.length === 0) {
      return res.status(400).json({ ok: false, error: "Missing batch" });
    }

    const { items: extracted, usage } = await extractWithLLM(batch);

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

    return res.status(200).json({
      ok: true,
      progressTimestamp,
      usage: {
        prompt_tokens: usage?.input_tokens || 0,
        completion_tokens: usage?.output_tokens || 0,
        total_tokens: usage?.total_tokens || 0,
      },
    });
  } catch (e) {
    console.error("Extract recommendations error:", e);
    return res.status(500).json({ ok: false, error: "Unexpected error" });
  }
}

async function extractWithLLM(batch) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY");
  }
  const client = new OpenAI({ apiKey });

  const result = await client.responses.create({
    model: OPENAI_MODEL,
    input: `${EXTRACTION_PROMPT}\n\nMessages (JSON):\n${JSON.stringify(batch)}`,
    reasoning: { effort: "medium" },
  });

  const rawResponse = result?.output_text || "[]";
  const usage = result?.usage || {};

  try {
    const items = JSON.parse(rawResponse);
    return {
      items: Array.isArray(items) ? items : [],
      usage,
    };
  } catch {
    return { items: [], usage };
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
  const collection = pb.collection(COLLECTION_NAMES.DATA);

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
      console.error("Write failed", e);
    }
  }
  return results;
}

async function upsertProgressTimestamp(value) {
  const pb = await getPocketBaseClient();
  const col = pb.collection(COLLECTION_NAMES.META);
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

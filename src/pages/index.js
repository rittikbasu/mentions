import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import Image from "next/image";
import PocketBase from "pocketbase";

const TYPE_OPTIONS = [
  { label: "Movies", value: "movie" },
  { label: "Shows", value: "tv_show" },
  { label: "Songs", value: "song" },
  { label: "Books", value: "book" },
  { label: "Youtube", value: "youtube" },
];

function getTypeBadgeClasses(type) {
  switch (type) {
    case "movie":
      return "bg-red-50 text-red-700 border-red-200";
    case "tv_show":
      return "bg-violet-50 text-violet-700 border-violet-200";
    case "song":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "youtube":
      return "bg-rose-50 text-rose-700 border-rose-200";
    case "book":
      return "bg-amber-50 text-amber-800 border-amber-200";
    default:
      return "bg-gray-100 text-gray-700 border-gray-200";
  }
}

function formatTypeLabel(type) {
  const found = TYPE_OPTIONS.find((t) => t.value === type);
  return found ? found.label : type;
}

function parseTimestampToMs(input) {
  if (!input && input !== 0) return 0;
  if (typeof input === "number") return input;
  const s = String(input).trim();
  if (/^\d+$/.test(s)) return Number(s);
  // Try native Date parsing first
  const parsed = Date.parse(s);
  if (!Number.isNaN(parsed)) return parsed;
  // Try custom MM/DD/YY, h:mm:ss AM/PM
  const m = s.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{2,4}),\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)$/i
  );
  if (m) {
    const month = Number(m[1]);
    const day = Number(m[2]);
    let year = Number(m[3]);
    if (year < 100) year += year < 70 ? 2000 : 1900; // assume 20xx for <70
    let hour = Number(m[4]);
    const minute = Number(m[5]);
    const second = Number(m[6]);
    const ampm = m[7].toUpperCase();
    if (ampm === "AM" && hour === 12) hour = 0;
    if (ampm === "PM" && hour !== 12) hour += 12;
    return new Date(year, month - 1, day, hour, minute, second).getTime();
  }
  return 0;
}

function Avatar({ sender }) {
  const [failed, setFailed] = useState(false);
  const initial = (sender || "?").charAt(0).toUpperCase();
  const src = `/pfp/${initial}.jpg`;
  if (!sender) return null;
  return failed ? (
    <div
      className="inline-flex h-7 w-7 shrink-0 select-none items-center justify-center rounded-full bg-gray-200 text-xs font-semibold text-gray-700 border border-black/5 dark:bg-white/10 dark:text-gray-200 dark:border-white/10"
      aria-label={`${sender} profile placeholder`}
      title={sender}
    >
      {initial}
    </div>
  ) : (
    <Image
      src={src}
      alt={`${sender} profile photo`}
      width={28}
      height={28}
      className="h-7 w-7 rounded-full border border-black/5 dark:border-white/10 object-cover"
      onError={() => setFailed(true)}
      priority={false}
    />
  );
}

export default function Home({ items }) {
  const router = useRouter();
  const [queryText, setQueryText] = useState("");
  const [activeType, setActiveType] = useState("");
  const [sortKey, setSortKey] = useState("mentions"); // mentions | latest
  const [error, setError] = useState(null);

  // Initialize state from URL
  useEffect(() => {
    if (!router.isReady) return;
    const { q, type, sort } = router.query;
    if (typeof q === "string") setQueryText(q);
    if (typeof type === "string") setActiveType(type);
    if (
      typeof sort === "string" &&
      (sort === "mentions" || sort === "latest")
    ) {
      setSortKey(sort);
    }
  }, [router.isReady, router.query]);

  // Sync URL query
  const syncQuery = (next) => {
    const q = next.q ?? queryText;
    const type = next.type ?? activeType;
    const sort = next.sort ?? sortKey;
    const newQuery = {
      ...(q ? { q } : {}),
      ...(type ? { type } : {}),
      ...(sort && sort !== "mentions" ? { sort } : {}),
    };
    router.replace({ pathname: router.pathname, query: newQuery }, undefined, {
      shallow: true,
    });
  };

  const computed = useMemo(() => {
    const norm = queryText.trim().toLowerCase();
    const filtered = items.filter((item) => {
      const matchesType = activeType === "" || item.type === activeType;
      if (!matchesType) return false;
      if (!norm) return true;
      const inTitle = (item.title || "").toLowerCase().includes(norm);
      const inSender = Array.isArray(item.mentioned_by)
        ? item.mentioned_by.some((m) =>
            (m.sender || "").toLowerCase().includes(norm)
          )
        : false;
      return inTitle || inSender;
    });

    const withMeta = filtered.map((item) => {
      const mentionCount = Array.isArray(item.mentioned_by)
        ? item.mentioned_by.length
        : 0;
      const latestMs =
        Array.isArray(item.mentioned_by) && item.mentioned_by.length > 0
          ? Math.max(
              ...item.mentioned_by.map((m) => parseTimestampToMs(m.timestamp))
            )
          : 0;
      return { ...item, _mentionCount: mentionCount, _latestMs: latestMs };
    });

    const sorted = [...withMeta].sort((a, b) => {
      if (sortKey === "latest") {
        if (b._latestMs !== a._latestMs) return b._latestMs - a._latestMs;
        if (b._mentionCount !== a._mentionCount)
          return b._mentionCount - a._mentionCount;
        return (a.title || "").localeCompare(b.title || "");
      }
      // default: mentions
      if (b._mentionCount !== a._mentionCount)
        return b._mentionCount - a._mentionCount;
      if (b._latestMs !== a._latestMs) return b._latestMs - a._latestMs;
      return (a.title || "").localeCompare(b.title || "");
    });

    return { list: sorted };
  }, [items, activeType, queryText, sortKey]);

  return (
    <div className="font-sans min-h-screen">
      <Head>
        <title>Mentions - from group chat</title>
        <meta
          name="description"
          content="Aggregate and browse media recommendations from your group chat"
        />
      </Head>

      <header className="sticky top-0 z-10 backdrop-blur supports-[backdrop-filter]:bg-background/70 bg-background/90 border-b border-black/5 dark:border-white/10">
        <div className="mx-auto max-w-5xl px-4 py-4">
          <h1 className="text-2xl font-bold tracking-tight">Mentions</h1>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="md:col-span-2">
              <label htmlFor="search" className="sr-only">
                Search
              </label>
              <input
                id="search"
                type="search"
                placeholder="Search by title or sender..."
                value={queryText}
                onChange={(e) => {
                  setQueryText(e.target.value);
                  syncQuery({ q: e.target.value });
                }}
                className="w-full rounded-md border border-black/10 dark:border-white/10 bg-white dark:bg-black/40 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              />
            </div>

            <div className="md:col-span-2 flex items-stretch gap-2 overflow-x-auto">
              {TYPE_OPTIONS.map((t) => {
                const isActive = activeType === t.value;
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => {
                      const next = isActive ? "" : t.value;
                      setActiveType(next);
                      syncQuery({ type: next });
                    }}
                    className={`shrink-0 rounded-md border px-2 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                      isActive
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-white dark:bg-black/40 border-black/10 dark:border-white/10 text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-white/5"
                    }`}
                    aria-pressed={isActive}
                    aria-label={
                      isActive
                        ? `${t.label} selected, click to clear`
                        : `Filter by ${t.label}`
                    }
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        {error ? (
          <div
            role="alert"
            className="rounded-md border border-red-200 bg-red-50 p-4 text-red-800"
          >
            Failed to load recommendations: {error}
          </div>
        ) : computed.list.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-lg font-semibold">No results</p>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              Try adjusting search or filters.
            </p>
          </div>
        ) : (
          <section
            aria-label="Recommendations"
            className="grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            {computed.list.map((item, idx) => (
              <article
                key={`${item.title}-${idx}`}
                className="rounded-lg border border-white/10 bg-black/40 p-4 shadow-sm"
                aria-labelledby={`rec-${idx}-title`}
              >
                <div className="flex gap-4">
                  <div className="w-28 h-40 flex items-center justify-center overflow-hidden rounded-md bg-white/2 border border-white/5">
                    {item.image_url ? (
                      <Image
                        src={item.image_url}
                        alt={item.title}
                        width={112}
                        height={160}
                        className="w-full h-full object-cover"
                        unoptimized
                        priority={false}
                      />
                    ) : (
                      <span className="text-xs text-gray-500">No image</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2">
                      <h2
                        id={`rec-${idx}-title`}
                        className="font-semibold text-base leading-tight break-words line-clamp-3"
                      >
                        {item.title}
                      </h2>
                      {/* <span
                        className={`ml-auto inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${getTypeBadgeClasses(
                          item.type
                        )}`}
                      >
                        {formatTypeLabel(item.type)}
                      </span> */}
                    </div>

                    {/* Link moved below the Mentioned by section */}

                    {Array.isArray(item.mentioned_by) &&
                    item.mentioned_by.length > 0 ? (
                      <div className="mt-3">
                        <div className="text-sm text-gray-700 dark:text-gray-300 mb-1">
                          Mentioned by
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          {Array.from(
                            new Set(
                              item.mentioned_by
                                .map((m) =>
                                  m && m.sender ? String(m.sender) : ""
                                )
                                .filter(Boolean)
                            )
                          ).map((sender, i) => (
                            <Avatar key={`${sender}-${i}`} sender={sender} />
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {item.link ? (
                      <div className="mt-3">
                        <a
                          href={item.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sm text-blue-400"
                          aria-label={`Open link to ${item.title}`}
                        >
                          Open Link
                        </a>
                      </div>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </section>
        )}
      </main>
    </div>
  );
}

export async function getStaticProps() {
  const { PB_URL, PB_EMAIL, PB_PASSWORD } = process.env;
  let items = [];
  try {
    if (!PB_URL || !PB_EMAIL || !PB_PASSWORD) {
      throw new Error("Missing PocketBase env vars");
    }
    const pb = new PocketBase(PB_URL);
    try {
      await pb.collection("clients").authWithPassword(PB_EMAIL, PB_PASSWORD);
    } catch (_) {
      // ignore; project may not have such collection, public access might be enough
    }
    const records = await pb
      .collection("chatrex_data")
      .getFullList({ sort: "-updated", batch: 200 });

    items = records.map((r) => {
      let mentionedBy = Array.isArray(r.mentioned_by) ? r.mentioned_by : [];
      if (!Array.isArray(mentionedBy) && typeof r.mentioned_by === "string") {
        try {
          const parsed = JSON.parse(r.mentioned_by);
          if (Array.isArray(parsed)) mentionedBy = parsed;
        } catch (_) {}
      }
      mentionedBy = (mentionedBy || [])
        .filter((m) => m && (m.sender || m.name || m.from))
        .map((m) => ({
          sender: m.sender || m.name || m.from,
          timestamp: m.timestamp || m.time || m.date || "",
        }));

      return {
        title: r.title || r.name || "Untitled",
        type: r.type || r.kind || r.category || "movie",
        link: r.link || r.url || null,
        image_url: r.image_url || r.image || r.thumbnail || null,
        mentioned_by: mentionedBy,
      };
    });
  } catch (e) {
    console.error("Error fetching items", e);
  }

  return {
    props: { items },
    revalidate: 3600,
  };
}

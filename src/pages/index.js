import { useMemo, useState } from "react";
import Image from "next/image";

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
      return "bg-blue-900/40 text-blue-200 border-blue-800";
    case "tv_show":
      return "bg-violet-900/40 text-violet-200 border-violet-800";
    case "song":
      return "bg-emerald-900/40 text-emerald-200 border-emerald-800";
    case "youtube":
      return "bg-rose-900/40 text-rose-200 border-rose-800";
    case "book":
      return "bg-amber-900/40 text-amber-200 border-amber-800";
    default:
      return "bg-gray-800 text-gray-200 border-gray-700";
  }
}

function formatTypeLabel(type) {
  const found = TYPE_OPTIONS.find((t) => t.value === type);
  return found ? found.label : type;
}

function Avatar({ sender }) {
  const [failed, setFailed] = useState(false);
  const src = `/pfp/${sender}.jpg`;
  if (!sender) return null;
  return failed ? (
    <div
      className="inline-flex h-7 w-7 shrink-0 select-none items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-gray-200 border border-white/10"
      aria-label={`${sender} profile placeholder`}
      title={sender}
    >
      {sender}
    </div>
  ) : (
    <Image
      src={src}
      alt={`${sender} profile photo`}
      width={28}
      height={28}
      className="h-7 w-7 rounded-full border border-white/10 object-cover"
      onError={() => setFailed(true)}
      priority={false}
    />
  );
}

export default function Home({ items, lastUpdated }) {
  const [activeType, setActiveType] = useState("");

  const computed = useMemo(() => {
    const filtered = items.filter((item) => {
      const matchesType = activeType === "" || item.type === activeType;
      if (!matchesType) return false;
      return true;
    });

    return { list: filtered };
  }, [items, activeType]);

  return (
    <div className="font-sans min-h-screen">
      <header className="sticky top-0 z-10 backdrop-blur supports-[backdrop-filter]:bg-background/70 bg-background/90 border-b border-white/8">
        <div className="mx-auto max-w-5xl px-4 py-4 sm:px-0">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-2xl font-bold tracking-tight">Mentions</h1>
            <div className="relative">
              <input
                id="uploadChat"
                type="file"
                accept=".txt"
                className="sr-only"
                onChange={() => {}}
              />
              <label
                htmlFor="uploadChat"
                className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-black/40 px-3 py-1.5 text-sm font-medium text-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 cursor-pointer"
              >
                Upload chat
              </label>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
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
                    }}
                    className={`shrink-0 rounded-md border px-2 py-1 text-sm transition-colors  ${
                      isActive
                        ? "bg-pink-600 text-white border-pink-600"
                        : "bg-black/40 border-white/10 text-gray-100 hover:bg-white/5"
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

      <main className="px-4 sm:px-0 py-6">
        {lastUpdated ? (
          <p className="mb-6 text-sm text-center text-gray-400">
            Last updated on {lastUpdated}
          </p>
        ) : null}
        {computed.list.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-lg font-semibold">No results</p>
            <p className="text-gray-400 mt-1">
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
                  <div className="w-28 h-40 flex items-center justify-center overflow-hidden rounded-md bg-white/2 border border-white/5 relative">
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
                    <span
                      className={`absolute bottom-0 left-0 items-center rounded-tr-lg border-t border-r px-2.5 py-0.5 text-sm font-medium backdrop-blur-md ${getTypeBadgeClasses(
                        item.type
                      )}`}
                    >
                      {formatTypeLabel(item.type)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col">
                    <div className="flex items-start gap-2">
                      <h2
                        id={`rec-${idx}-title`}
                        className="font-semibold text-base leading-tight break-words line-clamp-3"
                      >
                        {item.title}
                      </h2>
                    </div>

                    {Array.isArray(item.mentioned_by) &&
                    item.mentioned_by.length > 0 ? (
                      <div className="mt-3">
                        <div className="text-sm text-gray-300 mb-1">
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

                    <div className="mt-auto pt-3 flex items-center justify-between">
                      {item.link ? (
                        <a
                          href={item.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sm text-blue-400"
                          aria-label={`Open link to ${item.title}`}
                        >
                          Open Link
                        </a>
                      ) : (
                        <span aria-hidden className="inline-block w-0 h-0" />
                      )}
                    </div>
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
  let lastUpdated = "";
  try {
    if (!PB_URL || !PB_EMAIL || !PB_PASSWORD) {
      throw new Error("Missing PocketBase env vars");
    }
    const PocketBase = (await import("pocketbase")).default;
    const pb = new PocketBase(PB_URL);
    await pb.collection("clients").authWithPassword(PB_EMAIL, PB_PASSWORD);

    const records = await pb
      .collection("chatrex_data")
      .getFullList({ sort: "-created", batch: 200 });

    items = records.map((r) => ({
      title: r.title,
      type: r.type,
      link: r.link ?? null,
      image_url: r.image_url ?? null,
      mentioned_by: Array.isArray(r.mentioned_by) ? r.mentioned_by : [],
    }));

    try {
      const meta = await pb
        .collection("chatrex_meta")
        .getFirstListItem('key = "progress_timestamp"');
      const raw = meta && meta.value ? String(meta.value) : "";
      lastUpdated = raw ? raw.split(",")[0].trim().replace(/\//g, ".") : "";
    } catch (metaErr) {
      console.error(
        "Error fetching progress_timestamp from chatrex_meta",
        metaErr
      );
    }
  } catch (e) {
    console.error("Error fetching items", e);
  }

  return {
    props: { items, lastUpdated },
    revalidate: 3600,
  };
}

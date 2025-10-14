import { useMemo, useState } from "react";
import { useRouter } from "next/router";
import {
  Loader2,
  Check,
  Upload,
  ArrowUpRight,
  AlertCircle,
} from "lucide-react";
import BookCover from "@/components/BookCover";
import UploadModal from "@/components/UploadModal";
import Image from "next/image";
import { getPocketBaseClient, getMetaValue } from "@/lib/pocketbase";
import { COLLECTION_NAMES } from "@/lib/constants";

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
      return "bg-blue-900/60 text-blue-200 border-blue-800";
    case "tv_show":
      return "bg-violet-900/60 text-violet-200 border-violet-800";
    case "song":
      return "bg-emerald-900/60 text-emerald-200 border-emerald-800";
    case "youtube":
      return "bg-rose-900/60 text-rose-200 border-rose-800";
    case "book":
      return "bg-amber-900/60 text-amber-200 border-amber-800";
    default:
      return "bg-gray-800 text-gray-200 border-gray-700";
  }
}

function formatTypeLabel(type) {
  const found = TYPE_OPTIONS.find((t) => t.value === type);
  return found ? found.label : type;
}

const BUTTON_STATES = {
  idle: {
    icon: Upload,
    label: "Upload chat",
    className: "border-black/10 bg-white text-gray-900",
  },
  processing: {
    icon: Loader2,
    label: "Processing",
    className: "border-blue-600/20 bg-blue-50 text-blue-700",
    iconClassName: "animate-spin",
  },
  complete: {
    icon: Check,
    label: "Complete",
    className: "border-green-600/20 bg-green-50 text-green-700",
  },
  error: {
    icon: AlertCircle,
    label: "Error",
    className: "border-red-600/20 bg-red-50 text-red-700",
  },
};

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
      className="h-7 w-7 rounded-full border border-white/10 object-cover pointer-events-none"
      onError={() => setFailed(true)}
      priority={false}
    />
  );
}

export default function Home({ items, lastUpdated }) {
  const router = useRouter();
  const [activeType, setActiveType] = useState("");
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("idle"); // idle | processing | complete

  const computed = useMemo(() => {
    const filtered = items.filter((item) => {
      const matchesType = activeType === "" || item.type === activeType;
      if (!matchesType) return false;
      return true;
    });

    return { list: filtered };
  }, [items, activeType]);

  const handleUploadComplete = () => {
    setIsUploadOpen(false);
    setUploadStatus("idle");
    router.reload();
  };

  const handleStatusChange = (status) => {
    setUploadStatus(status);
  };

  const displayStatus =
    isUploadOpen && uploadStatus !== "error" ? "processing" : uploadStatus;

  const currentState = BUTTON_STATES[displayStatus];

  return (
    <div className="font-sans min-h-screen">
      <header className="sticky top-0 z-10 backdrop-blur supports-[backdrop-filter]:bg-background/70 bg-background/90 border-b border-white/8">
        <div className="mx-auto max-w-5xl px-4 py-4 sm:px-0">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-2xl font-bold tracking-tight">Mentions</h1>
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsUploadOpen(true)}
                className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition-colors cursor-pointer ${currentState.className}`}
              >
                {(() => {
                  const Icon = currentState.icon;
                  return (
                    <Icon size={16} className={currentState.iconClassName} />
                  );
                })()}
                {currentState.label}
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="md:col-span-2 w-full flex flex-nowrap items-center justify-between md:justify-start md:gap-2">
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
                        ? "bg-blue-600 text-white border-blue-600"
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
          <div className="mb-6 flex items-center justify-between text-sm text-gray-400">
            <p>last updated on {lastUpdated}</p>
            <a
              href="https://rittik.io"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 group hover:text-gray-200 transition-colors"
              aria-label="Visit rittik.io"
            >
              made with
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 650 900"
                className="inline-block h-[0.95em] align-middle text-red-500 group-hover:text-red-800 transition-colors"
                aria-hidden="true"
                focusable="false"
              >
                <path
                  fill="currentColor"
                  d="M636.688 17.688c9.097 8.478 13.182 19.131 13.78 31.449q.052 3.275.032 6.55l-.02 3.574c-.221 10.872-2 20.993-4.663 31.509a693 693 0 0 0-2.508 10.355c-4.767 19.676-10.971 38.79-17.623 57.9q-.942 2.716-1.877 5.433c-5.664 16.406-12.1 32.492-18.597 48.58a12541 12541 0 0 0-13.962 34.774l-1.43 3.575a7169 7169 0 0 0-32.316 82.254q-2.313 5.993-4.629 11.984l-1.166 3.018c-6.835 17.672-13.843 35.272-20.896 52.857-9.924 24.73-9.924 24.73-19.714 49.514q-.938 2.394-1.88 4.787c-9.189 23.333-17.276 47.007-24.719 70.949a13841 13841 0 0 1-5.303 16.93 2597 2597 0 0 1-8.869 27.742c-29.296 89.995-50.892 182.234-76.068 306.099l-.383 2.32a357 357 0 0 0-.699 4.438c-.93 5.655-2.754 9.99-7.178 13.721-4.482 2.74-8.894 2.842-14 2-13.325-5.971-22.214-19.556-27.273-32.71-4.679-14.74-.933-30.477 2.273-45.102q.612-2.89 1.219-5.78a1536 1536 0 0 1 6.16-27.787l.564-2.462c.868-3.793 1.75-7.58 2.668-11.361 3.14-13.244 4.537-23.827-2.611-35.798-2.327-2.953-4.913-5.56-7.6-8.184l-2.27-2.276a1404 1404 0 0 0-7.4-7.333 4724 4724 0 0 0-18.765-18.643 4890 4890 0 0 1-11.057-10.997q-6.616-6.591-13.24-13.172l-2.53-2.515q-3.57-3.546-7.149-7.084l-2.1-2.086a233 233 0 0 0-12.093-11.132c-3.466-3.045-6.642-6.383-9.862-9.683-2.76-2.8-5.565-5.47-8.555-8.024-5.344-4.62-10.296-9.639-15.28-14.64q-2.489-2.496-4.988-4.983c-5.03-5.028-9.962-10.09-14.583-15.502-2.532-2.894-5.28-5.56-8.028-8.246-4.016-3.972-7.904-7.97-11.563-12.277-2.739-3.143-5.592-6.177-8.437-9.223-4.591-4.926-9.123-9.882-13.5-15l-2.629-3.066a4355 4355 0 0 1-4.545-5.309 1000 1000 0 0 0-8.103-9.371c-5.68-6.485-11.214-13.03-16.491-19.848-3.627-4.676-7.384-9.233-11.17-13.781-5.501-6.634-10.747-13.412-15.87-20.34a589 589 0 0 0-7.04-9.289c-7.729-10.023-15.149-20.166-22.215-30.668a280 280 0 0 0-6.63-9.403C38.375 378.39-9.2 294.742 1.25 219.687c2.285-14.744 7.287-28.009 19.121-37.78 24.183-17.536 55.376-22.038 84.504-17.782C142.918 170.226 180.703 185.689 210 211l2.398 2.066c9.565 8.434 18.506 17.29 26.45 27.274 2.88 3.56 5.943 6.933 9.027 10.316 1.95 2.15 3.855 4.332 5.75 6.531 2.746 3.157 5.639 6.104 8.629 9.028 1.833 1.874 3.501 3.837 5.183 5.848 3.42 3.985 7.276 6.945 11.563 9.937 5.874-7.658 10.022-15.825 14-24.563l1.948-4.21a2327 2327 0 0 0 9.939-21.852c20.637-45.87 45.972-88.724 80-126.043a296 296 0 0 0 5.55-6.332c4.273-4.91 8.93-9.434 13.563-14a980 980 0 0 0 8.602-8.672c28.337-28.805 63.28-41.968 99.946-57.302a6557 6557 0 0 0 7.131-2.99 1963 1963 0 0 1 10.87-4.517 914 914 0 0 0 3.931-1.634c31.982-13.36 73.796-15.592 102.207 7.803Zm-214.25 98.183c-2.208 2.667-4.331 5.382-6.438 8.129l-3.043 3.855C384.373 164.3 366.091 207.273 349 250l-.779 1.947c-19.813 49.689-30.968 91.015-21.526 144.516 1.975 11.208 3.516 22.41 4.743 33.724l.252 2.315q.677 6.246 1.31 12.498-1.921 1.229-3.848 2.45l-2.164 1.377c-5.671 3.346-13.165 2.738-19.425 1.486C305 449 305 449 303.75 446.75L303 444l-1.016-2.75c-1.043-3.446-1.328-6.4-1.476-9.992l-.19-3.944-.093-2.07C297.686 371.182 276.958 327.024 245 284l-1.205-1.625C228.382 261.689 210.752 241.645 191 225l-2.816-2.445C168.935 205.905 150.636 194.029 126 187l-2.048-.59c-21.586-5.908-47.622-4.735-67.405 6.04C44.283 199.916 39.107 211.605 35 225l-.75 2.293C27.45 251.708 39.663 281.813 47 305l.81 2.565c13.217 41.127 35.904 78.3 59.642 114.1a1101 1101 0 0 1 3.775 5.733C125.582 449.206 140.989 470.383 157 491l1.493 1.923a944 944 0 0 0 16.339 20.444 956 956 0 0 1 4.305 5.266c5.651 6.96 11.462 13.773 17.315 20.564q2.288 2.668 4.56 5.35a600 600 0 0 0 18.32 20.57A270 270 0 0 1 225.5 572c4.476 5.164 9.137 10.158 13.79 15.161q1.74 1.872 3.478 3.748c7.524 8.121 15.137 16.12 23.046 23.868 2.877 2.835 5.634 5.704 8.252 8.782 5.03 5.824 10.538 11.193 15.986 16.623q2.82 2.816 5.634 5.64c5.301 5.305 10.593 10.529 16.308 15.39 5.245 4.674 10.083 9.818 15.015 14.818 5.262 5.326 10.532 10.561 16.23 15.428 3.308 2.897 6.318 6.093 9.359 9.267 4.938 5.05 9.734 9.213 17.09 9.337L373 710c2.652-4.772 3.936-9.239 5.059-14.516l1.148-5.16.604-2.746c9.064-40.924 21.853-80.552 35.094-120.289q2.068-6.218 4.126-12.44a6145 6145 0 0 1 20.204-59.982 14884 14884 0 0 0 16.89-49.68l.731-2.16c5.253-15.517 10.503-31.035 15.665-46.582Q475.752 386.72 479 377l1.006-3.013c14.378-43.03 29.699-85.455 46.94-127.417 3.53-8.602 7.04-17.212 10.554-25.82l1.273-3.117a14407 14407 0 0 0 29.601-73.104l5.667-14.082q5.499-13.656 10.983-27.318 2.728-6.799 5.464-13.594 2.586-6.42 5.159-12.848.955-2.38 1.915-4.76 1.326-3.288 2.638-6.58l.776-1.908c3.6-9.073 6.175-19.32 3.266-28.947-1.738-3.71-3.567-6.477-7.242-8.492-60.581-20.194-138.613 49.593-174.563 89.871Z"
                />
                <path
                  fill="currentColor"
                  d="M323 337h1v29h-1zM75 161h19v1H75zM576 26h18v1h-18zM341 844h1v16h-1zM34 235h1v15h-1zM603 37h1v12h-1zM297 407h1v11h-1zm1 20h1v10h-1zm13 26h9v1h-9zM100 185h9v1h-9zm-17 0h9v1h-9zm255 538 4 3-1 2c-1.5-1.375-1.5-1.375-3-3zM96 162h8v1h-8zm238 275h1v7h-1zm-1-8h1v7h-1zm-1-9h1v7h-1zm-1-9h1v7h-1zM66 162h7v1h-7zm329 712h1v6h-1zm-53-37h1v6h-1zm17-80h1v6h-1zm7-49h6v1h-6zM214 600l3 2-1 2zm116-196h1v6h-1zm-34-5h1v6h-1zm33-2h1v6h-1zm-5-30h1v6h-1zm0-37h1v6h-1zM568 27h6v1h-6zM399 853h1v5h-1zm-40-104h1v5h-1zm-64-357h1v5h-1zm33-1h1v5h-1zm-3-17h1v5h-1zm0-50h1v5h-1zM0 265h1v5H0zm35-14h1v5h-1zm0-22h1v5h-1zm186-9 3 1-1 2zM0 216h1v5H0zm111-30h5v1h-5zm-6-23h5v1h-5zm-45 0h5v1h-5zm589-87h1v5h-1zm-88-48h5v1h-5zM259 646l3 1h-3zm-8-49 2 1-1 2zm-53-14 2 1-1 2zm38-2 2 1-1 2zm-23-333 2 1-1 2zm-14-13 3 1h-3zm-88-71 4 1Zm-55 0 4 1Z"
                />
              </svg>
              by{" "}
              <span className="font-medium text-gray-300 group-hover:text-blue-400 transition-colors">
                rittik
              </span>
            </a>
          </div>
        ) : null}
        {computed.list.length === 0 ? (
          <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
            <p className="text-lg font-semibold">No results</p>
            <p className="text-gray-400 mt-1">Try adjusting the filters.</p>
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
                        className="w-full h-full object-cover pointer-events-none"
                        unoptimized
                        priority={false}
                      />
                    ) : item.type === "book" ? (
                      <BookCover title={item.title} />
                    ) : (
                      <span className="text-xs text-gray-500">No image</span>
                    )}
                    <span
                      className={`absolute bottom-0 left-0 items-center border-t w-full px-2.5 py-0.5 text-sm text-center font-medium backdrop-blur-xs ${getTypeBadgeClasses(
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
                          <ArrowUpRight size={16} />
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
      <UploadModal
        open={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onComplete={handleUploadComplete}
        onStatusChange={handleStatusChange}
      />
    </div>
  );
}

export async function getStaticProps() {
  let items = [];
  let lastUpdated = "";
  try {
    const pb = await getPocketBaseClient();

    const records = await pb
      .collection(COLLECTION_NAMES.DATA)
      .getFullList({ sort: "-created", batch: 200 });

    items = records.map((r) => ({
      title: r.title,
      type: r.type,
      link: r.link ?? null,
      image_url: r.image_url ?? null,
      mentioned_by: Array.isArray(r.mentioned_by) ? r.mentioned_by : [],
    }));

    try {
      const raw = await getMetaValue("progress_timestamp");
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
    revalidate: 1,
  };
}

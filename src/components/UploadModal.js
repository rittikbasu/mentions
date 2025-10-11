import { useEffect, useRef, useState } from "react";
import { unzipSync, strFromU8 } from "fflate";

function normalizeTimestampString(input) {
  return String(input || "")
    .replace(/[\u202F\u00A0]/g, " ")
    .trim();
}

function extractMessagesByTimestamps(text, targetTimestamps) {
  const normalizedTargets = new Set(
    (targetTimestamps || []).map((t) => normalizeTimestampString(t))
  );
  const result = {};
  const lines = String(text || "").split(/\r?\n/);
  const re =
    /^\[(\d{1,2}\/\d{1,2}\/\d{2,4}),\s+(\d{1,2}:\d{2}:\d{2})[\u202F\u00A0 ]?(AM|PM)\]\s+(.*)$/i;

  for (const line of lines) {
    const m = line.match(re);
    if (!m) continue;
    const datePart = m[1];
    const timePart = m[2];
    const ampm = m[3].toUpperCase();
    const rest = m[4];
    const normalizedKey = normalizeTimestampString(
      `${datePart}, ${timePart} ${ampm}`
    );
    if (!normalizedTargets.has(normalizedKey)) continue;
    const colonIdx = rest.indexOf(": ");
    const senderPart = colonIdx >= 0 ? rest.slice(0, colonIdx).trim() : "";
    const messageText =
      colonIdx >= 0 ? rest.slice(colonIdx + 2).trim() : rest.trim();
    result[normalizedKey] = { sender: senderPart, text: messageText };
  }
  return result;
}

async function sha256Hex(input) {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function parseTimestampToMs(s) {
  const m = String(s || "").match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{2,4}),\s+(\d{1,2}):(\d{2}):(\d{2})[\u202F\u00A0 ]?(AM|PM)$/i
  );
  if (!m) return 0;
  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = Number(m[3]);
  if (year < 100) year += year < 70 ? 2000 : 1900;
  let hour = Number(m[4]);
  const minute = Number(m[5]);
  const second = Number(m[6]);
  const ampm = m[7].toUpperCase();
  if (ampm === "AM" && hour === 12) hour = 0;
  if (ampm === "PM" && hour !== 12) hour += 12;
  return new Date(year, month - 1, day, hour, minute, second).getTime();
}

function isSkippable(text) {
  if (!text) return true;
  const lc = String(text).toLowerCase();
  if (lc.includes("messages and calls are end-to-end encrypted")) return true;
  if (lc.includes("created this group")) return true;
  if (lc.includes("changed the subject")) return true;
  if (lc.includes("changed this group's icon")) return true;
  if (lc.includes("deleted this message")) return true;
  if (lc.includes("you deleted this message")) return true;
  if (lc.includes("missed voice call")) return true;
  if (lc.includes("missed video call")) return true;
  if (
    /^[\u200e\u200f]?(image|video|gif|sticker|audio|document) omitted/i.test(
      text
    )
  )
    return true;
  return false;
}

export default function UploadModal({ open, onClose }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!open) return;

    const body = document.body;
    const html = document.documentElement;

    const prev = {
      bodyOverflow: body.style.overflow,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyWidth: body.style.width,
      htmlOverflow: html.style.overflow,
    };

    const scrollY = window.scrollY;

    // Lock scroll (robust across browsers, incl. iOS)
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    body.style.overflow = "hidden";
    html.style.overflow = "hidden";

    return () => {
      body.style.position = prev.bodyPosition;
      body.style.top = prev.bodyTop;
      body.style.width = prev.bodyWidth;
      body.style.overflow = prev.bodyOverflow;
      html.style.overflow = prev.htmlOverflow;
      window.scrollTo(0, scrollY);
    };
  }, [open]);

  if (!open) return null;

  const handleBrowse = () => {
    if (fileInputRef.current) fileInputRef.current.click();
  };
  const handleInputChange = (e) => {
    const files = Array.from(e.target.files || []);
    setSelectedFile(files[0] || null);
    setError("");
  };
  const removeFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setError("");
  };
  const startUpload = async () => {
    if (!selectedFile || isUploading) return;
    setIsUploading(true);
    setError("");
    try {
      const buf = await selectedFile.arrayBuffer();
      const zipEntries = unzipSync(new Uint8Array(buf));
      // find *_chat.txt (case-insensitive)
      const chatEntryName = Object.keys(zipEntries).find((name) =>
        /_chat\.txt$/i.test(name)
      );
      if (!chatEntryName) {
        setError("ZIP does not contain a _chat.txt file.");
        return;
      }
      const content = strFromU8(zipEntries[chatEntryName]);
      const targets = [
        "02/12/23, 7:27:49 AM",
        "18/12/23, 2:24:03 PM",
        "09/07/24, 2:20:25 PM",
        "18/08/24, 10:57:29 AM",
      ];
      const found = extractMessagesByTimestamps(content, targets);
      const textsInOrder = [];
      for (const ts of targets) {
        const key = normalizeTimestampString(ts);
        if (!Object.prototype.hasOwnProperty.call(found, key)) {
          setError("This is the wrong file. Please upload the correct one.");
          return;
        }
        const entry = found[key] || { sender: "", text: "" };
        textsInOrder.push(entry.text || "");
      }
      const combined = textsInOrder.join("\n");
      const hash = await sha256Hex(combined);

      // Verify with server
      const resp = await fetch("/api/verify-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hash }),
      });
      const data = await resp.json().catch(() => ({ ok: false }));
      if (!data || data.ok !== true) {
        setError("Chat export didn't match the expected group.");
        return;
      }

      // Progress check: ensure last message timestamp > progressTimestamp
      const effectiveProgress =
        data.progressTimestamp || progressTimestamp || "";
      const lines = String(content || "").split(/\r?\n/);
      const re =
        /^\[(\d{1,2}\/\d{1,2}\/\d{2,4}),\s+(\d{1,2}:\d{2}:\d{2})[\u202F\u00A0 ]?(AM|PM)\]\s+(.*)$/i;
      let lastTsMs = 0;
      for (const line of lines) {
        const m = line.match(re);
        if (!m) continue;
        const tsStr = `${m[1]}, ${m[2]} ${m[3].toUpperCase()}`;
        const ms = parseTimestampToMs(tsStr);
        if (ms > lastTsMs) lastTsMs = ms;
      }
      const progressMs = parseTimestampToMs(effectiveProgress);
      if (!lastTsMs || lastTsMs <= progressMs) {
        setError("Already up to date — no new messages to process.");
        return;
      }

      // Participant mapping based on the 4 anchor timestamps
      const senderMap = {};
      const anchors = ["A", "D", "P", "R"];
      targets.forEach((ts, idx) => {
        const key = normalizeTimestampString(ts);
        const entry = found[key];
        if (entry && entry.sender)
          senderMap[entry.sender] = anchors[idx] || entry.sender;
      });

      // Build first batch of 50 messages after progressTimestamp
      const batch = [];
      for (const line of lines) {
        const m = line.match(re);
        if (!m) continue;
        const tsStr = `${m[1]}, ${m[2]} ${m[3].toUpperCase()}`;
        const ms = parseTimestampToMs(tsStr);
        if (ms <= progressMs) continue;
        const rest = m[4];
        const colonIdx = rest.indexOf(": ");
        const sender = colonIdx >= 0 ? rest.slice(0, colonIdx).trim() : "";
        const text =
          colonIdx >= 0 ? rest.slice(colonIdx + 2).trim() : rest.trim();
        if (isSkippable(text)) continue;
        const mappedSender = senderMap[sender] || sender;
        batch.push({ timestamp: tsStr, sender: mappedSender, text });
        if (batch.length >= 50) break;
      }

      console.log("firstBatch:", batch);
      onClose && onClose();
    } catch (e) {
      console.error("Unzip/validation error", e);
      setError("Failed to read ZIP. Please try another file.");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upload-title"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg mx-4 rounded-xl border border-white/10 bg-black/80 shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
        ref={dialogRef}
      >
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <h2 id="upload-title" className="text-lg font-semibold">
            Upload chat
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-gray-300 hover:bg-white/5"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="p-5">
          <div className="mb-4 text-sm text-gray-300">
            <nav aria-label="Export steps">
              <ol className="flex flex-wrap items-center gap-1 sm:gap-2">
                <li className="whitespace-nowrap">Open group chat</li>
                <li aria-hidden className="text-gray-500">
                  ›
                </li>
                <li className="whitespace-nowrap">Tap group name</li>
                <li aria-hidden className="text-gray-500">
                  ›
                </li>
                <li className="whitespace-nowrap">Export chat</li>
                <li aria-hidden className="text-gray-500">
                  ›
                </li>
                <li className="whitespace-nowrap">Without media</li>
                <li aria-hidden className="text-gray-500">
                  ›
                </li>
                <li className="whitespace-nowrap">Upload .zip here</li>
              </ol>
            </nav>
          </div>
          {/* Hidden file input kept always mounted so Change works */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip"
            className="sr-only"
            onChange={handleInputChange}
          />

          {error ? (
            <div className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          ) : null}
          {!selectedFile ? (
            <div className="rounded-lg border border-white/10 bg-black/40 p-6 text-center min-h-32 flex flex-col items-center justify-center gap-2">
              <button
                type="button"
                onClick={handleBrowse}
                className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-gray-100 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="lucide lucide-upload-icon"
                  aria-hidden
                >
                  <path d="M12 3v12" />
                  <path d="m17 8-5-5-5 5" />
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                </svg>
                Choose .zip file
              </button>
              <p className="text-xs text-gray-400">ZIP only. Max 10 MB.</p>
            </div>
          ) : (
            <div className="rounded-lg border border-white/10 bg-black/40 p-4 min-h-32 flex flex-col justify-center">
              <p className="text-sm text-gray-100 break-words">
                {selectedFile.name}
              </p>
              <p className="mt-1 text-xs text-gray-400">
                {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
              </p>
              <div className="mt-3 flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleBrowse}
                  className="text-sm text-blue-400 hover:underline"
                >
                  Change
                </button>
                <button
                  type="button"
                  onClick={removeFile}
                  className="text-sm text-gray-400 hover:underline"
                >
                  Remove
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-white/10 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-white/10 px-3 py-1.5 text-sm text-gray-200 hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!selectedFile || isUploading}
            onClick={startUpload}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              !selectedFile || isUploading
                ? "bg-blue-600/50 text-white/70"
                : "bg-blue-600 text-white hover:bg-blue-500"
            }`}
          >
            {isUploading ? "Uploading…" : "Upload"}
          </button>
        </div>
      </div>
    </div>
  );
}

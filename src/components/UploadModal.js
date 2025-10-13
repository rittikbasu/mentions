import { useCallback, useEffect, useRef, useState } from "react";
import { unzipSync, strFromU8 } from "fflate";
import {
  sha256Hex,
  normalizeTimestampString,
  parseChat,
  isSkippable,
  extractMessagesByTimestamps,
  parseWhatsAppTimestamp,
} from "@/lib/utils";
import {
  ANCHOR_TIMESTAMPS,
  ANCHOR_LABELS,
  BATCH_SIZE,
  TOKEN_COSTS,
  TIMESTAMP_TOLERANCE_SECONDS,
} from "@/lib/constants";

export default function UploadModal({ open, onClose, onComplete }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");
  const [showProgress, setShowProgress] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [canRetry, setCanRetry] = useState(false);
  const [progress, setProgress] = useState({
    processedMessages: 0,
    totalMessages: 0,
    processedBatches: 0,
    totalBatches: 0,
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
  });
  const fileInputRef = useRef(null);

  const handleClose = useCallback(() => {
    if (isComplete) {
      setSelectedFile(null);
      setIsUploading(false);
      setError("");
      setShowProgress(false);
      setIsComplete(false);
      setProgress({
        processedMessages: 0,
        totalMessages: 0,
        processedBatches: 0,
        totalBatches: 0,
        totalPromptTokens: 0,
        totalCompletionTokens: 0,
      });
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (onComplete) {
        onComplete();
      } else {
        onClose();
      }
      return;
    }

    if (!showProgress) {
      setSelectedFile(null);
      setIsUploading(false);
      setError("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }

    onClose();
  }, [isComplete, showProgress, onComplete, onClose]);

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
  }, [open, handleClose]);

  if (!open) return null;

  const handleBrowse = () => {
    fileInputRef.current?.click();
  };

  const handleInputChange = (e) => {
    setSelectedFile(e.target.files?.[0] || null);
    setError("");
    setCanRetry(false);
  };

  const removeFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setError("");
    setCanRetry(false);
  };

  const startUpload = async () => {
    if (!selectedFile || isUploading) return;

    setCanRetry(false);

    const maxSize = 1 * 1024 * 1024;
    if (selectedFile.size > maxSize) {
      setError("File size exceeds 1 MB limit.");
      return;
    }

    setIsUploading(true);
    setError("");

    try {
      const buf = await selectedFile.arrayBuffer();
      const zipEntries = unzipSync(new Uint8Array(buf));
      const chatEntryName = Object.keys(zipEntries).find((name) =>
        /_chat\.txt$/i.test(name)
      );
      if (!chatEntryName) {
        setError("ZIP does not contain a chat export.");
        setIsUploading(false);
        return;
      }
      const content = strFromU8(zipEntries[chatEntryName]);
      const found = extractMessagesByTimestamps(
        content,
        ANCHOR_TIMESTAMPS,
        TIMESTAMP_TOLERANCE_SECONDS
      );
      const textsInOrder = [];
      for (const ts of ANCHOR_TIMESTAMPS) {
        const key = normalizeTimestampString(ts);
        if (!found[key]) {
          setError("This is the wrong file. Please upload the correct one.");
          setIsUploading(false);
          return;
        }
        textsInOrder.push(found[key].text || "");
      }
      const hash = await sha256Hex(textsInOrder.join("\n"));

      // verify with server and get progress timestamp
      const resp = await fetch("/api/verify-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hash }),
      });
      const data = await resp.json().catch(() => ({ ok: false }));
      if (!data?.ok) {
        setError("Chat export didn't match the expected group.");
        setIsUploading(false);
        return;
      }

      const senderMap = {};
      ANCHOR_TIMESTAMPS.forEach((ts, idx) => {
        const entry = found[normalizeTimestampString(ts)];
        if (entry?.sender) {
          senderMap[entry.sender] = ANCHOR_LABELS[idx];
        }
      });

      const allParsed = parseChat(content);
      const messages = allParsed
        .filter((msg) => !isSkippable(msg.text))
        .map((msg) => ({
          timestamp: msg.timestamp,
          normalizedTimestamp: normalizeTimestampString(msg.timestamp),
          sender: senderMap[msg.sender] || msg.sender,
          text: msg.text,
        }));

      // find starting index after progress timestamp
      let startIdx = 0;
      const progressTimestamp = data.progressTimestamp;
      if (progressTimestamp) {
        const normalizedProgress = normalizeTimestampString(progressTimestamp);
        let progressIdx = messages.findIndex(
          (m) => m.normalizedTimestamp === normalizedProgress
        );
        if (progressIdx < 0) {
          const targetDate = parseWhatsAppTimestamp(progressTimestamp);
          if (targetDate) {
            let bestIdx = -1;
            let bestDiff = Infinity;
            for (let i = 0; i < messages.length; i++) {
              const msgDate = parseWhatsAppTimestamp(messages[i].timestamp);
              if (!msgDate) continue;
              const diffSec =
                Math.abs(msgDate.getTime() - targetDate.getTime()) / 1000;
              if (
                diffSec <= TIMESTAMP_TOLERANCE_SECONDS &&
                diffSec < bestDiff
              ) {
                bestDiff = diffSec;
                bestIdx = i;
                if (bestDiff === 0) break;
              }
            }
            progressIdx = bestIdx;
          }
        }
        if (progressIdx < 0) {
          setError("Incompatible chat export. Please contact the developer.");
          setIsUploading(false);
          return;
        }
        startIdx = progressIdx + 1;
      }

      if (startIdx >= messages.length) {
        setError("Already up to date!");
        setIsUploading(false);
        return;
      }

      const totalMessages = messages.length - startIdx;
      const totalBatches = Math.ceil(totalMessages / BATCH_SIZE);
      setShowProgress(true);
      setProgress({
        processedMessages: 0,
        totalMessages,
        processedBatches: 0,
        totalBatches,
        totalPromptTokens: 0,
        totalCompletionTokens: 0,
      });

      let idx = startIdx;
      let processedCount = 0;
      let hadError = false;
      while (idx < messages.length) {
        const batch = messages.slice(idx, idx + BATCH_SIZE);
        try {
          const res = await fetch("/api/extract-recs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ batch }),
          });
          const result = await res.json();
          if (!result?.ok) {
            setError("Failed to extract recommendations.");
            setCanRetry(true);
            hadError = true;
            break;
          }

          processedCount += batch.length;
          setProgress((p) => ({
            ...p,
            processedMessages: processedCount,
            processedBatches: Math.ceil(processedCount / BATCH_SIZE),
            totalPromptTokens:
              p.totalPromptTokens + (result.usage?.prompt_tokens || 0),
            totalCompletionTokens:
              p.totalCompletionTokens + (result.usage?.completion_tokens || 0),
          }));

          // use server timestamp if available, else continue
          if (result.progressTimestamp) {
            const normalizedCursor = normalizeTimestampString(
              result.progressTimestamp
            );
            const cursorIdx = messages.findIndex(
              (m, i) => i >= idx && m.normalizedTimestamp === normalizedCursor
            );
            idx = cursorIdx >= 0 ? cursorIdx + 1 : idx + BATCH_SIZE;
          } else {
            idx += BATCH_SIZE;
          }
        } catch (e) {
          setError("Sorry there was a server error. Please try again.");
          setIsUploading(false);
          setCanRetry(true);
          hadError = true;
          break;
        }
      }

      if (!hadError) {
        setIsComplete(true);
      }
      setIsUploading(false);
    } catch (e) {
      console.error("Unzip/validation error", e);
      setError("Failed to read ZIP. Please try another file.");
      setIsUploading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upload-title"
      onClick={handleClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg mx-4 rounded-xl border border-white/10 bg-black/80 shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
      >
        <div className="px-5 py-4 border-b border-white/10">
          <h2 id="upload-title" className="text-lg font-semibold">
            Upload chat
          </h2>
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
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip"
            className="sr-only"
            onChange={handleInputChange}
          />

          {error && (
            <div className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}

          {!selectedFile ? (
            <div className="rounded-lg border border-white/10 bg-black/40 p-6 text-center min-h-36 flex flex-col items-center justify-center gap-2">
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
              <p className="text-xs text-gray-400">ZIP only. Max 1 MB.</p>
            </div>
          ) : showProgress ? (
            <>
              <div className="rounded-lg border border-white/10 bg-black/40 p-5 min-h-36">
                <div className="flex items-center justify-start mb-3">
                  <p className="text-sm font-medium text-gray-100">
                    {isComplete
                      ? "Processing complete"
                      : error
                      ? "Processing failed"
                      : "Processing messages"}
                  </p>
                </div>

                <div className="relative h-2 bg-white/5 rounded-full overflow-hidden mb-4">
                  <div
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-500 to-blue-400 transition-all duration-300 ease-out rounded-full"
                    style={{
                      width: `${
                        progress.totalMessages > 0
                          ? (progress.processedMessages /
                              progress.totalMessages) *
                            100
                          : 0
                      }%`,
                    }}
                  />
                </div>

                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="text-gray-300 font-medium">
                    Messages {progress.processedMessages} /{" "}
                    {progress.totalMessages}
                  </span>
                  <span className="text-gray-400">
                    Batch {progress.processedBatches}/{progress.totalBatches}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs pt-2">
                  <span className="text-gray-300 font-medium">
                    Tokens used{" "}
                    {(
                      progress.totalPromptTokens +
                      progress.totalCompletionTokens
                    ).toLocaleString()}
                  </span>
                  <span className="text-green-400 font-semibold">
                    $
                    {(
                      (progress.totalPromptTokens / 1_000_000) *
                        TOKEN_COSTS.INPUT_PER_MILLION +
                      (progress.totalCompletionTokens / 1_000_000) *
                        TOKEN_COSTS.OUTPUT_PER_MILLION
                    ).toFixed(4)}
                  </span>
                </div>
              </div>
              {!isComplete && (
                <p className="mt-2 text-[11px] text-gray-500">
                  You can close this box and continue to browse the mentions.
                  The processing will continue in the background.
                </p>
              )}
            </>
          ) : (
            <div className="rounded-lg border border-white/10 bg-black/40 p-4 min-h-36 flex flex-col justify-center">
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
            onClick={handleClose}
            className="rounded-md border border-white/10 px-3 py-1.5 text-sm text-gray-200 hover:bg-white/5"
          >
            {showProgress ? "Close" : "Cancel"}
          </button>
          <button
            type="button"
            disabled={
              !selectedFile ||
              (isUploading && !isComplete) ||
              (!!error && !canRetry)
            }
            onClick={isComplete ? handleClose : startUpload}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              !selectedFile ||
              (isUploading && !isComplete) ||
              (!!error && !canRetry)
                ? "bg-blue-600/50 text-white/70"
                : "bg-blue-600 text-white hover:bg-blue-500"
            }`}
          >
            {isComplete
              ? "Done"
              : canRetry
              ? "Retry"
              : showProgress || isUploading
              ? "Processing…"
              : "Upload"}
          </button>
        </div>
      </div>
    </div>
  );
}

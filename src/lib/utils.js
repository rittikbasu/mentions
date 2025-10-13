export function normalizeTimestampString(input) {
  return String(input || "")
    .replace(/[\u202F\u00A0]/g, " ")
    .trim();
}

export function parseChat(text) {
  const lines = String(text || "").split(/\r?\n/);
  const re =
    /^\[(\d{1,2}\/\d{1,2}\/\d{2,4}),\s+(\d{1,2}:\d{2}:\d{2})[\u202F\u00A0 ]?(AM|PM)\]\s+(.*)$/i;
  const out = [];
  let current = null;

  for (const rawLine of lines) {
    const m = rawLine.match(re);
    if (m) {
      if (current) out.push(current);
      const tsStr = `${m[1]}, ${m[2]} ${m[3].toUpperCase()}`;
      const rest = m[4];
      const colonIdx = rest.indexOf(": ");
      const sender = colonIdx >= 0 ? rest.slice(0, colonIdx).trim() : "";
      const body =
        colonIdx >= 0 ? rest.slice(colonIdx + 2).trim() : rest.trim();
      current = { timestamp: tsStr, sender, text: body };
    } else if (current) {
      const line = rawLine.trim();
      if (line.length > 0) current.text += `\n${line}`;
    }
  }
  if (current) out.push(current);
  return out;
}

export function isSkippable(text) {
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

export function extractMessagesByTimestamps(text, targetTimestamps) {
  const normalizedTargets = new Set(
    (targetTimestamps || []).map((t) => normalizeTimestampString(t))
  );
  const result = {};
  const messages = parseChat(text);
  for (const msg of messages) {
    const key = normalizeTimestampString(msg.timestamp);
    if (normalizedTargets.has(key) && !result[key]) {
      result[key] = { sender: msg.sender, text: msg.text };
    }
  }
  return result;
}

export async function sha256Hex(input) {
  const data = new TextEncoder().encode(input);
  if (globalThis.crypto && globalThis.crypto.subtle) {
    const hashBuffer = await globalThis.crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }
}

// Metadata helpers (used by extract-recs API)

export function extractUrl(str) {
  const m = String(str || "").match(/https?:\/\/\S+/i);
  if (!m) return null;
  return m[0].replace(/[)\],.]+$/, "");
}

export function cleanTitle(title) {
  return String(title || "")
    .replace(/\s+on\s+Apple\s+Music\s*$/i, "")
    .trim();
}

export function extractDate(timestamp) {
  const match = String(timestamp || "").match(/^(\d{2}\/\d{2}\/\d{2})/);
  return match ? match[1] : "";
}

export function escapeForFilter(str) {
  return String(str).replace(/"/g, '\\"');
}

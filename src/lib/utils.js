export function normalizeTimestampString(input) {
  return String(input || "")
    .replace(/[\u202F\u00A0]/g, " ")
    .trim();
}

export function parseWhatsAppTimestamp(timestamp) {
  try {
    const normalized = normalizeTimestampString(timestamp);
    const match = normalized.match(
      /^(\d{1,2})\/(\d{1,2})\/(\d{2,4}),\s+(\d{1,2}):(\d{2}):(\d{2})\s+(AM|PM)$/i
    );
    if (!match) return null;

    const [, day, month, year, hours, minutes, seconds, meridiem] = match;

    let fullYear = parseInt(year, 10);
    if (fullYear < 100) {
      fullYear += fullYear < 50 ? 2000 : 1900;
    }

    let hour24 = parseInt(hours, 10);
    const isAM = meridiem.toUpperCase() === "AM";
    if (hour24 === 12) {
      hour24 = isAM ? 0 : 12;
    } else if (!isAM) {
      hour24 += 12;
    }

    return new Date(
      fullYear,
      parseInt(month, 10) - 1,
      parseInt(day, 10),
      hour24,
      parseInt(minutes, 10),
      parseInt(seconds, 10)
    );
  } catch (e) {
    return null;
  }
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

export function extractMessagesByTimestamps(
  text,
  targetTimestamps,
  toleranceSeconds = 2
) {
  const result = {};
  const messages = parseChat(text);

  // for each target timestamp find a matching message within tolerance
  for (const targetTs of targetTimestamps || []) {
    const normalizedTarget = normalizeTimestampString(targetTs);

    // first try exact match
    const exactMatch = messages.find(
      (msg) => normalizeTimestampString(msg.timestamp) === normalizedTarget
    );

    if (exactMatch) {
      result[normalizedTarget] = {
        sender: exactMatch.sender,
        text: exactMatch.text,
      };
      continue;
    }

    // try fuzzy match within tolerance window and choose the closest by time
    let best = null;
    let bestDiff = Infinity;
    const targetDate = parseWhatsAppTimestamp(targetTs);
    if (targetDate) {
      for (const msg of messages) {
        const msgDate = parseWhatsAppTimestamp(msg.timestamp);
        if (!msgDate) continue;
        const diffSec =
          Math.abs(msgDate.getTime() - targetDate.getTime()) / 1000;
        if (diffSec <= toleranceSeconds && diffSec < bestDiff) {
          best = msg;
          bestDiff = diffSec;
          if (bestDiff === 0) break; // exact time match found
        }
      }
    }

    if (best) {
      result[normalizedTarget] = { sender: best.sender, text: best.text };
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

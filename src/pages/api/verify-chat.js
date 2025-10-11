import { timingSafeEqual } from "crypto";
import { getMetaValue } from "@/lib/pocketbase";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  try {
    const expectedHex = String(process.env.CHAT_HASH || "").trim();
    const providedHex = String((req.body && req.body.hash) || "").trim();

    if (!expectedHex) {
      return res
        .status(500)
        .json({ ok: false, error: "Server hash not configured" });
    }
    if (!providedHex) {
      return res.status(400).json({ ok: false, error: "Missing hash" });
    }

    const a = Buffer.from(providedHex, "hex");
    const b = Buffer.from(expectedHex, "hex");

    if (a.length !== b.length) {
      return res.status(200).json({ ok: false });
    }

    const ok = timingSafeEqual(a, b);

    let progressTimestamp = "";
    if (ok) {
      progressTimestamp = await getMetaValue("progress_timestamp");
    }

    return res.status(200).json({ ok, progressTimestamp });
  } catch (e) {
    return res.status(200).json({ ok: false });
  }
}

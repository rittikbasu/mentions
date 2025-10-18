# mentions

a collection of all your book, movie, youtube, music and tv show mentions and recommendations from your whatsapp group chat in one place so nothing gets lost.

i built this because a friend suggested making an excel sheet to keep track of all our recs. but i did what a developer would do and spent 2 days to save 2 hours.

<table>
  <tr>
    <td align="center">home ui</td>
     <td align="center">upload ui</td>
  </tr>
  <tr>
    <td><img src="https://ik.imagekit.io/zwcfsadeijm/mentions_landingui_3WwAN_prr.png" width=300 height=720></td>
    <td><img src="https://ik.imagekit.io/zwcfsadeijm/mentions_uploadui_A4DHtZs94.png" width=300 height=720></td>
  </tr>
</table>

## how it works

- upload your whatsapp chat export (.zip).
- to prevent uploads from non group members (site is authless) the server verifies the export by checking **4 random timestamps**: it hashes the messages at those timestamps and only accepts exports that produce the same hash. this makes sure only people with the real chat can upload.
- the app extracts recs using gpt-5-mini and saves them to the database.
- movie/tv posters are fetched from tmdb; links are enriched with opengraph metadata.
- processing happens in batches of 50 messages, saves as it goes, and resumes from the last processed timestamp if anything fails.
- you can also star your favourite recs in the ui and they are stored locally in the browser.

## tech stack

- next.js
- tailwindcss
- pocketbase

## run locally

1. install deps

   ```bash
   npm install
   ```

2. create `.env.local` with:

   ```
   OPENAI_API_KEY=sk-...
   TMDB_API_KEY=...
   PB_URL=http://localhost:8090
   PB_EMAIL=admin@example.com
   PB_PASSWORD=your-pocketbase-password
   # a hex sha256 of four random messages (see snippet below)
   CHAT_HASH=<hex encoded hash of 4 random messages>
   ```

3. run

   ```bash
   npm run dev
   ```

## how the upload verifier works

- when the server is configured for a group it stores the `CHAT_HASH` (sha256 of the 4 messages concatenated in a deterministic order).
- on upload, the app extracts the same 4 timestamps from the uploaded file, canonicalizes those message strings, computes the sha256 and compares with the stored `CHAT_HASH`.
- if the hashes match the upload is accepted; otherwise the upload is rejected.

### generate `CHAT_HASH` (node snippet)

```js
// generate-chat-hash.js
// usage: node generate-chat-hash.js "msg1" "msg2" "msg3" "msg4"
const crypto = require("crypto");

const parts = process.argv.slice(2);
if (parts.length !== 4) {
  console.error("pass exactly 4 message strings in the correct anchor order");
  process.exit(1);
}

const combined = parts.join("\n");
const hex = crypto.createHash("sha256").update(combined, "utf8").digest("hex");
console.log(hex);
```

run:

```bash
node generate-chat-hash.js "msgA" "msgB" "msgC" "msgD"
# copy the output into .env.local CHAT_HASH
```

## database (pocketbase)

**collections**

- `chatrex_data` — stores extracted recommendations

  - `title` (text, required) — title of the item
  - `type` (text, required) — one of: `book | movie | tv_show | song | youtube`
  - `link` (text/url, optional)
  - `image_url` (text/url, optional)
  - `mentioned_by` (array of objects, required) — each item: `{ sender: string, timestamp: string }`

- `chatrex_meta` — simple key/value store

  - `key` (text, required, unique) — e.g. `progress_timestamp`
  - `value` (text) — value for the key

## notes

- group members are assigned single letter initials to protect privacy.
- the 4 timestamp hash is a lightweight way to limit uploads to people who have the original export.
- the upload ui shows progress, token usage and cost.
- you can close the modal and continue browsing the mentions and it will let you know when the processing is complete.

## contributing

want to contribute? open a PR — bug fixes, better parsers for weird export formats, or improved ui are all welcome.

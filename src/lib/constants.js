export const COLLECTION_NAMES = {
  DATA: "chatrex_data",
  META: "chatrex_meta",
};

export const ANCHOR_TIMESTAMPS = [
  "02/12/23, 7:27:49 AM",
  "18/12/23, 2:24:03 PM",
  "09/07/24, 2:20:25 PM",
  "18/08/24, 10:57:29 AM",
];

export const ANCHOR_LABELS = ["A", "D", "P", "R"];

export const BATCH_SIZE = 50;

export const OG_FETCH_TIMEOUT_MS = 4000;

export const ENRICH_CONCURRENCY = 6;

export const OPENAI_MODEL = "gpt-5-mini";

export const TOKEN_COSTS = {
  INPUT_PER_MILLION: 0.25,
  OUTPUT_PER_MILLION: 2.0,
};

export const TIMESTAMP_TOLERANCE_SECONDS = 2;

export const EXTRACTION_PROMPT = `Core task: Extract media recommendations from Hinglish chat.
Output: Strict JSON array [{title, type, sender, timestamp}]

Types: book | movie | tv_show | song | youtube

Link handling (highest priority):
- If the message contains a URL that fits one of our types (Spotify, Apple Music, YouTube, SoundCloud, Netlfix), set "title" to the URL exactly as it appears.
- Do NOT replace a URL with track/movie names or artists. Never infer names when a URL is present.
- If both text and a URL exist in the same message, prefer the URL.

Classification rules:
- Link with Spotify/Apple Music → song
- Link with YouTube → youtube
- Text-only songs:
    - Require high confidence that the message is actually a song.
    - Do NOT classify ambiguous words or messages as songs.
    - Neutral/positive mentions still count as recommendations; clearly negative mentions are excluded.
- Movies/TV: STRICT. Need explicit recommendation or very enthusiastic intent. Series title only, no season/episode.
- Books: Include intent to read
- EXCLUDE: sports events, generic activities or anything that cannot be mapped to a specific book/movie/tv_show/song/youtube.

Title formatting:
- Canonical English title with articles (The/A/An)
- Songs: "Title — Artist"
- Fix typos: 'social network' → 'The Social Network'

Copy timestamp exactly from message.`;

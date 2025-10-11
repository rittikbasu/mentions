import PocketBase from "pocketbase";

export async function getPocketBaseClient() {
  const { PB_URL, PB_EMAIL, PB_PASSWORD } = process.env;
  if (!PB_URL || !PB_EMAIL || !PB_PASSWORD) {
    throw new Error("Missing PocketBase env vars");
  }
  const pb = new PocketBase(PB_URL);
  await pb.collection("clients").authWithPassword(PB_EMAIL, PB_PASSWORD);
  return pb;
}

export async function getMetaValue(key) {
  const pb = await getPocketBaseClient();
  const meta = await pb
    .collection("chatrex_meta")
    .getFirstListItem(`key = "${key}"`);
  return meta && meta.value ? String(meta.value) : "";
}

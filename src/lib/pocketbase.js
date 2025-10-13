import PocketBase from "pocketbase";
import { COLLECTION_NAMES } from "./constants";

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
  try {
    const meta = await pb
      .collection(COLLECTION_NAMES.META)
      .getFirstListItem(`key = "${key}"`);
    return meta && meta.value ? String(meta.value) : "";
  } catch (e) {
    return "";
  }
}

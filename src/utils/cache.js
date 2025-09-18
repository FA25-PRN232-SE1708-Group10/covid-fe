// Utility functions for caching data using IndexedDB via idb-keyval
import { del, get, set } from "idb-keyval";

export async function getCachedData(key) {
  return await get(key);
}

export async function setCachedData(key, data) {
  return await set(key, data);
}

export async function clearCachedData(key) {
  return await del(key);
}

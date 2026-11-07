import { QdrantClient } from "@qdrant/js-client-rest";
import { config } from "./config.js";

export const qdrant = new QdrantClient({ url: config.qdrantUrl, checkCompatibility: false });

export async function waitForQdrant(attempts = 40) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await qdrant.getCollections();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw new Error(`Qdrant недоступен по адресу ${config.qdrantUrl}. ${lastError?.message || ""}`.trim());
}

export async function collectionInfo() {
  try {
    const info = await qdrant.getCollection(config.collection);
    return {
      ok: true,
      points: info.points_count ?? info.indexed_vectors_count ?? 0,
    };
  } catch (error) {
    return { ok: false, points: 0, error: error?.message || "collection missing" };
  }
}

export async function recreateCollection(size) {
  await qdrant.deleteCollection(config.collection).catch(() => {});
  await qdrant.createCollection(config.collection, {
    vectors: { size, distance: "Cosine" },
  });
}

export async function upsertPoints(points) {
  await qdrant.upsert(config.collection, {
    wait: true,
    points,
  });
}

export async function searchPoints(vector, limit) {
  const result = await qdrant.query(config.collection, {
    query: vector,
    limit,
    with_payload: true,
  });
  return result.points ?? result;
}

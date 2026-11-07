import path from "node:path";
import { pipeline, env } from "@huggingface/transformers";
import { config, projectDir } from "./config.js";

env.cacheDir = path.join(projectDir, ".cache", "transformers");
env.allowLocalModels = true;

let extractorPromise;

function extractor() {
  if (!extractorPromise) {
    extractorPromise = pipeline("feature-extraction", config.embeddingModel, { dtype: "q8" });
  }
  return extractorPromise;
}

async function embed(texts, prefix) {
  const model = await extractor();
  const output = await model(
    texts.map((text) => `${prefix}${text}`),
    { pooling: "mean", normalize: true },
  );
  const rows = output.tolist();
  if (texts.length === 1 && typeof rows[0] === "number") return [rows];
  return rows;
}

export function embedDocuments(texts) {
  return embed(texts, "passage: ");
}

export function embedQuery(text) {
  return embed([text], "query: ").then((rows) => rows[0]);
}

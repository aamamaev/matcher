import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const srcDir = path.dirname(fileURLToPath(import.meta.url));
export const backendDir = path.resolve(srcDir, "..");
export const projectDir = path.resolve(backendDir, "..");
export const cacheDir = path.join(backendDir, "data", "cache");
export const examplesPath = path.join(backendDir, "data", "examples.json");
export const metaPath = path.join(cacheDir, "meta.json");

dotenv.config({ path: path.join(projectDir, ".env") });
dotenv.config({ path: path.join(backendDir, ".env") });

export const config = {
  port: Number(process.env.PORT || 8787),
  qdrantUrl: process.env.QDRANT_URL || "http://127.0.0.1:6333",
  collection: process.env.QDRANT_COLLECTION || "tnved_eaeu",
  embeddingModel: process.env.EMBEDDING_MODEL || "Xenova/multilingual-e5-small",
  embedBatch: Number(process.env.EMBED_BATCH || 24),
  llmBaseUrl: (process.env.LLM_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, ""),
  llmApiKey: process.env.LLM_API_KEY || "",
  llmModel: process.env.LLM_MODEL || "gpt-4o-mini",
};

export const fnsZipUrl = "https://data.nalog.ru/files/tnved/tnved.zip";
export const hsCsvUrl =
  "https://raw.githubusercontent.com/datasets/harmonized-system/master/data/harmonized-system.csv";

import fs from "node:fs/promises";
import cors from "cors";
import express from "express";
import { classifyInput } from "./classify.js";
import { config, metaPath } from "./config.js";
import { collectionInfo } from "./qdrant.js";
import { llmEnabled } from "./rerank.js";

const app = express();
app.use(cors({ origin: ["http://localhost:5173", "http://127.0.0.1:5173"] }));
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", async (_request, response) => {
  const qdrant = await collectionInfo();
  let nomenclature = null;
  try {
    nomenclature = JSON.parse(await fs.readFile(metaPath, "utf8"));
  } catch {
    nomenclature = null;
  }
  response.json({
    ok: qdrant.ok && qdrant.points > 0,
    qdrant: qdrant.ok,
    points: qdrant.points,
    nomenclature,
    llm: llmEnabled(),
  });
});

app.post("/api/classify", async (request, response) => {
  if (!request.body?.url && !request.body?.card && !request.body?.title) {
    response.status(400).json({ error: "Передайте ссылку или карточку товара" });
    return;
  }
  const stream = request.get("accept") === "application/x-ndjson";
  if (!stream) {
    try {
      response.json(await classifyInput(request.body));
    } catch (error) {
      response.status(error.status || 400).json({ error: error.message || "Не удалось классифицировать товар" });
    }
    return;
  }

  response.status(200);
  response.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  response.setHeader("Cache-Control", "no-cache");
  response.setHeader("X-Accel-Buffering", "no");
  response.flushHeaders();
  const send = (event) => {
    if (!response.writableEnded) response.write(`${JSON.stringify(event)}\n`);
  };
  try {
    const result = await classifyInput(request.body, (progress) => send({ type: "progress", ...progress }));
    send({ type: "result", result });
  } catch (error) {
    send({ type: "error", error: error.message || "Не удалось классифицировать товар" });
  }
  response.end();
});

app.listen(config.port, "127.0.0.1", () => {
  console.log(`API http://127.0.0.1:${config.port}`);
});

import fs from "node:fs/promises";
import { metaPath } from "./config.js";
import { embedQuery } from "./embeddings.js";
import { cardFromBody, fetchProduct } from "./fetch-product.js";
import { collectionInfo, searchPoints } from "./qdrant.js";
import { llmEnabled, rerank } from "./rerank.js";
import { productToText } from "./text.js";

function aggregate(hits) {
  const byCode = new Map();
  for (const hit of hits) {
    const payload = hit.payload || {};
    if (!payload.code) continue;
    const weighted = hit.score * (payload.kind === "example" ? 1.08 : 1);
    let row = byCode.get(payload.code);
    if (!row) {
      row = {
        code: payload.code,
        formatted: payload.formatted,
        name: payload.name,
        path: payload.path,
        hs6: payload.hs6 || "",
        score: weighted,
        via: payload.kind,
        examples: [],
        basis: "",
      };
      byCode.set(payload.code, row);
    }
    if (weighted >= row.score) {
      row.score = weighted;
      row.via = payload.kind;
    }
    if (payload.kind === "code") {
      row.name = payload.name || row.name;
      row.path = payload.path || row.path;
      row.hs6 = payload.hs6 || row.hs6;
      row.formatted = payload.formatted || row.formatted;
    }
    if (payload.kind === "example" && payload.exampleTitle) {
      row.examples.push(payload.exampleTitle);
      row.basis = payload.basis || row.basis;
    }
  }
  return [...byCode.values()].sort((left, right) => right.score - left.score);
}

async function readMeta() {
  try {
    return JSON.parse(await fs.readFile(metaPath, "utf8"));
  } catch {
    return null;
  }
}

export async function classifyInput(body, onProgress = () => {}) {
  const info = await collectionInfo();
  if (!info.ok || !info.points) {
    const error = new Error("Индекс Qdrant пуст. В каталоге tn_ved выполните npm run index");
    error.status = 409;
    throw error;
  }

  const report = (stage, extra = {}) => onProgress({ stage, ...extra });
  const started = Date.now();
  report(body.url ? "open" : "embed", {
    detail: body.url ? "Chrome открывает страницу магазина" : "Считаю вектор текста карточки",
  });
  const product = body.url ? await fetchProduct(body.url) : cardFromBody(body);
  const fetchedAt = Date.now();
  if (body.url) {
    report("read", {
      detail: product.title,
      product: {
        marketplace: product.marketplace,
        title: product.title,
        category: product.category,
        attributes: (product.attributes || []).slice(0, 6),
      },
    });
  }
  report("embed", { detail: "Считаю вектор текста карточки" });
  const vector = await embedQuery(productToText(product));
  const embeddedAt = Date.now();
  report("search", { detail: "Сравниваю карточку с номенклатурой" });
  const hits = await searchPoints(vector, 40);
  const searchedAt = Date.now();
  const retrieval = aggregate(hits).slice(0, 12);
  let reranked;
  if (llmEnabled()) report("rerank", { detail: "Модель выбирает три кода из найденных" });
  try {
    reranked = await rerank(product, retrieval);
  } catch (error) {
    product.warnings.push(`Переранжирование не выполнилось, оставляю порядок векторов: ${error.message}`);
    reranked = {
      top: retrieval.slice(0, 3).map((candidate, index) => ({
        rank: index + 1,
        code: candidate.code,
        formatted: candidate.formatted,
        name: candidate.name,
        path: candidate.path,
        hs6: candidate.hs6,
        score: Number(candidate.score.toFixed(4)),
        examples: candidate.examples,
        reason: "",
        source: "vector",
      })),
      mode: "vector",
      model: null,
    };
  }
  const finished = Date.now();
  return {
    product,
    top: reranked.top,
    retrieval: retrieval.slice(0, 8).map((candidate) => ({
      code: candidate.code,
      formatted: candidate.formatted,
      name: candidate.name,
      path: candidate.path,
      score: Number(candidate.score.toFixed(4)),
      via: candidate.via,
      examples: candidate.examples,
    })),
    meta: {
      mode: reranked.mode,
      model: reranked.model,
      nomenclature: await readMeta(),
      timingsMs: {
        fetch: fetchedAt - started,
        embed: embeddedAt - fetchedAt,
        search: searchedAt - embeddedAt,
        rerank: finished - searchedAt,
      },
    },
  };
}

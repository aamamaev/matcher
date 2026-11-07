import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { config, examplesPath, metaPath } from "./config.js";
import { embedDocuments } from "./embeddings.js";
import { loadNomenclature } from "./nomenclature.js";
import { recreateCollection, upsertPoints, waitForQdrant } from "./qdrant.js";
import { productToText } from "./text.js";

function pointId(value) {
  const hex = createHash("sha1").update(value).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function payloadFor(node, extra) {
  return {
    kind: extra.kind,
    code: node.code,
    formatted: node.formatted,
    name: node.leaf,
    path: node.path,
    sectionName: node.sectionName || "",
    groupName: node.groupName || "",
    positionName: node.positionName || "",
    hs6: node.hs6 || "",
    level: 10,
    exampleTitle: extra.exampleTitle || "",
    basis: extra.basis || "",
  };
}

async function loadExamples(leaves) {
  const byCode = new Map(leaves.map((leaf) => [leaf.code, leaf]));
  const examples = JSON.parse(await fs.readFile(examplesPath, "utf8"));
  const documents = [];
  for (const example of examples) {
    const leaf = byCode.get(example.code);
    if (!leaf) {
      console.warn(`Пример ${example.id} пропущен: кода ${example.code} нет среди действующих`);
      continue;
    }
    documents.push({
      id: pointId(`example:${example.id}`),
      text: productToText(example),
      payload: payloadFor(leaf, {
        kind: "example",
        exampleTitle: example.title,
        basis: example.basis || "",
      }),
    });
  }
  return documents;
}

async function indexDocuments(documents) {
  const batchSize = config.embedBatch;
  let created = false;
  for (let offset = 0; offset < documents.length; offset += batchSize) {
    const slice = documents.slice(offset, offset + batchSize);
    const vectors = await embedDocuments(slice.map((document) => document.text));
    if (!created) {
      await recreateCollection(vectors[0].length);
      created = true;
    }
    await upsertPoints(
      slice.map((document, index) => ({
        id: document.id,
        vector: vectors[index],
        payload: document.payload,
      })),
    );
    console.log(`Проиндексировано ${Math.min(offset + slice.length, documents.length)} / ${documents.length}`);
  }
}

async function main() {
  const nomenclature = await loadNomenclature();
  console.log(nomenclature.meta);
  const honey = nomenclature.leaves.find((leaf) => leaf.code === "0409000000");
  console.log(honey?.passage || "мёд не найден");

  if (process.argv.includes("--parse-only")) return;

  await waitForQdrant();
  const examples = await loadExamples(nomenclature.leaves);
  const documents = [
    ...nomenclature.leaves.map((leaf) => ({
      id: pointId(`code:${leaf.code}`),
      text: leaf.passage,
      payload: payloadFor(leaf, { kind: "code" }),
    })),
    ...examples,
  ];
  const started = Date.now();
  await indexDocuments(documents);
  const meta = {
    ...nomenclature.meta,
    examples: examples.length,
    points: documents.length,
    model: config.embeddingModel,
    indexedAt: new Date().toISOString(),
  };
  await fs.mkdir(path.dirname(metaPath), { recursive: true });
  await fs.writeFile(metaPath, JSON.stringify(meta, null, 2));
  console.log(`Готово за ${Math.round((Date.now() - started) / 1000)} с. Точек: ${documents.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

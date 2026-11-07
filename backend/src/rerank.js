import { config } from "./config.js";
import { productToText } from "./text.js";

export function llmEnabled() {
  return Boolean(config.llmApiKey);
}

function asTop(candidates, source) {
  return candidates.slice(0, 3).map((candidate, index) => ({
    rank: index + 1,
    code: candidate.code,
    formatted: candidate.formatted,
    name: candidate.name,
    path: candidate.path,
    hs6: candidate.hs6,
    score: Number(candidate.score.toFixed(4)),
    examples: candidate.examples,
    reason: candidate.reason || "",
    source,
  }));
}

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("В ответе модели нет JSON");
  return JSON.parse(raw.slice(start, end + 1));
}

export async function rerank(product, candidates) {
  if (!candidates.length) return { top: [], mode: "vector", model: null };
  if (!config.llmApiKey) return { top: asTop(candidates, "vector"), mode: "vector", model: null };

  const allowed = new Map(candidates.map((candidate) => [candidate.code, candidate]));
  const list = candidates
    .map((candidate, index) =>
      [
        `${index + 1}. Код ${candidate.formatted} (${candidate.code})`,
        `Путь: ${candidate.path}`,
        candidate.hs6 && `HS6: ${candidate.hs6}`,
        `Близость вектора: ${candidate.score.toFixed(3)}`,
        candidate.examples.length && `Похожий размеченный пример: ${candidate.examples.join("; ")}`,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");

  const response = await fetch(`${config.llmBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.llmApiKey}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(40_000),
    body: JSON.stringify({
      model: config.llmModel,
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "Ты выбираешь код ТН ВЭД ЕАЭС только из переданного списка. Это прототип, не таможенное решение. Коды вне списка запрещены. Если для выбора листа не хватает материала, состава, назначения или комплектности, напиши это в why. Лист «прочие» бери, когда более конкретный сосед ничем не подтверждён. Верни JSON {\"choices\":[{\"code\":\"10 цифр без пробелов\",\"why\":\"одна короткая фраза\"}]} из трёх разных кодов, по убыванию правдоподобия.",
        },
        {
          role: "user",
          content: `Товар:\n${productToText(product)}\n\nКандидаты:\n${list}`,
        },
      ],
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`LLM ответил ${response.status}: ${detail.slice(0, 300)}`);
  }
  const body = await response.json();
  const content = body.choices?.[0]?.message?.content || "";
  const parsed = extractJson(content);
  const chosen = [];
  for (const choice of parsed.choices || []) {
    const code = String(choice.code || "").replace(/\D/g, "");
    const candidate = allowed.get(code);
    if (!candidate || chosen.some((item) => item.code === code)) continue;
    chosen.push({ ...candidate, reason: collapseReason(choice.why) });
    if (chosen.length === 3) break;
  }
  for (const candidate of candidates) {
    if (chosen.length === 3) break;
    if (!chosen.some((item) => item.code === candidate.code)) chosen.push(candidate);
  }
  return { top: asTop(chosen, "llm"), mode: "llm", model: config.llmModel };
}

function collapseReason(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 400);
}

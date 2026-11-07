import { readProductPage } from "./browser.js";
import { collapse } from "./text.js";

const HOSTS = [
  "ozon.ru",
  "wildberries.ru",
  "wb.ru",
  "market.yandex.ru",
  "market.yandex.by",
  "market.yandex.kz",
  "market.yandex.uz",
  "aliexpress.ru",
  "aliexpress.com",
];

function allowedHost(hostname) {
  const host = hostname.toLowerCase();
  return HOSTS.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

function marketplaceOf(hostname) {
  const host = hostname.toLowerCase();
  if (host.endsWith("ozon.ru")) return "ozon";
  if (host.endsWith("wildberries.ru") || host.endsWith("wb.ru")) return "wildberries";
  if (host.includes("market.yandex.")) return "yandex";
  if (host.includes("aliexpress.")) return "aliexpress";
  return null;
}

export function assertProductUrl(raw) {
  let url;
  try {
    url = new URL(String(raw || "").trim());
  } catch {
    throw new Error("Некорректная ссылка");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Нужна ссылка http или https");
  if (url.username || url.password) throw new Error("Ссылка с логином и паролем не подходит");
  if (!allowedHost(url.hostname)) {
    throw new Error("Нужна ссылка на товар Ozon, Wildberries, Яндекс Маркета или AliExpress");
  }
  return url;
}

function cleanTitle(value) {
  return collapse(value)
    .replace(/\s+[|–—-]\s+купить\b.*$/i, "")
    .replace(/\s+\|\s+(Wildberries|OZON|Яндекс Маркет|AliExpress).*$/i, "")
    .trim();
}

function dedupeAttributes(attributes) {
  const seen = new Set();
  const result = [];
  for (const attribute of attributes) {
    const key = attribute.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(attribute);
  }
  return result;
}

function blockMessage(marketplace, heading) {
  const where = {
    wildberries: "Wildberries",
    ozon: "Ozon",
    yandex: "Яндекс Маркет",
    aliexpress: "AliExpress",
  }[marketplace] || "Площадка";
  const detail = heading ? ` Страница говорит: «${heading}».` : "";
  return `${where} не открыл карточку.${detail} Вставьте название и признаки.`;
}

export async function fetchProduct(raw) {
  const url = assertProductUrl(raw);
  const marketplace = marketplaceOf(url.hostname);
  if (!marketplace) throw new Error("Эту площадку пока не разбираю");
  const page = await readProductPage(url.toString());
  const title = cleanTitle(page.heading);
  if (page.blocked || !title || page.status === 403 || page.status === 498) {
    throw new Error(blockMessage(marketplace, page.heading));
  }
  return {
    marketplace,
    url: page.finalUrl || url.toString(),
    title,
    brand: "",
    category: collapse(page.category),
    description: "",
    attributes: dedupeAttributes(page.attributes),
    warnings: [],
  };
}

export function cardFromBody(body) {
  const source = body?.card || body || {};
  const rawAttributes = Array.isArray(source.attributes)
    ? source.attributes
    : Object.entries(source.attributes || {}).map(([name, value]) => ({ name, value: String(value) }));
  const title = collapse(source.title);
  if (!title) throw new Error("Нужно название товара");
  return {
    marketplace: "manual",
    url: "",
    title,
    brand: collapse(source.brand),
    category: collapse(source.category),
    description: collapse(source.description).slice(0, 4000),
    attributes: dedupeAttributes(
      rawAttributes
        .map((item) => ({ name: collapse(item.name), value: collapse(item.value) }))
        .filter((item) => item.name && item.value),
    ).slice(0, 40),
    warnings: [],
  };
}

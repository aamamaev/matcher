import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";
import { collapse } from "./text.js";

const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

const BLOCKED = /подозрительная активность|сопоставьте пазл|подтвердите, что вы не бот|похоже, нет соединения|checking your browser|antibot captcha/i;

let browserPromise;
let queue = Promise.resolve();

function chromePath() {
  const home = os.homedir();
  const candidates = [
    process.env.CHROME_PATH,
    path.join(
      home,
      "Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
    ),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean);
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error("Не найден Chrome для открытия карточки. Укажите путь в CHROME_PATH.");
  }
  return found;
}

async function browser() {
  if (!browserPromise) {
    browserPromise = chromium
      .launch({ headless: true, executablePath: chromePath() })
      .catch((error) => {
        browserPromise = undefined;
        throw error;
      });
  }
  return browserPromise;
}

function withPage(task) {
  const run = queue.then(task, task);
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

const SPEC_LABEL = /^(вес|не содержит|происхождение|место происхождения|упаковка|срок годности|основные ингредиенты|класс|возрастная категория|белки|жиры|углеводы|энергетическая|состав|материал|объ[её]м|вкус|тип продукта|назначение|страна)/i;

function isValue(line) {
  if (!line || line.length > 200) return false;
  if (/₽|купил|корзин|войти|все характеристики/i.test(line)) return false;
  return true;
}

export function specsFromLines(lines) {
  const attributes = [];
  for (let index = 0; index < lines.length - 1; index += 1) {
    if (!SPEC_LABEL.test(lines[index]) || !isValue(lines[index + 1])) continue;
    attributes.push({ name: lines[index], value: lines[index + 1] });
    index += 1;
  }
  const seen = new Set();
  return attributes.filter((attribute) => {
    const key = attribute.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function categoryFromLines(lines) {
  const shelf = lines.find((line) => /^м[её]д и продукты пчеловодства$/i.test(line));
  if (shelf) return shelf;
  const food = lines.findIndex((line) => line === "Еда");
  if (food >= 0 && /^м[её]д$/i.test(lines[food + 1] || "")) return "Еда / Мёд";
  return "";
}

export async function readProductPage(url) {
  return withPage(async () => {
    const instance = await browser();
    const context = await instance.newContext({
      userAgent: USER_AGENT,
      viewport: { width: 1920, height: 1080 },
      locale: "ru-RU",
      timezoneId: "Europe/Moscow",
      extraHTTPHeaders: {
        Accept: "text/html,application/xhtml+xml,application/xml",
        "Accept-Language": "ru-RU,ru;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        Connection: "keep-alive",
      },
    });
    const page = await context.newPage();
    try {
      const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForTimeout(3500);
      const status = response?.status() ?? 0;
      const snapshot = await page.evaluate(() => {
        const text = document.body?.innerText || "";
        const heading = document.querySelector("h1")?.innerText || "";
        const lines = text
          .split("\n")
          .map((line) => line.replace(/\s+/g, " ").trim())
          .filter(Boolean);
        return {
          finalUrl: location.href,
          documentTitle: document.title,
          heading,
          lines: lines.slice(0, 250),
        };
      });
      const heading = collapse(snapshot.heading);
      const blocked = BLOCKED.test(`${snapshot.documentTitle}\n${heading}\n${snapshot.lines.slice(0, 30).join("\n")}`);
      return {
        status,
        finalUrl: snapshot.finalUrl,
        documentTitle: collapse(snapshot.documentTitle),
        heading,
        blocked,
        lines: snapshot.lines,
        category: categoryFromLines(snapshot.lines),
        attributes: specsFromLines(snapshot.lines).slice(0, 20),
      };
    } finally {
      await context.close();
    }
  });
}

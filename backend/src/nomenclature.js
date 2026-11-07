import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import iconv from "iconv-lite";
import { cacheDir, fnsZipUrl, hsCsvUrl } from "./config.js";
import { buildPassage, cleanName, collapse, formatCode } from "./text.js";

const execFileAsync = promisify(execFile);
const DATE_RE = /^\d{2}\.\d{2}\.\d{4}$/;

function todayUtc() {
  const now = new Date();
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
}

function parseRuDate(value) {
  if (!value || !DATE_RE.test(value.trim())) return null;
  const [day, month, year] = value.trim().split(".").map(Number);
  return Date.UTC(year, month - 1, day);
}

function parseHeader(line) {
  const [version = "", ymd = ""] = line.split("|");
  const date = /^\d{8}$/.test(ymd) ? `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}` : ymd;
  return { version, date };
}

function parseRow(line) {
  const parts = line.split("|").map((part) => part.replace(/\u00a0/g, " "));
  if (parts.at(-1) === "") parts.pop();

  let from = null;
  let to = null;
  if (DATE_RE.test((parts.at(-1) || "").trim()) && DATE_RE.test((parts.at(-2) || "").trim())) {
    to = parts.at(-1).trim();
    from = parts.at(-2).trim();
    parts.splice(-2, 2);
  } else if (parts.at(-1) === "" && DATE_RE.test((parts.at(-2) || "").trim())) {
    from = parts.at(-2).trim();
    parts.splice(-2, 2);
  } else if (DATE_RE.test((parts.at(-1) || "").trim())) {
    from = parts.at(-1).trim();
    parts.pop();
  } else {
    return null;
  }

  const codes = [];
  while (parts.length && /^\d{1,6}$/.test(parts[0].trim()) && codes.length < 3) {
    codes.push(parts.shift().trim().padStart(parts.length ? 2 : 2, "0"));
  }
  const name = collapse(parts.shift() || "");
  if (!codes.length || !name) return null;
  return { codes, name, from: parseRuDate(from), to: to ? parseRuDate(to) : null };
}

function isActive(row, today) {
  if (row.from != null && row.from > today) return false;
  if (row.to != null && row.to < today) return false;
  return true;
}

function keepLatest(map, key, row) {
  const previous = map.get(key);
  if (!previous || (row.from ?? 0) >= (previous.from ?? 0)) map.set(key, row);
}

async function download(url, destination) {
  try {
    const stat = await fs.stat(destination);
    if (stat.size > 10_000) return destination;
  } catch {
    // cache miss
  }
  const response = await fetch(url, {
    headers: { "User-Agent": "tnved-prototype" },
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`Не удалось скачать ${url}: ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, buffer);
  return destination;
}

async function readEncoded(file) {
  const buffer = await fs.readFile(file);
  return iconv.decode(buffer, "cp866");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

async function loadHs() {
  const file = path.join(cacheDir, "harmonized-system.csv");
  try {
    await download(hsCsvUrl, file);
  } catch (error) {
    console.warn(`HS6-описания не скачались, индекс будет только на русских заголовках: ${error.message}`);
    return new Map();
  }
  const rows = parseCsv(await fs.readFile(file, "utf8"));
  const header = rows.shift() || [];
  const codeIndex = header.indexOf("hscode");
  const descriptionIndex = header.indexOf("description");
  const levelIndex = header.indexOf("level");
  const map = new Map();
  for (const row of rows) {
    const level = row[levelIndex];
    if (level !== "4" && level !== "6") continue;
    const code = (row[codeIndex] || "").trim();
    const description = collapse(row[descriptionIndex] || "");
    if (code && description) map.set(code, description);
  }
  console.log(`Описания HS уровней 4 и 6: ${map.size}`);
  return map;
}

async function loadFnsFiles() {
  await fs.mkdir(cacheDir, { recursive: true });
  const zipPath = path.join(cacheDir, "tnved.zip");
  const extractDir = path.join(cacheDir, "fns");
  await download(fnsZipUrl, zipPath);
  await fs.rm(extractDir, { recursive: true, force: true });
  await fs.mkdir(extractDir, { recursive: true });
  await execFileAsync("unzip", ["-qo", zipPath, "-d", extractDir]);
  const files = await fs.readdir(extractDir);
  const find = (needle) => files.find((name) => name.toLowerCase() === needle);
  const required = ["tnved1.txt", "tnved2.txt", "tnved3.txt", "tnved4.txt"].map(find);
  if (required.some((name) => !name)) {
    throw new Error(`В архиве ФНС нет ожидаемых файлов: ${files.join(", ")}`);
  }
  return required.map((name) => path.join(extractDir, name));
}

function rowsFromText(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const header = parseHeader(lines[0] || "");
  const rows = [];
  for (const line of lines.slice(1)) {
    const row = parseRow(line);
    if (row) rows.push(row);
  }
  return { header, rows };
}

function padCode(value, size) {
  return String(value).padStart(size, "0");
}

export async function loadNomenclature() {
  const today = todayUtc();
  const [file1, file2, file3, file4] = await loadFnsFiles();
  const sectionsFile = rowsFromText(await readEncoded(file1));
  const groupsFile = rowsFromText(await readEncoded(file2));
  const positionsFile = rowsFromText(await readEncoded(file3));
  const leavesFile = rowsFromText(await readEncoded(file4));
  const hs = await loadHs();

  const sections = new Map();
  for (const row of sectionsFile.rows) {
    if (!isActive(row, today)) continue;
    keepLatest(sections, padCode(row.codes[0], 2), row);
  }

  const groups = new Map();
  const groupSection = new Map();
  for (const row of groupsFile.rows) {
    if (!isActive(row, today) || row.codes.length < 2) continue;
    const group = padCode(row.codes[1], 2);
    keepLatest(groups, group, row);
    groupSection.set(group, padCode(row.codes[0], 2));
  }

  const positions = new Map();
  for (const row of positionsFile.rows) {
    if (!isActive(row, today) || row.codes.length < 2) continue;
    const code = padCode(row.codes[0], 2) + padCode(row.codes[1], 2);
    keepLatest(positions, code, row);
  }

  const leaves = [];
  const seen = new Map();
  for (const row of leavesFile.rows) {
    if (!isActive(row, today) || row.codes.length < 3) continue;
    const code = padCode(row.codes[0], 2) + padCode(row.codes[1], 2) + padCode(row.codes[2], 6);
    if (code.length !== 10) continue;
    const previous = seen.get(code);
    if (previous && (row.from ?? 0) < (previous.from ?? 0)) continue;
    seen.set(code, row);
  }

  let missingPositions = 0;
  for (const [code, row] of seen) {
    const group = code.slice(0, 2);
    const position = code.slice(0, 4);
    const sectionId = groupSection.get(group);
    const sectionName = sectionId ? sections.get(sectionId)?.name || "" : "";
    const groupName = groups.get(group)?.name || "";
    const russianPosition = positions.get(position)?.name || "";
    if (!russianPosition) missingPositions += 1;
    const positionName = russianPosition || hs.get(position) || "";
    const hs6 = hs.get(code.slice(0, 6)) || "";
    const leaf = cleanName(row.name) || collapse(row.name);
    const node = {
      code,
      formatted: formatCode(code),
      sectionName,
      groupName,
      positionName,
      hs6,
      leaf,
      from: row.from,
    };
    node.path = [
      sectionName && `Раздел: ${sectionName}`,
      groupName && `Группа ${group}: ${groupName}`,
      positionName && `Позиция ${position}: ${positionName}`,
      `Подсубпозиция: ${leaf}`,
    ]
      .filter(Boolean)
      .join(" → ");
    node.passage = buildPassage(node);
    leaves.push(node);
  }

  leaves.sort((a, b) => a.code.localeCompare(b.code));
  if (leaves.length < 8000 || leaves.length > 25000) {
    throw new Error(`Неожиданное число действующих 10-значных кодов: ${leaves.length}`);
  }
  return {
    leaves,
    meta: {
      source: fnsZipUrl,
      hsSource: hsCsvUrl,
      version: leavesFile.header.version,
      date: leavesFile.header.date,
      leaves: leaves.length,
      sections: sections.size,
      groups: groups.size,
      positions: positions.size,
      missingPositionHeadings: missingPositions,
      hsLabels: hs.size,
    },
  };
}

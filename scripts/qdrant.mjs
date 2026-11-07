import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function dockerReady() {
  try {
    execFileSync("docker", ["info"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function startDocker() {
  const child = spawn("docker", ["compose", "up", "-d"], { cwd: root, stdio: "inherit" });
  child.on("exit", (code) => process.exit(code ?? 0));
}

async function startBinary() {
  if (process.platform !== "darwin") {
    console.error("Docker не запущен. Поднимите Qdrant командой docker compose up -d");
    process.exit(1);
  }
  const arch = process.arch === "arm64" ? "aarch64" : "x86_64";
  const tools = path.join(root, ".tools");
  const binary = path.join(tools, "qdrant");
  fs.mkdirSync(tools, { recursive: true });
  if (!fs.existsSync(binary)) {
    const url = `https://github.com/qdrant/qdrant/releases/download/v1.20.0/qdrant-${arch}-apple-darwin.tar.gz`;
    console.log(`Docker не запущен, скачиваю локальный Qdrant ${url}`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Не удалось скачать Qdrant: ${response.status}`);
    const archive = path.join(tools, "qdrant.tar.gz");
    fs.writeFileSync(archive, Buffer.from(await response.arrayBuffer()));
    execFileSync("tar", ["-xzf", archive, "-C", tools]);
    try {
      execFileSync("xattr", ["-dr", "com.apple.quarantine", binary]);
    } catch {
      // карантина может не быть
    }
  }
  const data = path.join(root, ".qdrant");
  fs.mkdirSync(data, { recursive: true });
  console.log("Qdrant слушает http://127.0.0.1:6333");
  const child = spawn(binary, [], {
    cwd: data,
    stdio: "inherit",
    env: {
      ...process.env,
      QDRANT__SERVICE__HTTP_PORT: "6333",
      QDRANT__TELEMETRY_DISABLED: "true",
    },
  });
  child.on("exit", (code) => process.exit(code ?? 0));
}

if (dockerReady()) startDocker();
else startBinary().catch((error) => {
  console.error(error);
  process.exit(1);
});

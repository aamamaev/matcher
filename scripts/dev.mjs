import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const api = spawn("npm", ["--prefix", "backend", "run", "start"], { cwd: root, stdio: "inherit" });
const web = spawn("npm", ["--prefix", "frontend", "run", "dev", "--", "--host", "127.0.0.1"], {
  cwd: root,
  stdio: "inherit",
});

function shutdown() {
  api.kill("SIGTERM");
  web.kill("SIGTERM");
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

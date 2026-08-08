import { cp, mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "www");
const excluded = new Set([
  ".git", ".github", ".vscode", "android", "ios", "node_modules", "scripts",
  "supabase", "tests", "docs", "templates", "www"
]);
const rootFiles = new Set(["index.html", "offline.html", "site.webmanifest", "service-worker.js"]);

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const entry of await readdir(root)) {
  if (excluded.has(entry)) continue;
  const source = path.join(root, entry);
  const info = await stat(source);
  if (info.isDirectory()) {
    if (entry === "assets") await cp(source, path.join(output, entry), { recursive: true });
    continue;
  }
  if (rootFiles.has(entry)) await cp(source, path.join(output, entry));
}

console.log("KYUM native web bundle prepared in www/");

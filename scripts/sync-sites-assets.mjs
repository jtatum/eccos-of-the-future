import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const publicRoot = resolve(root, "public");
if (dirname(publicRoot) !== resolve(root)) throw new Error("Refusing to replace an unexpected public directory.");

await rm(publicRoot, { recursive: true, force: true });
await mkdir(publicRoot, { recursive: true });

for (const path of [
  "404.html", "AGENTS.md", "app.js", "assets", "ecco", "humans.txt", "llms.txt",
  "manifest.webmanifest", "robots.txt", "rooms", "src", "styles.css", "sw.js", ".well-known"
]) {
  await cp(join(root, path), join(publicRoot, path), { recursive: true });
}

const sourceHtml = await readFile(join(root, "index.html"), "utf8");
const sitesHtml = sourceHtml.replace(
  '<meta name="ecco-signal"',
  '<meta name="ecco-counter-endpoint" content="/api/countersign-success">\n  <meta name="ecco-signal"'
);
await writeFile(join(publicRoot, "index-static.html"), sitesHtml, "utf8");

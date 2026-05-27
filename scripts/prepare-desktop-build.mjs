import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtimeDirectory = path.join(rootDirectory, "desktop-runtime");
const serverDirectory = path.join(runtimeDirectory, "server");
const standaloneDirectory = path.join(rootDirectory, ".next", "standalone");
const nextStaticDirectory = path.join(rootDirectory, ".next", "static");
const publicDirectory = path.join(rootDirectory, "public");

if (!existsSync(standaloneDirectory)) {
  fail("Missing .next/standalone. Run `npm run build` before preparing the desktop app.");
}

rmSync(runtimeDirectory, { recursive: true, force: true });
mkdirSync(serverDirectory, { recursive: true });

cpSync(standaloneDirectory, serverDirectory, { recursive: true, dereference: true });

if (existsSync(nextStaticDirectory)) {
  cpSync(nextStaticDirectory, path.join(serverDirectory, ".next", "static"), { recursive: true, dereference: true });
}

if (existsSync(publicDirectory)) {
  cpSync(publicDirectory, path.join(serverDirectory, "public"), { recursive: true, dereference: true });
}

writeFileSync(path.join(serverDirectory, ".env"), "", "utf8");
console.log("Desktop env source: first-run user settings modal");

console.log(`Prepared desktop server runtime at ${path.relative(rootDirectory, serverDirectory)}`);

function fail(message) {
  console.error(message);
  process.exit(1);
}

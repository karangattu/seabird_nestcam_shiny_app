import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return {};
  }
  const content = readFileSync(filePath, "utf8");
  const values = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }
    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value.replaceAll("\\n", "\n");
  }
  return values;
}

const localEnv = {
  ...parseEnvFile(path.join(rootDirectory, ".env")),
  ...parseEnvFile(path.join(rootDirectory, ".env.local")),
};

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  localEnv.NEXT_PUBLIC_SUPABASE_URL ||
  localEnv.SUPABASE_URL ||
  "";

const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  localEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  localEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  localEnv.SUPABASE_ANON_KEY ||
  "";

const envLines = [];
if (supabaseUrl) {
  envLines.push(`NEXT_PUBLIC_SUPABASE_URL=${supabaseUrl}`);
}
if (supabaseKey) {
  envLines.push(`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${supabaseKey}`);
}

writeFileSync(path.join(serverDirectory, ".env"), envLines.length ? `${envLines.join("\n")}\n` : "", "utf8");

console.log(`Prepared desktop server runtime at ${path.relative(rootDirectory, serverDirectory)}`);

function fail(message) {
  console.error(message);
  process.exit(1);
}

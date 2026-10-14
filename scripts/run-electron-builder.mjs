import { spawnSync } from "node:child_process";

const env = { ...process.env };

const isMac = process.platform === "darwin";
const isWin = process.platform === "win32";

const cscLink = isMac
  ? env.MAC_CSC_LINK || env.CSC_LINK
  : isWin
    ? env.WIN_CSC_LINK || env.CSC_LINK
    : env.CSC_LINK;

const cscKeyPassword = isMac
  ? env.MAC_CSC_KEY_PASSWORD || env.CSC_KEY_PASSWORD
  : isWin
    ? env.WIN_CSC_KEY_PASSWORD || env.CSC_KEY_PASSWORD
    : env.CSC_KEY_PASSWORD;

if (cscLink && cscLink.trim().length > 0) {
  env.CSC_LINK = cscLink.trim();
} else {
  delete env.CSC_LINK;
  delete env.MAC_CSC_LINK;
  delete env.WIN_CSC_LINK;
}

if (cscKeyPassword && cscKeyPassword.trim().length > 0) {
  env.CSC_KEY_PASSWORD = cscKeyPassword.trim();
} else {
  delete env.CSC_KEY_PASSWORD;
  delete env.MAC_CSC_KEY_PASSWORD;
  delete env.WIN_CSC_KEY_PASSWORD;
}

if (!env.APPLE_ID || env.APPLE_ID.trim().length === 0) {
  delete env.APPLE_ID;
  delete env.APPLE_APP_SPECIFIC_PASSWORD;
  delete env.APPLE_TEAM_ID;
}

if (!env.CSC_LINK) {
  env.CSC_IDENTITY_AUTO_DISCOVERY = "false";
}

const args = process.argv.slice(2);
const result = spawnSync("npx", ["electron-builder", ...args], {
  stdio: "inherit",
  env,
  shell: true,
});

process.exit(result.status ?? 0);

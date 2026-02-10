"use strict";

const { execSync } = require("child_process");

// No Linux/macOS o NSIS falha (uninstaller não é gerado). Só construímos o portable.
// No Windows usamos a config do package.json (portable + NSIS).
const isWindows = process.platform === "win32";
const env = { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: "false" };
// No Linux: só target portable (evita erro do NSIS). Sintaxe: --win <target>
const args = isWindows
  ? "electron-builder --win"
  : "electron-builder --win portable";

execSync(`npx ${args}`, { stdio: "inherit", env });

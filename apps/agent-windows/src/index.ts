/**
 * Agente de monitoramento para Windows (entrada ESM).
 * Use: npm run dev | npm start
 */

import { createRequire } from "node:module";
import { run } from "./main.js";

const require = createRequire(import.meta.url);
const screenshot = require("screenshot-desktop") as Parameters<typeof run>[0];

run(screenshot).catch((err) => {
  console.error(err);
  process.exit(1);
});

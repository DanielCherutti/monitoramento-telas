"use strict";

const { app, BrowserWindow, ipcMain, Tray, nativeImage, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const WebSocket = require("ws");

const CONFIG_PATH = path.join(app.getPath("userData"), "config.json");

function getConfigPath() {
  return CONFIG_PATH;
}

function loadConfig() {
  try {
    const data = fs.readFileSync(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(data);
    if (parsed && typeof parsed.apiUrl === "string" && parsed.apiUrl.trim()) {
      return parsed;
    }
  } catch (_) {
    // no config or invalid
  }
  return null;
}

function saveConfig(config) {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
}

let mainWindow = null;
let tray = null;
let agentRunning = false;

function createWindow(showConfig = true) {
  const win = new BrowserWindow({
    width: 480,
    height: 560,
    minWidth: 400,
    minHeight: 500,
    title: "Monitoramento de Telas — Agente",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
    backgroundColor: "#0f0f12",
    titleBarStyle: "default",
  });

  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, "config-ui.html"));

  win.once("ready-to-show", () => {
    if (showConfig) win.show();
  });

  win.on("closed", () => {
    mainWindow = null;
  });

  return win;
}

function createTray() {
  const iconPath = path.join(__dirname, "tray-icon.png");
  if (!fs.existsSync(iconPath)) return;
  try {
    const icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) return;
    tray = new Tray(icon);
    tray.setToolTip("Agente de Monitoramento");
    tray.on("click", () => {
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
      } else {
        mainWindow = createWindow(true);
      }
    });
  } catch (_) {}
}

function writeLogLine(logFilePath, line) {
  try {
    const dir = path.dirname(logFilePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(logFilePath, new Date().toISOString() + " " + line + "\n", "utf8");
  } catch (_) {}
}

function startAgent(config) {
  if (agentRunning) return Promise.resolve();
  agentRunning = true;

  const logFilePath = path.join(app.getPath("userData"), "agent-log.txt");
  writeLogLine(logFilePath, "[start] Iniciando agente...");

  let screenshot;
  try {
    screenshot = require("screenshot-desktop");
  } catch (err) {
    writeLogLine(logFilePath, "[start] ERRO ao carregar captura de tela: " + (err.message || String(err)));
    agentRunning = false;
    throw err;
  }

  const agentPath = path.join(__dirname, "..", "dist-pkg", "main.cjs");
  let run;
  try {
    run = require(agentPath).run;
  } catch (err) {
    writeLogLine(logFilePath, "[start] ERRO ao carregar módulo do agente: " + (err.message || String(err)));
    agentRunning = false;
    throw err;
  }

  const screenCount = config.screenCount != null ? Math.max(1, parseInt(String(config.screenCount), 10) || 1) : undefined;
  return run(screenshot, {
    apiUrl: config.apiUrl.trim(),
    agentId: (config.agentId || "").trim() || undefined,
    hostname: (config.hostname || "").trim() || undefined,
    registrationSecret: (config.registrationSecret || "").trim() || "dev-agent-secret",
    fps: config.fps,
    logFilePath,
    screenCount: screenCount === 1 ? undefined : screenCount,
  }).catch((err) => {
    writeLogLine(logFilePath, "[start] ERRO ao executar agente: " + (err.message || String(err)));
    agentRunning = false;
    throw err;
  });
}

app.whenReady().then(() => {
  ipcMain.handle("config:load", () => loadConfig());
  ipcMain.handle("config:save", (_event, config) => {
    saveConfig(config);
    return true;
  });
  ipcMain.handle("agent:start", async (_event, config) => {
    await startAgent(config);
    return { ok: true };
  });
  ipcMain.handle("window:minimize-to-tray", () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
  });

  ipcMain.handle("path:logFile", () => path.join(app.getPath("userData"), "agent-log.txt"));
  ipcMain.handle("shell:openLogFolder", () => shell.openPath(app.getPath("userData")));

  ipcMain.handle("connection:test", async (_event, { apiUrl, agentId }) => {
    const base = (apiUrl || "").trim().replace(/\/$/, "");
    const aid = (agentId || "TEST").trim();
    if (!base) return { ok: false, message: "URL da API vazia." };
    try {
      const healthRes = await fetch(base + "/health");
      if (!healthRes.ok) return { ok: false, message: "API HTTP: status " + healthRes.status };
      const wsUrl = base.replace(/^http/, "ws") + "/ws/device/preview?agentId=" + encodeURIComponent(aid);
      const result = await new Promise((resolve) => {
        const ws = new WebSocket(wsUrl);
        const t = setTimeout(() => {
          try { ws.close(); } catch (_) {}
          resolve({ ok: false, message: "WebSocket: tempo esgotado (10s). No processo principal a conexão pode estar bloqueada (firewall/antivírus)." });
        }, 10000);
        ws.on("open", () => {
          clearTimeout(t);
          try { ws.close(); } catch (_) {}
          resolve({ ok: true, message: "Conexão OK no processo principal (mesmo do agente). API e WebSocket acessíveis." });
        });
        ws.on("error", (err) => {
          clearTimeout(t);
          resolve({ ok: false, message: "WebSocket (processo principal): " + (err.message || "erro de rede.") });
        });
        ws.on("close", (code) => {
          clearTimeout(t);
          if (code === 4001) resolve({ ok: true, message: "Conexão OK no processo principal (dispositivo não registrado é esperado). Pode salvar e iniciar." });
          else if (code !== 1000 && code !== 1005) resolve({ ok: false, message: "WebSocket fechou com código " + code });
        });
      });
      return result;
    } catch (err) {
      return { ok: false, message: (err.message || String(err)) };
    }
  });

  const config = loadConfig();
  mainWindow = createWindow(true);

  if (config) {
    mainWindow.webContents.once("did-finish-load", () => {
      mainWindow.webContents.send("config:loaded", config);
    });
    startAgent(config).then(() => {
      if (mainWindow) mainWindow.webContents.send("agent:started");
    }).catch((err) => {
      if (mainWindow) mainWindow.webContents.send("agent:error", err.message);
    });
  }

  try {
    createTray();
  } catch (_) {
    // tray optional
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (mainWindow === null) mainWindow = createWindow(true);
});

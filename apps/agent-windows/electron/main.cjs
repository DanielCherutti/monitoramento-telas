"use strict";

const { app, BrowserWindow, ipcMain, Tray, nativeImage, shell, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const WebSocket = require("ws");

let autoUpdater = null;
if (app.isPackaged) {
  try {
    autoUpdater = require("electron-updater").autoUpdater;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowPrerelease = true; // considera releases Beta / Pre-release
  } catch (_) {}
}

const CONFIG_PATH = path.join(app.getPath("userData"), "config.json");

// Uma única instância: abrir o .exe de novo só traz a janela à frente
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}
app.on("second-instance", () => {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  } else {
    mainWindow = createWindow(true);
  }
});

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
    width: 440,
    height: 500,
    minWidth: 400,
    minHeight: 460,
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

  win.on("close", (e) => {
    if (app.isQuitting || !tray) {
      mainWindow = null;
      return;
    }
    e.preventDefault();
    win.hide();
  });

  win.on("closed", () => {
    mainWindow = null;
  });

  return win;
}

const { Menu } = require("electron");

// Ícone mínimo 16x16 (cinza) para bandeja quando tray-icon.png não existir
const TRAY_FALLBACK_ICON = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAHklEQVQ4y2NgGAWjYBSMglEwCkbBKBgFDPQCDADhBAV/ePhjZAAAAABJRU5ErkJggg==";

function getTrayIcon() {
  const iconPath = path.join(__dirname, "tray-icon.png");
  if (fs.existsSync(iconPath)) {
    const img = nativeImage.createFromPath(iconPath);
    if (!img.isEmpty()) return img;
  }
  return nativeImage.createFromDataURL(TRAY_FALLBACK_ICON);
}

function createTray() {
  try {
    const icon = getTrayIcon();
    tray = new Tray(icon);
    tray.setToolTip("Agente de Monitoramento — clique para abrir");
    tray.on("click", () => {
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
      } else {
        mainWindow = createWindow(true);
      }
    });
    tray.on("right-click", () => {
      const menu = Menu.buildFromTemplate([
        { label: "Abrir", click: () => { if (mainWindow) mainWindow.show(); else mainWindow = createWindow(true); } },
        { type: "separator" },
        { label: "Sair", click: () => { app.isQuitting = true; app.quit(); } },
      ]);
      tray.setContextMenu(menu);
      tray.popUpContextMenu();
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
  if (agentRunning) {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("agent:started");
    return Promise.resolve();
  }
  agentRunning = true;

  const logFilePath = path.join(app.getPath("userData"), "agent-log.txt");
  writeLogLine(logFilePath, "[start] Iniciando agente... (se a VPN estiver desconectada, o agente tentará a cada 15s até conectar)");

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

function setupAutoUpdater() {
  if (!autoUpdater) return;
  autoUpdater.on("update-available", (info) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("update:available", info.version);
    }
  });
  autoUpdater.on("update-downloaded", async (info) => {
    const { response } = await dialog.showMessageBox(mainWindow && !mainWindow.isDestroyed() ? mainWindow : null, {
      type: "info",
      title: "Atualização disponível",
      message: `A versão ${info.version} foi baixada. Reiniciar o agente agora para aplicar?`,
      buttons: ["Reiniciar agora", "Depois"],
      defaultId: 0,
    });
    if (response === 0) autoUpdater.quitAndInstall(false, true);
  });
  autoUpdater.on("update-not-available", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("update:not-available");
    }
  });
  autoUpdater.on("error", (err) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("update:error", err.message);
    }
  });
  // Verificação inicial após 10s e a cada 4h
  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 10_000);
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 4 * 60 * 60 * 1000);
}

app.whenReady().then(() => {
  app.isQuitting = false;
  setupAutoUpdater();

  ipcMain.handle("config:load", () => ({ config: loadConfig(), agentRunning }));
  ipcMain.handle("config:save", (_event, config) => {
    saveConfig(config);
    return true;
  });
  ipcMain.handle("update:check", async () => {
    const currentVersion = app.getVersion();
    if (!autoUpdater) return { hasUpdate: false, currentVersion };
    try {
      const result = await autoUpdater.checkForUpdates();
      const version = result?.updateInfo?.version;
      return { hasUpdate: !!version, version: version || null, currentVersion };
    } catch (_) {
      return { hasUpdate: false, currentVersion };
    }
  });
  ipcMain.handle("app:version", () => app.getVersion());

  ipcMain.handle("github:latest-release", async () => {
    try {
      const res = await fetch("https://api.github.com/repos/DanielCherutti/monitoramento-telas/releases/latest", {
        headers: { Accept: "application/vnd.github.v3+json" },
      });
      if (!res.ok) return { tag: null, error: res.status };
      const data = await res.json();
      const tag = data.tag_name || null;
      const assets = (data.assets || []).map((a) => a.name);
      const releaseUrl = data.html_url || (tag ? `https://github.com/DanielCherutti/monitoramento-telas/releases/tag/${tag}` : null);
      const assetExe = (data.assets || []).find((a) => a.name === "monitoramento-agent.exe");
      const downloadUrl = assetExe ? assetExe.browser_download_url : null;
      return { tag, assets, releaseUrl, downloadUrl };
    } catch (e) {
      return { tag: null, error: (e && e.message) || "erro" };
    }
  });
  ipcMain.handle("update:quitAndInstall", () => {
    if (autoUpdater) autoUpdater.quitAndInstall(false, true);
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
  ipcMain.handle("shell:openUrl", (_event, url) => {
    if (url && typeof url === "string") shell.openExternal(url);
  });

  ipcMain.handle("update:downloadAndReplace", async () => {
    if (!app.isPackaged) return { ok: false, message: "Só funciona no .exe instalado." };
    try {
      const res = await fetch("https://api.github.com/repos/DanielCherutti/monitoramento-telas/releases/latest", {
        headers: { Accept: "application/vnd.github.v3+json" },
      });
      if (!res.ok) return { ok: false, message: "Não foi possível obter a release." };
      const data = await res.json();
      const assetExe = (data.assets || []).find((a) => a.name === "monitoramento-agent.exe");
      if (!assetExe || !assetExe.browser_download_url) return { ok: false, message: "Asset monitoramento-agent.exe não encontrado na release." };
      const downloadUrl = assetExe.browser_download_url;
      const currentVersion = app.getVersion();
      const tagVersion = (data.tag_name || "").replace(/^v/, "");
      if (tagVersion === currentVersion) return { ok: false, message: "Já está na versão mais recente." };

      const tempDir = app.getPath("temp");
      const newExePath = path.join(tempDir, "monitoramento-agent-new.exe");
      const downloadRes = await fetch(downloadUrl);
      if (!downloadRes.ok) return { ok: false, message: "Download falhou (HTTP " + downloadRes.status + ")." };
      const out = fs.createWriteStream(newExePath);
      await new Promise((resolve, reject) => {
        downloadRes.body.pipe(out);
        out.on("finish", () => { out.close(); resolve(); });
        out.on("error", reject);
        downloadRes.body.on("error", reject);
      });

      const currentExe = process.execPath;
      const batPath = path.join(tempDir, "monitoramento-agent-update.bat");
      const batContent =
        "@echo off\r\n" +
        "timeout /t 2 /nobreak > nul\r\n" +
        "copy /Y \"" + newExePath.replace(/\"/g, "\"\"") + "\" \"" + currentExe.replace(/\"/g, "\"\"") + "\"\r\n" +
        "start \"\" \"" + currentExe.replace(/\"/g, "\"\"") + "\"\r\n" +
        "del \"" + newExePath.replace(/\"/g, "\"\"") + "\"\r\n" +
        "del \"%~f0\"\r\n";
      fs.writeFileSync(batPath, batContent, "utf8");

      spawn("cmd.exe", ["/c", batPath], { detached: true, stdio: "ignore", windowsHide: true }).unref();
      setImmediate(() => app.quit());
      return { ok: true };
    } catch (e) {
      return { ok: false, message: (e && e.message) || "Erro ao baixar ou preparar atualização." };
    }
  });

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

  mainWindow.on("show", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("agent:status", agentRunning);
    }
  });

  if (config) {
    mainWindow.webContents.once("did-finish-load", () => {
      mainWindow.webContents.send("config:loaded", config, agentRunning);
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

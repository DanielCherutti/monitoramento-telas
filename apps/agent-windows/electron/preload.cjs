"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("agentApi", {
  loadConfig: () => ipcRenderer.invoke("config:load"),
  saveConfig: (config) => ipcRenderer.invoke("config:save", config),
  startAgent: (config) => ipcRenderer.invoke("agent:start", config),
  minimizeToTray: () => ipcRenderer.invoke("window:minimize-to-tray"),
  getLogPath: () => ipcRenderer.invoke("path:logFile"),
  openLogFolder: () => ipcRenderer.invoke("shell:openLogFolder"),
  testConnection: (apiUrl, agentId) => ipcRenderer.invoke("connection:test", { apiUrl, agentId }),
  onConfigLoaded: (fn) => {
    ipcRenderer.on("config:loaded", (_event, config, agentRunning) => fn(config, agentRunning));
  },
  onAgentStarted: (fn) => {
    ipcRenderer.on("agent:started", () => fn());
  },
  onAgentError: (fn) => {
    ipcRenderer.on("agent:error", (_event, message) => fn(message));
  },
  checkForUpdates: () => ipcRenderer.invoke("update:check"),
  getAppVersion: () => ipcRenderer.invoke("app:version"),
  onUpdateAvailable: (fn) => ipcRenderer.on("update:available", (_event, version) => fn(version)),
  onUpdateDownloaded: (fn) => ipcRenderer.on("update:downloaded", (_event, version) => fn(version)),
  onUpdateError: (fn) => ipcRenderer.on("update:error", (_event, message) => fn(message)),
  onUpdateNotAvailable: (fn) => ipcRenderer.on("update:not-available", () => fn()),
  onAgentStatus: (fn) => ipcRenderer.on("agent:status", (_event, running) => fn(running)),
});

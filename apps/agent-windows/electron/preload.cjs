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
    ipcRenderer.on("config:loaded", (_event, config) => fn(config));
  },
  onAgentStarted: (fn) => {
    ipcRenderer.on("agent:started", () => fn());
  },
  onAgentError: (fn) => {
    ipcRenderer.on("agent:error", (_event, message) => fn(message));
  },
});

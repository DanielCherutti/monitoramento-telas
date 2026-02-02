/**
 * Lógica do agente de monitoramento (registro, WebSocket, captura).
 * Recebe a função de captura de tela para permitir ESM (createRequire) ou CJS (require).
 * Aceita config opcional (ex.: vindo da interface Electron); senão usa process.env.
 */

import os from "node:os";
import fs from "node:fs";
import WebSocket from "ws";

export type ScreenshotFn = (options?: { format?: "jpg" | "png"; screen?: number }) => Promise<Buffer>;
/** Módulo screenshot-desktop: default + listDisplays + all */
export type ScreenshotModule = ScreenshotFn & {
  listDisplays?: () => Promise<{ id: number; name: string }[]>;
  all?: (options?: { format?: "jpg" | "png" }) => Promise<Buffer[]>;
};

export interface AgentConfig {
  apiUrl: string;
  agentId: string;
  hostname: string;
  registrationSecret: string;
  fps?: number;
  /** Caminho do arquivo para gravar log (diagnóstico em outros PCs) */
  logFilePath?: string;
  /** Número de telas (opcional). Se >= 2, envia meta na conexão para o seletor aparecer na plataforma. */
  screenCount?: number;
}

function getConfig(overrides?: AgentConfig | null) {
  return {
    AGENT_ID: overrides?.agentId ?? process.env.AGENT_ID ?? os.hostname(),
    HOSTNAME: overrides?.hostname ?? process.env.HOSTNAME ?? os.hostname(),
    API_URL: overrides?.apiUrl ?? process.env.API_URL ?? "http://localhost:4001",
    REGISTRATION_SECRET:
      overrides?.registrationSecret ??
      process.env.REGISTRATION_SECRET ??
      process.env.AGENT_REGISTRATION_SECRET ??
      "dev-agent-secret",
    FPS: Math.max(
      0.25,
      Math.min(2, overrides?.fps ?? (Number(process.env.FPS) || 1))
    ),
  };
}

function logToFile(filePath: string | undefined, line: string): void {
  const s = `${new Date().toISOString()} ${line}\n`;
  if (filePath) {
    try {
      fs.appendFileSync(filePath, s, "utf8");
    } catch (_) {}
  }
  console.log(line);
}

export async function run(screenshot: ScreenshotModule, config?: AgentConfig | null): Promise<void> {
  const cfg = getConfig(config);
  const logPath = config?.logFilePath;
  const log = (msg: string) => logToFile(logPath, msg);
  const INTERVAL_MS = Math.round(1000 / cfg.FPS);
  const WS_URL = cfg.API_URL.replace(/^http/, "ws");
  const listDisplays = screenshot.listDisplays ?? (() => Promise.resolve([{ id: 0, name: "Principal" }]));
  const captureAll = screenshot.all ?? (async () => [await screenshot({ format: "jpg" })]);

  async function register(): Promise<boolean> {
    const res = await fetch(`${cfg.API_URL}/devices/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        agentId: cfg.AGENT_ID,
        hostname: cfg.HOSTNAME,
        secret: cfg.REGISTRATION_SECRET,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      log(`[register] Falha: ${res.status} ${text}`);
      return false;
    }
    log(`[register] Dispositivo registrado: ${cfg.AGENT_ID} ${cfg.HOSTNAME}`);
    return true;
  }

  function connectPreview(): WebSocket {
    const url = `${WS_URL}/ws/device/preview?agentId=${encodeURIComponent(cfg.AGENT_ID)}`;
    const ws = new WebSocket(url);
    ws.binaryType = "nodebuffer";

    ws.on("open", () => {
      log("[preview] Conectado ao servidor");
    });

    ws.on("close", (code: number, reason: Buffer) => {
      log(`[preview] Conexão fechada: ${code} ${reason?.toString() || ""}`);
    });

    ws.on("error", (err: Error) => {
      log(`[preview] Erro: ${err.message}`);
    });

    return ws;
  }

  /** Captura todas as telas; retorna array de buffers (1 byte índice + jpeg por tela). */
  async function captureAllFrames(): Promise<Buffer[]> {
    try {
      const buffers = await captureAll({ format: "jpg" });
      return buffers.map((buf, i) => Buffer.concat([Buffer.from([Math.min(255, i)]), buf]));
    } catch (err) {
      log(`[capture] Erro ao capturar telas: ${(err as Error).message}`);
      return [];
    }
  }

  function runPreviewLoop(ws: WebSocket, initialScreenCount: number): void {
    let running = true;
    let actualScreenCount = initialScreenCount;
    const lastGoodFrames: Buffer[] = [];

    const sendFrames = async () => {
      if (!running || ws.readyState !== WebSocket.OPEN) return;
      const frames = await captureAllFrames();
      if (frames.length > actualScreenCount) {
        actualScreenCount = frames.length;
        log(`[preview] ${actualScreenCount} tela(s) detectada(s) (captura)`);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "meta", screens: actualScreenCount }));
        }
      }
      for (let i = 0; i < frames.length; i++) if (frames[i]) lastGoodFrames[i] = frames[i];
      for (let i = 0; i < actualScreenCount && ws.readyState === WebSocket.OPEN; i++) {
        const toSend = frames[i] ?? lastGoodFrames[i];
        if (toSend) ws.send(toSend);
      }
    };

    const interval = setInterval(sendFrames, INTERVAL_MS);

    ws.on("close", () => {
      running = false;
      clearInterval(interval);
    });

    ws.on("error", () => {
      running = false;
      clearInterval(interval);
    });

    sendFrames();
  }

  log(`Agente de monitoramento — ${cfg.AGENT_ID} ${cfg.HOSTNAME}`);
  log(`API: ${cfg.API_URL} | Preview: ${cfg.FPS} fps`);

  const ok = await register();
  if (!ok) {
    const msg =
      "Não foi possível registrar o dispositivo na API. Verifique a URL da API, o segredo e se a API está rodando.";
    log(`ERRO: ${msg}`);
    throw new Error(msg);
  }

  function connectAndRun(): void {
    const ws = connectPreview();
    const forcedScreenCount = config?.screenCount != null && config.screenCount >= 1 ? Math.round(config.screenCount) : null;
    ws.on("open", async () => {
      let screenCount = forcedScreenCount ?? 1;
      if (forcedScreenCount != null) {
        log(`[preview] ${screenCount} tela(s) (configuração manual)`);
      } else {
        try {
          const displays = await listDisplays();
          screenCount = Math.max(1, displays?.length ?? 1);
          log(`[preview] ${screenCount} tela(s) (listDisplays)`);
        } catch (_) {
          screenCount = 1;
        }
      }
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "meta", screens: screenCount }));
      }
      runPreviewLoop(ws, screenCount);
    });
    ws.on("close", () => {
      log("[preview] Reconectando em 5s...");
      setTimeout(connectAndRun, 5000);
    });
  }

  connectAndRun();
}

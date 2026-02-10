"use strict";
/**
 * Lógica do agente de monitoramento (registro, WebSocket, captura).
 * Recebe a função de captura de tela para permitir ESM (createRequire) ou CJS (require).
 * Aceita config opcional (ex.: vindo da interface Electron); senão usa process.env.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.run = run;
const node_os_1 = __importDefault(require("node:os"));
const node_fs_1 = __importDefault(require("node:fs"));
const ws_1 = __importDefault(require("ws"));
function getConfig(overrides) {
    return {
        AGENT_ID: overrides?.agentId ?? process.env.AGENT_ID ?? node_os_1.default.hostname(),
        HOSTNAME: overrides?.hostname ?? process.env.HOSTNAME ?? node_os_1.default.hostname(),
        API_URL: overrides?.apiUrl ?? process.env.API_URL ?? "http://localhost:4001",
        REGISTRATION_SECRET: overrides?.registrationSecret ??
            process.env.REGISTRATION_SECRET ??
            process.env.AGENT_REGISTRATION_SECRET ??
            "dev-agent-secret",
        FPS: Math.max(0.25, Math.min(2, overrides?.fps ?? (Number(process.env.FPS) || 1))),
    };
}
function logToFile(filePath, line) {
    const s = `${new Date().toISOString()} ${line}\n`;
    if (filePath) {
        try {
            node_fs_1.default.appendFileSync(filePath, s, "utf8");
        }
        catch (_) { }
    }
    console.log(line);
}
async function run(screenshot, config) {
    const cfg = getConfig(config);
    const logPath = config?.logFilePath;
    const log = (msg) => logToFile(logPath, msg);
    const INTERVAL_MS = Math.round(1000 / cfg.FPS);
    const WS_URL = cfg.API_URL.replace(/^http/, "ws");
    const listDisplays = screenshot.listDisplays ?? (() => Promise.resolve([{ id: 0, name: "Principal" }]));
    const captureAll = screenshot.all ?? (async () => [await screenshot({ format: "jpg" })]);
    async function register() {
        try {
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
        catch (err) {
            log(`[register] Erro de rede: ${err.message} (VPN/rede indisponível — tentando de novo em 15s)`);
            return false;
        }
    }
    function connectPreview() {
        const url = `${WS_URL}/ws/device/preview?agentId=${encodeURIComponent(cfg.AGENT_ID)}`;
        const ws = new ws_1.default(url);
        ws.binaryType = "nodebuffer";
        ws.on("open", () => {
            log("[preview] Conectado ao servidor");
        });
        ws.on("close", (code, reason) => {
            log(`[preview] Conexão fechada: ${code} ${reason?.toString() || ""}`);
        });
        ws.on("error", (err) => {
            log(`[preview] Erro: ${err.message}`);
        });
        return ws;
    }
    /** Captura todas as telas; retorna array de buffers (1 byte índice + jpeg por tela). */
    async function captureAllFrames() {
        try {
            const buffers = await captureAll({ format: "jpg" });
            return buffers.map((buf, i) => Buffer.concat([Buffer.from([Math.min(255, i)]), buf]));
        }
        catch (err) {
            log(`[capture] Erro ao capturar telas: ${err.message}`);
            return [];
        }
    }
    function runPreviewLoop(ws, initialScreenCount) {
        let running = true;
        let actualScreenCount = initialScreenCount;
        const lastGoodFrames = [];
        const sendFrames = async () => {
            if (!running || ws.readyState !== ws_1.default.OPEN)
                return;
            const frames = await captureAllFrames();
            if (frames.length > actualScreenCount) {
                actualScreenCount = frames.length;
                log(`[preview] ${actualScreenCount} tela(s) detectada(s) (captura)`);
                if (ws.readyState === ws_1.default.OPEN) {
                    ws.send(JSON.stringify({ type: "meta", screens: actualScreenCount }));
                }
            }
            for (let i = 0; i < frames.length; i++)
                if (frames[i])
                    lastGoodFrames[i] = frames[i];
            for (let i = 0; i < actualScreenCount && ws.readyState === ws_1.default.OPEN; i++) {
                const toSend = frames[i] ?? lastGoodFrames[i];
                if (toSend)
                    ws.send(toSend);
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
    const REGISTER_RETRY_MS = 15_000; // 15s entre tentativas (ex.: esperar VPN)
    log(`Agente de monitoramento — ${cfg.AGENT_ID} ${cfg.HOSTNAME}`);
    log(`API: ${cfg.API_URL} | Preview: ${cfg.FPS} fps`);
    for (;;) {
        try {
            const ok = await register();
            if (ok)
                break;
        }
        catch (err) {
            log(`[register] Erro: ${err.message}. Tentando novamente em ${REGISTER_RETRY_MS / 1000}s.`);
        }
        log(`Aguardando ${REGISTER_RETRY_MS / 1000}s para tentar de novo… (conecte a VPN para conectar automaticamente)`);
        await new Promise((r) => setTimeout(r, REGISTER_RETRY_MS));
    }
    function connectAndRun() {
        const ws = connectPreview();
        const forcedScreenCount = config?.screenCount != null && config.screenCount >= 1 ? Math.round(config.screenCount) : null;
        ws.on("open", async () => {
            let screenCount = forcedScreenCount ?? 1;
            if (forcedScreenCount != null) {
                log(`[preview] ${screenCount} tela(s) (configuração manual)`);
            }
            else {
                try {
                    const displays = await listDisplays();
                    screenCount = Math.max(1, displays?.length ?? 1);
                    log(`[preview] ${screenCount} tela(s) (listDisplays)`);
                }
                catch (_) {
                    screenCount = 1;
                }
            }
            if (ws.readyState === ws_1.default.OPEN) {
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

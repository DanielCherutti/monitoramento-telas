"use client";

import { useEffect, useRef, useState } from "react";

import { getApiUrl, getAuthHeaders, getWsUrl } from "@/lib/api";

type Props = {
  deviceId: string;
  token: string | null;
  screen?: number;
  onOffline?: () => void;
  onScreensCount?: (n: number) => void;
};

const CONNECTING_TIMEOUT_MS = 12_000;
const RETRY_ON_AGENT_OFFLINE_MS = 2_500;
const MAX_RETRIES = 8;
const BACKGROUND_RETRY_MS = 15_000; // quando ficar Offline, tentar de novo após 15s

export default function PreviewThumbnail({ deviceId, token, screen = 0, onOffline, onScreensCount }: Props) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<"connecting" | "live" | "off">("connecting");
  const wsRef = useRef<WebSocket | null>(null);
  const lastUrlRef = useRef<string | null>(null);
  const onOfflineRef = useRef(onOffline);
  onOfflineRef.current = onOffline;
  const onScreensCountRef = useRef(onScreensCount);
  onScreensCountRef.current = onScreensCount;
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const offlineRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);
  const mountedRef = useRef(true);

  // Buscar número de telas na API (ao montar e a cada 8s) para o seletor aparecer mesmo se a meta do WebSocket não chegar
  useEffect(() => {
    if (!token || !deviceId) return;
    const fetchScreens = () => {
      fetch(`${getApiUrl()}/devices/${encodeURIComponent(deviceId)}/screens`, {
        headers: getAuthHeaders(token),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data: { screens?: number } | null) => {
          // Só atualizar quando tiver 2+ telas (não sobrescrever com 1 após reinício da API)
          if (mountedRef.current && data && typeof data.screens === "number" && data.screens > 1) {
            onScreensCountRef.current?.(data.screens);
          }
        })
        .catch(() => {});
    };
    fetchScreens();
    const interval = setInterval(fetchScreens, 8000);
    return () => clearInterval(interval);
  }, [deviceId, token]);

  const connectionIdRef = useRef(0);

  useEffect(() => {
    if (!token) return;
    mountedRef.current = true;
    retryCountRef.current = 0;
    const thisConnectionId = ++connectionIdRef.current;
    setPreviewUrl(null);
    setStatus("connecting");

    const url = `${getWsUrl()}/ws/supervisor/preview?deviceId=${encodeURIComponent(deviceId)}&token=${encodeURIComponent(token)}&screen=${Math.max(0, screen)}`;

    function connect() {
      if (!mountedRef.current) return;
      const ws = new WebSocket(url);
      wsRef.current = ws;
      ws.binaryType = "arraybuffer";

      let connectingTimeout: ReturnType<typeof setTimeout> | null = null;

      ws.onopen = () => {
        if (thisConnectionId !== connectionIdRef.current) return;
        setStatus("connecting");
      };
      const handleMeta = (raw: string) => {
        if (thisConnectionId !== connectionIdRef.current) return;
        try {
          const meta = JSON.parse(raw) as { type?: string; screens?: number };
          if (meta.type === "meta" && typeof meta.screens === "number") {
            onScreensCountRef.current?.(Math.max(1, meta.screens));
          }
        } catch {
          // ignore
        }
      };

      ws.onmessage = (ev) => {
        if (thisConnectionId !== connectionIdRef.current) return;
        if (typeof ev.data === "string") {
          handleMeta(ev.data);
          return;
        }
        if (ev.data instanceof Blob) {
          ev.data.text().then(handleMeta).catch(() => {});
          return;
        }
        if (typeof ev.data !== "object" || !(ev.data instanceof ArrayBuffer)) return;
        if (connectingTimeout) {
          clearTimeout(connectingTimeout);
          connectingTimeout = null;
        }
        if (offlineRetryRef.current) {
          clearTimeout(offlineRetryRef.current);
          offlineRetryRef.current = null;
        }
        retryCountRef.current = 0;
        setStatus("live");
        const blob = new Blob([ev.data], { type: "image/jpeg" });
        const objectUrl = URL.createObjectURL(blob);
        if (lastUrlRef.current) URL.revokeObjectURL(lastUrlRef.current);
        lastUrlRef.current = objectUrl;
        setPreviewUrl(objectUrl);
      };

      const goOffline = () => {
        if (connectingTimeout) {
          clearTimeout(connectingTimeout);
          connectingTimeout = null;
        }
        setStatus("off");
        setPreviewUrl((u) => (u ? u : null));
        onOfflineRef.current?.();
      };

      ws.onclose = (ev: CloseEvent) => {
        wsRef.current = null;
        if (connectingTimeout) {
          clearTimeout(connectingTimeout);
          connectingTimeout = null;
        }
        const code = ev.code;
        if (mountedRef.current && (code === 4002 || code === 4003) && retryCountRef.current < MAX_RETRIES) {
          retryCountRef.current += 1;
          setStatus("connecting");
          retryTimeoutRef.current = setTimeout(connect, RETRY_ON_AGENT_OFFLINE_MS);
          return;
        }
        setStatus("off");
        setPreviewUrl((u) => (u ? u : null));
        onOfflineRef.current?.();
        if (mountedRef.current) {
          if (offlineRetryRef.current) clearTimeout(offlineRetryRef.current);
          offlineRetryRef.current = setTimeout(() => {
            offlineRetryRef.current = null;
            if (mountedRef.current) {
              retryCountRef.current = 0;
              setStatus("connecting");
              connect();
            }
          }, BACKGROUND_RETRY_MS);
        }
      };
      ws.onerror = () => {
        ws.close();
      };

      connectingTimeout = setTimeout(() => {
        connectingTimeout = null;
        if (wsRef.current === ws && ws.readyState !== WebSocket.CLOSED && ws.readyState !== WebSocket.CLOSING) {
          ws.close();
        }
      }, CONNECTING_TIMEOUT_MS);
    }

    connect();

    return () => {
      mountedRef.current = false;
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      if (offlineRetryRef.current) {
        clearTimeout(offlineRetryRef.current);
        offlineRetryRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (lastUrlRef.current) {
        URL.revokeObjectURL(lastUrlRef.current);
        lastUrlRef.current = null;
      }
      setPreviewUrl(null);
    };
  }, [deviceId, token, screen]);

  return (
    <div className="relative w-full aspect-video bg-slate-900 overflow-hidden flex items-center justify-center">
      {previewUrl ? (
        <img src={previewUrl} alt="Preview ao vivo" className="w-full h-full object-contain" />
      ) : (
        <div className="flex flex-col items-center justify-center text-slate-500">
          {status === "connecting" && (
            <div className="w-8 h-8 border-2 border-slate-600 border-t-slate-400 rounded-full animate-spin" />
          )}
          <span className="mt-2 text-xs">
            {status === "connecting" ? "Conectando..." : status === "off" ? "Offline" : "Sem preview"}
          </span>
        </div>
      )}
      {previewUrl && status === "live" && (
        <span className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded bg-black/50 text-white text-xs font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          Ao vivo
        </span>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getApiUrl, getAuthHeaders } from "@/lib/api";
import PreviewThumbnail from "../dashboard/PreviewThumbnail";
import { PlatformTitle } from "@/app/components/PlatformTitle";
import Footer from "@/app/components/Footer";

type Favorite = {
  id: string;
  deviceId: string;
  sortOrder: number;
  device: { id: string; hostname: string; agentId: string; lastSeenAt: string | null };
};

const LAYOUT_KEY = "monitorLayout";

type TileLayout = { x: number; y: number; w: number; h: number };

const MIN_SIZE = 15;
const MAX_SIZE = 100;

function getDefaultLayout(index: number, total: number): TileLayout {
  if (total <= 0) return { x: 0, y: 0, w: 50, h: 50 };
  const cols = total <= 2 ? total : Math.ceil(Math.sqrt(total));
  const rows = Math.ceil(total / cols);
  const col = index % cols;
  const row = Math.floor(index / cols);
  const w = 100 / cols;
  const h = 100 / rows;
  return {
    x: col * w,
    y: row * h,
    w,
    h,
  };
}

function loadLayout(): Record<string, TileLayout> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, { x?: number; y?: number; w?: number; h?: number }>;
    const out: Record<string, TileLayout> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (v && typeof v.x === "number" && typeof v.y === "number" && typeof v.w === "number" && typeof v.h === "number") {
        out[k] = {
          x: Math.max(0, Math.min(100, v.x)),
          y: Math.max(0, Math.min(100, v.y)),
          w: Math.max(MIN_SIZE, Math.min(MAX_SIZE, v.w)),
          h: Math.max(MIN_SIZE, Math.min(MAX_SIZE, v.h)),
        };
      }
    }
    return out;
  } catch {
    return {};
  }
}

function saveLayout(layout: Record<string, TileLayout>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
  } catch {
    // ignore
  }
}

export default function MonitorPage() {
  const searchParams = useSearchParams();
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [mounted, setMounted] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showHeader, setShowHeader] = useState(true);
  const [layout, setLayout] = useState<Record<string, TileLayout>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [screensCountByDevice, setScreensCountByDevice] = useState<Record<string, number>>({});
  const [selectedScreenByDevice, setSelectedScreenByDevice] = useState<Record<string, number>>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef<Record<string, TileLayout>>({});

  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  useEffect(() => {
    setMounted(true);
    setToken(typeof window !== "undefined" ? localStorage.getItem("token") : null);
    setLayout(loadLayout());
  }, []);

  const visibleFavorites = useMemo(() => {
    if (selectedIds.size === 0) return favorites;
    return favorites.filter((f) => selectedIds.has(f.deviceId));
  }, [favorites, selectedIds]);

  useEffect(() => {
    const only = searchParams.get("only");
    const devices = searchParams.get("devices");
    if (only) {
      setSelectedIds(new Set([only]));
      return;
    }
    if (devices) {
      const ids = devices.split(",").filter(Boolean);
      setSelectedIds(ids.length ? new Set(ids) : new Set());
      return;
    }
    setSelectedIds(new Set());
  }, [searchParams]);

  useEffect(() => {
    if (favorites.length === 0) return;
    if (selectedIds.size === 0) setSelectedIds(new Set(favorites.map((f) => f.deviceId)));
  }, [favorites]);

  const toggleDevice = useCallback((deviceId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(deviceId)) next.delete(deviceId);
      else next.add(deviceId);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(favorites.map((f) => f.deviceId)));
  }, [favorites]);

  const loadFavorites = useCallback(async () => {
    if (!token) return;
    const res = await fetch(`${getApiUrl()}/favorites`, {
      headers: getAuthHeaders(token),
    });
    if (!res.ok) return;
    const data = (await res.json()) as { favorites: Favorite[] };
    setFavorites(data.favorites);
  }, [token]);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    loadFavorites().finally(() => setLoading(false));
  }, [token, loadFavorites]);

  const getTileLayout = useCallback(
    (deviceId: string, index: number, total: number): TileLayout => {
      const saved = layout[deviceId];
      if (saved) return saved;
      return getDefaultLayout(index, total);
    },
    [layout]
  );

  const updateTileLayout = useCallback((deviceId: string, updater: (prev: TileLayout) => TileLayout, index: number, total: number) => {
    setLayout((prev) => {
      const current = prev[deviceId] ?? getDefaultLayout(index, total);
      const next = { ...prev, [deviceId]: updater(current) };
      saveLayout(next);
      return next;
    });
  }, []);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent, deviceId: string, index: number, total: number) => {
      e.preventDefault();
      e.stopPropagation();
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const startX = e.clientX;
      const startY = e.clientY;
      const current = layout[deviceId] ?? getDefaultLayout(index, total);
      const startW = current.w;
      const startH = current.h;

      const onMove = (moveEvent: MouseEvent) => {
        const dx = ((moveEvent.clientX - startX) / rect.width) * 100;
        const dy = ((moveEvent.clientY - startY) / rect.height) * 100;
        const newW = Math.max(MIN_SIZE, Math.min(MAX_SIZE, startW + dx));
        const newH = Math.max(MIN_SIZE, Math.min(MAX_SIZE, startH + dy));
        updateTileLayout(deviceId, (prev) => ({ ...prev, w: newW, h: newH }), index, total);
      };

      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.body.style.cursor = "nwse-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [layout, updateTileLayout]
  );

  const handleMoveStart = useCallback(
    (e: React.MouseEvent, deviceId: string, index: number, total: number, visibleList: Favorite[]) => {
      e.preventDefault();
      e.stopPropagation();
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const startX = e.clientX;
      const startY = e.clientY;
      const current = layout[deviceId] ?? getDefaultLayout(index, total);
      const startLeft = current.x;
      const startTop = current.y;
      const dropLayoutRef = { current: { ...current } };

      const onMove = (moveEvent: MouseEvent) => {
        const dx = ((moveEvent.clientX - startX) / rect.width) * 100;
        const dy = ((moveEvent.clientY - startY) / rect.height) * 100;
        let newX = startLeft + dx;
        let newY = startTop + dy;
        newX = Math.max(0, Math.min(100 - current.w, newX));
        newY = Math.max(0, Math.min(100 - current.h, newY));
        dropLayoutRef.current = { ...current, x: newX, y: newY };
        updateTileLayout(deviceId, (prev) => ({ ...prev, x: newX, y: newY }), index, total);
      };

      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";

        const dropped = dropLayoutRef.current;
        const centerX = dropped.x + dropped.w / 2;
        const centerY = dropped.y + dropped.h / 2;
        const currentLayout = layoutRef.current;

        for (let i = 0; i < visibleList.length; i++) {
          if (visibleList[i].deviceId === deviceId) continue;
          const otherId = visibleList[i].deviceId;
          const other = currentLayout[otherId] ?? getDefaultLayout(i, visibleList.length);
          const inX = centerX >= other.x && centerX <= other.x + other.w;
          const inY = centerY >= other.y && centerY <= other.y + other.h;
          if (inX && inY) {
            setLayout((prev) => {
              const otherLayout = prev[otherId] ?? getDefaultLayout(i, visibleList.length);
              const next = {
                ...prev,
                [deviceId]: otherLayout,
                [otherId]: dropped,
              };
              saveLayout(next);
              return next;
            });
            return;
          }
        }
      };

      document.body.style.cursor = "move";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [layout, updateTileLayout]
  );

  if (!mounted) {
    return (
      <main className="h-screen bg-slate-900 flex flex-col items-center justify-center text-slate-400">
        <div className="w-10 h-10 border-2 border-slate-600 border-t-slate-400 rounded-full animate-spin" />
        <p className="mt-4 text-sm">Carregando...</p>
      </main>
    );
  }

  if (!token) {
    return (
      <main className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6">
        <div className="flex-1 flex flex-col items-center justify-center">
          <p className="text-slate-300 text-center mb-6">Faça login para usar o monitor em TV.</p>
          <Link
            href="/"
            className="px-6 py-3 rounded-lg bg-white text-slate-900 font-medium hover:bg-slate-100 transition-colors"
          >
            Entrar
          </Link>
        </div>
        <Footer />
      </main>
    );
  }

  if (loading) {
    return (
      <main className="h-screen bg-slate-900 flex flex-col items-center justify-center text-slate-400">
        <div className="w-10 h-10 border-2 border-slate-600 border-t-slate-400 rounded-full animate-spin" />
        <p className="mt-4 text-sm">Carregando dispositivos...</p>
      </main>
    );
  }

  if (favorites.length === 0) {
    return (
      <main className="h-screen bg-slate-900 flex flex-col items-center justify-center p-6">
        <p className="text-slate-300 text-center mb-2">Nenhum favorito configurado.</p>
        <p className="text-slate-500 text-sm text-center mb-6">Adicione dispositivos nos favoritos no dashboard.</p>
        <Link
          href="/dashboard"
          className="px-6 py-3 rounded-lg bg-white text-slate-900 font-medium hover:bg-slate-100 transition-colors"
        >
          Ir ao Dashboard
        </Link>
      </main>
    );
  }

  const contentHeight = showHeader ? "calc(100vh - 88px)" : "100vh";

  return (
    <main className="h-screen flex flex-col bg-slate-900 text-white overflow-hidden">
      {showHeader && (
        <header className="shrink-0 flex flex-wrap items-center justify-between gap-3 px-4 py-2 bg-black/40 backdrop-blur border-b border-white/10">
          <div className="flex flex-wrap items-center gap-4">
            <PlatformTitle className="text-lg" lightBg={false} logoSize={32} logoSrc="/images/icon.png" />
            <span className="text-slate-400 text-sm">
              {visibleFavorites.length} de {favorites.length} {favorites.length === 1 ? "tela" : "telas"} · Arraste para mover, trocar ou redimensionar
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-slate-500 text-xs">Filtrar:</span>
              {favorites.map((f) => (
                <label key={f.deviceId} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === 0 || selectedIds.has(f.deviceId)}
                    onChange={() => toggleDevice(f.deviceId)}
                    className="rounded border-slate-500 bg-slate-800 text-emerald-500 focus:ring-emerald-500"
                  />
                  <span className="text-xs text-slate-300 truncate max-w-[120px]" title={f.device.hostname}>{f.device.hostname}</span>
                </label>
              ))}
              <button
                type="button"
                onClick={selectAll}
                className="px-2 py-1 rounded text-xs text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
              >
                Todas
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowHeader(false)}
              className="px-3 py-1.5 rounded-lg text-sm text-slate-300 hover:bg-white/10 transition-colors"
              title="Ocultar barra"
            >
              Ocultar barra
            </button>
            <Link
              href="/dashboard"
              className="px-3 py-1.5 rounded-lg text-sm text-slate-300 hover:bg-white/10 transition-colors"
            >
              Dashboard
            </Link>
          </div>
        </header>
      )}

      {!showHeader && (
        <div
          className="absolute top-0 left-0 right-0 h-12 z-10 cursor-pointer flex items-center justify-center bg-black/20 hover:bg-black/40 transition-colors"
          onClick={() => setShowHeader(true)}
          title="Clique para mostrar a barra"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && setShowHeader(true)}
        >
          <span className="text-slate-400 text-xs">Clique para mostrar opções · Arraste para mover, trocar de posição ou redimensionar</span>
        </div>
      )}

      <div
        ref={containerRef}
        className="flex-1 relative overflow-hidden p-2"
        style={{ height: contentHeight }}
      >
        {visibleFavorites.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500">
            <p className="text-sm font-medium">Nenhuma tela selecionada</p>
            <p className="text-xs mt-1">Marque ao menos uma no filtro acima ou clique em &quot;Todas&quot;</p>
          </div>
        ) : (
          visibleFavorites.map((f, index) => {
            const total = visibleFavorites.length;
            const tile = getTileLayout(f.deviceId, index, total);
            return (
              <div
                key={f.id}
                className="absolute flex flex-col bg-black/30 rounded-lg overflow-hidden border border-white/10"
                style={{
                  left: `${tile.x}%`,
                  top: `${tile.y}%`,
                  width: `${tile.w}%`,
                  height: `${tile.h}%`,
                }}
              >
                <div
                  className="shrink-0 px-2 py-1 bg-black/50 flex items-center justify-between gap-2 cursor-move select-none"
                  onMouseDown={(e) => handleMoveStart(e, f.deviceId, index, total, visibleFavorites)}
                  title="Arraste para mover; solte em cima de outra tela para trocar de posição"
                >
                  <span className="text-xs font-medium text-slate-300 truncate">{f.device.hostname}</span>
                  <select
                    value={selectedScreenByDevice[f.deviceId] ?? 0}
                    onChange={(e) => {
                      e.stopPropagation();
                      setSelectedScreenByDevice((prev) => ({
                        ...prev,
                        [f.deviceId]: parseInt(e.target.value, 10),
                      }));
                    }}
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    className="text-xs bg-white/10 border border-white/20 rounded px-1.5 py-0.5 text-slate-200 cursor-pointer"
                  >
                    {Array.from({ length: Math.max(1, screensCountByDevice[f.deviceId] ?? 1) }, (_, i) => (
                      <option key={i} value={i}>
                        Tela {i + 1}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex-1 min-h-0 relative">
                  <PreviewThumbnail
                    key={f.deviceId}
                    deviceId={f.deviceId}
                    token={token}
                    screen={selectedScreenByDevice[f.deviceId] ?? 0}
                    onScreensCount={(n) => {
                      const num = Math.max(1, n);
                      setScreensCountByDevice((prev) => ({ ...prev, [f.deviceId]: num }));
                    }}
                  />
                </div>
                <div
                  className="absolute bottom-0 right-0 w-8 h-8 cursor-nwse-resize flex items-end justify-end p-1.5 rounded-tl-lg bg-black/40 hover:bg-black/60 transition-colors"
                  onMouseDown={(e) => handleResizeStart(e, f.deviceId, index, total)}
                  title="Arraste para redimensionar"
                  role="slider"
                  aria-label="Redimensionar"
                >
                  <svg className="w-4 h-4 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l12 12m-4 4v4m0 0h-4m4 0l12-12" />
                  </svg>
                </div>
              </div>
            );
          })
        )}
      </div>
      <Footer />
    </main>
  );
}

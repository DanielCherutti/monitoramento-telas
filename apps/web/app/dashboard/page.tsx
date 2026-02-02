"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PreviewThumbnail from "./PreviewThumbnail";
import { getApiUrl, getAuthHeaders } from "@/lib/api";
import { PlatformTitle } from "@/app/components/PlatformTitle";
import Footer from "@/app/components/Footer";

type Favorite = {
  id: string;
  deviceId: string;
  sortOrder: number;
  device: { id: string; hostname: string; agentId: string; lastSeenAt: string | null };
};

type Device = {
  id: string;
  hostname: string;
  agentId: string;
  lastSeenAt: string | null;
};

function formatLastSeen(lastSeenAt: string | null): string {
  if (!lastSeenAt) return "Offline";
  const d = new Date(lastSeenAt);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Agora";
  if (diffMin < 60) return `${diffMin} min atrás`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h atrás`;
  return d.toLocaleDateString();
}

function StatusDot({ lastSeenAt }: { lastSeenAt: string | null }) {
  if (!lastSeenAt) return <span className="inline-block w-2 h-2 rounded-full bg-slate-300" title="Offline" />;
  const diff = Date.now() - new Date(lastSeenAt).getTime();
  const online = diff < 120000; // 2 min
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${online ? "bg-emerald-500" : "bg-amber-400"}`}
      title={online ? "Online" : "Inativo"}
    />
  );
}

export default function DashboardPage() {
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [deviceToDelete, setDeviceToDelete] = useState<{ id: string; hostname: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [screensCountByDevice, setScreensCountByDevice] = useState<Record<string, number>>({});
  const [selectedScreenByDevice, setSelectedScreenByDevice] = useState<Record<string, number>>({});

  useEffect(() => {
    setMounted(true);
    setToken(typeof window !== "undefined" ? localStorage.getItem("token") : null);
  }, []);

  const loadDevices = useCallback(async () => {
    if (!token) return;
    const res = await fetch(`${getApiUrl()}/devices`, {
      headers: getAuthHeaders(token),
    });
    if (!res.ok) return;
    const data = (await res.json()) as { devices: Device[] };
    setDevices(data.devices);
  }, [token]);

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
    setError(null);
    setLoading(true);
    Promise.all([loadFavorites(), loadDevices()]).finally(() => setLoading(false));
  }, [token, loadFavorites, loadDevices]);

  useEffect(() => {
    if (!token) return;
    const interval = setInterval(() => {
      loadDevices().catch(() => {});
      loadFavorites().catch(() => {});
    }, 15000);
    return () => clearInterval(interval);
  }, [token, loadDevices, loadFavorites]);

  async function addFavorite(deviceId: string) {
    if (!token) return;
    setError(null);
    try {
      const res = await fetch(`${getApiUrl()}/favorites`, {
        method: "POST",
        headers: { ...getAuthHeaders(token), "content-type": "application/json" },
        body: JSON.stringify({ deviceId }),
      });
      if (res.ok) loadFavorites();
      else setError("Não foi possível adicionar favorito.");
    } catch {
      setError("Erro de rede. Verifique se a API está acessível e tente novamente.");
    }
  }

  async function removeFavorite(deviceId: string) {
    if (!token) return;
    setError(null);
    try {
      const url = `${getApiUrl()}/favorites/${encodeURIComponent(deviceId)}`;
      const res = await fetch(url, {
        method: "DELETE",
        headers: getAuthHeaders(token),
      });
      if (res.ok) {
        loadFavorites();
      } else {
        const data = await res.json().catch(() => ({})) as { error?: string };
        setError(data.error || "Não foi possível remover o favorito.");
      }
    } catch {
      setError("Erro de rede. Verifique se a API está acessível e tente novamente.");
    }
  }

  async function confirmDeleteDevice(deviceId: string, hostname: string) {
    if (!token) return;
    setError(null);
    setDeleting(true);
    try {
      const res = await fetch(`${getApiUrl()}/admin/devices/${encodeURIComponent(deviceId)}`, {
        method: "DELETE",
        headers: getAuthHeaders(token),
      });
      if (res.ok) {
        setDeviceToDelete(null);
        loadDevices();
        loadFavorites();
      } else {
        setError(res.status === 403 ? "Apenas administradores podem excluir dispositivos." : "Não foi possível excluir o dispositivo.");
      }
    } catch {
      setError("Erro de rede. Verifique se a API está acessível e tente novamente.");
    } finally {
      setDeleting(false);
    }
  }

  const favoriteIds = useMemo(() => new Set(favorites.map((f) => f.deviceId)), [favorites]);
  const maxPreview = 6;
  const favoritesWithPreview = favorites.slice(0, maxPreview);

  if (!mounted) {
    return (
      <main className="min-h-screen bg-slate-100 flex flex-col">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur shadow-sm">
          <div className="max-w-5xl mx-auto px-6 py-4 flex justify-between items-center">
            <PlatformTitle className="text-xl" logoSize={32} logoSrc="/images/icon.png" />
          </div>
        </header>
        <div className="flex-1 flex flex-col items-center justify-center py-24 text-slate-500">
          <div className="w-8 h-8 border-2 border-slate-200 border-t-slate-600 rounded-full animate-spin" />
          <p className="mt-3 text-sm">Carregando...</p>
        </div>
        <Footer />
      </main>
    );
  }

  if (!token) {
    return (
      <main className="min-h-screen bg-slate-50 flex flex-col">
        <header className="border-b border-slate-200 bg-white shadow-sm">
          <div className="max-w-5xl mx-auto px-6 py-4 flex justify-between items-center">
            <PlatformTitle className="text-xl" logoSize={32} logoSrc="/images/icon.png" />
            <Link href="/" className="text-sm text-slate-600 hover:text-slate-900 font-medium">
              Entrar
            </Link>
          </div>
        </header>
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="max-w-md w-full p-8 rounded-2xl bg-white border border-slate-200 shadow-sm text-center">
            <p className="text-slate-600">Você precisa estar logado para acessar o dashboard.</p>
            <Link
              href="/"
              className="mt-4 inline-flex items-center justify-center h-10 px-5 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800"
            >
              Fazer login
            </Link>
          </div>
        </div>
        <Footer />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 flex flex-col">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur shadow-sm">
        <div className="max-w-5xl mx-auto px-6 py-4 flex justify-between items-center">
          <PlatformTitle className="text-xl" logoSize={32} logoSrc="/images/icon.png" />
          <nav className="flex items-center gap-1">
            <Link
              href="/monitor"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
              title="Abrir em outra aba (ideal para TV)"
            >
              Modo TV
            </Link>
            <Link
              href="/audit"
              className="px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            >
              Auditoria
            </Link>
            <Link
              href="/reports"
              className="px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            >
              Relatórios
            </Link>
            <Link
              href="/reports?tab=productivity"
              className="px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            >
              Produtividade
            </Link>
            <Link
              href="/admin/users"
              className="px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            >
              Usuários
            </Link>
            <Link
              href="/admin/groups"
              className="px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            >
              Grupos
            </Link>
            <Link
              href="/"
              className="px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:text-red-600 hover:bg-red-50 transition-colors"
            >
              Sair
            </Link>
          </nav>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium flex items-start justify-between gap-3">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="shrink-0 p-1 rounded text-red-500 hover:bg-red-100 transition-colors"
              aria-label="Fechar"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {deviceToDelete && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            onClick={() => !deleting && setDeviceToDelete(null)}
          >
            <div
              className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id="modal-title" className="text-lg font-semibold text-slate-900">
                Excluir dispositivo
              </h2>
              <p className="mt-2 text-slate-600 text-sm">
                Excluir <strong className="text-slate-900">&quot;{deviceToDelete.hostname}&quot;</strong>? O dispositivo sairá da lista e será removido de todos os favoritos.
              </p>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => !deleting && setDeviceToDelete(null)}
                  disabled={deleting}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => confirmDeleteDevice(deviceToDelete.id, deviceToDelete.hostname)}
                  disabled={deleting}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center gap-2"
                >
                  {deleting ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Excluindo…
                    </>
                  ) : (
                    "Excluir"
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-500">
            <div className="w-8 h-8 border-2 border-slate-200 border-t-slate-600 rounded-full animate-spin" />
            <p className="mt-3 text-sm">Carregando...</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 mb-10">
              <div className="rounded-xl bg-white border border-slate-200 p-5 shadow-sm">
                <p className="text-sm font-medium text-slate-500 uppercase tracking-wide">Favoritos</p>
                <p className="mt-1 text-3xl font-bold text-slate-900">{favorites.length}</p>
              </div>
              <div className="rounded-xl bg-white border border-slate-200 p-5 shadow-sm">
                <p className="text-sm font-medium text-slate-500 uppercase tracking-wide">Dispositivos</p>
                <p className="mt-1 text-3xl font-bold text-slate-900">{devices.length}</p>
              </div>
            </div>

            <section>
              <h2 className="text-base font-semibold text-slate-800 mb-4">Favoritos</h2>
              {favorites.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white p-10 text-center shadow-sm">
                  <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                    </svg>
                  </div>
                  <p className="mt-3 text-slate-600 font-medium">Nenhum favorito</p>
                  <p className="mt-1 text-sm text-slate-500">Adicione um dispositivo na lista abaixo.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {favorites.map((f) => (
                    <div
                      key={f.id}
                      className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden hover:shadow-md transition-shadow"
                    >
                      <div className="p-4 flex justify-between items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <StatusDot lastSeenAt={f.device.lastSeenAt} />
                            <p className="font-semibold text-slate-900 truncate">{f.device.hostname}</p>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5 truncate" title={f.device.agentId}>
                            {f.device.agentId}
                          </p>
                          <p className="text-xs text-slate-400 mt-1">{formatLastSeen(f.device.lastSeenAt)}</p>
                        </div>
                        <div className="shrink-0 flex items-center gap-1">
                          <Link
                            href={`/monitor?only=${encodeURIComponent(f.deviceId)}`}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                            title="Abrir no Modo TV (tela cheia, redimensionável)"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                          </Link>
                          <button
                            type="button"
                            onClick={() => removeFavorite(f.deviceId)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            title="Remover favorito"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                      {favoritesWithPreview.some((fp) => fp.deviceId === f.deviceId) ? (
                        <>
                          <div className="px-4 pt-2 pb-1 flex items-center gap-2">
                            <label className="text-xs font-medium text-slate-500">Tela:</label>
                            <select
                              value={selectedScreenByDevice[f.deviceId] ?? 0}
                              onChange={(e) =>
                                setSelectedScreenByDevice((prev) => ({
                                  ...prev,
                                  [f.deviceId]: parseInt(e.target.value, 10),
                                }))
                              }
                              className="text-xs border border-slate-200 rounded-md px-2 py-1 bg-white text-slate-700"
                            >
                              {Array.from({ length: Math.max(1, screensCountByDevice[f.deviceId] ?? 1) }, (_, i) => (
                                <option key={i} value={i}>
                                  Tela {i + 1}
                                </option>
                              ))}
                            </select>
                          </div>
                          <PreviewThumbnail
                            key={f.deviceId}
                            deviceId={f.deviceId}
                            token={token}
                            screen={selectedScreenByDevice[f.deviceId] ?? 0}
                            onScreensCount={(n) => {
                              const num = Math.max(1, n);
                              setScreensCountByDevice((prev) => ({ ...prev, [f.deviceId]: num }));
                            }}
                            onOffline={() => {
                              loadDevices().catch(() => {});
                              loadFavorites().catch(() => {});
                            }}
                          />
                        </>
                      ) : (
                        <div className="px-4 pb-4">
                          <p className="text-xs text-slate-400">Preview nos primeiros {maxPreview} favoritos.</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="mt-10">
              <h2 className="text-base font-semibold text-slate-800 mb-4">Dispositivos</h2>
              {devices.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white p-10 text-center shadow-sm">
                  <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <p className="mt-3 text-slate-600 font-medium">Nenhum dispositivo</p>
                  <p className="mt-1 text-sm text-slate-500">
                    Registre um agente via API (<code className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">POST /devices/register</code>).
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                  <ul className="divide-y divide-slate-100">
                    {devices.map((d) => (
                      <li
                        key={d.id}
                        className="flex justify-between items-center gap-4 px-5 py-4 hover:bg-slate-50/80 transition-colors"
                      >
                        <div className="min-w-0 flex-1 flex items-center gap-3">
                          <StatusDot lastSeenAt={d.lastSeenAt} />
                          <div className="min-w-0">
                            <p className="font-medium text-slate-900 truncate">{d.hostname}</p>
                            <p className="text-xs text-slate-500 truncate">
                              {d.agentId} · {formatLastSeen(d.lastSeenAt)}
                            </p>
                          </div>
                        </div>
                        <div className="shrink-0 flex items-center gap-2">
                          {favoriteIds.has(d.id) ? (
                            <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium">
                              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
                              </svg>
                              Favorito
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => addFavorite(d.id)}
                              className="h-9 px-4 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition-colors"
                            >
                              Favoritar
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setDeviceToDelete({ id: d.id, hostname: d.hostname })}
                            className="h-9 px-3 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 border border-slate-200 hover:border-red-200 text-sm font-medium transition-colors"
                            title="Excluir dispositivo (apenas admin)"
                          >
                            Excluir
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          </>
        )}
      </div>
      <Footer />
    </main>
  );
}

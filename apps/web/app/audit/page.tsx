"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { getApiUrl, getAuthHeaders } from "@/lib/api";
import { PlatformTitle } from "@/app/components/PlatformTitle";
import Footer from "@/app/components/Footer";

type AuditEvent = {
  id: string;
  eventType: string;
  actorUserId: string | null;
  targetDeviceId: string | null;
  ip: string | null;
  userAgent: string | null;
  metadata: unknown;
  createdAt: string;
};

function eventTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    login: "Login",
    login_failed: "Login falhou",
    logout: "Logout",
    favorite_add: "Favorito adicionado",
    favorite_remove: "Favorito removido",
    device_view: "Visualização",
    device_control: "Controle",
  };
  return labels[type] ?? type;
}

function eventTypeColor(type: string): string {
  if (type.includes("login")) return "bg-emerald-100 text-emerald-800";
  if (type.includes("favorite")) return "bg-violet-100 text-violet-800";
  if (type.includes("view") || type.includes("control")) return "bg-slate-100 text-slate-700";
  return "bg-slate-100 text-slate-700";
}

export default function AuditPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    setToken(localStorage.getItem("token"));
  }, []);

  useEffect(() => {
    if (!mounted || !token) {
      if (!token) setLoading(false);
      return;
    }
    setError(null);
    setLoading(true);
    fetch(`${getApiUrl()}/audit/events?limit=100`, {
      headers: getAuthHeaders(token),
    })
      .then((res) => {
        if (res.status === 401) throw new Error("Não autorizado. Faça login novamente.");
        if (!res.ok) throw new Error("Falha ao carregar auditoria.");
        return res.json();
      })
      .then((data: { events: AuditEvent[] }) => setEvents(data.events))
      .catch((err) => setError(err instanceof Error ? err.message : "Erro ao carregar eventos de auditoria."))
      .finally(() => setLoading(false));
  }, [mounted, token]);

  if (!mounted || !token) {
    return (
      <main className="min-h-screen bg-slate-100 flex flex-col">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur shadow-sm">
          <div className="max-w-5xl mx-auto px-6 py-4 flex justify-between items-center">
            <PlatformTitle className="text-xl" logoSize={32} logoSrc="/images/icon.png" />
            <Link href="/" className="text-sm font-medium text-slate-600 hover:text-slate-900">
              Entrar
            </Link>
          </div>
        </header>
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="max-w-md w-full p-8 rounded-2xl bg-white border border-slate-200 shadow-sm text-center">
            <p className="text-slate-600">Você precisa estar logado para ver a auditoria.</p>
            <Link href="/" className="mt-4 inline-flex h-10 px-5 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800">
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
          <Link
            href="/dashboard"
            className="px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
          >
            ← Dashboard
          </Link>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8 flex-1">
        <div className="mb-8">
          <h2 className="text-base font-semibold text-slate-800">Auditoria</h2>
          <p className="mt-1 text-sm text-slate-500">Eventos de login, favoritos e acessos aos dispositivos.</p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-500">
            <div className="w-8 h-8 border-2 border-slate-200 border-t-slate-600 rounded-full animate-spin" />
            <p className="mt-3 text-sm">Carregando eventos...</p>
          </div>
        ) : events.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-12 text-center shadow-sm">
            <div className="w-14 h-14 mx-auto rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
            </div>
            <p className="mt-4 text-slate-600 font-medium">Nenhum evento</p>
            <p className="mt-1 text-sm text-slate-500">Os eventos de auditoria aparecerão aqui.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <ul className="divide-y divide-slate-100">
              {events.map((e) => (
                <li key={e.id} className="px-5 py-4 hover:bg-slate-50/80 transition-colors">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex px-2.5 py-1 rounded-md text-xs font-medium ${eventTypeColor(e.eventType)}`}>
                        {eventTypeLabel(e.eventType)}
                      </span>
                      <span className="text-xs text-slate-400">
                        {new Date(e.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                      </span>
                    </div>
                  </div>
                  {(e.actorUserId || e.targetDeviceId || e.ip) && (
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                      {e.actorUserId && <span>Usuário {e.actorUserId.slice(0, 8)}…</span>}
                      {e.targetDeviceId && <span>Dispositivo {e.targetDeviceId.slice(0, 8)}…</span>}
                      {e.ip && <span>IP {e.ip}</span>}
                    </div>
                  )}
                  {e.metadata && typeof e.metadata === "object" ? (
                    <pre className="mt-3 text-xs text-slate-500 bg-slate-50 p-3 rounded-lg overflow-x-auto border border-slate-100">
                      {JSON.stringify(e.metadata, null, 2)}
                    </pre>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <Footer />
    </main>
  );
}

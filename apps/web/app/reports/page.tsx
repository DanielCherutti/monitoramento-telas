"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { getApiUrl, getAuthHeaders } from "@/lib/api";
import { PlatformTitle } from "@/app/components/PlatformTitle";
import Footer from "@/app/components/Footer";

type TabId = "devices" | "users" | "weekday" | "date" | "productivity";

type TopDevicesRes = {
  since: string;
  to: string;
  totalSessions: number;
  top: { id: string; hostname: string; viewCount: number }[];
};

type ByUserRes = {
  since: string;
  to: string;
  totalSessions: number;
  users: { userId: string; username: string; viewCount: number }[];
};

type ByWeekdayRes = {
  since: string;
  to: string;
  totalSessions: number;
  weekdays: { weekday: number; dayName: string; viewCount: number }[];
};

type ByDateRes = {
  since: string;
  to: string;
  totalSessions: number;
  days: { date: string; viewCount: number }[];
};

type TimelineSession = {
  id: string;
  viewerId: string;
  username: string;
  deviceId: string;
  hostname: string;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number | null;
};

type TimelineRes = { date: string; sessions: TimelineSession[] };

type RangeSession = {
  id: string;
  viewerId: string;
  username: string;
  deviceId: string;
  hostname: string;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number;
};

type SessionsByRangeRes = { since: string; to: string; sessions: RangeSession[] };

type DeviceOnlineSession = {
  id: string;
  deviceId: string;
  hostname: string;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number;
};

type DeviceOnlineByRangeRes = { since: string; to: string; sessions: DeviceOnlineSession[] };

type DayStats = { date: string; minutes: number; sessionCount: number };
type DeviceProductivity = { deviceId: string; hostname: string; totalMinutes: number; days: DayStats[] };

function formatDateRange(since: string, to: string): string {
  const s = new Date(since).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
  const t = new Date(to).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
  return `${s} – ${t}`;
}

function getPresetRange(preset: string): { start: string; end: string } {
  const end = new Date();
  const start = new Date();
  switch (preset) {
    case "7":
      start.setDate(start.getDate() - 7);
      break;
    case "30":
      start.setDate(start.getDate() - 30);
      break;
    case "month":
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      break;
    default:
      start.setDate(start.getDate() - 30);
  }
  return { start: start.toISOString(), end: end.toISOString() };
}

const VALID_TABS: TabId[] = ["productivity", "devices", "users", "weekday", "date"];

export default function ReportsPage() {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const initialTab = tabParam && VALID_TABS.includes(tabParam as TabId) ? (tabParam as TabId) : "productivity";

  const [preset, setPreset] = useState("30");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [tab, setTab] = useState<TabId>(initialTab);

  useEffect(() => {
    const t = searchParams.get("tab");
    if (t && VALID_TABS.includes(t as TabId)) setTab(t as TabId);
  }, [searchParams]);

  const [devicesData, setDevicesData] = useState<TopDevicesRes | null>(null);
  const [usersData, setUsersData] = useState<ByUserRes | null>(null);
  const [weekdayData, setWeekdayData] = useState<ByWeekdayRes | null>(null);
  const [dateData, setDateData] = useState<ByDateRes | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    setToken(localStorage.getItem("token"));
  }, []);

  const [productivityView, setProductivityView] = useState<"range" | "day">("range");
  const [productivityDate, setProductivityDate] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });
  const [productivityUserId, setProductivityUserId] = useState<string>("");
  const [timelineData, setTimelineData] = useState<TimelineRes | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState<string | null>(null);

  const [rangeSince, setRangeSince] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return d.toISOString().slice(0, 10);
  });
  const [rangeTo, setRangeTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [deviceRangeData, setDeviceRangeData] = useState<DeviceOnlineByRangeRes | null>(null);
  const [rangeLoading, setRangeLoading] = useState(false);
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [deviceDayData, setDeviceDayData] = useState<DeviceOnlineByRangeRes | null>(null);

  const range = useMemo(() => {
    if (preset === "custom" && customFrom && customTo) {
      const start = new Date(customFrom);
      const end = new Date(customTo);
      if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
        return { start: start.toISOString(), end: end.toISOString() };
      }
    }
    return getPresetRange(preset === "custom" ? "30" : preset);
  }, [preset, customFrom, customTo]);

  const loadReports = useCallback(async () => {
    if (!token) return;
    setError(null);
    setLoading(true);
    const q = `?since=${encodeURIComponent(range.start)}&to=${encodeURIComponent(range.end)}`;
    const base = getApiUrl();
    const headers = getAuthHeaders(token);
    try {
      const [devRes, usrRes, wdRes, dtRes] = await Promise.all([
        fetch(`${base}/reports/top-devices${q}`, { headers }),
        fetch(`${base}/reports/by-user${q}`, { headers }),
        fetch(`${base}/reports/by-weekday${q}`, { headers }),
        fetch(`${base}/reports/by-date${q}`, { headers }),
      ]);
      const readError = async (r: Response, fallback: string) => {
        try {
          const b = (await r.json()) as { error?: string };
          return b?.error || fallback;
        } catch {
          return fallback;
        }
      };
      const [dev, usr, wd, dt] = await Promise.all([
        devRes.ok ? devRes.json() : readError(devRes, "top-devices").then((m) => Promise.reject(new Error(m))),
        usrRes.ok ? usrRes.json() : readError(usrRes, "by-user").then((m) => Promise.reject(new Error(m))),
        wdRes.ok ? wdRes.json() : readError(wdRes, "by-weekday").then((m) => Promise.reject(new Error(m))),
        dtRes.ok ? dtRes.json() : readError(dtRes, "by-date").then((m) => Promise.reject(new Error(m))),
      ]);
      setDevicesData(dev);
      setUsersData(usr);
      setWeekdayData(wd);
      setDateData(dt);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      setError(msg ? `Erro ao carregar relatórios: ${msg}` : "Erro ao carregar relatórios. Verifique se a API está acessível e se você está logado.");
    } finally {
      setLoading(false);
    }
  }, [token, range.start, range.end]);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    loadReports();
  }, [token, loadReports]);

  const loadTimeline = useCallback(async () => {
    if (!token) return;
    setTimelineError(null);
    setTimelineLoading(true);
    try {
      const res = await fetch(`${getApiUrl()}/reports/sessions-timeline?date=${encodeURIComponent(productivityDate)}`, {
        headers: getAuthHeaders(token),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({})) as { error?: string };
        setTimelineError(b?.error ?? "Erro ao carregar timeline.");
        setTimelineData(null);
        return;
      }
      const data = (await res.json()) as TimelineRes;
      setTimelineData(data);
    } catch {
      setTimelineError("Erro ao carregar timeline.");
      setTimelineData(null);
    } finally {
      setTimelineLoading(false);
    }
  }, [token, productivityDate]);

  const loadDeviceOnlineByRange = useCallback(async () => {
    if (!token) return;
    setRangeError(null);
    setRangeLoading(true);
    try {
      const start = new Date(rangeSince);
      const end = new Date(rangeTo);
      end.setHours(23, 59, 59, 999);
      const res = await fetch(
        `${getApiUrl()}/reports/device-online-by-range?since=${encodeURIComponent(start.toISOString())}&to=${encodeURIComponent(end.toISOString())}`,
        { headers: getAuthHeaders(token) }
      );
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        setRangeError(b?.error ?? "Erro ao carregar período.");
        setDeviceRangeData(null);
        return;
      }
      const data = (await res.json()) as DeviceOnlineByRangeRes;
      setDeviceRangeData(data);
    } catch {
      setRangeError("Erro ao carregar período.");
      setDeviceRangeData(null);
    } finally {
      setRangeLoading(false);
    }
  }, [token, rangeSince, rangeTo]);

  const loadDeviceDaySessions = useCallback(async () => {
    if (!token) return;
    setTimelineError(null);
    setTimelineLoading(true);
    try {
      const start = new Date(productivityDate + "T00:00:00.000Z");
      const end = new Date(productivityDate + "T23:59:59.999Z");
      const res = await fetch(
        `${getApiUrl()}/reports/device-online-by-range?since=${encodeURIComponent(start.toISOString())}&to=${encodeURIComponent(end.toISOString())}`,
        { headers: getAuthHeaders(token) }
      );
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        setTimelineError(b?.error ?? "Erro ao carregar timeline.");
        setDeviceDayData(null);
        return;
      }
      const data = (await res.json()) as DeviceOnlineByRangeRes;
      setDeviceDayData(data);
    } catch {
      setTimelineError("Erro ao carregar timeline.");
      setDeviceDayData(null);
    } finally {
      setTimelineLoading(false);
    }
  }, [token, productivityDate]);

  useEffect(() => {
    if (!token || tab !== "productivity") return;
    if (productivityView === "day") loadDeviceDaySessions();
    else loadDeviceOnlineByRange();
  }, [token, tab, productivityView, productivityDate, rangeSince, rangeTo, loadDeviceDaySessions, loadDeviceOnlineByRange]);

  const filteredTimelineSessions = useMemo(() => {
    if (!timelineData?.sessions.length) return [];
    if (!productivityUserId) return timelineData.sessions;
    return timelineData.sessions.filter((s) => s.viewerId === productivityUserId);
  }, [timelineData, productivityUserId]);

  const totalSessions = devicesData?.totalSessions ?? 0;
  const periodLabel = formatDateRange(range.start, range.end);
  const maxCount = useMemo(() => {
    const d = devicesData?.top[0]?.viewCount ?? 0;
    const u = usersData?.users[0]?.viewCount ?? 0;
    const w = Math.max(...(weekdayData?.weekdays.map((x) => x.viewCount) ?? [0]), 1);
    const t = Math.max(...(dateData?.days.map((x) => x.viewCount) ?? [0]), 1);
    return { devices: d, users: u, weekday: w, date: t };
  }, [devicesData, usersData, weekdayData, dateData]);

  const uniqueUsersFromTimeline = useMemo(() => {
    if (!timelineData?.sessions.length) return [];
    const seen = new Map<string, string>();
    for (const s of timelineData.sessions) {
      if (!seen.has(s.viewerId)) seen.set(s.viewerId, s.username);
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [timelineData]);

  const productivityByDevice = useMemo((): DeviceProductivity[] => {
    if (!deviceRangeData?.sessions.length) return [];
    const byDevice = new Map<string, { hostname: string; byDay: Map<string, { minutes: number; count: number }> }>();
    for (const s of deviceRangeData.sessions) {
      const dateKey = s.startedAt.slice(0, 10);
      if (!byDevice.has(s.deviceId)) {
        byDevice.set(s.deviceId, { hostname: s.hostname, byDay: new Map() });
      }
      const d = byDevice.get(s.deviceId)!;
      const day = d.byDay.get(dateKey) ?? { minutes: 0, count: 0 };
      day.minutes += s.durationMinutes;
      day.count += 1;
      d.byDay.set(dateKey, day);
    }
    const start = new Date(deviceRangeData.since);
    const end = new Date(deviceRangeData.to);
    const allDates: string[] = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      allDates.push(d.toISOString().slice(0, 10));
    }
    return [...byDevice.entries()]
      .map(([deviceId, { hostname, byDay }]) => {
        const days: DayStats[] = allDates.map((date) => ({
          date,
          minutes: byDay.get(date)?.minutes ?? 0,
          sessionCount: byDay.get(date)?.count ?? 0,
        }));
        const totalMinutes = days.reduce((a, d) => a + d.minutes, 0);
        return { deviceId, hostname, totalMinutes, days };
      })
      .sort((a, b) => b.totalMinutes - a.totalMinutes);
  }, [deviceRangeData]);

  const productivitySummary = useMemo(() => {
    const totalMinutes = productivityByDevice.reduce((a, d) => a + d.totalMinutes, 0);
    const uniqueDates = new Set<string>();
    productivityByDevice.forEach((d) => d.days.forEach((day) => day.minutes > 0 && uniqueDates.add(day.date)));
    return {
      totalMinutes,
      activeDevices: productivityByDevice.length,
      daysWithActivity: uniqueDates.size,
    };
  }, [productivityByDevice]);

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
            <p className="text-slate-600">Você precisa estar logado para ver os relatórios.</p>
            <Link href="/" className="mt-4 inline-flex h-10 px-5 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800">
              Fazer login
            </Link>
          </div>
        </div>
        <Footer />
      </main>
    );
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: "productivity", label: "Produtividade" },
    { id: "devices", label: "Por dispositivo" },
    { id: "users", label: "Por usuário" },
    { id: "weekday", label: "Por dia da semana" },
    { id: "date", label: "Por data" },
  ];

  function formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  function formatDuration(min: number): string {
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m ? `${h}h ${m} min` : `${h}h`;
  }

  return (
    <main className="min-h-screen bg-slate-100 flex flex-col">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur shadow-sm">
        <div className="max-w-5xl mx-auto px-6 py-4 flex justify-between items-center">
          <PlatformTitle className="text-xl" logoSize={32} logoSrc="/images/icon.png" />
          <Link href="/dashboard" className="px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors">
            ← Dashboard
          </Link>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h2 className="text-base font-semibold text-slate-800">Relatórios</h2>
          <p className="mt-1 text-sm text-slate-500">Sessões de visualização por dispositivo, usuário, dia da semana ou data.</p>
          <p className="mt-1 text-xs text-slate-400">Cada abertura de visualização é gravada no banco de dados (tabela ViewSession). Os relatórios usam esse histórico, não dependem de agentes conectados no momento.</p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium">
            {error}
          </div>
        )}

        {/* Filtro de período */}
        <section className="mb-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Período</h3>
          <div className="flex flex-wrap gap-3 items-center">
            {[
              { value: "7", label: "Últimos 7 dias" },
              { value: "30", label: "Últimos 30 dias" },
              { value: "month", label: "Este mês" },
              { value: "custom", label: "Personalizado" },
            ].map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setPreset(p.value)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  preset === p.value ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {p.label}
              </button>
            ))}
            {preset === "custom" && (
              <div className="flex flex-wrap gap-2 items-center ml-2">
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-slate-900 text-sm"
                />
                <span className="text-slate-400">até</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-slate-900 text-sm"
                />
              </div>
            )}
          </div>
          <p className="mt-2 text-xs text-slate-500">Período: {periodLabel}</p>
        </section>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-500">
            <div className="w-8 h-8 border-2 border-slate-200 border-t-slate-600 rounded-full animate-spin" />
            <p className="mt-3 text-sm">Carregando relatórios...</p>
          </div>
        ) : (
          <>
            {/* Resumo */}
            <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm font-medium text-slate-500 uppercase tracking-wide">Total de sessões</p>
                <p className="mt-1 text-3xl font-bold text-slate-900">{totalSessions}</p>
                <p className="mt-0.5 text-xs text-slate-500">{periodLabel}</p>
              </div>
            </div>

            {/* Abas */}
            <div className="mb-4 flex flex-wrap gap-1 border-b border-slate-200 overflow-x-auto min-w-0">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    tab === t.id
                      ? "border-slate-900 text-slate-900"
                      : "border-transparent text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Conteúdo por dispositivo */}
            {tab === "devices" && (
              <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                {!devicesData?.top.length ? (
                  <div className="p-12 text-center text-slate-500">
                    <p className="font-medium">Nenhuma sessão no período</p>
                    <p className="text-sm mt-1">As visualizações por dispositivo aparecerão aqui.</p>
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {devicesData.top.map((d, i) => (
                      <li key={d.id} className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50/80 transition-colors">
                        <span
                          className={`shrink-0 flex items-center justify-center w-8 h-8 rounded-lg text-sm font-bold ${
                            i === 0 ? "bg-amber-100 text-amber-800" : i === 1 ? "bg-slate-200 text-slate-700" : i === 2 ? "bg-orange-100 text-orange-800" : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-slate-900 truncate">{d.hostname}</p>
                          <div className="mt-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-slate-400"
                              style={{ width: `${maxCount.devices ? (d.viewCount / maxCount.devices) * 100 : 0}%` }}
                            />
                          </div>
                        </div>
                        <span className="shrink-0 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium">
                          {d.viewCount} {d.viewCount === 1 ? "sessão" : "sessões"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Conteúdo por usuário */}
            {tab === "users" && (
              <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                {!usersData?.users.length ? (
                  <div className="p-12 text-center text-slate-500">
                    <p className="font-medium">Nenhuma sessão no período</p>
                    <p className="text-sm mt-1">As visualizações por usuário aparecerão aqui.</p>
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {usersData.users.map((u, i) => (
                      <li key={u.userId} className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50/80 transition-colors">
                        <span className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg text-sm font-bold bg-violet-100 text-violet-800">
                          {i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-slate-900 truncate">{u.username}</p>
                          <div className="mt-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-violet-400"
                              style={{ width: `${maxCount.users ? (u.viewCount / maxCount.users) * 100 : 0}%` }}
                            />
                          </div>
                        </div>
                        <span className="shrink-0 px-3 py-1.5 rounded-lg bg-violet-50 text-violet-700 text-sm font-medium">
                          {u.viewCount} {u.viewCount === 1 ? "sessão" : "sessões"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Conteúdo por dia da semana */}
            {tab === "weekday" && (
              <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                {!weekdayData?.weekdays.length ? (
                  <div className="p-12 text-center text-slate-500">
                    <p className="font-medium">Nenhuma sessão no período</p>
                    <p className="text-sm mt-1">As visualizações por dia da semana aparecerão aqui.</p>
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {weekdayData.weekdays.map((w) => (
                      <li key={w.weekday} className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50/80 transition-colors">
                        <span className="shrink-0 w-24 text-sm font-medium text-slate-700">{w.dayName}</span>
                        <div className="min-w-0 flex-1">
                          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-emerald-500"
                              style={{ width: `${maxCount.weekday ? (w.viewCount / maxCount.weekday) * 100 : 0}%` }}
                            />
                          </div>
                        </div>
                        <span className="shrink-0 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium">
                          {w.viewCount} {w.viewCount === 1 ? "sessão" : "sessões"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Conteúdo por data */}
            {tab === "date" && (
              <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                {!dateData?.days.length ? (
                  <div className="p-12 text-center text-slate-500">
                    <p className="font-medium">Nenhuma sessão no período</p>
                    <p className="text-sm mt-1">As visualizações dia a dia aparecerão aqui.</p>
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-100 max-h-[480px] overflow-y-auto">
                    {dateData.days.map((d) => (
                      <li key={d.date} className="flex items-center gap-4 px-5 py-3 hover:bg-slate-50/80 transition-colors">
                        <span className="shrink-0 text-sm font-medium text-slate-700 w-28">
                          {new Date(d.date + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" })}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-slate-500"
                              style={{ width: `${maxCount.date ? (d.viewCount / maxCount.date) * 100 : 0}%` }}
                            />
                          </div>
                        </div>
                        <span className="shrink-0 px-3 py-1 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium">
                          {d.viewCount} {d.viewCount === 1 ? "sessão" : "sessões"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Produtividade: por período (gráficos por usuário/dia) ou timeline de um dia */}
            {tab === "productivity" && (
              <div className="space-y-6">
                <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
                  <button
                    type="button"
                    onClick={() => setProductivityView("range")}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      productivityView === "range" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    Por período (gráficos)
                  </button>
                  <button
                    type="button"
                    onClick={() => setProductivityView("day")}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      productivityView === "day" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    Timeline de um dia
                  </button>
                </div>

                {productivityView === "range" ? (
                  <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                    <div className="p-5 border-b border-slate-100 space-y-4">
                      <p className="text-sm text-slate-600">
                        Produtividade do colaborador no PC: tempo em que o agente ficou online (conectado) e offline. Cada sessão = agente entrou e saiu.
                      </p>
                      <div className="flex flex-wrap gap-3 items-center">
                        <label className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-700">De:</span>
                          <input
                            type="date"
                            value={rangeSince}
                            onChange={(e) => setRangeSince(e.target.value)}
                            className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-slate-900 text-sm"
                          />
                        </label>
                        <label className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-700">Até:</span>
                          <input
                            type="date"
                            value={rangeTo}
                            onChange={(e) => setRangeTo(e.target.value)}
                            className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-slate-900 text-sm"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => loadDeviceOnlineByRange()}
                          disabled={rangeLoading}
                          className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-50"
                        >
                          {rangeLoading ? "Carregando…" : "Carregar"}
                        </button>
                      </div>
                    </div>
                    {rangeError && (
                      <div className="mx-5 mt-4 p-3 rounded-lg bg-red-50 border border-red-100 text-red-700 text-sm">
                        {rangeError}
                      </div>
                    )}
                    {rangeLoading ? (
                      <div className="py-16 flex flex-col items-center text-slate-500">
                        <div className="w-10 h-10 border-2 border-slate-200 border-t-slate-600 rounded-full animate-spin" />
                        <p className="mt-4 text-sm">Carregando produtividade…</p>
                      </div>
                    ) : !productivityByDevice.length ? (
                      <div className="p-12 text-center text-slate-500">
                        <p className="font-medium">Nenhuma sessão no período</p>
                        <p className="text-sm mt-1">O agente precisa ter ficado online nos PCs. Selecione um intervalo e clique em Carregar.</p>
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-5 bg-slate-50/80 border-b border-slate-100">
                          <div className="rounded-xl bg-white border border-slate-200 p-4 shadow-sm">
                            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Total online no período</p>
                            <p className="mt-1 text-2xl font-bold text-slate-900">{formatDuration(productivitySummary.totalMinutes)}</p>
                          </div>
                          <div className="rounded-xl bg-white border border-slate-200 p-4 shadow-sm">
                            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">PCs / dispositivos</p>
                            <p className="mt-1 text-2xl font-bold text-slate-900">{productivitySummary.activeDevices}</p>
                          </div>
                          <div className="rounded-xl bg-white border border-slate-200 p-4 shadow-sm">
                            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Dias com atividade</p>
                            <p className="mt-1 text-2xl font-bold text-slate-900">{productivitySummary.daysWithActivity}</p>
                          </div>
                        </div>
                        <div className="p-5 space-y-6">
                          {productivityByDevice.map((device, idx) => {
                            const maxMin = Math.max(...device.days.map((d) => d.minutes), 1);
                            return (
                              <div
                                key={device.deviceId}
                                className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm"
                              >
                                <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                                  <div className="flex items-center gap-3">
                                    <span
                                      className={`flex items-center justify-center w-10 h-10 rounded-xl text-lg font-bold text-white ${
                                        idx === 0 ? "bg-emerald-500" : idx === 1 ? "bg-violet-500" : idx === 2 ? "bg-amber-500" : "bg-slate-500"
                                      }`}
                                    >
                                      {device.hostname.charAt(0).toUpperCase()}
                                    </span>
                                    <div>
                                      <p className="font-semibold text-slate-900">{device.hostname}</p>
                                      <p className="text-sm text-slate-500">Colaborador neste PC · {formatDuration(device.totalMinutes)} online no período</p>
                                    </div>
                                  </div>
                                </div>
                                <div className="p-4">
                                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">Minutos online por dia</p>
                                  <div className="flex gap-1 h-28 items-end">
                                    {device.days.map((d) => (
                                      <div
                                        key={d.date}
                                        className="flex-1 min-w-0 flex flex-col items-center gap-1 h-full justify-end group"
                                        title={`${d.date}: ${d.minutes} min online, ${d.sessionCount} sessões`}
                                      >
                                        <div
                                          className={`w-full min-h-[2px] rounded-t transition-all ${
                                            d.minutes > 0
                                              ? idx === 0
                                                ? "bg-emerald-400 hover:bg-emerald-500"
                                                : idx === 1
                                                  ? "bg-violet-400 hover:bg-violet-500"
                                                  : idx === 2
                                                    ? "bg-amber-400 hover:bg-amber-500"
                                                    : "bg-slate-400 hover:bg-slate-500"
                                              : "bg-slate-100"
                                          }`}
                                          style={{
                                            height: d.minutes > 0 ? `${Math.max(8, (d.minutes / maxMin) * 100)}%` : "2px",
                                          }}
                                        />
                                        <span className="text-[10px] text-slate-400 truncate w-full text-center shrink-0">
                                          {new Date(d.date + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                  <div className="mt-4 overflow-x-auto">
                                    <table className="w-full text-sm">
                                      <thead>
                                        <tr className="text-left text-slate-500 border-b border-slate-100">
                                          <th className="py-2 pr-3 font-medium">Data</th>
                                          <th className="py-2 pr-3 font-medium text-right">Sessões (online→offline)</th>
                                          <th className="py-2 font-medium text-right">Tempo online</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {device.days
                                          .filter((d) => d.minutes > 0)
                                          .map((d) => (
                                            <tr key={d.date} className="border-b border-slate-50">
                                              <td className="py-2 pr-3 text-slate-700">
                                                {new Date(d.date + "T12:00:00").toLocaleDateString("pt-BR", {
                                                  weekday: "short",
                                                  day: "2-digit",
                                                  month: "short",
                                                })}
                                              </td>
                                              <td className="py-2 pr-3 text-right text-slate-600">{d.sessionCount}</td>
                                              <td className="py-2 text-right font-medium text-slate-700">{formatDuration(d.minutes)}</td>
                                            </tr>
                                          ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                    <div className="p-5 border-b border-slate-100 space-y-4">
                      <p className="text-sm text-slate-600">
                        Neste dia: em quais horários cada PC (agente) ficou online e offline. Produtividade do colaborador naquele computador.
                      </p>
                      <div className="flex flex-wrap gap-4 items-center">
                        <label className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-700">Data:</span>
                          <input
                            type="date"
                            value={productivityDate}
                            onChange={(e) => setProductivityDate(e.target.value)}
                            className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-slate-900 text-sm"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => loadDeviceDaySessions()}
                          disabled={timelineLoading}
                          className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-50"
                        >
                          {timelineLoading ? "Carregando…" : "Atualizar"}
                        </button>
                      </div>
                    </div>
                    {timelineError && (
                      <div className="mx-5 mt-4 p-3 rounded-lg bg-red-50 border border-red-100 text-red-700 text-sm">
                        {timelineError}
                      </div>
                    )}
                    {timelineLoading ? (
                      <div className="py-12 flex flex-col items-center text-slate-500">
                        <div className="w-8 h-8 border-2 border-slate-200 border-t-slate-600 rounded-full animate-spin" />
                        <p className="mt-3 text-sm">Carregando timeline…</p>
                      </div>
                    ) : !deviceDayData?.sessions.length ? (
                      <div className="p-12 text-center text-slate-500">
                        <p className="font-medium">Nenhuma sessão neste dia</p>
                        <p className="text-sm mt-1">Nenhum agente (PC) ficou online na data selecionada.</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-200 bg-slate-50/80">
                              <th className="text-left py-3 px-4 font-semibold text-slate-700">PC / Colaborador</th>
                              <th className="text-left py-3 px-4 font-semibold text-slate-700">Entrada (online)</th>
                              <th className="text-left py-3 px-4 font-semibold text-slate-700">Saída (offline)</th>
                              <th className="text-right py-3 px-4 font-semibold text-slate-700">Duração</th>
                            </tr>
                          </thead>
                          <tbody>
                            {deviceDayData.sessions.map((s) => (
                              <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                                <td className="py-3 px-4 font-medium text-slate-900">{s.hostname}</td>
                                <td className="py-3 px-4 text-slate-700">{formatTime(s.startedAt)}</td>
                                <td className="py-3 px-4 text-slate-700">
                                  {s.endedAt ? formatTime(s.endedAt) : <span className="text-amber-600">em andamento</span>}
                                </td>
                                <td className="py-3 px-4 text-right text-slate-700">{formatDuration(s.durationMinutes)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {deviceDayData?.sessions.length ? (
                      <div className="p-4 border-t border-slate-100 bg-slate-50/50 text-sm text-slate-600">
                        Total: {deviceDayData.sessions.length} {deviceDayData.sessions.length === 1 ? "sessão" : "sessões"} no dia{" "}
                        {new Date(productivityDate + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}.
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
      <Footer />
    </main>
  );
}

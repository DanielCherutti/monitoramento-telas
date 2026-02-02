"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { getApiUrl, getAuthHeaders } from "@/lib/api";
import { PlatformTitle } from "@/app/components/PlatformTitle";
import Footer from "@/app/components/Footer";

type GroupSummary = { id: string; name: string; deviceCount: number };
type GroupDetail = {
  id: string;
  name: string;
  devices: { id: string; hostname: string; agentId: string }[];
  supervisors: { userId: string; username: string; canView: boolean; canControl: boolean; canAnnotate: boolean; requirePromptForAnnotate: boolean }[];
};
type User = { id: string; username: string; isActive: boolean; createdAt: string };
type Device = { id: string; hostname: string; agentId: string; lastSeenAt: string | null };

export default function AdminGroupsPage() {
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<GroupDetail | null>(null);
  const [newGroupName, setNewGroupName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    setToken(localStorage.getItem("token"));
  }, []);

  const loadGroups = useCallback(async () => {
    if (!token) return;
    const res = await fetch(`${getApiUrl()}/admin/groups`, { headers: getAuthHeaders(token) });
    if (!res.ok) {
      if (res.status === 401) setError("Não autorizado. Faça login novamente.");
      else if (res.status === 403) setError("Acesso negado. Apenas administradores.");
      return;
    }
    const data = (await res.json()) as { groups: GroupSummary[] };
    setGroups(data.groups ?? []);
  }, [token]);

  const loadUsers = useCallback(async () => {
    if (!token) return;
    const res = await fetch(`${getApiUrl()}/admin/users`, { headers: getAuthHeaders(token) });
    if (!res.ok) return;
    const data = (await res.json()) as { users: User[] };
    setUsers(data.users);
  }, [token]);

  const loadDevices = useCallback(async () => {
    if (!token) return;
    const res = await fetch(`${getApiUrl()}/devices`, { headers: getAuthHeaders(token) });
    if (!res.ok) return;
    const data = (await res.json()) as { devices: Device[] };
    setDevices(data.devices);
  }, [token]);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    setError(null);
    setLoading(true);
    Promise.all([loadGroups(), loadUsers(), loadDevices()]).finally(() => setLoading(false));
  }, [token, loadGroups, loadUsers, loadDevices]);

  async function openGroup(groupId: string) {
    if (!token) return;
    const res = await fetch(`${getApiUrl()}/admin/groups/${groupId}`, { headers: getAuthHeaders(token) });
    if (!res.ok) return;
    const data = (await res.json()) as { group: GroupDetail };
    setSelectedGroup(data.group);
  }

  async function createGroup() {
    if (!token || !newGroupName.trim()) return;
    const res = await fetch(`${getApiUrl()}/admin/groups`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: newGroupName.trim() }),
    });
    if (res.ok) {
      setNewGroupName("");
      loadGroups();
    } else setError("Não foi possível criar o grupo.");
  }

  async function addDeviceToGroup(groupId: string, deviceId: string) {
    if (!token) return;
    const res = await fetch(`${getApiUrl()}/admin/groups/${groupId}/devices`, {
      method: "POST",
      headers: { ...getAuthHeaders(token), "content-type": "application/json" },
      body: JSON.stringify({ deviceId }),
    });
    if (res.ok) {
      if (selectedGroup?.id === groupId) openGroup(groupId);
      loadGroups();
    }
  }

  async function removeDeviceFromGroup(groupId: string, deviceId: string) {
    if (!token) return;
    const res = await fetch(`${getApiUrl()}/admin/groups/${groupId}/devices/${deviceId}`, {
      method: "DELETE",
      headers: getAuthHeaders(token),
    });
    if (res.ok) {
      if (selectedGroup?.id === groupId) openGroup(groupId);
      loadGroups();
    }
  }

  async function addSupervisorToGroup(groupId: string, userId: string) {
    if (!token) return;
    const res = await fetch(`${getApiUrl()}/admin/groups/${groupId}/supervisors`, {
      method: "POST",
      headers: { ...getAuthHeaders(token), "content-type": "application/json" },
      body: JSON.stringify({ userId, canView: true, canControl: false, canAnnotate: true, requirePromptForAnnotate: false }),
    });
    if (res.ok) {
      if (selectedGroup?.id === groupId) openGroup(groupId);
      loadGroups();
    }
  }

  async function removeSupervisorFromGroup(groupId: string, userId: string) {
    if (!token) return;
    const res = await fetch(`${getApiUrl()}/admin/groups/${groupId}/supervisors/${userId}`, {
      method: "DELETE",
      headers: getAuthHeaders(token),
    });
    if (res.ok) {
      if (selectedGroup?.id === groupId) openGroup(groupId);
      loadGroups();
    }
  }

  const selectedDeviceIds = useMemo(() => new Set(selectedGroup?.devices.map((d) => d.id) ?? []), [selectedGroup]);
  const selectedUserIds = useMemo(() => new Set(selectedGroup?.supervisors.map((s) => s.userId) ?? []), [selectedGroup]);

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
            <p className="text-slate-600">Você precisa estar logado para gerenciar grupos.</p>
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
          <nav className="flex items-center gap-1">
            <Link
              href="/admin/users"
              className="px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            >
              Usuários
            </Link>
            <Link
              href="/dashboard"
              className="px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            >
              ← Dashboard
            </Link>
          </nav>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h2 className="text-base font-semibold text-slate-800">Grupos</h2>
          <p className="mt-1 text-sm text-slate-500">
            Crie grupos e associe dispositivos e supervisores. Supervisores só veem dispositivos dos grupos em que estão.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium">
            {error}
          </div>
        )}

        <section className="mb-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Criar grupo</h3>
          <div className="flex flex-wrap gap-3 items-center">
            <input
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="Nome do grupo"
              className="h-10 px-4 rounded-lg border border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 focus:border-transparent min-w-[220px]"
            />
            <button
              type="button"
              onClick={createGroup}
              disabled={!newGroupName.trim()}
              className="h-10 px-5 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Criar grupo
            </button>
          </div>
        </section>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-500">
            <div className="w-8 h-8 border-2 border-slate-200 border-t-slate-600 rounded-full animate-spin" />
            <p className="mt-3 text-sm">Carregando grupos...</p>
          </div>
        ) : groups.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-12 text-center shadow-sm">
            <div className="w-14 h-14 mx-auto rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <p className="mt-4 text-slate-600 font-medium">Nenhum grupo</p>
            <p className="mt-1 text-sm text-slate-500">Crie um grupo acima para começar.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map((g) => (
              <div
                key={g.id}
                className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden"
              >
                <div className="p-5 flex flex-wrap justify-between items-center gap-3">
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-slate-900">{g.name}</span>
                    <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-medium">
                      {g.deviceCount} {g.deviceCount === 1 ? "dispositivo" : "dispositivos"}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => (selectedGroup?.id === g.id ? setSelectedGroup(null) : openGroup(g.id))}
                    className={`h-9 px-4 rounded-lg text-sm font-medium transition-colors ${
                      selectedGroup?.id === g.id
                        ? "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        : "bg-slate-900 text-white hover:bg-slate-800"
                    }`}
                  >
                    {selectedGroup?.id === g.id ? "Fechar" : "Gerenciar"}
                  </button>
                </div>
                {selectedGroup?.id === g.id && (
                  <div className="border-t border-slate-100 bg-slate-50/50 p-5 space-y-6">
                    <div>
                      <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                        <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        Dispositivos
                      </h4>
                      <ul className="space-y-2 mb-3">
                        {selectedGroup.devices.length === 0 ? (
                          <li className="text-sm text-slate-500 py-2">Nenhum dispositivo no grupo.</li>
                        ) : (
                          selectedGroup.devices.map((d) => (
                            <li key={d.id} className="flex justify-between items-center py-2 px-3 rounded-lg bg-white border border-slate-100">
                              <span className="text-sm text-slate-700">
                                {d.hostname} <span className="text-slate-400">({d.agentId})</span>
                              </span>
                              <button
                                type="button"
                                onClick={() => removeDeviceFromGroup(g.id, d.id)}
                                className="text-xs text-slate-400 hover:text-red-600 font-medium transition-colors"
                              >
                                Remover
                              </button>
                            </li>
                          ))
                        )}
                      </ul>
                      <select
                        onChange={(e) => {
                          const id = e.target.value;
                          if (id) addDeviceToGroup(g.id, id);
                          e.target.value = "";
                        }}
                        className="w-full max-w-xs h-9 px-3 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
                      >
                        <option value="">Adicionar dispositivo...</option>
                        {devices.filter((d) => !selectedDeviceIds.has(d.id)).map((d) => (
                          <option key={d.id} value={d.id}>{d.hostname}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                        <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                        </svg>
                        Supervisores
                      </h4>
                      <ul className="space-y-2 mb-3">
                        {selectedGroup.supervisors.length === 0 ? (
                          <li className="text-sm text-slate-500 py-2">Nenhum supervisor no grupo.</li>
                        ) : (
                          selectedGroup.supervisors.map((s) => (
                            <li key={s.userId} className="flex justify-between items-center py-2 px-3 rounded-lg bg-white border border-slate-100">
                              <span className="text-sm text-slate-700">{s.username}</span>
                              <button
                                type="button"
                                onClick={() => removeSupervisorFromGroup(g.id, s.userId)}
                                className="text-xs text-slate-400 hover:text-red-600 font-medium transition-colors"
                              >
                                Remover
                              </button>
                            </li>
                          ))
                        )}
                      </ul>
                      <select
                        onChange={(e) => {
                          const id = e.target.value;
                          if (id) addSupervisorToGroup(g.id, id);
                          e.target.value = "";
                        }}
                        className="w-full max-w-xs h-9 px-3 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
                      >
                        <option value="">Adicionar supervisor...</option>
                        {users.filter((u) => !selectedUserIds.has(u.id)).map((u) => (
                          <option key={u.id} value={u.id}>{u.username}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      <Footer />
    </main>
  );
}

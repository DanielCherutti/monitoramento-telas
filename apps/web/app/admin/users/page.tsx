"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { getApiUrl, getAuthHeaders } from "@/lib/api";
import { PlatformTitle } from "@/app/components/PlatformTitle";
import Footer from "@/app/components/Footer";

type User = {
  id: string;
  username: string;
  isActive: boolean;
  createdAt: string;
  roles?: string[];
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"ADMIN" | "SUPERVISOR">("SUPERVISOR");
  const [mounted, setMounted] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    setToken(localStorage.getItem("token"));
  }, []);

  const loadUsers = useCallback(async () => {
    if (!token) return;
    const res = await fetch(`${getApiUrl()}/admin/users`, { headers: getAuthHeaders(token) });
    if (!res.ok) {
      if (res.status === 403) setError("Acesso negado. Apenas administradores.");
      return;
    }
    const data = (await res.json()) as { users: User[] };
    setUsers(data.users);
  }, [token]);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    setError(null);
    setLoading(true);
    loadUsers().finally(() => setLoading(false));
  }, [token, loadUsers]);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !newUsername.trim() || !newPassword.trim()) return;
    setError(null);
    setCreating(true);
    try {
      const res = await fetch(`${getApiUrl()}/admin/users`, {
        method: "POST",
        headers: { ...getAuthHeaders(token), "content-type": "application/json" },
        body: JSON.stringify({ username: newUsername.trim(), password: newPassword, role: newRole }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409) setError("Este nome de usuário já está em uso.");
        else setError("Não foi possível criar o usuário.");
        return;
      }
      setNewUsername("");
      setNewPassword("");
      setNewRole("SUPERVISOR");
      loadUsers();
    } finally {
      setCreating(false);
    }
  }

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
            <p className="text-slate-600">Você precisa estar logado para gerenciar usuários.</p>
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
              href="/admin/groups"
              className="px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            >
              Grupos
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
          <h2 className="text-base font-semibold text-slate-800">Usuários</h2>
          <p className="mt-1 text-sm text-slate-500">
            Crie e gerencie usuários. Administradores têm acesso total; supervisores veem apenas os grupos em que estão.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium">
            {error}
          </div>
        )}

        <section className="mb-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Criar usuário</h3>
          <form onSubmit={createUser} className="flex flex-wrap gap-4 items-end">
            <div>
              <label htmlFor="new-username" className="block text-xs font-medium text-slate-500 mb-1">
                Usuário
              </label>
              <input
                id="new-username"
                type="text"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="Nome de usuário"
                className="h-10 px-4 rounded-lg border border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 focus:border-transparent min-w-[180px]"
                required
              />
            </div>
            <div>
              <label htmlFor="new-password" className="block text-xs font-medium text-slate-500 mb-1">
                Senha
              </label>
              <input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                minLength={6}
                className="h-10 px-4 rounded-lg border border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 focus:border-transparent min-w-[180px]"
                required
              />
            </div>
            <div>
              <label htmlFor="new-role" className="block text-xs font-medium text-slate-500 mb-1">
                Perfil
              </label>
              <select
                id="new-role"
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as "ADMIN" | "SUPERVISOR")}
                className="h-10 px-4 rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-200 min-w-[140px]"
              >
                <option value="SUPERVISOR">Supervisor</option>
                <option value="ADMIN">Administrador</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={creating || !newUsername.trim() || newPassword.length < 6}
              className="h-10 px-5 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {creating ? "Criando..." : "Criar usuário"}
            </button>
          </form>
        </section>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-500">
            <div className="w-8 h-8 border-2 border-slate-200 border-t-slate-600 rounded-full animate-spin" />
            <p className="mt-3 text-sm">Carregando usuários...</p>
          </div>
        ) : users.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-12 text-center shadow-sm">
            <div className="w-14 h-14 mx-auto rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <p className="mt-4 text-slate-600 font-medium">Nenhum usuário</p>
            <p className="mt-1 text-sm text-slate-500">Crie um usuário acima.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <ul className="divide-y divide-slate-100">
              {users.map((u) => (
                <li key={u.id} className="flex justify-between items-center gap-4 px-5 py-4 hover:bg-slate-50/80 transition-colors">
                  <div className="min-w-0 flex-1 flex items-center gap-3">
                    <span className="font-medium text-slate-900 truncate">{u.username}</span>
                    <span className="flex gap-1.5 shrink-0">
                      {(Array.isArray(u.roles) ? u.roles : []).map((r) => (
                        <span
                          key={r}
                          className={`px-2 py-0.5 rounded text-xs font-medium ${
                            r === "ADMIN" ? "bg-violet-100 text-violet-800" : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {r === "ADMIN" ? "Admin" : "Supervisor"}
                        </span>
                      ))}
                    </span>
                    {!u.isActive && (
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">Inativo</span>
                    )}
                  </div>
                  <span className="text-xs text-slate-400 shrink-0">
                    {new Date(u.createdAt).toLocaleDateString("pt-BR")}
                  </span>
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

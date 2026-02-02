"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

import { getApiUrl } from "@/lib/api";
import Footer from "@/app/components/Footer";

export default function HomePage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const disabled = useMemo(
    () => loading || !username.trim() || !password.trim(),
    [loading, username, password],
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${getApiUrl()}/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => ({})) as { token?: string; error?: string; message?: string };
      if (!res.ok) {
        if (res.status === 401) {
          setError("Usuário ou senha inválidos.");
        } else if (res.status >= 500) {
          setError(data?.message ?? "Erro no servidor. Tente novamente.");
        } else {
          setError(data?.message ?? "Usuário ou senha inválidos.");
        }
        return;
      }
      if (data.token) {
        localStorage.setItem("token", data.token);
        router.push("/dashboard");
      } else {
        setError("Resposta inválida do servidor.");
      }
    } catch {
      setError("Falha de rede ao tentar logar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm flex flex-col items-center text-center">
        <Image
          src="/images/logo-pazini.png"
          alt=""
          width={220}
          height={220}
          className="rounded-lg object-contain shrink-0"
        />
        <h1 className="mt-4 text-2xl font-semibold text-slate-900">
          Pazini Monitoramento
        </h1>
        <p className="mt-2 text-slate-500 text-sm">
          Acompanhe telas em tempo real, favoritos e auditoria.
        </p>
        <form onSubmit={onSubmit} className="mt-8 w-full space-y-5 text-left">
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-slate-700 mb-1.5">
              Usuário
            </label>
            <input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 focus:border-transparent"
              placeholder="Usuário"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1.5">
              Senha
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 focus:border-transparent"
              placeholder="••••••••"
            />
          </div>
          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-100 text-red-700 text-sm">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={disabled}
            className="w-full h-10 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>
        </div>
      </div>
      <Footer />
    </main>
  );
}

/**
 * Retorna a URL base da API.
 * No navegador: se a URL configurada for localhost, usa o mesmo host da página
 * na porta 4001 (API direta), para que o token seja enviado corretamente.
 * O proxy /api do Next.js não repassa Authorization em alguns ambientes.
 */
export function getApiUrl(): string {
  const env = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4001";
  if (typeof window === "undefined") return env;
  try {
    const u = new URL(env);
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1") {
      const port = u.port || "4001";
      return `${window.location.protocol}//${window.location.hostname}:${port}`;
    }
  } catch {
    // ignore
  }
  return env;
}

/**
 * Retorna a URL base do WebSocket (ws ou wss) a partir da URL da API.
 */
export function getWsUrl(): string {
  return getApiUrl().replace(/^http/, "ws");
}

/**
 * Headers para requisições autenticadas. Envia o token em Authorization e em X-Auth-Token
 * (fallback para quando o proxy/Next.js não repassa Authorization).
 */
export function getAuthHeaders(token: string | null): Record<string, string> {
  if (!token) return {};
  return {
    authorization: `Bearer ${token}`,
    "x-auth-token": token,
  };
}

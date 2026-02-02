# Monitoramento de Telas (Windows) — Web + API + Agente

Sistema on‑prem para monitorar telas Windows em tempo real, com acesso de **administradores** e **supervisores**, **favoritos** na dashboard, **auditoria/relatórios**, e suporte a **overlay de anotações** (desenho) refletido na máquina do usuário.

## Estrutura
- `apps/api/`: API (Fastify + TypeScript + Prisma)
- `apps/web/`: Webapp (Next.js)
- `apps/agent-windows/`: Agente Windows (placeholder + especificação inicial)
- `infra/`: Docker Compose e configs (Postgres/Redis/TURN opcional)

## Rodando (dev, on‑prem)
Pré‑requisitos: Docker + Docker Compose.

1) Suba a infra + apps:

```bash
cd /root/monitoramento-telas
docker compose up --build
```

2) Acesse:
- Web: `http://localhost:3000`
- API: `http://localhost:4000/health`

## Credenciais iniciais
No primeiro boot, a API cria um usuário admin padrão:
- usuário: `admin`
- senha: `admin123`

Troque imediatamente em produção.

## Funcionalidades (MVP)
- **Login** (admin/supervisor) e **Dashboard** com favoritos e lista de dispositivos.
- **Preview ao vivo**: nos primeiros 6 favoritos, miniaturas via WebSocket quando o agente envia frames (`/ws/device/preview`, `/ws/supervisor/preview`).
- **Admin — Grupos**: criar grupos, associar dispositivos e supervisores; supervisores só veem dispositivos dos grupos em que estão.
- **Auditoria**: eventos de login, favoritos e acessos (`/audit/events`).
- **Relatórios**: top dispositivos mais acessados (`/reports/top-devices`).
- **Registro do agente**: `POST /devices/register` (agentId, hostname, secret) para o agente Windows se cadastrar.


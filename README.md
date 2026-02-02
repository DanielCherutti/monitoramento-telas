![Monitoramento de Telas](https://raw.githubusercontent.com/DanielCherutti/monitoramento-telas/main/images/icon.png)

# Monitoramento de Telas

**Sistema on‑prem para monitorar telas Windows em tempo real.**

Acesso para administradores e supervisores · Dashboard com favoritos · Auditoria e relatórios · Overlay de anotações

---

## Sobre

Plataforma de **monitoramento remoto de telas** em ambiente corporativo. Administradores e supervisores visualizam dispositivos Windows em tempo real, organizam por grupos, acessam preview ao vivo dos primeiros favoritos na dashboard e podem desenhar anotações em overlay na tela do usuário. Tudo auditado e com relatórios de uso.

- **On‑prem** — infraestrutura sob seu controle
- **Roles** — admin e supervisor, com escopos distintos
- **Preview ao vivo** — miniaturas na dashboard via WebSocket
- **Anotações** — sessões de desenho refletidas no dispositivo
- **Auditoria** — eventos de login, favoritos e acessos
- **Relatórios** — top dispositivos mais acessados

---

## Funcionalidades

| Área | Descrição |
|------|------------|
| **Login** | Autenticação por usuário/senha (admin e supervisor) |
| **Dashboard** | Favoritos e lista de dispositivos; preview ao vivo nos 6 primeiros favoritos |
| **Monitor** | Acesso à tela ao vivo do dispositivo |
| **Grupos** | Admin cria grupos e associa dispositivos e supervisores; supervisor vê só seus grupos |
| **Usuários** | Gestão de usuários (admin) |
| **Auditoria** | Eventos de login, favoritos e acessos |
| **Relatórios** | Top dispositivos mais acessados |
| **Agente** | Registro do agente Windows (`POST /devices/register`) e envio de frames para preview |

---

## Stack

| Camada | Tecnologia |
|--------|------------|
| **Web** | Next.js · React · Tailwind CSS |
| **API** | Fastify · TypeScript · Prisma |
| **Agente** | TypeScript · Electron (config UI) |
| **Infra** | Docker · Docker Compose |

---

## Estrutura do repositório

```
monitoramento-telas/
├── apps/
│   ├── web/          # Frontend Next.js
│   ├── api/          # API Fastify + Prisma
│   └── agent-windows/ # Agente Windows (registro, preview, anotações)
├── docs/             # Protocolo e especificações
├── images/           # Logos e ícones
└── docker-compose.yml
```

---

*Monitoramento de Telas · On‑prem · Windows*

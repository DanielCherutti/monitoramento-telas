import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import websocket from "@fastify/websocket";
import { PrismaClient, RoleName } from "@prisma/client";
import argon2 from "argon2";
import { z } from "zod";

const prisma = new PrismaClient();

const app = Fastify({
  logger: true,
});

await app.register(cors, {
  origin: true,
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Auth-Token"],
});

await app.register(jwt, {
  secret: process.env.JWT_SECRET ?? "dev-secret-change-me",
});

await app.register(websocket);

type JwtPayload = { sub: string; roles: RoleName[] };

app.decorate("authenticate", async (req: any, reply: any) => {
  try {
    await req.jwtVerify();
  } catch {
    return reply.code(401).send({ error: "unauthorized" });
  }
});

declare module "fastify" {
  interface FastifyInstance {
    authenticate: any;
  }
}

async function bootstrapAdmin() {
  const username = process.env.BOOTSTRAP_ADMIN_USER ?? "admin";
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "admin123";

  const [adminRole, supervisorRole] = await Promise.all([
    prisma.role.upsert({
      where: { name: "ADMIN" },
      update: {},
      create: { name: "ADMIN" },
    }),
    prisma.role.upsert({
      where: { name: "SUPERVISOR" },
      update: {},
      create: { name: "SUPERVISOR" },
    }),
  ]);

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) return;

  const passwordHash = await argon2.hash(password);
  await prisma.user.create({
    data: {
      username,
      passwordHash,
      roles: { create: [{ roleId: adminRole.id }] },
    },
  });

  app.log.warn(
    { username },
    "Usuário admin bootstrap criado (troque a senha em produção).",
  );
}

function requireRole(role: RoleName) {
  return async (req: any, reply: any) => {
    const roles: RoleName[] = req.user?.roles ?? [];
    if (!roles.includes(role)) {
      return reply.code(403).send({ error: "forbidden" });
    }
  };
}

app.get("/health", async () => ({ ok: true }));

app.post("/auth/login", async (req, reply) => {
  try {
    let raw = req.body ?? {};
    if (typeof raw === "string") {
      try {
        raw = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        raw = {};
      }
    }
    const body = z
      .object({
        username: z.string().min(1),
        password: z.string().min(1),
      })
      .safeParse(raw);

    if (!body.success) {
      return reply.code(400).send({ error: "invalid_request", message: "Usuário e senha são obrigatórios." });
    }

    const user = await prisma.user.findUnique({
      where: { username: body.data.username },
      include: { roles: { include: { role: true } } },
    });

    if (!user || !user.isActive) {
      await prisma.auditEvent.create({
        data: { eventType: "auth_login_failed", metadata: { username: body.data.username } },
      });
      return reply.code(401).send({ error: "invalid_credentials" });
    }

    const ok = await argon2.verify(user.passwordHash, body.data.password);
    if (!ok) {
      await prisma.auditEvent.create({
        data: { eventType: "auth_login_failed", actorUserId: user.id },
      });
      return reply.code(401).send({ error: "invalid_credentials" });
    }

    const roles = user.roles.map((r) => r.role.name);
    const token = await reply.jwtSign({ sub: user.id, roles } satisfies JwtPayload, {
      expiresIn: "8h",
    });

    await prisma.auditEvent.create({
      data: {
        eventType: "auth_login_success",
        actorUserId: user.id,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      },
    });

    return { token };
  } catch (err) {
    req.log.error({ err }, "auth/login error");
    return reply.code(500).send({ error: "internal_error", message: "Erro ao processar login. Tente novamente." });
  }
});

app.get("/me", { preHandler: [app.authenticate] }, async (req: any) => {
  const userId = req.user.sub as string;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, isActive: true },
  });
  const roles = (req.user as JwtPayload).roles ?? [];
  return { user: user ? { ...user, roles } : null };
});

// Admin: listar usuários (MVP)
app.get(
  "/admin/users",
  { preHandler: [app.authenticate, requireRole("ADMIN")] },
  async () => {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        isActive: true,
        createdAt: true,
        roles: { include: { role: { select: { name: true } } } },
      },
      orderBy: { createdAt: "desc" },
    });
    return {
      users: users.map((u) => ({
        id: u.id,
        username: u.username,
        isActive: u.isActive,
        createdAt: u.createdAt,
        roles: u.roles.map((r) => r.role.name),
      })),
    };
  },
);

// Admin: criar usuário
app.post(
  "/admin/users",
  { preHandler: [app.authenticate, requireRole("ADMIN")] },
  async (req: any, reply: any) => {
    const body = z
      .object({
        username: z.string().min(1).max(100),
        password: z.string().min(6),
        role: z.enum(["ADMIN", "SUPERVISOR"]),
      })
      .parse(req.body);

    const existing = await prisma.user.findUnique({ where: { username: body.username } });
    if (existing) {
      return reply.code(409).send({ error: "username_taken" });
    }

    const role = await prisma.role.findUnique({ where: { name: body.role } });
    if (!role) {
      return reply.code(400).send({ error: "invalid_role" });
    }

    const passwordHash = await argon2.hash(body.password);
    const user = await prisma.user.create({
      data: {
        username: body.username,
        passwordHash,
        roles: { create: [{ roleId: role.id }] },
      },
      select: { id: true, username: true, isActive: true, createdAt: true },
    });

    const actorUserId = req.user.sub as string;
    await prisma.auditEvent.create({
      data: {
        eventType: "user_created",
        actorUserId,
        metadata: { targetUsername: user.username, role: body.role },
      },
    });

    return { user };
  },
);

// Supervisor/Admin: favoritos (MVP)
app.get("/favorites", { preHandler: [app.authenticate] }, async (req: any) => {
  const userId = req.user.sub as string;
  const favorites = await prisma.favorite.findMany({
    where: { supervisorId: userId },
    include: { device: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return { favorites };
});

app.post("/favorites", { preHandler: [app.authenticate] }, async (req: any, reply) => {
  const userId = req.user.sub as string;
  const body = z.object({ deviceId: z.string().min(1) }).parse(req.body);
  try {
    const fav = await prisma.favorite.create({
      data: { supervisorId: userId, deviceId: body.deviceId },
    });
    await prisma.auditEvent.create({
      data: { eventType: "favorite_added", actorUserId: userId, targetDeviceId: body.deviceId },
    });
    return { favorite: fav };
  } catch {
    return reply.code(409).send({ error: "already_favorited" });
  }
});

app.delete(
  "/favorites/:deviceId",
  { preHandler: [app.authenticate] },
  async (req: any, reply) => {
    const userId = req.user.sub as string;
    const deviceId = req.params.deviceId as string;
    try {
      await prisma.favorite.deleteMany({ where: { supervisorId: userId, deviceId } });
      await prisma.auditEvent.create({
        data: { eventType: "favorite_removed", actorUserId: userId, targetDeviceId: deviceId },
      });
      return { ok: true };
    } catch (err) {
      app.log.error({ err, deviceId, userId }, "Erro ao remover favorito");
      return reply.code(500).send({ error: "Não foi possível remover o favorito." });
    }
  },
);

// Admin: grupos e escopos (para supervisores verem dispositivos).
app.get(
  "/admin/groups",
  { preHandler: [app.authenticate, requireRole("ADMIN")] },
  async () => {
    const groups = await prisma.group.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: { select: { devices: true } },
      },
    });
    return { groups: groups.map((g) => ({ id: g.id, name: g.name, deviceCount: (g as any)._count.devices })) };
  },
);

app.post(
  "/admin/groups",
  { preHandler: [app.authenticate, requireRole("ADMIN")] },
  async (req: any) => {
    const body = z.object({ name: z.string().min(1) }).parse(req.body);
    const group = await prisma.group.create({ data: { name: body.name } });
    return { group };
  },
);

app.get(
  "/admin/groups/:groupId",
  { preHandler: [app.authenticate, requireRole("ADMIN")] },
  async (req: any) => {
    const groupId = req.params.groupId as string;
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      include: {
        devices: { include: { device: true } },
        supervisorScopes: { include: { supervisor: { select: { id: true, username: true } } } },
      },
    });
    if (!group) return { group: null };
    return {
      group: {
        id: group.id,
        name: group.name,
        devices: group.devices.map((d) => d.device),
        supervisors: group.supervisorScopes.map((s) => ({
          userId: s.supervisorId,
          username: s.supervisor.username,
          canView: s.canView,
          canControl: s.canControl,
          canAnnotate: s.canAnnotate,
          requirePromptForAnnotate: s.requirePromptForAnnotate,
        })),
      },
    };
  },
);

app.post(
  "/admin/groups/:groupId/devices",
  { preHandler: [app.authenticate, requireRole("ADMIN")] },
  async (req: any) => {
    const groupId = req.params.groupId as string;
    const body = z.object({ deviceId: z.string().min(1) }).parse(req.body);
    await prisma.deviceGroup.upsert({
      where: { deviceId_groupId: { deviceId: body.deviceId, groupId } },
      update: {},
      create: { deviceId: body.deviceId, groupId },
    });
    return { ok: true };
  },
);

app.post(
  "/admin/groups/:groupId/supervisors",
  { preHandler: [app.authenticate, requireRole("ADMIN")] },
  async (req: any) => {
    const groupId = req.params.groupId as string;
    const body = z
      .object({
        userId: z.string().min(1),
        canView: z.boolean().optional(),
        canControl: z.boolean().optional(),
        canAnnotate: z.boolean().optional(),
        requirePromptForAnnotate: z.boolean().optional(),
      })
      .parse(req.body);
    await prisma.supervisorScope.upsert({
      where: { supervisorId_groupId: { supervisorId: body.userId, groupId } },
      update: {
        canView: body.canView ?? true,
        canControl: body.canControl ?? false,
        canAnnotate: body.canAnnotate ?? true,
        requirePromptForAnnotate: body.requirePromptForAnnotate ?? false,
      },
      create: {
        supervisorId: body.userId,
        groupId,
        canView: body.canView ?? true,
        canControl: body.canControl ?? false,
        canAnnotate: body.canAnnotate ?? true,
        requirePromptForAnnotate: body.requirePromptForAnnotate ?? false,
      },
    });
    return { ok: true };
  },
);

app.delete(
  "/admin/groups/:groupId/devices/:deviceId",
  { preHandler: [app.authenticate, requireRole("ADMIN")] },
  async (req: any) => {
    const groupId = req.params.groupId as string;
    const deviceId = req.params.deviceId as string;
    await prisma.deviceGroup.deleteMany({
      where: { groupId, deviceId },
    });
    return { ok: true };
  },
);

app.delete(
  "/admin/groups/:groupId/supervisors/:userId",
  { preHandler: [app.authenticate, requireRole("ADMIN")] },
  async (req: any) => {
    const groupId = req.params.groupId as string;
    const userId = req.params.userId as string;
    await prisma.supervisorScope.deleteMany({
      where: { groupId, supervisorId: userId },
    });
    return { ok: true };
  },
);

// Dispositivos: admin vê todos; supervisor vê apenas os do escopo (grupos permitidos).
app.get("/devices", { preHandler: [app.authenticate] }, async (req: any) => {
  const payload = req.user as JwtPayload;
  const roles = payload.roles ?? [];
  if (roles.includes("ADMIN")) {
    const devices = await prisma.device.findMany({
      orderBy: { createdAt: "desc" },
    });
    return { devices };
  }
  const scopeGroupIds = await prisma.supervisorScope
    .findMany({
      where: { supervisorId: payload.sub, canView: true },
      select: { groupId: true },
    })
    .then((r) => r.map((s) => s.groupId));
  if (scopeGroupIds.length === 0) {
    return { devices: [] };
  }
  const deviceIds = await prisma.deviceGroup
    .findMany({
      where: { groupId: { in: scopeGroupIds } },
      select: { deviceId: true },
    })
    .then((r) => [...new Set(r.map((d) => d.deviceId))]);
  const devices = await prisma.device.findMany({
    where: { id: { in: deviceIds } },
    orderBy: { lastSeenAt: "desc" },
  });
  return { devices };
});

// Admin: excluir dispositivo (remove favoritos, grupos e sessões em cascata).
app.delete(
  "/admin/devices/:deviceId",
  { preHandler: [app.authenticate, requireRole("ADMIN")] },
  async (req: any, reply) => {
    const deviceId = req.params.deviceId as string;
    const device = await prisma.device.findUnique({ where: { id: deviceId } });
    if (!device) return reply.code(404).send({ error: "device_not_found" });
    await prisma.device.delete({ where: { id: deviceId } });
    await prisma.auditEvent.create({
      data: { eventType: "device_deleted", actorUserId: req.user.sub, targetDeviceId: deviceId },
    });
    return { ok: true };
  }
);

// Registro do agente (MVP: secret em env). Cria ou atualiza device por agentId.
app.post("/devices/register", async (req, reply) => {
  const secret = process.env.AGENT_REGISTRATION_SECRET ?? "dev-agent-secret";
  const body = z
    .object({
      agentId: z.string().min(1),
      hostname: z.string().min(1),
      secret: z.string().min(1),
    })
    .parse(req.body);
  if (body.secret !== secret) {
    return reply.code(401).send({ error: "invalid_secret" });
  }
  const device = await prisma.device.upsert({
    where: { agentId: body.agentId },
    update: { hostname: body.hostname, lastSeenAt: new Date() },
    create: { agentId: body.agentId, hostname: body.hostname, lastSeenAt: new Date() },
  });
  return { deviceId: device.id, hostname: device.hostname };
});

// --- WebSocket: preview e anotações (MVP) ---
const previewSubscribers = new Map<string, Set<{ socket: any; screen: number }>>();
const devicePreviewPublisher = new Map<string, { socket: any; agentId: string }>();
const deviceScreensCount = new Map<string, number>(); // deviceId -> número de telas (do agente)
const deviceAnnotateSubscribers = new Map<string, Set<{ socket: any }>>();
const supervisorAnnotateByDevice = new Map<string, Set<{ socket: any; userId: string }>>();

function getDeviceIdByAgentId(agentId: string): Promise<string | null> {
  return prisma.device.findUnique({ where: { agentId }, select: { id: true } }).then((d) => d?.id ?? null);
}

// Número de telas do dispositivo (para o seletor no front; valor vem da meta do agente)
app.get("/devices/:deviceId/screens", { preHandler: [app.authenticate] }, async (req: any, reply) => {
  const deviceId = req.params.deviceId as string;
  const screens = deviceScreensCount.get(deviceId) ?? 1;
  return { screens: Math.max(1, screens) };
});

app.get("/ws/device/preview", { websocket: true }, async (socket, req) => {
  const url = new URL(req.url ?? "", "http://localhost");
  const agentId = url.searchParams.get("agentId");
  if (!agentId) {
    socket.close(4000, "agentId required");
    return;
  }
  const deviceId = await getDeviceIdByAgentId(agentId);
  if (!deviceId) {
    socket.close(4001, "device not registered");
    return;
  }
  devicePreviewPublisher.set(deviceId, { socket, agentId });

  const INACTIVITY_MS = 60_000; // 60s sem frame → considerar agente offline
  let inactivityTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  const closeSupervisorsAndEndSession = () => {
    if (closed) return;
    closed = true;
    if (inactivityTimer) {
      clearTimeout(inactivityTimer);
      inactivityTimer = null;
    }
    if (onlineSessionId) {
      prisma.deviceOnlineSession
        .update({ where: { id: onlineSessionId }, data: { endedAt: new Date() } })
        .catch(() => {});
    }
    prisma.device.update({ where: { id: deviceId }, data: { lastSeenAt: null } }).catch(() => {});
    devicePreviewPublisher.delete(deviceId);
    deviceScreensCount.delete(deviceId);
    const subs = previewSubscribers.get(deviceId);
    if (subs) {
      const copy = Array.from(subs);
      previewSubscribers.delete(deviceId);
      for (const { socket: s } of copy) {
        try {
          if (s.readyState === 1) s.close(4002, "agent_disconnected");
        } catch {
          // ignore
        }
      }
    }
  };

  const scheduleInactivity = () => {
    if (inactivityTimer) clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => {
      inactivityTimer = null;
      try {
        if (socket.readyState === 1) socket.close(4004, "inactivity");
      } catch {
        // ignore
      }
      closeSupervisorsAndEndSession();
    }, INACTIVITY_MS);
  };

  let onlineSessionId: string | null = null;
  try {
    const session = await prisma.deviceOnlineSession.create({
      data: { deviceId, startedAt: new Date() },
    });
    onlineSessionId = session.id;
  } catch {
    // ignore
  }

  scheduleInactivity();

  socket.on("close", closeSupervisorsAndEndSession);
  socket.on("error", closeSupervisorsAndEndSession);

  socket.on("message", (raw: Buffer | string) => {
    scheduleInactivity();
    prisma.device.update({ where: { id: deviceId }, data: { lastSeenAt: new Date() } }).catch(() => {});
    // Mensagem de meta (agente envia número de telas) — processar SEMPRE para guardar em deviceScreensCount
    // mesmo quando ainda não há supervisores conectados (senão GET /devices/:id/screens devolve 1)
    const rawStr = typeof raw === "string" ? raw : (Buffer.isBuffer(raw) && raw[0] === 0x7b ? raw.toString("utf8") : null);
    if (rawStr) {
      try {
        const meta = JSON.parse(rawStr) as { type?: string; screens?: number };
        if (meta.type === "meta" && typeof meta.screens === "number") {
          const screens = Math.max(1, meta.screens);
          deviceScreensCount.set(deviceId, screens);
          const subs = previewSubscribers.get(deviceId);
          if (subs) {
            for (const { socket: s } of subs) {
              if (s.readyState === 1) {
                try {
                  s.send(JSON.stringify({ type: "meta", screens }));
                } catch {
                  // ignore
                }
              }
            }
          }
        }
      } catch {
        // ignore
      }
      return;
    }
    // Binário: 1 byte = índice da tela, resto = jpeg
    const subs = previewSubscribers.get(deviceId);
    if (!subs || typeof raw !== "object" || !Buffer.isBuffer(raw) || raw.length < 2) return;
    const screenIndex = raw[0];
    const frame = raw.subarray(1);
    for (const { socket: s, screen } of subs) {
      if (s.readyState === 1 && screen === screenIndex) s.send(frame);
    }
  });
});

app.get("/ws/supervisor/preview", { websocket: true }, async (socket, req) => {
  const url = new URL(req.url ?? "", "http://localhost");
  const deviceId = url.searchParams.get("deviceId");
  const token = url.searchParams.get("token");
  if (!deviceId || !token) {
    socket.close(4000, "deviceId and token required");
    return;
  }
  try {
    const decoded = await app.jwt.verify<JwtPayload>(token);
    req.user = decoded;
  } catch {
    socket.close(4001, "invalid token");
    return;
  }
  const userId = (req.user as JwtPayload).sub;

  if (!devicePreviewPublisher.has(deviceId)) {
    socket.close(4003, "agent_offline");
    return;
  }

  const screen = Math.max(0, parseInt(url.searchParams.get("screen") ?? "0", 10) || 0);
  if (!previewSubscribers.has(deviceId)) previewSubscribers.set(deviceId, new Set());
  previewSubscribers.get(deviceId)!.add({ socket, screen });

  // Enviar meta logo ao conectar (número de telas) para o seletor aparecer
  const screensCount = deviceScreensCount.get(deviceId) ?? 1;
  setImmediate(() => {
    try {
      if (socket.readyState === 1) socket.send(JSON.stringify({ type: "meta", screens: screensCount }));
    } catch {
      // ignore
    }
  });

  let viewSessionId: string | null = null;
  try {
    const session = await prisma.viewSession.create({
      data: { viewerId: userId, deviceId, startedAt: new Date() },
    });
    viewSessionId = session.id;
  } catch {
    // ignore (e.g. device deleted)
  }

  socket.on("close", () => {
    if (viewSessionId) {
      prisma.viewSession
        .update({ where: { id: viewSessionId }, data: { endedAt: new Date() } })
        .catch(() => {});
    }
    const set = previewSubscribers.get(deviceId);
    if (set) {
      for (const entry of set) {
        if (entry.socket === socket) {
          set.delete(entry);
          break;
        }
      }
      if (set.size === 0) previewSubscribers.delete(deviceId);
    }
  });
  socket.on("error", () => {});
});

app.get("/ws/device/annotate", { websocket: true }, async (socket, req) => {
  const url = new URL(req.url ?? "", "http://localhost");
  const agentId = url.searchParams.get("agentId");
  if (!agentId) {
    socket.close(4000, "agentId required");
    return;
  }
  const deviceId = await getDeviceIdByAgentId(agentId);
  if (!deviceId) {
    socket.close(4001, "device not registered");
    return;
  }
  if (!deviceAnnotateSubscribers.has(deviceId)) deviceAnnotateSubscribers.set(deviceId, new Set());
  deviceAnnotateSubscribers.get(deviceId)!.add({ socket });
  socket.on("close", () => {
    const set = deviceAnnotateSubscribers.get(deviceId);
    if (set) {
      for (const s of set) {
        if (s.socket === socket) {
          set.delete(s);
          break;
        }
      }
      if (set.size === 0) deviceAnnotateSubscribers.delete(deviceId);
    }
  });
  socket.on("message", (raw: Buffer | string) => {
    const str = raw.toString();
    const subs = supervisorAnnotateByDevice.get(deviceId);
    if (subs) for (const { socket: s } of subs) if (s.readyState === 1) s.send(str);
  });
});

app.get("/ws/supervisor/annotate", { websocket: true }, async (socket, req) => {
  const url = new URL(req.url ?? "", "http://localhost");
  const deviceId = url.searchParams.get("deviceId");
  const token = url.searchParams.get("token");
  if (!deviceId || !token) {
    socket.close(4000, "deviceId and token required");
    return;
  }
  try {
    const decoded = await app.jwt.verify<JwtPayload>(token);
    req.user = decoded;
  } catch {
    socket.close(4001, "invalid token");
    return;
  }
  const userId = (req.user as JwtPayload).sub;
  if (!supervisorAnnotateByDevice.has(deviceId)) supervisorAnnotateByDevice.set(deviceId, new Set());
  supervisorAnnotateByDevice.get(deviceId)!.add({ socket, userId });
  socket.on("close", () => {
    const set = supervisorAnnotateByDevice.get(deviceId);
    if (set) {
      for (const s of set) {
        if (s.socket === socket) {
          set.delete(s);
          break;
        }
      }
      if (set.size === 0) supervisorAnnotateByDevice.delete(deviceId);
    }
  });
  socket.on("message", (raw: Buffer | string) => {
    const str = raw.toString();
    const deviceSockets = deviceAnnotateSubscribers.get(deviceId);
    if (deviceSockets) for (const { socket: s } of deviceSockets) if (s.readyState === 1) s.send(str);
  });
});

// Auditoria: listar eventos (admin vê todos; supervisor vê os próprios).
app.get("/audit/events", { preHandler: [app.authenticate] }, async (req: any) => {
  const payload = req.user as JwtPayload;
  const roles = payload.roles ?? [];
  const limit = Math.min(Number((req.query as any).limit) || 100, 500);
  const since = (req.query as any).since;
  const where: any = {};
  if (!roles.includes("ADMIN")) {
    where.actorUserId = payload.sub;
  }
  if (since) {
    where.createdAt = { gte: new Date(since) };
  }
  const events = await prisma.auditEvent.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return { events };
});

// Relatórios leem do banco de dados (tabela ViewSession), não de conexões em tempo real.
// Helpers para relatórios: período (since/to); sempre retorna datas válidas.
function getReportRange(req: any): { start: Date; end: Date } {
  const since = (req.query as any).since;
  const to = (req.query as any).to;
  const endRaw = to ? new Date(to) : new Date();
  const end = Number.isNaN(endRaw.getTime()) ? new Date() : endRaw;
  const startRaw = since ? new Date(since) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
  const start = Number.isNaN(startRaw.getTime()) ? new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000) : startRaw;
  if (start.getTime() > end.getTime()) {
    return { start: new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000), end };
  }
  return { start, end };
}

// Relatório: top dispositivos (dados no banco ViewSession).
app.get("/reports/top-devices", { preHandler: [app.authenticate] }, async (req: any, reply) => {
  try {
    const { start, end } = getReportRange(req);
    const sessions = await prisma.viewSession.findMany({
      where: { startedAt: { gte: start, lte: end } },
      select: { deviceId: true },
    });
    const countByDevice = new Map<string, number>();
    for (const s of sessions) {
      countByDevice.set(s.deviceId, (countByDevice.get(s.deviceId) ?? 0) + 1);
    }
    const top = [...countByDevice.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 50)
      .map(([deviceId, count]) => ({ deviceId, count }));
    const deviceIds = top.map((t) => t.deviceId);
    const devices = deviceIds.length
      ? await prisma.device.findMany({
          where: { id: { in: deviceIds } },
          select: { id: true, hostname: true },
        })
      : [];
    const byId = Object.fromEntries(devices.map((d) => [d.id, d]));
    return {
      since: start.toISOString(),
      to: end.toISOString(),
      totalSessions: sessions.length,
      top: top.map((t) => ({
        id: t.deviceId,
        hostname: byId[t.deviceId]?.hostname ?? "(dispositivo removido)",
        viewCount: t.count,
      })),
    };
  } catch (err) {
    req.log?.error?.(err);
    return reply.code(500).send({ error: "Erro ao gerar relatório por dispositivo." });
  }
});

// Relatório: sessões por usuário (dados no banco ViewSession).
app.get("/reports/by-user", { preHandler: [app.authenticate] }, async (req: any, reply) => {
  try {
    const { start, end } = getReportRange(req);
    const sessions = await prisma.viewSession.findMany({
      where: { startedAt: { gte: start, lte: end } },
      select: { viewerId: true },
    });
    const countByUser = new Map<string, number>();
    for (const s of sessions) {
      countByUser.set(s.viewerId, (countByUser.get(s.viewerId) ?? 0) + 1);
    }
    const userIds = [...countByUser.keys()];
    const users =
      userIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, username: true },
          })
        : [];
    const byId = Object.fromEntries(users.map((u) => [u.id, u]));
    const usersReport = userIds
      .map((userId) => ({
        userId,
        username: byId[userId]?.username ?? "(desconhecido)",
        viewCount: countByUser.get(userId) ?? 0,
      }))
      .sort((a, b) => b.viewCount - a.viewCount);
    return {
      since: start.toISOString(),
      to: end.toISOString(),
      totalSessions: sessions.length,
      users: usersReport,
    };
  } catch (err) {
    req.log?.error?.(err);
    return reply.code(500).send({ error: "Erro ao gerar relatório por usuário." });
  }
});

// Relatório: sessões por dia da semana (dados no banco ViewSession).
app.get("/reports/by-weekday", { preHandler: [app.authenticate] }, async (req: any, reply) => {
  try {
    const { start, end } = getReportRange(req);
    const sessions = await prisma.viewSession.findMany({
      where: { startedAt: { gte: start, lte: end } },
      select: { startedAt: true },
    });
    const dayNames = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
    const countByWeekday = new Map<number, number>();
    for (let d = 0; d <= 6; d++) countByWeekday.set(d, 0);
    for (const s of sessions) {
      const d = new Date(s.startedAt).getDay();
      countByWeekday.set(d, (countByWeekday.get(d) ?? 0) + 1);
    }
    const order = [1, 2, 3, 4, 5, 6, 0];
    const weekdays = order.map((weekday) => ({
      weekday,
      dayName: dayNames[weekday],
      viewCount: countByWeekday.get(weekday) ?? 0,
    }));
    return {
      since: start.toISOString(),
      to: end.toISOString(),
      totalSessions: sessions.length,
      weekdays,
    };
  } catch (err) {
    req.log?.error?.(err);
    return reply.code(500).send({ error: "Erro ao gerar relatório por dia da semana." });
  }
});

// Relatório: sessões por data (dados no banco ViewSession).
app.get("/reports/by-date", { preHandler: [app.authenticate] }, async (req: any, reply) => {
  try {
    const { start, end } = getReportRange(req);
    const sessions = await prisma.viewSession.findMany({
      where: { startedAt: { gte: start, lte: end } },
      select: { startedAt: true },
    });
    const countByDate = new Map<string, number>();
    for (const s of sessions) {
      const key = new Date(s.startedAt).toISOString().slice(0, 10);
      countByDate.set(key, (countByDate.get(key) ?? 0) + 1);
    }
    const dates = [...countByDate.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, viewCount]) => ({ date, viewCount }));
    return {
      since: start.toISOString(),
      to: end.toISOString(),
      totalSessions: sessions.length,
      days: dates,
    };
  } catch (err) {
    req.log?.error?.(err);
    return reply.code(500).send({ error: "Erro ao gerar relatório por data." });
  }
});

// Relatório: timeline de sessões em um dia (produtividade – online/offline).
app.get("/reports/sessions-timeline", { preHandler: [app.authenticate] }, async (req: any, reply) => {
  try {
    const dateStr = (req.query as { date?: string }).date;
    const userId = (req.query as { userId?: string }).userId;
    if (!dateStr) {
      return reply.code(400).send({ error: "Parâmetro date (YYYY-MM-DD) é obrigatório." });
    }
    const dayStart = new Date(dateStr + "T00:00:00.000Z");
    const dayEnd = new Date(dateStr + "T23:59:59.999Z");
    if (Number.isNaN(dayStart.getTime())) {
      return reply.code(400).send({ error: "Data inválida. Use YYYY-MM-DD." });
    }
    const where: { startedAt: { gte: Date; lte: Date }; viewerId?: string } = {
      startedAt: { gte: dayStart, lte: dayEnd },
    };
    if (userId) where.viewerId = userId;
    const sessions = await prisma.viewSession.findMany({
      where,
      orderBy: { startedAt: "asc" },
      select: {
        id: true,
        viewerId: true,
        deviceId: true,
        startedAt: true,
        endedAt: true,
        viewer: { select: { username: true } },
        device: { select: { hostname: true } },
      },
    });
    const list = sessions.map((s) => {
      const end = s.endedAt ?? null;
      const durationMinutes =
        end != null ? Math.round((end.getTime() - s.startedAt.getTime()) / 60000) : null;
      return {
        id: s.id,
        viewerId: s.viewerId,
        username: s.viewer.username,
        deviceId: s.deviceId,
        hostname: s.device.hostname,
        startedAt: s.startedAt.toISOString(),
        endedAt: end?.toISOString() ?? null,
        durationMinutes,
      };
    });
    return { date: dateStr, sessions: list };
  } catch (err) {
    req.log?.error?.(err);
    return reply.code(500).send({ error: "Erro ao gerar timeline de sessões." });
  }
});

// Relatório: sessões em um período (para produtividade por usuário e por dia).
app.get("/reports/sessions-by-range", { preHandler: [app.authenticate] }, async (req: any, reply) => {
  try {
    const sinceRaw = (req.query as { since?: string }).since;
    const toRaw = (req.query as { to?: string }).to;
    const userId = (req.query as { userId?: string }).userId;
    const end = toRaw ? new Date(toRaw) : new Date();
    const start = sinceRaw ? new Date(sinceRaw) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start.getTime() > end.getTime()) {
      return reply.code(400).send({ error: "Parâmetros since e to devem ser datas válidas (ISO)." });
    }
    const dayEnd = new Date(end);
    dayEnd.setHours(23, 59, 59, 999);
    const where: { startedAt: { gte: Date; lte: Date }; viewerId?: string } = {
      startedAt: { gte: start, lte: dayEnd },
    };
    if (userId) where.viewerId = userId;
    const sessions = await prisma.viewSession.findMany({
      where,
      orderBy: { startedAt: "asc" },
      select: {
        id: true,
        viewerId: true,
        deviceId: true,
        startedAt: true,
        endedAt: true,
        viewer: { select: { username: true } },
        device: { select: { hostname: true } },
      },
    });
    const now = new Date();
    const list = sessions.map((s) => {
      const endAt = s.endedAt ?? null;
      const durationMinutes =
        endAt != null
          ? Math.round((endAt.getTime() - s.startedAt.getTime()) / 60000)
          : Math.max(0, Math.round((now.getTime() - s.startedAt.getTime()) / 60000));
      return {
        id: s.id,
        viewerId: s.viewerId,
        username: s.viewer.username,
        deviceId: s.deviceId,
        hostname: s.device.hostname,
        startedAt: s.startedAt.toISOString(),
        endedAt: endAt?.toISOString() ?? null,
        durationMinutes,
      };
    });
    return { since: start.toISOString(), to: dayEnd.toISOString(), sessions: list };
  } catch (err) {
    req.log?.error?.(err);
    return reply.code(500).send({ error: "Erro ao gerar sessões do período." });
  }
});

// Produtividade do colaborador (PC): quando o agente ficou online/offline.
app.get("/reports/device-online-by-range", { preHandler: [app.authenticate] }, async (req: any, reply) => {
  try {
    const sinceRaw = (req.query as { since?: string }).since;
    const toRaw = (req.query as { to?: string }).to;
    const deviceIdFilter = (req.query as { deviceId?: string }).deviceId;
    const end = toRaw ? new Date(toRaw) : new Date();
    const start = sinceRaw ? new Date(sinceRaw) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start.getTime() > end.getTime()) {
      return reply.code(400).send({ error: "Parâmetros since e to devem ser datas válidas (ISO)." });
    }
    const dayEnd = new Date(end);
    dayEnd.setHours(23, 59, 59, 999);
    const where: { startedAt: { gte: Date; lte: Date }; deviceId?: string } = {
      startedAt: { gte: start, lte: dayEnd },
    };
    if (deviceIdFilter) where.deviceId = deviceIdFilter;
    const sessions = await prisma.deviceOnlineSession.findMany({
      where,
      orderBy: { startedAt: "asc" },
      select: {
        id: true,
        deviceId: true,
        startedAt: true,
        endedAt: true,
        device: { select: { hostname: true } },
      },
    });
    const now = new Date();
    const list = sessions.map((s) => {
      const endAt = s.endedAt ?? null;
      const durationMinutes =
        endAt != null
          ? Math.round((endAt.getTime() - s.startedAt.getTime()) / 60000)
          : Math.max(0, Math.round((now.getTime() - s.startedAt.getTime()) / 60000));
      return {
        id: s.id,
        deviceId: s.deviceId,
        hostname: s.device.hostname,
        startedAt: s.startedAt.toISOString(),
        endedAt: endAt?.toISOString() ?? null,
        durationMinutes,
      };
    });
    return { since: start.toISOString(), to: dayEnd.toISOString(), sessions: list };
  } catch (err) {
    req.log?.error?.(err);
    return reply.code(500).send({ error: "Erro ao gerar produtividade por dispositivo." });
  }
});

const port = Number(process.env.PORT ?? 4000);

app.addHook("onReady", async () => {
  await bootstrapAdmin();
});

await app.listen({ host: "0.0.0.0", port });


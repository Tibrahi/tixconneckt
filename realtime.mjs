/**
 * TIXCONNECKT realtime server (standalone Socket.IO process).
 *
 * Run alongside Next.js: `npm run realtime` (or `npm run dev:all` for both).
 *
 * Security model (no database access here by design):
 *  - Every socket must present a short-lived ticket signed by the Next.js API
 *    (jose HS256 with BETTER_AUTH_SECRET, purpose "socket").
 *  - Joining a room requires a per-room ticket issued by the Next.js API only
 *    after a membership/permission check (purpose "room", claim room).
 *  - The internal /internal/emit relay requires INTERNAL_RELAY_SECRET, used
 *    only server-to-server by API routes after their database commits.
 *
 * Events always reflect persisted operations; clients re-fetch authoritative
 * records from the API when an event arrives.
 *
 * Presence is genuine: the server counts live sockets per user id (a user
 * with several devices counts once) and answers /internal/presence for the
 * Next.js API only. This is single-instance state — a multi-instance
 * deployment would need a shared store before presence stays accurate.
 */

import { createServer } from "node:http";
import { Server } from "socket.io";
import { jwtVerify } from "jose";

const PORT = Number(process.env.REALTIME_PORT ?? 3001);
const INTERNAL_SECRET = process.env.INTERNAL_RELAY_SECRET ?? "";
const AUTH_SECRET = process.env.BETTER_AUTH_SECRET ?? "";

if (!AUTH_SECRET) {
  console.error("[realtime] BETTER_AUTH_SECRET is required");
  process.exit(1);
}

const key = new TextEncoder().encode(AUTH_SECRET);

/** userId -> live socket count. */
const presence = new Map();

function markOnline(userId) {
  presence.set(userId, (presence.get(userId) ?? 0) + 1);
}

function markOffline(userId) {
  const left = (presence.get(userId) ?? 1) - 1;
  if (left <= 0) presence.delete(userId);
  else presence.set(userId, left);
}

const httpServer = createServer((req, res) => {
  // Internal server-to-server relay endpoint.
  if (req.method === "POST" && req.url === "/internal/emit") {
    if (!INTERNAL_SECRET || req.headers.authorization !== `Bearer ${INTERNAL_SECRET}`) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false }));
      return;
    }
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 64 * 1024) req.destroy();
    });
    req.on("end", () => {
      try {
        const { room, event, payload } = JSON.parse(body);
        if (typeof room !== "string" || typeof event !== "string") throw new Error("bad payload");
        io.to(room).emit(event, { ...payload, at: new Date().toISOString() });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false }));
      }
    });
    return;
  }
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "tixconneckt-realtime" }));
    return;
  }
  if (req.method === "GET" && req.url.startsWith("/internal/presence")) {
    if (!INTERNAL_SECRET || req.headers.authorization !== `Bearer ${INTERNAL_SECRET}`) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false }));
      return;
    }
    const query = new URL(req.url, "http://localhost").searchParams.get("ids") ?? "";
    const ids = query.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 100);
    const online = ids.filter((id) => (presence.get(id) ?? 0) > 0);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, online }));
    return;
  }
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: false }));
});

const io = new Server(httpServer, {
  path: "/socket.io",
  cors: {
    origin: (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").split(","),
    credentials: true,
  },
});

async function verifyTicket(token, purpose) {
  const { payload } = await jwtVerify(token, key);
  if (payload.purpose !== purpose || !payload.sub) throw new Error("wrong purpose");
  return payload;
}

io.use(async (socket, next) => {
  try {
    const ticket = socket.handshake.auth?.ticket;
    if (!ticket) return next(new Error("missing ticket"));
    const payload = await verifyTicket(ticket, "socket");
    socket.data.userId = String(payload.sub);
    next();
  } catch {
    next(new Error("unauthorized"));
  }
});

io.on("connection", (socket) => {
  const userId = socket.data.userId;
  // Personal room is implicit and always allowed.
  socket.join(`user:${userId}`);
  markOnline(userId);
  socket.on("disconnect", () => markOffline(userId));

  socket.on("join", async ({ room, ticket }, ack) => {
    try {
      if (typeof room !== "string" || typeof ticket !== "string") throw new Error("bad join");
      const payload = await verifyTicket(ticket, "room");
      if (String(payload.sub) !== userId || payload.room !== room) throw new Error("room mismatch");
      socket.join(room);
      ack?.({ ok: true });
    } catch {
      ack?.({ ok: false });
    }
  });

  socket.on("leave", ({ room }) => {
    if (typeof room === "string" && room !== `user:${userId}`) socket.leave(room);
  });
});

httpServer.listen(PORT, () => {
  console.log(`[realtime] listening on :${PORT}`);
});

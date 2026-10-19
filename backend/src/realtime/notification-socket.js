const { Server } = require("socket.io");
const env = require("../config/env");
const auth = require("../modules/auth/auth.service");
const notifications = require("../modules/notification/notifications/notification.repository");
const preferences = require("../modules/notification/preferences/notification-preference.service");
const presence = require("../modules/notification/presence/notification-presence.service");
const { createRealtimeConnection } = require("../config/realtime");
const { channel } = require("./notification-events");
const { handshakeSchema, activitySchema, eventSchema } = require("./notification-socket.validation");

async function createNotificationSocket(server) {
  const io = new Server(server, {
    cors: { origin: env.SOCKET_ORIGINS },
    // WebSocket-only avoids sticky-session requirements across API instances.
    transports: ["websocket"],
    maxHttpBufferSize: 16384,
    allowRequest: (req, callback) => {
      const origin = req.headers.origin;
      callback(null, !origin || env.SOCKET_ORIGINS.includes(origin));
    },
  });
  const subscriber = createRealtimeConnection();
  const pendingCleanup = new Set();

  async function authenticateSocket(socket) {
    const user = await auth.authenticateAccessToken(socket.data.token);
    socket.data.user = user;
    return user;
  }

  io.use(async (socket, next) => {
    const parsed = handshakeSchema.safeParse(socket.handshake.auth);
    if (!parsed.success) {
      return next(new Error("An access token is required"));
    }
    socket.data.token = parsed.data.token;
    try {
      await authenticateSocket(socket);
      next();
    } catch {
      next(new Error("Invalid or expired session"));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.data.user.userId;
    socket.join(`user:${userId}`);
    socket.data.activeUntil = 0;
    socket.data.presenceWork = Promise.resolve();

    function updatePresence(activeUntil) {
      // Serialize updates and disconnect cleanup for this socket.
      const work = socket.data.presenceWork.then(() => {
        if (socket.connected) {
          return presence.touch(userId, socket.id, activeUntil);
        }
      });
      socket.data.presenceWork = work.catch(() => {});
      return work;
    }
    socket.data.updatePresence = updatePresence;

    updatePresence(0).then(() => {
      if (socket.connected) {
        socket.emit("notification:ready", { heartbeatMs: Math.floor(env.PRESENCE_TTL_MS / 3) });
      }
    }).catch(() => socket.disconnect(true));

    socket.on("presence:update", async (input, acknowledge) => {
      const reply = typeof acknowledge === "function" ? acknowledge : () => {};
      const parsed = activitySchema.safeParse(input);
      if (!parsed.success) {
        return reply({ success: false, message: "active must be a boolean" });
      }
      try {
        await authenticateSocket(socket);
        socket.data.activeUntil = parsed.data.active ? Date.now() + env.PRESENCE_TTL_MS : 0;
        await updatePresence(socket.data.activeUntil);
        reply({ success: true });
      } catch {
        reply({ success: false, message: "Session or presence unavailable" });
        socket.disconnect(true);
      }
    });

    socket.on("disconnect", () => {
      const cleanup = socket.data.presenceWork.then(() => presence.remove(userId, socket.id))
        .catch(() => console.error("Presence cleanup deferred to expiry"));
      pendingCleanup.add(cleanup);
      cleanup.finally(() => pendingCleanup.delete(cleanup));
    });
  });

  async function deliverMessage(raw) {
    const parsed = eventSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      return;
    }
    const { userId, event, notificationId } = parsed.data;
    const members = io.sockets.adapter.rooms.get(`user:${userId}`);
    if (!members) {
      return;
    }
    let payload = { id: notificationId };
    if (event === "notification:new" || event === "notification:read") {
      const notification = await notifications.findForUser(userId, notificationId);
      if (!notification) {
        return;
      }
      if (event === "notification:new") {
        const settings = await preferences.getMine(userId);
        if (!settings.IN_APP) {
          return;
        }
      }
      payload = { notification };
    } else if (event === "notifications:read-all") {
      payload = { refresh: true };
    }
    for (const socketId of members) {
      const socket = io.sockets.sockets.get(socketId);
      if (!socket) {
        continue;
      }
      try {
        // Recheck before private events, not only at the initial handshake.
        await authenticateSocket(socket);
        if (socket.connected) {
          socket.emit(event, payload);
        }
      } catch {
        socket.disconnect(true);
      }
    }
  }

  subscriber.on("message", (name, raw) => {
    if (name === channel) {
      deliverMessage(raw).catch(() => console.error("Live event unavailable; use the REST inbox"));
    }
  });
  try {
    await subscriber.connect();
    await subscriber.subscribe(channel);
  } catch (error) {
    subscriber.disconnect();
    await new Promise((resolve) => io.close(resolve));
    throw error;
  }

  let checking = false;
  let checkWork = Promise.resolve();
  async function checkSockets() {
    if (checking) {
      return;
    }
    checking = true;
    try {
      for (const socket of io.sockets.sockets.values()) {
        try {
          await authenticateSocket(socket);
          if (socket.connected) {
            await socket.data.updatePresence(socket.data.activeUntil);
          }
        } catch {
          socket.disconnect(true);
        }
      }
    } finally {
      checking = false;
    }
  }
  const timer = setInterval(() => {
    if (!checking) {
      checkWork = checkSockets();
    }
  }, Math.min(env.SOCKET_CHECK_MS, Math.floor(env.PRESENCE_TTL_MS / 3)));
  timer.unref();

  async function close() {
    clearInterval(timer);
    subscriber.disconnect();
    await new Promise((resolve) => io.close(resolve));
    await checkWork;
    await Promise.all([...pendingCleanup]);
  }

  return { io, close };
}

module.exports = { createNotificationSocket };

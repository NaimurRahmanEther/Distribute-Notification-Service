const env = require("../../../config/env");
const { getRealtimeConnection } = require("../../../config/realtime");

function keys(userId) {
  return {
    online: `${env.REALTIME_PREFIX}:online:${userId}`,
    active: `${env.REALTIME_PREFIX}:active:${userId}`,
  };
}

async function touch(userId, socketId, activeUntil) {
  const redis = getRealtimeConnection();
  const key = keys(userId);
  const now = Date.now();
  // One member per socket: closing a tab must not remove another tab's presence.
  const transaction = redis.multi()
    .zremrangebyscore(key.online, "-inf", now)
    .zremrangebyscore(key.active, "-inf", now)
    .zadd(key.online, now + env.PRESENCE_TTL_MS, socketId)
    .pexpire(key.online, env.PRESENCE_TTL_MS);
  if (activeUntil > now) {
    transaction.zadd(key.active, activeUntil, socketId);
    transaction.pexpire(key.active, env.PRESENCE_TTL_MS);
  } else {
    transaction.zrem(key.active, socketId);
  }
  const results = await transaction.exec();
  for (const [error] of results) {
    if (error) {
      throw error;
    }
  }
}

async function remove(userId, socketId) {
  const redis = getRealtimeConnection();
  const key = keys(userId);
  await redis.zrem(key.online, socketId);
  await redis.zrem(key.active, socketId);
}

async function getForUser(userId) {
  const redis = getRealtimeConnection();
  const key = keys(userId);
  const now = Date.now();
  const [online, active] = await Promise.all([
    redis.zcount(key.online, `(${now}`, "+inf"),
    redis.zcount(key.active, `(${now}`, "+inf"),
  ]);
  return { online: online > 0, active: active > 0 };
}

module.exports = { touch, remove, getForUser };

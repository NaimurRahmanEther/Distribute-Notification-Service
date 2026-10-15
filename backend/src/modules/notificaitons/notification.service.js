const { randomUUID } = require("node:crypto");
const repository = require("./notification.repository");
const authRepository = require("../auth/auth.repository");
const AppError = require("../../shared/errors/AppError");

function requireNotification(notification) {
  if (!notification) throw new AppError("Notification not found", 404);
  return notification;
}

async function createForSelf(userId, input) {
  const user = await authRepository.findById(userId);
  if (!user) throw new AppError("User no longer exists", 401);

  try {
    return await repository.create({
      id: randomUUID(),
      userId,
      type: input.type,
      title: input.title,
      message: input.message,
      data: input.data,
    });
  } catch (error) {
    // The recipient may be deleted between the lookup and insertion.
    if (error.code === "23503" &&
        error.constraint === "notifications_user_id_fkey") {
      throw new AppError("User no longer exists", 401);
    }
    throw error;
  }
}

async function listMine(userId, filters) {
  const { notifications, total } = await repository.listForUser(userId, filters);
  return {
    notifications,
    meta: {
      page: filters.page,
      limit: filters.limit,
      total,
      totalPages: Math.ceil(total / filters.limit),
    },
  };
}

async function getMine(userId, id) {
  return requireNotification(await repository.findForUser(userId, id));
}

async function markMineRead(userId, id) {
  return requireNotification(await repository.markReadForUser(userId, id));
}

async function markAllMineRead(userId) {
  return { updatedCount: await repository.markAllReadForUser(userId) };
}

async function deleteMine(userId, id) {
  return requireNotification(await repository.deleteForUser(userId, id));
}

module.exports = {
  createForSelf, listMine, getMine, markMineRead, markAllMineRead, deleteMine,
};

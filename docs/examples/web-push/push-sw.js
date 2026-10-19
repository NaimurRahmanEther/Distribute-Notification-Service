// Copy to your frontend's public/push-sw.js (same origin as the web app).
self.addEventListener("push", (event) => {
  if (!event.data) {
    return;
  }
  let notification;
  try {
    notification = event.data.json();
  } catch {
    return;
  }
  if (typeof notification.notificationId !== "string" || typeof notification.title !== "string") {
    return;
  }
  event.waitUntil(self.registration.showNotification(notification.title, {
    body: notification.body,
    tag: notification.notificationId,
    renotify: false,
    data: { notificationId: notification.notificationId },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const id = event.notification.data.notificationId;
  // Change this path to your frontend notification page. Never use a supplied external URL.
  const url = new URL(`/notifications?notificationId=${encodeURIComponent(id)}`, self.location.origin);
  event.waitUntil(self.clients.openWindow(url.href));
});

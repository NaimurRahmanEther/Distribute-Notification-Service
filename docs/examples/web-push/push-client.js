// Load this in the frontend; call enable from an explicit user click.
// apiBase example: http://localhost:8000/api/v1
async function pushRequest(apiBase, token, path, options = {}) {
  const response = await fetch(`${apiBase}/push-subscriptions${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.message || "Push request failed");
  }
  return result.data;
}

function decodePushKey(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const decoded = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

async function enablePush(apiBase, token) {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    throw new Error("Web Push is not supported in this browser");
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notification permission was not granted");
  }
  const { publicKey } = await pushRequest(apiBase, token, "/public-key");
  await navigator.serviceWorker.register("/push-sw.js");
  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodePushKey(publicKey),
    });
  }
  const result = await pushRequest(apiBase, token, "", {
    method: "POST",
    body: JSON.stringify(subscription.toJSON()),
  });
  // Store this ID for this signed-in user/device; it is needed before logout.
  return result.subscription.id;
}

async function disablePush(apiBase, token, subscriptionId) {
  await pushRequest(apiBase, token, `/${encodeURIComponent(subscriptionId)}`, { method: "DELETE" });
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = registration && await registration.pushManager.getSubscription();
  if (subscription) {
    await subscription.unsubscribe();
  }
}

window.notificationPush = { enable: enablePush, disable: disablePush };

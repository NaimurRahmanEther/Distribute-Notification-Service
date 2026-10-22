const env = require("./env");

// Named route families avoid a new Redis bucket for every notification UUID.
const routes = [
  { name: "register", path: /^\/api\/v1\/auth\/register\/?$/i, method: "POST", public: true, limit: env.REGISTER_LIMIT_MAX, windowMs: env.AUTH_WINDOW_MS },
  { name: "login", path: /^\/api\/v1\/auth\/login\/?$/i, method: "POST", public: true, limit: env.LOGIN_LIMIT_MAX, windowMs: env.AUTH_WINDOW_MS },
  { name: "refresh", path: /^\/api\/v1\/auth\/refresh\/?$/i, method: "POST", public: true, limit: env.SESSION_LIMIT_MAX },
  { name: "logout", path: /^\/api\/v1\/auth\/logout\/?$/i, method: "POST", public: true, limit: env.SESSION_LIMIT_MAX },
  { name: "notifications", path: /^\/api\/v1\/notifications(?:\/|$)/ },
  { name: "deliveries", path: /^\/api\/v1\/notification-deliveries(?:\/|$)/ },
  { name: "preferences", path: /^\/api\/v1\/notification-preferences(?:\/|$)/ },
  { name: "subscriptions", path: /^\/api\/v1\/push-subscriptions(?:\/|$)/ },
  { name: "dead-letters", path: /^\/api\/v1\/admin\/dead-letters(?:\/|$)/, admin: true },
  { name: "operations", path: /^\/api\/v1\/admin\/operations(?:\/|$)/, admin: true },
  { name: "socket", path: /^\/socket\.io\//, method: "GET", socket: true },
];

function findRoute(path, method) {
  return routes.find(route => route.path.test(path) && (!route.method || route.method === method || method === "OPTIONS"));
}

module.exports = { routes, findRoute };

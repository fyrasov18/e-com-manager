export const ROLES = ["admin", "manager", "user"] as const;

export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "admin:all",
  "dashboard:read",
  "reports:read",
  "orders:read",
  "orders:write",
  "products:read",
  "products:write",
  "finance:read",
  "finance:write",
  "expenses:read",
  "expenses:write",
  "tasks:read",
  "tasks:write",
  "goals:read",
  "goals:write",
  "imports:write",
  "delivery:read",
  "delivery:write",
  "settings:manage",
  "profile:read",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  admin: ["admin:all"],
  manager: [
    "dashboard:read",
    "reports:read",
    "orders:read",
    "orders:write",
    "products:read",
    "products:write",
    "finance:read",
    "finance:write",
    "expenses:read",
    "expenses:write",
    "tasks:read",
    "tasks:write",
    "goals:read",
    "goals:write",
    "imports:write",
    "delivery:read",
    "delivery:write",
    "profile:read",
  ],
  user: ["dashboard:read", "finance:read", "expenses:read", "profile:read"],
};

type RouteRule = {
  path: string;
  permission: Permission | null;
  exact?: boolean;
  methods?: readonly string[];
};

const PAGE_RULES: readonly RouteRule[] = [
  { path: "/forbidden", permission: null, exact: true },
  { path: "/", permission: "dashboard:read", exact: true },
  { path: "/analytics", permission: "reports:read" },
  { path: "/orders", permission: "orders:read" },
  { path: "/products", permission: "products:read" },
  { path: "/finance", permission: "finance:read" },
  { path: "/payments", permission: "finance:read" },
  { path: "/transactions", permission: "finance:read" },
  { path: "/expenses", permission: "expenses:read" },
  { path: "/tasks", permission: "tasks:read" },
  { path: "/goals", permission: "goals:read" },
  { path: "/import", permission: "imports:write" },
  { path: "/shipping-providers", permission: "delivery:read" },
  { path: "/settings", permission: "settings:manage" },
];

const API_RULES: readonly RouteRule[] = [
  { path: "/api/me", permission: "profile:read", exact: true },
  { path: "/api/logout", permission: "profile:read", exact: true },
  { path: "/api/dashboard", permission: "dashboard:read" },
  { path: "/api/finance", permission: "finance:read" },
  { path: "/api/transactions", permission: "finance:read", methods: ["GET"] },
  { path: "/api/transactions", permission: "finance:write" },
  { path: "/api/expenses", permission: "expenses:read", methods: ["GET"] },
  { path: "/api/expenses", permission: "expenses:write" },
  { path: "/api/orders", permission: "orders:read", methods: ["GET"] },
  { path: "/api/orders", permission: "orders:write" },
  { path: "/api/products", permission: "products:read", methods: ["GET"] },
  { path: "/api/products", permission: "products:write" },
  { path: "/api/goals", permission: "goals:read", methods: ["GET"] },
  { path: "/api/goals", permission: "goals:write" },
  { path: "/api/tasks", permission: "tasks:read", methods: ["GET"] },
  { path: "/api/tasks", permission: "tasks:write" },
  { path: "/api/import", permission: "imports:write" },
  { path: "/api/meta-ads", permission: "reports:read" },
  { path: "/api/delivery-settings", permission: "settings:manage" },
  { path: "/api/settings", permission: "settings:manage" },
  { path: "/api/shipping-providers", permission: "delivery:read", methods: ["GET"] },
  { path: "/api/shipping-providers", permission: "delivery:write" },
  { path: "/api/colissimo", permission: "delivery:write" },
  { path: "/api/insta-delivery", permission: "delivery:write" },
  { path: "/api/delivery", permission: "delivery:write" },
  { path: "/api/delivery-revenue", permission: "finance:read", methods: ["GET"] },
  { path: "/api/delivery-revenue", permission: "finance:write" },
  { path: "/api/revenue-livraison", permission: "finance:read", methods: ["GET"] },
  { path: "/api/revenue-livraison", permission: "finance:write" },
  { path: "/api/payments", permission: "finance:read", methods: ["GET"] },
  { path: "/api/payments", permission: "finance:write" },
  { path: "/api/stock-movements", permission: "products:read", methods: ["GET"] },
  { path: "/api/stock-movements", permission: "products:write" },
  { path: "/api/notifications", permission: "dashboard:read", methods: ["GET"] },
  { path: "/api/notifications", permission: "settings:manage" },
  { path: "/api/cron", permission: "admin:all" },
];

export const rolePermissions = ROLE_PERMISSIONS;

export function normalizeRole(value: unknown): Role {
  const role = typeof value === "string" ? value.trim().toLowerCase() : "";

  if (role === "admin") return "admin";
  if (role === "manager") return "manager";
  if (role === "user" || role === "viewer") return "user";

  return "user";
}

export function roleHasPermission(roleValue: unknown, permission: Permission | null) {
  if (!permission) return true;

  const role = normalizeRole(roleValue);
  const permissions = ROLE_PERMISSIONS[role];

  return permissions.includes("admin:all") || permissions.includes(permission);
}

function matchesRule(rule: RouteRule, pathname: string, method?: string) {
  if (rule.methods && method && !rule.methods.includes(method.toUpperCase())) {
    return false;
  }

  if (rule.exact) {
    return pathname === rule.path;
  }

  return pathname === rule.path || pathname.startsWith(`${rule.path}/`);
}

function getMatchingRule(
  rules: readonly RouteRule[],
  pathname: string,
  method?: string
) {
  return rules.find((rule) => matchesRule(rule, pathname, method));
}

export function getRequiredPagePermission(pathname: string) {
  return getMatchingRule(PAGE_RULES, pathname)?.permission ?? "admin:all";
}

export function getRequiredApiPermission(pathname: string, method = "GET") {
  return getMatchingRule(API_RULES, pathname, method)?.permission ?? "admin:all";
}

export function canAccessPath(pathname: string, roleValue: unknown) {
  return roleHasPermission(roleValue, getRequiredPagePermission(pathname));
}

export function canAccessApiRoute(
  pathname: string,
  method: string,
  roleValue: unknown
) {
  return roleHasPermission(roleValue, getRequiredApiPermission(pathname, method));
}

export function getPermissionsForRole(roleValue: unknown) {
  const role = normalizeRole(roleValue);
  return ROLE_PERMISSIONS[role];
}

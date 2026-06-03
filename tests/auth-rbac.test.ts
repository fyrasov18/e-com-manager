import assert from "node:assert/strict";
import {
  validateLoginCredentials,
  normalizeEmail,
} from "../src/lib/auth-validation";
import {
  canAccessApiRoute,
  canAccessApiRouteWithPermissions,
  canAccessPath,
  canAccessPathWithPermissions,
  getPermissionsForRole,
  normalizeAssignablePermissions,
  normalizeRole,
  permissionsHavePermission,
  resolveEffectivePermissions,
  roleHasPermission,
} from "../src/lib/rbac";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test("successful login input validates and normalizes email", () => {
  const result = validateLoginCredentials(" Admin@Example.COM ", "secret-password");

  assert.equal(result.success, true);
  assert.equal(result.success && result.data.email, "admin@example.com");
});

test("failed login input rejects invalid email and missing password", () => {
  const result = validateLoginCredentials("not-an-email", "");

  assert.equal(result.success, false);
  assert.equal(result.errors.email, "Veuillez saisir une adresse email valide.");
  assert.equal(result.errors.password, "Le mot de passe est requis.");
});

test("logout endpoint requires authenticated basic profile permission", () => {
  assert.equal(canAccessApiRoute("/api/logout", "POST", "user"), true);
});

test("unauthenticated route access is represented by missing role and denied by caller", () => {
  assert.equal(normalizeRole(undefined), "user");
  assert.equal(normalizeEmail(" USER@Example.COM "), "user@example.com");
});

test("forbidden role access denies user access to manager pages", () => {
  assert.equal(canAccessPath("/orders", "user"), false);
  assert.equal(canAccessApiRoute("/api/orders", "GET", "user"), false);
});

test("basic users can view expenses but cannot modify them", () => {
  assert.equal(canAccessPath("/expenses", "user"), true);
  assert.equal(canAccessApiRoute("/api/expenses", "GET", "user"), true);
  assert.equal(canAccessApiRoute("/api/expenses", "POST", "user"), false);
});

test("allowed role access permits manager order and product access", () => {
  assert.equal(canAccessPath("/orders", "manager"), true);
  assert.equal(canAccessApiRoute("/api/orders", "GET", "manager"), true);
  assert.equal(canAccessApiRoute("/api/products", "POST", "manager"), true);
  assert.equal(canAccessApiRoute("/api/expenses", "POST", "manager"), true);
});

test("admin can access settings and admin-only APIs", () => {
  assert.equal(canAccessPath("/settings", "admin"), true);
  assert.equal(canAccessApiRoute("/api/settings", "POST", "admin"), true);
  assert.equal(canAccessApiRoute("/api/cron/import-orders", "POST", "admin"), true);
});

test("manager cannot access admin-only settings", () => {
  assert.equal(canAccessPath("/settings", "manager"), false);
  assert.equal(canAccessApiRoute("/api/settings", "POST", "manager"), false);
});

test("protected API endpoints require the mapped permission", () => {
  assert.equal(roleHasPermission("manager", "orders:write"), true);
  assert.equal(roleHasPermission("user", "orders:write"), false);
  assert.deepEqual(getPermissionsForRole("VIEWER"), getPermissionsForRole("user"));
});

test("custom workspace permissions can grant page and API access", () => {
  const permissions = ["dashboard:read", "orders:read", "orders:write", "profile:read"];

  assert.equal(canAccessPathWithPermissions("/orders", permissions), true);
  assert.equal(canAccessApiRouteWithPermissions("/api/orders", "POST", permissions), true);
  assert.equal(canAccessPathWithPermissions("/settings/users", permissions), false);
});

test("assignable workspace permissions exclude admin all and keep profile read", () => {
  const permissions = normalizeAssignablePermissions([
    "admin:all",
    "users:manage",
    "orders:read",
    "not-real",
  ]);

  assert.equal(permissions.includes("admin:all"), false);
  assert.equal(permissions.includes("users:manage"), true);
  assert.equal(permissions.includes("profile:read"), true);
  assert.equal(permissionsHavePermission(["admin:all"], "users:manage"), true);
});

test("admin session keeps full navigation even with stale limited permissions", () => {
  const permissions = resolveEffectivePermissions({
    role: "admin",
    permissions: ["dashboard:read", "finance:read", "expenses:read", "profile:read"],
  });

  assert.equal(canAccessPathWithPermissions("/products", permissions), true);
  assert.equal(canAccessPathWithPermissions("/orders", permissions), true);
  assert.equal(canAccessPathWithPermissions("/settings", permissions), true);
});

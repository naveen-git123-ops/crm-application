/**
 * Role permissions from /auth/me (sourced from roles table in DB).
 * Having a screen permission (e.g. cgw-flow-metre) grants full use of that screen.
 */

export function normalizeUserPermissions(user) {
  if (!user) return [];
  if (user.role === 'Admin') return ['*'];
  const raw = user.permissions;
  if (Array.isArray(raw)) return raw.filter(Boolean);
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function userHasPermission(user, permissionKey) {
  if (!user || !permissionKey) return false;
  if (user.role === 'Admin') return true;
  return normalizeUserPermissions(user).includes(permissionKey);
}

/** CGW screen: view + create + edit when role includes cgw-flow-metre. */
export function userCanManageCgw(user) {
  return userHasPermission(user, 'cgw-flow-metre');
}

/** Delete entire CGW inventory rows — Admin only. */
export function userCanDeleteCgw(user) {
  return user?.role === 'Admin';
}

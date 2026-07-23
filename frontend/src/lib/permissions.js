/**
 * Role permissions from /auth/me (sourced from roles table in DB).
 * Having a screen permission (e.g. cgw-flow-metre) grants full use of that screen.
 */

export function normalizeRole(user) {
  return (user?.role || '').trim().toLowerCase();
}

export function isAdminUser(user) {
  if (!user) return false;
  if (user.is_admin === true) return true;
  return normalizeRole(user) === 'admin';
}

/** Admin or Manager — may edit/delete any lead in the CRM. */
export function canManageAllLeads(user) {
  if (!user) return false;
  if (isAdminUser(user)) return true;
  return normalizeRole(user) === 'manager';
}

export function isAdminOrHrUser(user) {
  const role = normalizeRole(user);
  return role === 'admin' || role === 'hr';
}

export function isAdminOrManagerUser(user) {
  const role = normalizeRole(user);
  return role === 'admin' || role === 'manager';
}

/** Admin may edit/delete any business record regardless of creator or assignee. */
export function userCanManageAnyRecord(user) {
  return isAdminUser(user);
}

export function normalizeUserPermissions(user) {
  if (!user) return [];
  if (isAdminUser(user)) return ['*'];
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
  if (isAdminUser(user)) return true;
  return normalizeUserPermissions(user).includes(permissionKey);
}

/** CGW screen: view + create + edit when role includes cgw-flow-metre. */
export function userCanManageCgw(user) {
  return userHasPermission(user, 'cgw-flow-metre');
}

/** Delete entire CGW inventory rows — Admin only. */
export function userCanDeleteCgw(user) {
  return isAdminUser(user);
}

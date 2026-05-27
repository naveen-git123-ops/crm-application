import { useAuth } from '@/contexts/AuthContext';
import { useEmployeeLocationTracking } from '@/hooks/useEmployeeLocationTracking';

/**
 * Invisible component — starts GPS breadcrumbs while the employee is punched in.
 * Mount once inside the authenticated layout (browser tab should stay open).
 */
export function EmployeeLocationTracker() {
  const { user, token } = useAuth();
  const employeeId = user?.employee_id;
  const enabled = Boolean(token && employeeId);

  useEmployeeLocationTracking({ enabled, employeeId });

  return null;
}

export default EmployeeLocationTracker;

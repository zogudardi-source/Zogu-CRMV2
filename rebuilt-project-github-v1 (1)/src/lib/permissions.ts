import { supabase } from '../services/supabase';
import { UserRole } from '../types';

/**
 * Saves the role permissions for a given organization by calling a secure
 * backend RPC function.
 * @param orgId The UUID of the organization to update.
 * @param permissions The complete permissions object for all configurable roles.
 * @param configurableRoles An array of roles that are being configured.
 */
export const saveRolePermissions = async (
  orgId: string,
  permissions: Record<UserRole, string[]>,
  configurableRoles: UserRole[]
) => {
  const permissions_data = configurableRoles.map(role => ({
    role: role,
    permissions: permissions[role] || []
  }));

  const { error } = await supabase.rpc('update_role_permissions', {
    target_org_id: orgId,
    permissions_data: permissions_data
  });

  if (error) {
    throw new Error(error.message);
  }
};

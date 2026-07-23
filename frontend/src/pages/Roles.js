import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Shield, Save, Loader2, Plus, Pencil, Trash2, Lock } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${BACKEND_URL}/api`;

const authHeaders = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });

const PERMISSION_LABELS = {
  dashboard: 'Dashboard',
  leads: 'Leads',
  customers: 'Customers',
  'cgw-flow-metre': 'CGW Flow Metre',
  employees: 'Employees',
  attendance: 'Attendance',
  'monthly-report': 'Monthly Report',
  leaves: 'Leaves',
  tasks: 'Tasks',
  expenses: 'Expenses',
  vehicles: 'Vehicle Tracking',
  roles: 'Roles',
  workspace: 'Workspace',
  idcards: 'ID Cards',
  documents: 'Documents',
  settings: 'Settings',
  holidays: 'Government Holidays',
};

const PERMISSION_KEYS = Object.keys(PERMISSION_LABELS);

export const Roles = () => {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [savingEmailId, setSavingEmailId] = useState(null);
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState(null);
  const [roleForm, setRoleForm] = useState({ name: '', permissions: [] });
  const [savingRole, setSavingRole] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  // Admin password reset dialog (no email verification)
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetTargetUser, setResetTargetUser] = useState(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetSaving, setResetSaving] = useState(false);

  useEffect(() => {
    fetchUsers();
    fetchRoles();
  }, []);

  const openResetPasswordDialog = (targetUser) => {
    setResetTargetUser(targetUser);
    setResetPassword('');
    setResetDialogOpen(true);
  };

  const submitResetPassword = async () => {
    if (user?.role !== 'Admin') return;
    if (!resetTargetUser) return;

    const newPassword = (resetPassword || '').trim();
    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setResetSaving(true);
    try {
      await axios.post(
        `${API}/users/${resetTargetUser.id}/reset-password`,
        { new_password: newPassword },
        authHeaders()
      );
      toast.success('Password reset successfully');
      setResetDialogOpen(false);
      setResetTargetUser(null);
      setResetPassword('');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to reset password');
    } finally {
      setResetSaving(false);
      // No need to refetch users, but keep UI consistent in case role changes occurred.
      fetchUsers();
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await axios.get(`${API}/users`, authHeaders());
      setUsers(response.data);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const fetchRoles = async () => {
    try {
      const response = await axios.get(`${API}/roles`, authHeaders());
      setRoles(response.data);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to load roles');
    }
  };

  const handleRoleChange = (userId, newRole) => {
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
  };

  const handleEmailChange = (userId, newEmail) => {
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, email: newEmail } : u));
  };

  const saveRole = async (userId) => {
    const target = users.find(u => u.id === userId);
    if (!target) return;
    setSavingId(userId);
    try {
      await axios.put(`${API}/users/${userId}/role`, { role: target.role }, authHeaders());
      toast.success(`Role updated to ${target.role}`);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update role');
      fetchUsers();
    } finally {
      setSavingId(null);
    }
  };

  const saveEmail = async (userId) => {
    const target = users.find(u => u.id === userId);
    if (!target) return;
    const email = (target.email || '').trim().toLowerCase();
    if (!email) {
      toast.error('Email is required');
      return;
    }
    setSavingEmailId(userId);
    try {
      await axios.put(`${API}/users/${userId}/email`, { email }, authHeaders());
      toast.success(`Email updated to ${email}`);
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update email');
      fetchUsers();
    } finally {
      setSavingEmailId(null);
    }
  };

  const openCreateRole = () => {
    setEditingRole(null);
    setRoleForm({ name: '', permissions: [] });
    setRoleDialogOpen(true);
  };

  const openEditRole = (role) => {
    setEditingRole(role);
    setRoleForm({ name: role.name, permissions: role.permissions || [] });
    setRoleDialogOpen(true);
  };

  const togglePermission = (key) => {
    setRoleForm(prev => ({
      ...prev,
      permissions: prev.permissions.includes(key)
        ? prev.permissions.filter(p => p !== key)
        : [...prev.permissions, key],
    }));
  };

  const saveRoleForm = async () => {
    const name = roleForm.name.trim();
    if (!name) {
      toast.error('Role name is required');
      return;
    }
    setSavingRole(true);
    try {
      if (editingRole) {
        await axios.put(`${API}/roles/${editingRole.id}`, {
          name,
          permissions: roleForm.permissions,
        }, authHeaders());
        toast.success('Role updated. Users with this role get new permissions after they refresh the page or log in again.');
      } else {
        await axios.post(`${API}/roles`, {
          name,
          permissions: roleForm.permissions,
        }, authHeaders());
        toast.success('Role created');
      }
      setRoleDialogOpen(false);
      fetchRoles();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save role');
    } finally {
      setSavingRole(false);
    }
  };

  const deleteRole = async (role) => {
    if (!window.confirm(`Delete role "${role.name}"? Users with this role must be reassigned first.`)) return;
    setDeletingId(role.id);
    try {
      await axios.delete(`${API}/roles/${role.id}`, authHeaders());
      toast.success('Role deleted');
      fetchRoles();
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete role');
    } finally {
      setDeletingId(null);
    }
  };

  const canEditRole = (role) => !role.is_system && role.name !== 'Admin';

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-8" data-testid="roles-page">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Role Management</h1>
        <p className="text-gray-600 text-sm mt-1">Create and edit roles, control which screens each role can see. Assign roles to users below.</p>
      </div>

      {/* Roles & screen access */}
      <Card className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-gray-900">Roles & screen access</h2>
          <Button onClick={openCreateRole} className="bg-blue-600 hover:bg-blue-700 text-white h-9">
            <Plus className="h-4 w-4 mr-2" />
            Create role
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Role name</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Screens</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Status</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((r) => (
                <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                  <td className="py-3 px-4 font-medium text-gray-900">{r.name}</td>
                  <td className="py-3 px-4 text-gray-600">
                    {(r.permissions || []).map(p => PERMISSION_LABELS[p] || p).join(', ') || '—'}
                  </td>
                  <td className="py-3 px-4">
                    {r.is_system || r.name === 'Admin' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700">
                        <Lock className="h-3 w-3" /> Protected
                      </span>
                    ) : (
                      <span className="text-gray-500 text-xs">Editable</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    {canEditRole(r) ? (
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="h-8" onClick={() => openEditRole(r)}>
                          <Pencil className="h-3.5 w-3 mr-1" /> Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-red-600 border-red-200 hover:bg-red-50"
                          onClick={() => deleteRole(r)}
                          disabled={deletingId === r.id}
                        >
                          {deletingId === r.id ? <Loader2 className="h-3.5 w-3 animate-spin" /> : <><Trash2 className="h-3.5 w-3 mr-1" /> Delete</>}
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* User role assignment */}
      <Card className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">User role assignment</h2>
          <p className="text-sm text-gray-600 mt-0.5">Assign a role to each user. Only Admin can change roles.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Name</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Email</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Employee ID</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Department</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Current Role</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Action</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                  <td className="py-3 px-4 font-medium text-gray-900">{u.name}</td>
                  <td className="py-3 px-4 text-gray-600 min-w-[240px]">
                    <Input
                      value={u.email || ''}
                      onChange={(e) => handleEmailChange(u.id, e.target.value)}
                      className="h-9"
                    />
                  </td>
                  <td className="py-3 px-4 text-gray-600">{u.employee_id || '—'}</td>
                  <td className="py-3 px-4 text-gray-600">{u.department || '—'}</td>
                  <td className="py-3 px-4">
                    <select
                      value={u.role}
                      onChange={(e) => handleRoleChange(u.id, e.target.value)}
                      disabled={u.id === user?.id}
                      className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {roles.map((r) => (
                        <option key={r.id} value={r.name}>{r.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex flex-col gap-2">
                      {u.id !== user?.id && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-9"
                          onClick={() => saveRole(u.id)}
                          disabled={savingId === u.id}
                        >
                          {savingId === u.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <Save className="h-4 w-4 mr-1" />
                              Save
                            </>
                          )}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-9"
                        onClick={() => saveEmail(u.id)}
                        disabled={savingEmailId === u.id}
                      >
                        {savingEmailId === u.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Save className="h-4 w-4 mr-1" />
                            Save Email
                          </>
                        )}
                      </Button>
                      {u.id === user?.id && (
                        <span className="text-xs text-gray-500">(You)</span>
                      )}

                      {user?.role === 'Admin' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-9"
                          onClick={() => openResetPasswordDialog(u)}
                          disabled={resetSaving && resetTargetUser?.id === u.id}
                        >
                          {resetSaving && resetTargetUser?.id === u.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <Lock className="h-4 w-4 mr-1" />
                              Reset Password
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {users.length === 0 && (
        <Card className="p-12 text-center rounded-lg border border-gray-200 bg-white shadow-sm">
          <Shield className="h-12 w-12 mx-auto mb-2 opacity-20" />
          <p className="text-gray-600">No users found</p>
        </Card>
      )}

      {/* Create / Edit role dialog */}
      <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
        <DialogContent className="max-w-lg bg-white rounded-lg border border-gray-200 shadow-xl p-0">
          <div className="bg-blue-600 text-white p-6 rounded-t-lg">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-white">{editingRole ? 'Edit Role' : 'Create Role'}</DialogTitle>
              <p className="text-blue-100 text-sm mt-1">Choose which screens this role can access.</p>
            </DialogHeader>
          </div>
          <div className="space-y-4 p-6">
            <div>
              <Label htmlFor="role-name" className="text-sm font-semibold text-gray-900 block mb-2">Role Name *</Label>
              <Input
                id="role-name"
                value={roleForm.name}
                onChange={(e) => setRoleForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g. Sales, Support"
                className="h-10 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={editingRole?.name === 'Admin'}
              />
            </div>
            <div>
              <Label className="text-sm font-semibold text-gray-900 mb-2 block">Screens this role can access *</Label>
              <div className="grid grid-cols-2 gap-2 border border-gray-300 rounded-lg p-3 bg-gray-50 max-h-48 overflow-y-auto">
                {PERMISSION_KEYS.map((key) => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      checked={roleForm.permissions.includes(key)}
                      onChange={() => togglePermission(key)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-gray-700">{PERMISSION_LABELS[key]}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2 border-t border-gray-200">
              <Button variant="outline" onClick={() => setRoleDialogOpen(false)} className="px-4 py-2">Cancel</Button>
              <Button onClick={saveRoleForm} disabled={savingRole} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2">
                {savingRole ? <Loader2 className="h-4 w-4 animate-spin" /> : (editingRole ? 'Update' : 'Create')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Admin reset password dialog */}
      <Dialog
        open={resetDialogOpen}
        onOpenChange={(open) => {
          setResetDialogOpen(open);
          if (!open) {
            setResetTargetUser(null);
            setResetPassword('');
            setResetSaving(false);
          }
        }}
      >
        <DialogContent className="max-w-md bg-white rounded-lg border border-gray-200 shadow-xl p-0">
          <div className="bg-blue-600 text-white p-6 rounded-t-lg">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-white">Reset Password</DialogTitle>
              <p className="text-blue-100 text-sm mt-1">
                {resetTargetUser ? `For ${resetTargetUser.name}` : 'For selected user'}
              </p>
            </DialogHeader>
          </div>
          <div className="space-y-4 p-6">
            <div className="space-y-2">
              <Label htmlFor="new-password" className="text-sm font-semibold text-gray-900 block">
                New Password *
              </Label>
              <Input
                id="new-password"
                type="password"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                placeholder="Enter new password"
                className="h-10 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={resetSaving}
              />
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t border-gray-200">
              <Button
                variant="outline"
                onClick={() => setResetDialogOpen(false)}
                className="px-4 py-2"
                disabled={resetSaving}
              >
                Cancel
              </Button>
              <Button
                onClick={submitResetPassword}
                disabled={resetSaving || !resetPassword.trim() || user?.role !== 'Admin'}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2"
              >
                {resetSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Reset'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

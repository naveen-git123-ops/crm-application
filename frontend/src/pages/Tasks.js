import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useRegisterPageHeader } from '@/contexts/PageHeaderContext';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { formatISTDate, formatISTDateTime } from '@/utils/date';
import {
  Plus,
  Search,
  Trash2,
  Calendar as CalendarIcon,
  User,
  MessageSquare,
  Paperclip,
  Send,
  Download,
  Play,
  Check,
  Clock,
} from 'lucide-react';
import { API_ENDPOINT } from '@/lib/apiConfig';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { isAdminOrManagerUser } from '@/lib/permissions';
import { cn } from '@/lib/utils';

const API = API_ENDPOINT;
const authHeaders = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });

const STATUS_META = {
  Pending: { label: 'To do', className: 'bg-slate-100 text-slate-700' },
  'In Progress': { label: 'In progress', className: 'bg-blue-50 text-blue-700' },
  Overdue: { label: 'Overdue', className: 'bg-red-50 text-red-700' },
  Completed: { label: 'Done', className: 'bg-emerald-50 text-emerald-700' },
  'Approval Pending': { label: 'Waiting approval', className: 'bg-amber-50 text-amber-800' },
};

const EMPTY_FORM = {
  title: '',
  description: '',
  assigned_to_employee_id: '',
  due_date: '',
  estimated_time_hours: '',
};

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function statusLabel(status) {
  return STATUS_META[status]?.label || status || '—';
}

function statusClass(status) {
  return STATUS_META[status]?.className || 'bg-gray-100 text-gray-700';
}

function isOpenStatus(status) {
  return status !== 'Completed';
}

function formatHours(minutes) {
  if (minutes == null || minutes === '') return '—';
  const hours = Number(minutes) / 60;
  if (!Number.isFinite(hours) || hours <= 0) return '—';
  return hours % 1 === 0 ? `${hours}h` : `${hours.toFixed(1)}h`;
}

function dueLabel(dueDate, status) {
  if (!dueDate) return 'No due date';
  if (status === 'Completed') return formatISTDate(dueDate) || dueDate;
  const today = isoToday();
  if (dueDate < today) return `Overdue · ${dueDate}`;
  if (dueDate === today) return 'Due today';
  return dueDate;
}

function StatusPill({ status }) {
  return (
    <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium', statusClass(status))}>
      {statusLabel(status)}
    </span>
  );
}

const TaskDetailsSheet = ({ task, open, onClose, onChanged, user, employees }) => {
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [comments, setComments] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [timeLogs, setTimeLogs] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [timeMinutes, setTimeMinutes] = useState('');
  const [timeNote, setTimeNote] = useState('');
  const [saving, setSaving] = useState(false);

  const canManage = isAdminOrManagerUser(user);
  const isAssignee = task?.assigned_to_employee_id === user?.employee_id;
  const canUpdateStatus = canManage || isAssignee;
  const canDelete = canManage || task?.created_by_employee_id === user?.employee_id;

  useEffect(() => {
    if (!open || !task) return undefined;
    setEditMode(false);
    setEditForm({
      title: task.title || '',
      description: task.description || '',
      status: task.status || 'Pending',
      due_date: task.due_date || '',
      assigned_to_employee_id: task.assigned_to_employee_id || '',
    });
    setNewComment('');
    setTimeMinutes('');
    setTimeNote('');

    let cancelled = false;
    (async () => {
      try {
        const [cRes, aRes, tRes] = await Promise.all([
          axios.get(`${API}/tasks/${task.id}/comments`, authHeaders()),
          axios.get(`${API}/tasks/${task.id}/attachments`, authHeaders()),
          axios.get(`${API}/tasks/${task.id}/time-logs`, authHeaders()),
        ]);
        if (cancelled) return;
        setComments(Array.isArray(cRes.data) ? cRes.data : []);
        setAttachments(Array.isArray(aRes.data) ? aRes.data : []);
        setTimeLogs(Array.isArray(tRes.data) ? tRes.data : []);
      } catch {
        if (!cancelled) toast.error('Could not load task activity');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, task]);

  if (!task) return null;

  const updateStatus = async (status) => {
    setSaving(true);
    try {
      await axios.put(`${API}/tasks/${task.id}/status`, { status }, authHeaders());
      toast.success(status === 'Completed' ? 'Task marked done' : 'Status updated');
      onChanged();
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Could not update status'));
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      await axios.put(`${API}/tasks/${task.id}`, editForm, authHeaders());
      toast.success('Task updated');
      setEditMode(false);
      onChanged();
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Could not update task'));
    } finally {
      setSaving(false);
    }
  };

  const addComment = async () => {
    if (!newComment.trim()) return;
    try {
      await axios.post(`${API}/tasks/${task.id}/comments`, { content: newComment.trim() }, authHeaders());
      setNewComment('');
      const res = await axios.get(`${API}/tasks/${task.id}/comments`, authHeaders());
      setComments(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Could not add comment'));
    }
  };

  const addTime = async () => {
    const minutes = parseInt(timeMinutes, 10);
    if (!minutes || minutes <= 0) {
      toast.error('Enter time in minutes');
      return;
    }
    try {
      await axios.post(
        `${API}/tasks/${task.id}/time-logs`,
        { time_spent_minutes: minutes, description: timeNote, log_date: isoToday() },
        authHeaders(),
      );
      setTimeMinutes('');
      setTimeNote('');
      const res = await axios.get(`${API}/tasks/${task.id}/time-logs`, authHeaders());
      setTimeLogs(Array.isArray(res.data) ? res.data : []);
      toast.success('Time logged');
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Could not log time'));
    }
  };

  const uploadFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    try {
      await axios.post(`${API}/tasks/${task.id}/attachments`, fd, {
        headers: { ...authHeaders().headers, 'Content-Type': 'multipart/form-data' },
      });
      const res = await axios.get(`${API}/tasks/${task.id}/attachments`, authHeaders());
      setAttachments(Array.isArray(res.data) ? res.data : []);
      toast.success('File attached');
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Could not upload file'));
    }
  };

  const deleteTask = async () => {
    if (!window.confirm('Delete this task?')) return;
    try {
      await axios.delete(`${API}/tasks/${task.id}`, authHeaders());
      toast.success('Task deleted');
      onClose();
      onChanged();
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Could not delete task'));
    }
  };

  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent className="w-full sm:max-w-lg bg-white overflow-y-auto p-0" side="right">
        <div className="sticky top-0 z-10 border-b border-gray-200 bg-white px-5 py-4">
          <SheetHeader className="space-y-1 text-left">
            <p className="text-[11px] font-mono text-gray-500">{task.task_id}</p>
            <SheetTitle className="text-lg font-semibold text-gray-900 leading-snug pr-8">
              {task.title}
            </SheetTitle>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <StatusPill status={task.status} />
              <span className={cn('text-xs', task.status !== 'Completed' && task.due_date < isoToday() ? 'text-red-600 font-medium' : 'text-gray-500')}>
                {dueLabel(task.due_date, task.status)}
              </span>
            </div>
          </SheetHeader>
        </div>

        <div className="space-y-6 px-5 py-5">
          {canUpdateStatus && task.status !== 'Completed' ? (
            <div className="flex flex-wrap gap-2">
              {task.status !== 'In Progress' ? (
                <Button size="sm" className="h-8 bg-blue-600 text-white hover:bg-blue-700" disabled={saving} onClick={() => updateStatus('In Progress')}>
                  <Play className="h-3.5 w-3.5 mr-1.5" />
                  Start
                </Button>
              ) : null}
              <Button size="sm" className="h-8 bg-emerald-600 text-white hover:bg-emerald-700" disabled={saving} onClick={() => updateStatus('Completed')}>
                <Check className="h-3.5 w-3.5 mr-1.5" />
                Mark done
              </Button>
            </div>
          ) : null}

          {editMode ? (
            <div className="space-y-3 rounded-lg border border-gray-200 bg-slate-50 p-4">
              <div>
                <Label className="text-xs font-medium text-gray-700">Title</Label>
                <Input className="mt-1 h-9" value={editForm.title} onChange={(e) => setEditForm((p) => ({ ...p, title: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs font-medium text-gray-700">Description</Label>
                <textarea
                  rows={3}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  value={editForm.description}
                  onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-medium text-gray-700">Due date</Label>
                  <Input type="date" className="mt-1 h-9" value={editForm.due_date} onChange={(e) => setEditForm((p) => ({ ...p, due_date: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs font-medium text-gray-700">Assign to</Label>
                  <select
                    className="mt-1 h-9 w-full rounded-md border border-gray-300 bg-white px-2 text-sm"
                    value={editForm.assigned_to_employee_id}
                    onChange={(e) => setEditForm((p) => ({ ...p, assigned_to_employee_id: e.target.value }))}
                  >
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.employee_id}>{emp.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditMode(false)}>Cancel</Button>
                <Button size="sm" className="bg-blue-600 text-white hover:bg-blue-700" disabled={saving} onClick={saveEdit}>Save</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-gray-500">Assigned to</p>
                  <p className="mt-0.5 font-medium text-gray-900">{task.assigned_to_name || '—'}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-gray-500">Assigned by</p>
                  <p className="mt-0.5 font-medium text-gray-900">{task.created_by_name || '—'}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-gray-500">Estimate</p>
                  <p className="mt-0.5 font-medium text-gray-900">{formatHours(task.estimated_time_minutes)}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-gray-500">Created</p>
                  <p className="mt-0.5 font-medium text-gray-900">{task.created_at ? formatISTDateTime(task.created_at) : '—'}</p>
                </div>
              </div>
              {task.description ? (
                <p className="whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-sm text-gray-700">{task.description}</p>
              ) : null}
              {canManage ? (
                <Button size="sm" variant="outline" className="h-8" onClick={() => setEditMode(true)}>Edit assignment</Button>
              ) : null}
            </div>
          )}

          <section>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-900">
              <MessageSquare className="h-4 w-4" /> Updates
            </h3>
            <div className="flex gap-2">
              <Input
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Write an update…"
                className="h-9"
                onKeyDown={(e) => e.key === 'Enter' && addComment()}
              />
              <Button size="sm" className="h-9 bg-blue-600 text-white hover:bg-blue-700" onClick={addComment}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-3 space-y-2">
              {comments.length === 0 ? (
                <p className="text-xs text-gray-400">No updates yet.</p>
              ) : comments.map((c) => (
                <div key={c.id} className="rounded-md bg-slate-50 px-3 py-2">
                  <div className="flex justify-between gap-2 text-[11px] text-gray-500">
                    <span className="font-medium text-gray-800">{c.author_name}</span>
                    <span>{formatISTDateTime(c.created_at)}</span>
                  </div>
                  <p className="mt-0.5 text-sm text-gray-700">{c.content}</p>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-900">
              <Clock className="h-4 w-4" /> Time spent
            </h3>
            <div className="flex gap-2">
              <Input type="number" min="1" className="h-9 w-28" placeholder="Minutes" value={timeMinutes} onChange={(e) => setTimeMinutes(e.target.value)} />
              <Input className="h-9 flex-1" placeholder="What did you do?" value={timeNote} onChange={(e) => setTimeNote(e.target.value)} />
              <Button size="sm" variant="outline" className="h-9" onClick={addTime}>Log</Button>
            </div>
            <div className="mt-2 space-y-1">
              {timeLogs.map((log) => (
                <p key={log.id} className="text-xs text-gray-600">
                  {log.time_spent_minutes} min · {log.logged_by_name} · {log.log_date}
                  {log.description ? ` — ${log.description}` : ''}
                </p>
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-900">
              <Paperclip className="h-4 w-4" /> Files
            </h3>
            <label className="flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-gray-300 px-3 py-4 text-xs text-gray-500 hover:bg-slate-50">
              Attach a file
              <input type="file" className="hidden" onChange={uploadFile} />
            </label>
            <div className="mt-2 space-y-1">
              {attachments.map((att) => (
                <div key={att.id} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2">
                  <span className="truncate text-sm text-gray-800">{att.file_name}</span>
                  <a href={att.file_url} target="_blank" rel="noopener noreferrer" className="text-blue-600">
                    <Download className="h-4 w-4" />
                  </a>
                </div>
              ))}
            </div>
          </section>

          {canDelete ? (
            <Button variant="outline" className="h-8 border-red-200 text-red-700 hover:bg-red-50" onClick={deleteTask}>
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Delete task
            </Button>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export const Tasks = () => {
  const { user } = useAuth();
  const canSeeAll = isAdminOrManagerUser(user);
  const [tasks, setTasks] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [scope, setScope] = useState('mine');
  const [statusFilter, setStatusFilter] = useState('open');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState(null);

  const fetchTasks = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/tasks`, authHeaders());
      const list = Array.isArray(res.data) ? res.data : [];
      setTasks(list);
      return list;
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Could not load tasks'));
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
    (async () => {
      try {
        const res = await axios.get(`${API}/employees`, authHeaders());
        setEmployees(Array.isArray(res.data) ? res.data : []);
      } catch {
        setEmployees([]);
      }
    })();
  }, [fetchTasks]);

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const mineId = user?.employee_id;
    return [...tasks]
      .filter((t) => {
        if (scope === 'mine' && t.assigned_to_employee_id !== mineId) return false;
        if (assigneeFilter && t.assigned_to_employee_id !== assigneeFilter) return false;
        if (statusFilter === 'open' && !isOpenStatus(t.status)) return false;
        if (statusFilter === 'todo' && t.status !== 'Pending' && t.status !== 'Overdue') return false;
        if (statusFilter === 'progress' && t.status !== 'In Progress') return false;
        if (statusFilter === 'done' && t.status !== 'Completed') return false;
        if (statusFilter === 'overdue' && t.status !== 'Overdue' && !(isOpenStatus(t.status) && t.due_date && t.due_date < isoToday())) return false;
        if (!q) return true;
        return [t.title, t.task_id, t.assigned_to_name, t.description].some((v) => String(v || '').toLowerCase().includes(q));
      })
      .sort((a, b) => {
        const rank = (t) => {
          if (t.status === 'Overdue' || (isOpenStatus(t.status) && t.due_date && t.due_date < isoToday())) return 0;
          if (t.status === 'In Progress') return 1;
          if (t.status === 'Pending') return 2;
          return 3;
        };
        const d = rank(a) - rank(b);
        if (d !== 0) return d;
        return String(a.due_date || '').localeCompare(String(b.due_date || ''));
      });
  }, [tasks, searchTerm, scope, statusFilter, assigneeFilter, user?.employee_id]);

  const stats = useMemo(() => {
    const pool = scope === 'mine' ? tasks.filter((t) => t.assigned_to_employee_id === user?.employee_id) : tasks;
    const today = isoToday();
    return {
      open: pool.filter((t) => isOpenStatus(t.status)).length,
      progress: pool.filter((t) => t.status === 'In Progress').length,
      overdue: pool.filter((t) => isOpenStatus(t.status) && t.due_date && t.due_date < today).length,
      done: pool.filter((t) => t.status === 'Completed').length,
    };
  }, [tasks, scope, user?.employee_id]);

  const createTask = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.assigned_to_employee_id || !form.due_date) {
      toast.error('Title, assignee, and due date are required');
      return;
    }
    setCreating(true);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        assigned_to_employee_id: form.assigned_to_employee_id,
        due_date: form.due_date,
      };
      if (form.estimated_time_hours) payload.estimated_time_hours = parseFloat(form.estimated_time_hours);
      await axios.post(`${API}/tasks`, payload, authHeaders());
      toast.success('Task assigned');
      setCreateOpen(false);
      setForm(EMPTY_FORM);
      await fetchTasks();
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Could not assign task'));
    } finally {
      setCreating(false);
    }
  };

  const quickStatus = async (task, status, e) => {
    e.stopPropagation();
    try {
      await axios.put(`${API}/tasks/${task.id}/status`, { status }, authHeaders());
      toast.success(status === 'Completed' ? 'Marked done' : 'Started');
      await fetchTasks();
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Could not update task'));
    }
  };

  const pageHeaderActions = useMemo(() => (
    <Button className="h-9" onClick={() => { setForm(EMPTY_FORM); setCreateOpen(true); }}>
      <Plus className="h-4 w-4 mr-1.5" />
      Assign task
    </Button>
  ), []);

  useRegisterPageHeader({
    subtitle: `${stats.open} open · ${stats.overdue} overdue`,
    actions: pageHeaderActions,
    enabled: !loading,
  });

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
      </div>
    );
  }

  const chips = [
    { id: 'open', label: 'Open' },
    { id: 'todo', label: 'To do' },
    { id: 'progress', label: 'In progress' },
    { id: 'overdue', label: 'Overdue' },
    { id: 'done', label: 'Done' },
    { id: 'all', label: 'All' },
  ];

  return (
    <div className="space-y-5" data-testid="tasks-page">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Open</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{stats.open}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">In progress</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-indigo-600">{stats.progress}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Overdue</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-rose-600">{stats.overdue}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Done</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-emerald-700">{stats.done}</p>
        </Card>
      </div>

      <Card className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          {canSeeAll ? (
            <div className="flex rounded-lg bg-muted p-0.5">
              <button
                type="button"
                className={cn('h-8 rounded-md px-3 text-sm font-medium', scope === 'mine' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
                onClick={() => setScope('mine')}
              >
                My tasks
              </button>
              <button
                type="button"
                className={cn('h-8 rounded-md px-3 text-sm font-medium', scope === 'all' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
                onClick={() => setScope('all')}
              >
                Everyone
              </button>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-1.5">
            {chips.map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => setStatusFilter(chip.id)}
                className={cn(
                  'h-8 rounded-full border px-3 text-xs font-medium',
                  statusFilter === chip.id ? 'border-primary/30 bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover:bg-muted',
                )}
              >
                {chip.label}
              </button>
            ))}
          </div>
          {canSeeAll && scope === 'all' ? (
            <select
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
              className="h-9 rounded-lg border border-input bg-card px-2 text-sm"
            >
              <option value="">All people</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.employee_id}>{emp.name}</option>
              ))}
            </select>
          ) : null}
          <div className="relative min-w-[180px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search title, person, or ID…"
              className="h-9 pl-9"
            />
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {filtered.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="font-medium text-foreground">No tasks here</p>
            <p className="mt-1 text-sm text-muted-foreground">Assign a task to someone, then track it from To do → In progress → Done.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="app-table">
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Assigned to</th>
                  <th>Due</th>
                  <th>Status</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((task) => {
                  const mine = task.assigned_to_employee_id === user?.employee_id;
                  const canAct = mine || canSeeAll;
                  return (
                    <tr
                      key={task.id}
                      className="cursor-pointer border-b border-gray-100 hover:bg-slate-50/80"
                      onClick={() => setSelected(task)}
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{task.title}</p>
                        <p className="mt-0.5 font-mono text-[11px] text-gray-500">{task.task_id}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        <span className="inline-flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5 text-gray-400" />
                          {task.assigned_to_name || '—'}
                        </span>
                      </td>
                      <td className={cn('px-4 py-3', isOpenStatus(task.status) && task.due_date < isoToday() ? 'font-medium text-red-600' : 'text-gray-700')}>
                        <span className="inline-flex items-center gap-1.5">
                          <CalendarIcon className="h-3.5 w-3.5 text-gray-400" />
                          {dueLabel(task.due_date, task.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill status={task.status} />
                      </td>
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        {canAct && task.status !== 'Completed' ? (
                          <div className="inline-flex gap-1">
                            {task.status !== 'In Progress' ? (
                              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={(e) => quickStatus(task, 'In Progress', e)}>
                                Start
                              </Button>
                            ) : null}
                            <Button size="sm" className="h-7 bg-emerald-600 text-xs text-white hover:bg-emerald-700" onClick={(e) => quickStatus(task, 'Completed', e)}>
                              Done
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">View</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg bg-white">
          <DialogHeader>
            <DialogTitle>Assign a task</DialogTitle>
          </DialogHeader>
          <form onSubmit={createTask} className="space-y-4">
            <div>
              <Label className="text-sm font-medium text-gray-700">What needs to be done</Label>
              <Input className="mt-1.5 h-10" value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} placeholder="Short title" required />
            </div>
            <div>
              <Label className="text-sm font-medium text-gray-700">Details</Label>
              <textarea
                rows={3}
                className="mt-1.5 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="Optional context"
              />
            </div>
            <div>
              <Label className="text-sm font-medium text-gray-700">Assign to</Label>
              <select
                className="mt-1.5 h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm"
                value={form.assigned_to_employee_id}
                onChange={(e) => setForm((p) => ({ ...p, assigned_to_employee_id: e.target.value }))}
                required
              >
                <option value="">Select a person</option>
                {employees.filter((e) => String(e.status || 'Active').toLowerCase() === 'active').map((emp) => (
                  <option key={emp.id} value={emp.employee_id}>{emp.name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm font-medium text-gray-700">Due date</Label>
                <Input type="date" className="mt-1.5 h-10" value={form.due_date} onChange={(e) => setForm((p) => ({ ...p, due_date: e.target.value }))} required />
              </div>
              <div>
                <Label className="text-sm font-medium text-gray-700">Estimate (hours)</Label>
                <Input type="number" min="0.5" step="0.5" className="mt-1.5 h-10" value={form.estimated_time_hours} onChange={(e) => setForm((p) => ({ ...p, estimated_time_hours: e.target.value }))} placeholder="Optional" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={creating}>
                {creating ? 'Assigning…' : 'Assign task'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <TaskDetailsSheet
        task={selected}
        open={!!selected}
        onClose={() => setSelected(null)}
        onChanged={async () => {
          const list = await fetchTasks();
          setSelected((prev) => (prev ? list.find((t) => t.id === prev.id) || null : null));
        }}
        user={user}
        employees={employees}
      />
    </div>
  );
};

export default Tasks;

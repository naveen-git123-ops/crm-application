import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { API_ENDPOINT } from '@/lib/apiConfig';
import { getApiErrorMessage } from '@/lib/apiErrors';

const API = API_ENDPOINT;
const authHeaders = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });

function todayIso() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function BpoAdminPanel() {
  const [day, setDay] = useState(todayIso());
  const [employees, setEmployees] = useState([]);
  const [employeeId, setEmployeeId] = useState('');
  const [targetCount, setTargetCount] = useState(40);
  const [stats, setStats] = useState({ agents: [], open_records: 0 });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [{ data: people }, { data: progress }] = await Promise.all([
        axios.get(`${API}/employees`, authHeaders()),
        axios.get(`${API}/business-potential-records/bpo-stats`, {
          ...authHeaders(),
          params: { target_date: day },
        }),
      ]);
      setEmployees(Array.isArray(people) ? people : []);
      setStats(progress || { agents: [], open_records: 0 });
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to load BPO progress'));
    }
  }, [day]);

  useEffect(() => {
    load();
  }, [load]);

  const saveTarget = async () => {
    if (!employeeId) {
      toast.error('Select the BPO person');
      return;
    }
    setSaving(true);
    try {
      await axios.post(
        `${API}/business-potential-records/bpo-targets`,
        { employee_id: employeeId, target_date: day, target_count: Number(targetCount) || 0 },
        authHeaders(),
      );
      toast.success('Daily target saved');
      await load();
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to save daily target'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto">
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-indigo-600" />
          <h3 className="text-sm font-semibold text-slate-900">Set daily calling target</h3>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div>
            <Label>Date</Label>
            <Input type="date" className="mt-1" value={day} onChange={(e) => setDay(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <Label>BPO person</Label>
            <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm">
              <option value="">Select employee</option>
              {employees.map((emp) => (
                <option key={emp.employee_id || emp.id} value={emp.employee_id}>
                  {emp.name} ({emp.employee_id})
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Calls today</Label>
            <Input type="number" min="1" className="mt-1" value={targetCount} onChange={(e) => setTargetCount(e.target.value)} />
          </div>
        </div>
        <Button type="button" disabled={saving} onClick={saveTarget}>
          {saving ? 'Saving…' : 'Save target'}
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
            <tr>
              <th className="px-3 py-3 font-semibold">BPO person</th>
              <th className="px-3 py-3 font-semibold">Target</th>
              <th className="px-3 py-3 font-semibold">Follow-ups done</th>
              <th className="px-3 py-3 font-semibold">Converted</th>
              <th className="px-3 py-3 font-semibold">Pending vs target</th>
            </tr>
          </thead>
          <tbody>
            {(stats.agents || []).length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center text-slate-500">No target or activity for this date yet.</td>
              </tr>
            ) : (
              stats.agents.map((agent) => {
                const pending = Math.max(0, Number(agent.target_count || 0) - Number(agent.calls || 0));
                return (
                  <tr key={agent.employee_id} className="border-t border-slate-100">
                    <td className="px-3 py-3 font-medium text-slate-900">{agent.employee_name}</td>
                    <td className="px-3 py-3 tabular-nums">{agent.target_count || 0}</td>
                    <td className="px-3 py-3 tabular-nums text-indigo-700">{agent.calls || 0}</td>
                    <td className="px-3 py-3 tabular-nums text-emerald-700">{agent.conversions || 0}</td>
                    <td className="px-3 py-3 tabular-nums">{pending}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">Open records still in the BPO queue: {Number(stats.open_records || 0).toLocaleString('en-IN')}</p>
    </div>
  );
}

export default BpoAdminPanel;

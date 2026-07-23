import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Plus, Calendar, Trash2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${BACKEND_URL}/api`;

const authHeader = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });

export const GovernmentHolidays = () => {
  const { user } = useAuth();
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [yearFilter, setYearFilter] = useState(new Date().getFullYear());
  const [formData, setFormData] = useState({ date: '', name: '', description: '' });

  const canManageHolidays = ['Admin', 'HR'].includes(user?.role);

  useEffect(() => {
    fetchHolidays();
  }, [yearFilter]);

  const fetchHolidays = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/government-holidays`, {
        params: { year: yearFilter },
        ...authHeader(),
      });
      setHolidays(res.data);
    } catch {
      toast.error('Failed to load government holidays');
      setHolidays([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAddHoliday = async (e) => {
    e.preventDefault();
    if (!formData.date || !formData.name.trim()) {
      toast.error('Date and name are required');
      return;
    }
    try {
      await axios.post(
        `${API}/government-holidays`,
        {
          date: formData.date,
          name: formData.name.trim(),
          description: formData.description.trim() || null,
        },
        authHeader()
      );
      toast.success('Government holiday added');
      setAddDialogOpen(false);
      setFormData({ date: '', name: '', description: '' });
      fetchHolidays();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to add holiday');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Remove this holiday from the list?')) return;
    try {
      await axios.delete(`${API}/government-holidays/${id}`, authHeader());
      toast.success('Holiday removed');
      fetchHolidays();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete');
    }
  };

  const formatDate = (dateStr) => {
    try {
      return format(parseISO(dateStr), 'EEEE, d MMM yyyy');
    } catch {
      return dateStr;
    }
  };

  const formatShortDate = (dateStr) => {
    try {
      const d = parseISO(dateStr);
      return { day: format(d, 'd'), month: format(d, 'MMM') };
    } catch {
      return { day: '–', month: '–' };
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6" data-testid="government-holidays-page">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight text-gray-900">
            Government Holidays
          </h1>
          <p className="text-gray-600 text-sm mt-1">View the list of government holidays for the year</p>
        </div>
        {canManageHolidays && (
          <div className="flex gap-2 flex-wrap">
            <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-blue-600 hover:bg-blue-700 text-white min-h-[44px]">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Holiday
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md bg-white rounded-lg border border-gray-200 shadow-xl p-0">
                <div className="bg-blue-600 text-white p-6 rounded-t-lg">
                  <DialogHeader>
                    <DialogTitle className="text-xl font-bold text-white">Add Government Holiday</DialogTitle>
                    <p className="text-blue-100 text-sm mt-1">Add a holiday date and name</p>
                  </DialogHeader>
                </div>
                <form onSubmit={handleAddHoliday} className="space-y-4 p-6">
                  <div className="space-y-2">
                    <Label htmlFor="gh-date" className="text-sm font-semibold text-gray-900 block">Date *</Label>
                    <Input
                      id="gh-date"
                      type="date"
                      value={formData.date}
                      onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                      required
                      className="h-11 bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="gh-name" className="text-sm font-semibold text-gray-900 block">Holiday Name *</Label>
                    <Input
                      id="gh-name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g. Republic Day"
                      required
                      className="h-11 bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="gh-desc" className="text-sm font-semibold text-gray-900 block">Description (optional)</Label>
                    <Textarea
                      id="gh-desc"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Optional notes"
                      rows={2}
                      className="resize-none bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex gap-3 pt-2 justify-end border-t border-gray-200">
                    <Button type="button" variant="outline" className="border-gray-300 text-gray-700 hover:bg-gray-50 px-4 py-2" onClick={() => setAddDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2">
                      Add Holiday
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      <Card className="p-4 sm:p-6 rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <Label htmlFor="year-filter" className="text-sm font-medium text-gray-700">Year</Label>
          <select
            id="year-filter"
            value={yearFilter}
            onChange={(e) => setYearFilter(Number(e.target.value))}
            className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 min-h-[44px]"
          >
            {[new Date().getFullYear() + 1, new Date().getFullYear(), new Date().getFullYear() - 1].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-blue-600 border-t-transparent" />
          </div>
        ) : holidays.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Calendar className="h-12 w-12 mx-auto mb-2 opacity-40" />
            <p>No government holidays listed for {yearFilter}.</p>
            {canManageHolidays && (
              <p className="text-sm mt-1">Use &quot;Add Holiday&quot; to add one.</p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2.5 sm:gap-3 justify-items-start">
            {holidays.map((h) => {
              const { day, month } = formatShortDate(h.date);
              return (
                <Card
                  key={h.id}
                  className="relative aspect-square w-20 h-20 sm:w-24 sm:h-24 rounded-lg bg-blue-400/20 border border-blue-300/50 shadow-sm hover:bg-blue-400/30 transition-all overflow-hidden flex-shrink-0"
                >
                  <div className="absolute inset-0 p-1.5 flex flex-col items-center justify-center">
                    <span className="text-[9px] sm:text-[10px] font-medium text-blue-800 uppercase leading-none">{month}</span>
                    <span className="text-lg sm:text-xl font-bold leading-none text-blue-900">{day}</span>
                    <p className="text-[9px] sm:text-[10px] font-semibold text-blue-900 leading-tight text-center line-clamp-2 w-full px-0.5 mt-0.5">{h.name}</p>
                    {canManageHolidays && (
                        <Button
                          variant="outline"
                          size="icon"
                          className="absolute top-0.5 right-0.5 h-6 w-6 min-h-0 min-w-0 p-0 bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 rounded shadow-sm"
                        onClick={(e) => { e.stopPropagation(); handleDelete(h.id); }}
                        aria-label="Delete holiday"
                      >
                        <Trash2 className="h-2.5 w-2.5" />
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
};

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import L from 'leaflet';
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import {
  MapPin,
  Calendar,
  User,
  Clock,
  AlertCircle,
  Radio,
  Navigation,
  LogIn,
  LogOut,
  Route,
  RefreshCw,
} from 'lucide-react';
import {
  buildDayTimeline,
  formatCoord,
  formatRecordedAt,
  formatTimeShort,
} from '@/utils/locationTracker';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${BACKEND_URL}/api`;

const OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const defaultCenter = [28.6139, 77.209];

const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

function FitBounds({ points, focusPoint }) {
  const map = useMap();
  useEffect(() => {
    if (focusPoint) {
      map.setView(focusPoint, 16, { animate: true });
      return;
    }
    if (!points.length) return;
    if (points.length === 1) {
      map.setView(points[0], 15);
      return;
    }
    const bounds = L.latLngBounds(points.map((p) => [p[0], p[1]]));
    map.fitBounds(bounds, { padding: [56, 56], maxZoom: 16 });
  }, [map, points, focusPoint]);
  return null;
}

function DayRouteMap({ trackPath, punchEvents, currentLocation, selectedPoint, onSelectPoint }) {
  const allPoints = useMemo(() => {
    const pts = trackPath.map((p) => [p.latitude, p.longitude]);
    punchEvents.forEach((p) => pts.push([p.latitude, p.longitude]));
    if (currentLocation) pts.push([currentLocation.latitude, currentLocation.longitude]);
    return pts;
  }, [trackPath, punchEvents, currentLocation]);

  const center = allPoints[0] || defaultCenter;
  const focusPoint = selectedPoint ? [selectedPoint.latitude, selectedPoint.longitude] : null;
  const pathCoords = trackPath.map((p) => [p.latitude, p.longitude]);

  return (
    <MapContainer
      center={center}
      zoom={14}
      className="h-full min-h-[420px] w-full rounded-xl z-0 [&_.leaflet-control-attribution]:text-[10px]"
      scrollWheelZoom
    >
      <TileLayer attribution={OSM_ATTRIBUTION} url={OSM_TILE_URL} />
      {pathCoords.length > 1 && (
        <Polyline positions={pathCoords} pathOptions={{ color: '#3b82f6', weight: 4, opacity: 0.75 }} />
      )}
      {punchEvents.map((p) => {
        const isIn = p.type === 'punch_in';
        const isSelected = selectedPoint?.id === p.id;
        return (
          <CircleMarker
            key={p.id}
            center={[p.latitude, p.longitude]}
            radius={isSelected ? 14 : 11}
            pathOptions={{
              color: isIn ? '#15803d' : '#b91c1c',
              fillColor: isIn ? '#22c55e' : '#ef4444',
              fillOpacity: 0.95,
              weight: 3,
            }}
            eventHandlers={{ click: () => onSelectPoint(p) }}
          >
            <Popup>
              <div className="text-sm min-w-[180px]">
                <p className="font-semibold text-gray-900">{isIn ? 'Punch in' : 'Punch out'}</p>
                <p className="text-gray-600 mt-1">{formatTimeShort(p.time)}</p>
                <p className="text-xs text-gray-500 mt-1 font-mono">{formatCoord(p.latitude, p.longitude)}</p>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
      {currentLocation && (
        <CircleMarker
          center={[currentLocation.latitude, currentLocation.longitude]}
          radius={selectedPoint?.id === currentLocation.id ? 16 : 13}
          pathOptions={{
            color: '#1d4ed8',
            fillColor: '#3b82f6',
            fillOpacity: 0.9,
            weight: 4,
          }}
          eventHandlers={{ click: () => onSelectPoint(currentLocation) }}
        >
          <Popup>
            <div className="text-sm min-w-[180px]">
              <p className="font-semibold text-blue-800">{currentLocation.label || 'Current location'}</p>
              <p className="text-gray-600 mt-1">{formatTimeShort(currentLocation.time)}</p>
              <p className="text-xs text-gray-500 mt-1 font-mono">
                {formatCoord(currentLocation.latitude, currentLocation.longitude)}
              </p>
            </div>
          </Popup>
        </CircleMarker>
      )}
      <FitBounds points={allPoints} focusPoint={focusPoint} />
    </MapContainer>
  );
}

function TimelineItem({ item, isSelected, isCurrent, onClick }) {
  const isIn = item.kind === 'punch_in';
  const isOut = item.kind === 'punch_out';
  const isTrack = item.kind === 'track';

  let dotClass = 'bg-blue-500 ring-blue-100';
  let Icon = Navigation;
  if (isIn) {
    dotClass = 'bg-emerald-500 ring-emerald-100';
    Icon = LogIn;
  } else if (isOut) {
    dotClass = 'bg-rose-500 ring-rose-100';
    Icon = LogOut;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-xl border px-3 py-3 transition-all ${
        isSelected
          ? 'border-blue-400 bg-blue-50 shadow-sm ring-2 ring-blue-100'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
      }`}
    >
      <div className="flex gap-3">
        <div
          className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white ring-4 ${dotClass}`}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold text-sm text-slate-900">{item.title}</p>
            <span className="shrink-0 text-xs font-mono font-medium text-slate-600 tabular-nums">
              {formatTimeShort(item.time)}
            </span>
          </div>
          <p className="mt-0.5 text-xs font-mono text-slate-500 truncate">{item.subtitle}</p>
          {isCurrent && (
            <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-800">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-pulse" />
              Current
            </span>
          )}
          {isTrack && item.accuracy != null && (
            <p className="mt-1 text-[10px] text-slate-400">GPS accuracy ~{Math.round(item.accuracy)} m</p>
          )}
        </div>
      </div>
    </button>
  );
}

const LocationTracker = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';
  const todayStr = new Date().toISOString().split('T')[0];

  const [date, setDate] = useState(todayStr);
  const [employees, setEmployees] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [liveRefresh, setLiveRefresh] = useState(true);

  const fetchEmployees = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/employees`, { headers: authHeaders() });
      if (response.data && Array.isArray(response.data)) {
        setEmployees(response.data);
        if (response.data.length > 0) {
          setSelectedEmployee((prev) => prev || response.data[0].employee_id);
        }
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to load employees');
    }
  }, []);

  const fetchLocations = useCallback(async () => {
    if (!selectedEmployee || !date) return;
    setLoading(true);
    try {
      const response = await axios.get(`${API}/attendance/employee-locations`, {
        params: { employee_id: selectedEmployee, date },
        headers: authHeaders(),
      });
      setReport(response.data || null);
      setSelectedPoint(null);
    } catch (err) {
      console.error(err);
      if (err.response?.status === 403) {
        toast.error('Permission denied');
      } else {
        toast.error(err.response?.data?.detail || 'Failed to load location data');
      }
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [selectedEmployee, date]);

  useEffect(() => {
    if (isAdmin) fetchEmployees();
  }, [isAdmin, fetchEmployees]);

  useEffect(() => {
    if (!isAdmin || !selectedEmployee || !date) return;
    fetchLocations();
  }, [isAdmin, selectedEmployee, date, fetchLocations]);

  useEffect(() => {
    if (!isAdmin || !liveRefresh || date !== todayStr || !selectedEmployee) return undefined;
    const interval = setInterval(fetchLocations, 30_000);
    return () => clearInterval(interval);
  }, [isAdmin, liveRefresh, date, todayStr, selectedEmployee, fetchLocations]);

  const punchEvents = report?.punch_events ?? (report?.locations || []).filter((l) => l.type !== 'track');
  const trackRecords = report?.track_records ?? (report?.locations || []).filter((l) => l.type === 'track');
  const currentLocation = report?.current_location ?? null;
  const isLive = Boolean(report?.is_live);
  const summary = report?.summary || {};

  const { items: timelineItems, trackSampleNote, totalTrackPoints } = useMemo(
    () => buildDayTimeline(punchEvents, trackRecords, report?.date || date),
    [punchEvents, trackRecords, report?.date, date],
  );

  const selectedEmployeeName =
    report?.employee_name ||
    employees.find((emp) => emp.employee_id === selectedEmployee)?.name ||
    'Employee';

  const hasData = punchEvents.length > 0 || trackRecords.length > 0;

  if (!isAdmin) {
    return (
      <div className="space-y-6 p-6" data-testid="location-tracker-page">
        <Card className="p-8 border border-amber-200 bg-amber-50">
          <div className="flex gap-3">
            <AlertCircle className="w-6 h-6 text-amber-700 shrink-0" />
            <div>
              <p className="font-semibold text-amber-900">Admin only</p>
              <p className="text-sm text-amber-800 mt-1">Location tracking is only available to administrators.</p>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5" data-testid="location-tracker-page">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
            <MapPin className="w-7 h-7 text-blue-600 shrink-0" />
            Location tracker
          </h1>
          <p className="text-gray-600 text-sm mt-1 max-w-2xl">
            See where an employee is now and their full day journey — punch times and GPS updates while punched in.
          </p>
        </div>
        {date === todayStr && (
          <Button
            type="button"
            variant={liveRefresh ? 'default' : 'outline'}
            className={liveRefresh ? 'bg-blue-600 hover:bg-blue-700' : ''}
            onClick={() => setLiveRefresh((v) => !v)}
          >
            <Radio className={`h-4 w-4 mr-2 ${liveRefresh ? 'animate-pulse' : ''}`} />
            {liveRefresh ? 'Auto-refresh on' : 'Auto-refresh off'}
          </Button>
        )}
      </div>

      <Card className="p-4 sm:p-5 rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <User className="w-4 h-4" />
              Employee
            </Label>
            <Select value={selectedEmployee || undefined} onValueChange={setSelectedEmployee}>
              <SelectTrigger className="h-11 border-gray-300">
                <SelectValue placeholder="Select employee" />
              </SelectTrigger>
              <SelectContent>
                {employees.map((emp) => (
                  <SelectItem key={emp.employee_id} value={emp.employee_id}>
                    {emp.name} ({emp.employee_id})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <Calendar className="w-4 h-4" />
              Date
            </Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              max={todayStr}
              className="h-11 border-gray-300"
            />
          </div>
          <div className="flex items-end">
            <Button type="button" variant="outline" className="h-11 w-full" onClick={fetchLocations} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>
      </Card>

      {loading && !report ? (
        <Card className="p-16 flex justify-center">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-10 w-10 border-2 border-blue-600 border-t-transparent" />
            <p className="mt-4 text-gray-600 text-sm">Loading location data…</p>
          </div>
        </Card>
      ) : !hasData ? (
        <Card className="p-12 text-center border border-dashed border-gray-300 bg-gray-50/80">
          <MapPin className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="font-medium text-gray-800">No location data for this day</p>
          <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">
            The employee must punch in with location enabled and keep the CRM browser tab open for GPS tracking during
            work hours.
          </p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Card className="p-4 border border-blue-200 bg-gradient-to-br from-blue-50 to-white">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">
                {isLive ? 'Current location' : 'Last known location'}
              </p>
              {currentLocation ? (
                <>
                  <p className="mt-2 font-mono text-sm font-semibold text-gray-900">
                    {formatCoord(currentLocation.latitude, currentLocation.longitude)}
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-gray-600">
                    <Clock className="h-3.5 w-3.5" />
                    {formatTimeShort(currentLocation.time)}
                    {isLive && (
                      <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        LIVE
                      </span>
                    )}
                  </p>
                </>
              ) : (
                <p className="mt-2 text-sm text-gray-500">—</p>
              )}
            </Card>
            <Card className="p-4 border border-emerald-200 bg-emerald-50/50">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800">Day start</p>
              <p className="mt-2 text-lg font-bold text-gray-900 tabular-nums">
                {summary.punch_in_time ? formatTimeShort(summary.punch_in_time) : '—'}
              </p>
              <p className="text-xs text-gray-500 mt-1">First punch in</p>
            </Card>
            <Card className="p-4 border border-rose-200 bg-rose-50/50">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-800">Day end</p>
              <p className="mt-2 text-lg font-bold text-gray-900 tabular-nums">
                {summary.punch_out_time ? formatTimeShort(summary.punch_out_time) : isLive ? 'Still in' : '—'}
              </p>
              <p className="text-xs text-gray-500 mt-1">Last punch out</p>
            </Card>
            <Card className="p-4 border border-slate-200 bg-slate-50/80">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">GPS updates</p>
              <p className="mt-2 text-lg font-bold text-gray-900 tabular-nums">{totalTrackPoints}</p>
              <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                <Route className="h-3 w-3" />
                {punchEvents.length} punch{punchEvents.length !== 1 ? 'es' : ''}
              </p>
            </Card>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[minmax(300px,380px)_1fr] gap-4 min-h-[520px]">
            <Card className="flex flex-col overflow-hidden border border-gray-200 shadow-sm">
              <div className="border-b border-gray-100 bg-gray-50 px-4 py-3">
                <h2 className="font-semibold text-gray-900">Day timeline</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {selectedEmployeeName} · {report?.date || date}
                </p>
                {trackSampleNote && (
                  <p className="text-[10px] text-amber-700 mt-1">{trackSampleNote}</p>
                )}
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2 max-h-[560px] xl:max-h-none">
                {timelineItems.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-8">No events for this day.</p>
                ) : (
                  timelineItems.map((item) => {
                    const loc = punchEvents.find((p) => p.id === item.id) ||
                      trackRecords.find((t) => t.id === item.id) || {
                        id: item.id,
                        latitude: item.latitude,
                        longitude: item.longitude,
                        time: item.time,
                        type: item.kind,
                      };
                    const isCurrent =
                      currentLocation &&
                      item.latitude === currentLocation.latitude &&
                      item.longitude === currentLocation.longitude &&
                      (item.id === currentLocation.id ||
                        formatTimeShort(item.time) === formatTimeShort(currentLocation.time));
                    return (
                      <TimelineItem
                        key={item.id}
                        item={item}
                        isSelected={selectedPoint?.id === item.id}
                        isCurrent={Boolean(isCurrent)}
                        onClick={() => setSelectedPoint(loc)}
                      />
                    );
                  })
                )}
              </div>
              <div className="border-t border-gray-100 px-4 py-2.5 flex flex-wrap gap-3 text-[11px] text-gray-500">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Punch in
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-500" /> Punch out
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-blue-500" /> GPS update
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-full bg-blue-600 ring-2 ring-blue-200" /> Current
                </span>
              </div>
            </Card>

            <Card className="overflow-hidden border border-gray-200 shadow-sm p-1 sm:p-2">
              <div className="h-full min-h-[420px] rounded-lg overflow-hidden border border-gray-100">
                <DayRouteMap
                  trackPath={trackRecords}
                  punchEvents={punchEvents}
                  currentLocation={currentLocation}
                  selectedPoint={selectedPoint}
                  onSelectPoint={setSelectedPoint}
                />
              </div>
              {selectedPoint && (
                <div className="mx-2 mb-2 mt-2 rounded-lg border border-blue-100 bg-blue-50/80 px-3 py-2 text-xs text-gray-700">
                  <span className="font-semibold text-gray-900">Selected: </span>
                  {selectedPoint.type === 'punch_in'
                    ? 'Punch in'
                    : selectedPoint.type === 'punch_out'
                      ? 'Punch out'
                      : currentLocation?.id === selectedPoint.id
                        ? currentLocation.label || 'Current'
                        : 'GPS update'}{' '}
                  at {formatTimeShort(selectedPoint.time)} · {formatCoord(selectedPoint.latitude, selectedPoint.longitude)}
                  {selectedPoint.timestamp && (
                    <span className="text-gray-500"> · {formatRecordedAt(selectedPoint)}</span>
                  )}
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
};

export default LocationTracker;

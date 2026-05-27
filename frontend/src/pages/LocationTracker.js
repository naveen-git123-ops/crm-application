import React, { useState, useEffect, useCallback } from 'react';
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
import { MapPin, Calendar, User, Clock, AlertCircle, Radio } from 'lucide-react';
import { formatISTDateTime } from '@/utils/date';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${BACKEND_URL}/api`;

const OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const defaultCenter = [28.6139, 77.209];

const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) {
      map.setView(points[0], 15);
      return;
    }
    const bounds = L.latLngBounds(points.map((p) => [p[0], p[1]]));
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 16 });
  }, [map, points]);
  return null;
}

function typeLabel(type) {
  if (type === 'punch_in') return 'Punch in';
  if (type === 'punch_out') return 'Punch out';
  return 'GPS track';
}

function RouteMapLeaflet({ locations, selectedId, onSelectLocation }) {
  const path = locations.map((loc) => [loc.latitude, loc.longitude]);
  const center = path.length ? path[0] : defaultCenter;

  return (
    <MapContainer
      center={center}
      zoom={14}
      className="h-[560px] w-full rounded-lg z-0 [&_.leaflet-control-attribution]:text-[10px] [&_.leaflet-control-attribution]:max-w-[90%]"
      scrollWheelZoom
    >
      <TileLayer attribution={OSM_ATTRIBUTION} url={OSM_TILE_URL} />
      {path.length > 1 && (
        <Polyline
          positions={path}
          pathOptions={{ color: '#2563eb', weight: 4, opacity: 0.85 }}
        />
      )}
      {locations.map((location, index) => {
        const isTrack = location.type === 'track';
        const isIn = location.type === 'punch_in';
        const isOut = location.type === 'punch_out';
        const isSelected = selectedId === location.id;
        const radius = isTrack ? (isSelected ? 7 : 5) : isSelected ? 12 : 9;
        const color = isIn ? '#15803d' : isOut ? '#b91c1c' : '#2563eb';
        const fill = isIn ? '#22c55e' : isOut ? '#ef4444' : '#60a5fa';

        return (
          <CircleMarker
            key={location.id}
            center={[location.latitude, location.longitude]}
            radius={radius}
            pathOptions={{
              color,
              fillColor: fill,
              fillOpacity: isTrack ? 0.75 : 0.92,
              weight: isTrack ? 1 : 2,
            }}
            eventHandlers={{
              click: () => onSelectLocation(selectedId === location.id ? null : location),
            }}
          >
            <Popup>
              <div className="text-sm text-gray-800 min-w-[160px]">
                <p className="font-semibold mb-1">{typeLabel(location.type)}</p>
                <p>
                  <span className="text-gray-500">Time:</span> {location.time || '—'}
                </p>
                {location.accuracy != null ? (
                  <p className="text-xs text-gray-500 mt-1">Accuracy: ~{Math.round(location.accuracy)} m</p>
                ) : null}
                <p className="text-xs text-gray-500 mt-1">
                  {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
                </p>
                {location.timestamp && (
                  <p className="text-xs text-gray-500 mt-1">{formatISTDateTime(location.timestamp)}</p>
                )}
                <p className="text-[10px] text-gray-400 mt-2">Point {index + 1}</p>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
      {path.length > 0 && <FitBounds points={path} />}
    </MapContainer>
  );
}

const LocationTracker = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';
  const todayStr = new Date().toISOString().split('T')[0];

  const [date, setDate] = useState(todayStr);
  const [employees, setEmployees] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [locations, setLocations] = useState([]);
  const [trackPoints, setTrackPoints] = useState(0);
  const [punchPoints, setPunchPoints] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(null);
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

      const locs = response.data?.locations;
      if (Array.isArray(locs)) {
        setLocations(locs);
        setTrackPoints(response.data?.track_points ?? locs.filter((l) => l.type === 'track').length);
        setPunchPoints(response.data?.punch_points ?? locs.filter((l) => l.type !== 'track').length);
      } else {
        setLocations([]);
        setTrackPoints(0);
        setPunchPoints(0);
      }
    } catch (err) {
      console.error(err);
      if (err.response?.status === 403) {
        toast.error('Permission denied');
      } else {
        toast.error(err.response?.data?.detail || 'Failed to load location data');
      }
      setLocations([]);
      setTrackPoints(0);
      setPunchPoints(0);
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

  const selectedEmployeeName =
    employees.find((emp) => emp.employee_id === selectedEmployee)?.name || 'Employee';

  const selectedId = selectedLocation?.id ?? null;

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
    <div className="space-y-6" data-testid="location-tracker-page">
      <div>
        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
          <MapPin className="w-7 h-7 text-blue-600 shrink-0" />
          Location tracker
        </h1>
        <p className="text-gray-600 text-sm mt-1 max-w-3xl">
          Full-day route from automatic GPS while punched in (every ~3 min), plus punch in/out markers.
          Employees must keep this CRM tab open on their phone or laptop during work hours for web tracking.
        </p>
      </div>

      <Card className="p-4 sm:p-6 rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
              className="h-11 border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            />
          </div>

          <div className="flex flex-col justify-end gap-1">
            <p className="text-sm text-gray-600">
              <strong className="text-gray-900">{trackPoints}</strong> GPS track point
              {trackPoints !== 1 ? 's' : ''}
              {punchPoints > 0 ? (
                <>
                  {' '}
                  · <strong className="text-gray-900">{punchPoints}</strong> punch point
                  {punchPoints !== 1 ? 's' : ''}
                </>
              ) : null}
            </p>
          </div>

          <div className="flex items-end">
            {date === todayStr ? (
              <Button
                type="button"
                variant={liveRefresh ? 'default' : 'outline'}
                className={liveRefresh ? 'bg-blue-600 hover:bg-blue-700 text-white h-11 w-full' : 'h-11 w-full'}
                onClick={() => setLiveRefresh((v) => !v)}
              >
                <Radio className={`h-4 w-4 mr-2 ${liveRefresh ? 'animate-pulse' : ''}`} />
                {liveRefresh ? 'Live refresh on' : 'Live refresh off'}
              </Button>
            ) : (
              <Button type="button" variant="outline" className="h-11 w-full" onClick={fetchLocations}>
                Reload map
              </Button>
            )}
          </div>
        </div>
      </Card>

      <Card className="p-4 sm:p-6 rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Route · {selectedEmployeeName}</h2>
        {loading ? (
          <div className="flex items-center justify-center h-[560px] bg-gray-50 rounded-lg border border-gray-200">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-10 w-10 border-2 border-blue-600 border-t-transparent" />
              <p className="mt-4 text-gray-600 text-sm">Loading location data…</p>
            </div>
          </div>
        ) : locations.length === 0 ? (
          <div className="flex items-center justify-center h-[560px] bg-gray-50 rounded-lg border border-gray-200">
            <div className="text-center text-gray-500 px-4">
              <MapPin className="w-12 h-12 mx-auto mb-2 opacity-40" />
              <p className="font-medium text-gray-700">No location data</p>
              <p className="text-sm mt-1 max-w-md mx-auto">
                No GPS points for this date. Employee must punch in with location enabled and keep the CRM
                browser tab open for automatic tracking.
              </p>
            </div>
          </div>
        ) : (
          <RouteMapLeaflet
            locations={locations}
            selectedId={selectedId}
            onSelectLocation={setSelectedLocation}
          />
        )}
      </Card>

      {locations.length > 0 && (
        <Card className="p-4 sm:p-6 rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Location details</h2>
          <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
            <table className="w-full text-sm min-w-[720px] border-collapse">
              <thead className="sticky top-0 bg-gray-50 z-10">
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">#</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Type</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Time</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Latitude</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Longitude</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Recorded</th>
                </tr>
              </thead>
              <tbody>
                {locations.map((location, index) => (
                  <tr
                    key={location.id}
                    className={`border-b border-gray-100 hover:bg-gray-50/80 cursor-pointer ${
                      selectedLocation?.id === location.id ? 'bg-blue-50/80' : ''
                    }`}
                    onClick={() => setSelectedLocation(location)}
                  >
                    <td className="py-3 px-4 text-gray-900">{index + 1}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex px-2.5 py-1 rounded-md text-xs font-medium text-white ${
                          location.type === 'punch_in'
                            ? 'bg-green-600'
                            : location.type === 'punch_out'
                              ? 'bg-red-600'
                              : 'bg-blue-600'
                        }`}
                      >
                        {typeLabel(location.type)}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-gray-800">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-gray-400" />
                        {location.time || '—'}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-gray-700">{Number(location.latitude).toFixed(5)}</td>
                    <td className="py-3 px-4 font-mono text-gray-700">{Number(location.longitude).toFixed(5)}</td>
                    <td className="text-gray-600 text-xs py-3 px-4">
                      {location.timestamp ? formatISTDateTime(location.timestamp) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex flex-wrap gap-6 text-sm text-gray-600">
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-green-600" /> Punch in
            </span>
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-red-600" /> Punch out
            </span>
            <span className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> GPS track
            </span>
            <span className="flex items-center gap-2">
              <span className="h-0.5 w-6 bg-blue-600" /> Route
            </span>
          </div>
        </Card>
      )}
    </div>
  );
};

export default LocationTracker;

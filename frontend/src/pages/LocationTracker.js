import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import L from 'leaflet';
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { MapPin, Calendar, User, Clock, AlertCircle } from 'lucide-react';
import { formatISTDateTime } from '@/utils/date';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${BACKEND_URL}/api`;

/** OpenStreetMap tiles — free, no API key (fair-use; fine for typical internal CRM traffic). */
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
        const isIn = location.type === 'punch_in';
        const isSelected = selectedId === location.id;
        return (
          <CircleMarker
            key={location.id}
            center={[location.latitude, location.longitude]}
            radius={isSelected ? 12 : 9}
            pathOptions={{
              color: isIn ? '#15803d' : '#b91c1c',
              fillColor: isIn ? '#22c55e' : '#ef4444',
              fillOpacity: 0.92,
              weight: 2,
            }}
            eventHandlers={{
              click: () => onSelectLocation(selectedId === location.id ? null : location),
            }}
          >
            <Popup>
              <div className="text-sm text-gray-800 min-w-[160px]">
                <p className="font-semibold capitalize mb-1">{isIn ? 'Punch in' : 'Punch out'}</p>
                <p>
                  <span className="text-gray-500">Time:</span> {location.time || '—'}
                </p>
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
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [employees, setEmployees] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(null);

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

  useEffect(() => {
    if (isAdmin) fetchEmployees();
  }, [isAdmin, fetchEmployees]);

  useEffect(() => {
    if (!isAdmin || !selectedEmployee || !date) return;

    const fetchLocations = async () => {
      setLoading(true);
      setSelectedLocation(null);
      try {
        const response = await axios.get(`${API}/attendance/employee-locations`, {
          params: { employee_id: selectedEmployee, date },
          headers: authHeaders(),
        });

        const locs = response.data?.locations;
        if (Array.isArray(locs)) {
          setLocations(locs);
        } else {
          setLocations([]);
        }
      } catch (err) {
        console.error(err);
        if (err.response?.status === 403) {
          toast.error('Permission denied');
        } else {
          toast.error(err.response?.data?.detail || 'Failed to load location data');
        }
        setLocations([]);
      } finally {
        setLoading(false);
      }
    };

    fetchLocations();
  }, [isAdmin, selectedEmployee, date]);

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
        <p className="text-gray-600 text-sm mt-1">
          Map uses free <strong>OpenStreetMap</strong> tiles (no Google billing). GPS points come from punch in/out.
        </p>
      </div>

      <Card className="p-4 sm:p-6 rounded-lg border border-gray-200 bg-white shadow-sm">
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
              max={new Date().toISOString().split('T')[0]}
              className="h-11 border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            />
          </div>

          <div className="flex items-end">
            <p className="text-sm text-gray-600 pb-2">
              <strong className="text-gray-900">{locations.length}</strong> GPS point
              {locations.length !== 1 ? 's' : ''} for this day
            </p>
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
                This employee has no stored GPS coordinates for the selected date. Locations are saved when employees
                punch in/out with location enabled on their device.
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
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px] border-collapse">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
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
                          location.type === 'punch_in' ? 'bg-green-600' : 'bg-red-600'
                        }`}
                      >
                        {location.type === 'punch_in' ? 'Punch in' : 'Punch out'}
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
              <span className="h-0.5 w-6 bg-blue-600" /> Route
            </span>
          </div>
        </Card>
      )}
    </div>
  );
};

export default LocationTracker;

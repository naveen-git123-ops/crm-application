import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { MapPin, Calendar, User, Clock, AlertCircle } from 'lucide-react';
import { GoogleMap, LoadScript, Marker, Polyline, InfoWindow } from '@react-google-maps/api';
import { formatISTDateTime } from '@/utils/date';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${BACKEND_URL}/api`;
const GOOGLE_MAPS_API_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY || '';

const LocationTracker = () => {
  const { user } = useAuth();
  const [date, setDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [employees, setEmployees] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const mapRef = useRef(null);

  // Check if user has permission to view locations
  useEffect(() => {
    if (user && user.role && !['Admin', 'Manager'].includes(user.role)) {
      toast.error('Only Admin and Manager can access Location Tracking');
    }
  }, [user]);

  // Fetch employees
  useEffect(() => {
    const fetchEmployees = async () => {
      try {
        const response = await axios.get(`${API}/employees`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        });
        if (response.data && Array.isArray(response.data)) {
          setEmployees(response.data);
          // Auto-select first employee
          if (response.data.length > 0) {
            setSelectedEmployee(response.data[0].employee_id);
          }
        }
      } catch (err) {
        console.error('Failed to fetch employees:', err);
        toast.error('Failed to load employees');
      }
    };
    fetchEmployees();
  }, []);

  // Fetch locations for selected employee and date
  useEffect(() => {
    if (!selectedEmployee || !date) return;

    const fetchLocations = async () => {
      setLoading(true);
      try {
        const response = await axios.get(`${API}/attendance/employee-locations`, {
          params: {
            employee_id: selectedEmployee,
            date: date,
          },
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        });

        if (response.data && response.data.locations) {
          setLocations(response.data.locations);
          setSelectedLocation(null);

          // Center map on first location if available
          if (response.data.locations.length > 0 && mapRef.current) {
            const firstLoc = response.data.locations[0];
            mapRef.current.panTo({
              lat: firstLoc.latitude,
              lng: firstLoc.longitude,
            });
          }
        } else {
          setLocations([]);
          toast.info('No location data available for this date');
        }
      } catch (err) {
        console.error('Failed to fetch locations:', err);
        if (err.response?.status === 403) {
          toast.error('Permission denied');
        } else {
          toast.error('Failed to load location data');
        }
        setLocations([]);
      } finally {
        setLoading(false);
      }
    };

    fetchLocations();
  }, [selectedEmployee, date]);

  // Get polyline path from locations
  const getPolylineCoordinates = () => {
    return locations.map((loc) => ({
      lat: loc.latitude,
      lng: loc.longitude,
    }));
  };

  // Get marker color based on type
  const getMarkerColor = (type) => {
    return type === 'punch_in' ? '#00AA00' : '#FF6B6B';
  };

  // Get marker label
  const getMarkerLabel = (type, index) => {
    return type === 'punch_in' ? `IN ${index + 1}` : `OUT ${index + 1}`;
  };

  const selectedEmployeeName =
    employees.find((emp) => emp.employee_id === selectedEmployee)?.name || 'Employee';

  const mapContainerStyle = {
    width: '100%',
    height: '600px',
    borderRadius: '8px',
  };

  const defaultCenter = {
    lat: 28.6139, // Default to India center
    lng: 77.209,
  };

  const polylineOptions = {
    strokeColor: '#4A90E2',
    strokeOpacity: 0.8,
    strokeWeight: 3,
    geodesic: true,
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-2">
        <MapPin className="w-6 h-6 text-blue-600" />
        <h1 className="text-3xl font-bold">Location Tracker</h1>
      </div>

      {/* Access Control Notice */}
      {user && !['Admin', 'Manager'].includes(user.role) && (
        <Card className="bg-red-50 border-red-200 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
            <div>
              <p className="font-semibold text-red-900">Access Denied</p>
              <p className="text-red-800 text-sm">
                Only Admin and Manager can access employee location tracking.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Filters */}
      {user && ['Admin', 'Manager'].includes(user.role) && (
        <Card className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Employee Selector */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <User className="w-4 h-4" />
                Employee
              </Label>
              <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Employee" />
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

            {/* Date Picker */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Date
              </Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                max={new Date().toISOString().split('T')[0]}
              />
            </div>

            {/* Info */}
            <div className="flex items-end">
              <div className="text-sm text-gray-600">
                <p>
                  <strong>{locations.length}</strong> location point
                  {locations.length !== 1 ? 's' : ''} recorded
                </p>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Map */}
      {user && ['Admin', 'Manager'].includes(user.role) && (
        <>
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">Daily Route - {selectedEmployeeName}</h2>
            {loading ? (
              <div className="flex items-center justify-center h-96 bg-gray-50 rounded-lg">
                <div className="text-center">
                  <div className="inline-block animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-600"></div>
                  <p className="mt-4 text-gray-600">Loading location data...</p>
                </div>
              </div>
            ) : locations.length === 0 ? (
              <div className="flex items-center justify-center h-96 bg-gray-50 rounded-lg">
                <div className="text-center text-gray-500">
                  <MapPin className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No location data available for selected date</p>
                </div>
              </div>
            ) : (
              <LoadScript googleMapsApiKey={GOOGLE_MAPS_API_KEY}>
                <GoogleMap
                  mapContainerStyle={mapContainerStyle}
                  center={
                    locations.length > 0
                      ? {
                          lat: locations[0].latitude,
                          lng: locations[0].longitude,
                        }
                      : defaultCenter
                  }
                  zoom={14}
                  onLoad={(map) => (mapRef.current = map)}
                  options={{
                    disableDefaultUI: false,
                    zoomControl: true,
                    mapTypeControl: true,
                    streetViewControl: true,
                  }}
                >
                  {/* Draw polyline path */}
                  {locations.length > 1 && (
                    <Polyline
                      path={getPolylineCoordinates()}
                      options={polylineOptions}
                    />
                  )}

                  {/* Draw markers */}
                  {locations.map((location, index) => (
                    <Marker
                      key={location.id}
                      position={{
                        lat: location.latitude,
                        lng: location.longitude,
                      }}
                      title={`${location.type} - ${location.time}`}
                      icon={{
                        path: window.google?.maps?.SymbolPath?.CIRCLE,
                        scale: 10,
                        fillColor: getMarkerColor(location.type),
                        fillOpacity: 0.8,
                        strokeColor: '#fff',
                        strokeWeight: 2,
                      }}
                      onClick={() => setSelectedLocation(location)}
                    />
                  ))}

                  {/* Info window for selected location */}
                  {selectedLocation && (
                    <InfoWindow
                      position={{
                        lat: selectedLocation.latitude,
                        lng: selectedLocation.longitude,
                      }}
                      onCloseClick={() => setSelectedLocation(null)}
                    >
                      <div className="p-3 text-gray-800 max-w-xs">
                        <p className="font-semibold text-lg mb-2 capitalize">
                          {selectedLocation.type === 'punch_in' ? '✅ Punch In' : '❌ Punch Out'}
                        </p>
                        <p className="text-sm">
                          <strong>Time:</strong> {selectedLocation.time || 'N/A'}
                        </p>
                        <p className="text-sm">
                          <strong>Location:</strong> {selectedLocation.latitude.toFixed(4)}, {selectedLocation.longitude.toFixed(4)}
                        </p>
                        {selectedLocation.timestamp && (
                          <p className="text-sm text-gray-600 mt-2">
                            {formatISTDateTime(selectedLocation.timestamp)}
                          </p>
                        )}
                      </div>
                    </InfoWindow>
                  )}
                </GoogleMap>
              </LoadScript>
            )}
          </Card>

          {/* Location Details Table */}
          {locations.length > 0 && (
            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Location Details</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse">
                  <thead>
                    <tr className="bg-gray-100 border-b">
                      <th className="px-4 py-2 text-left">S.No</th>
                      <th className="px-4 py-2 text-left">Type</th>
                      <th className="px-4 py-2 text-left">Time</th>
                      <th className="px-4 py-2 text-left">Latitude</th>
                      <th className="px-4 py-2 text-left">Longitude</th>
                      <th className="px-4 py-2 text-left">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {locations.map((location, index) => (
                      <tr
                        key={location.id}
                        className="border-b hover:bg-gray-50 cursor-pointer"
                        onClick={() => setSelectedLocation(location)}
                      >
                        <td className="px-4 py-2">{index + 1}</td>
                        <td className="px-4 py-2">
                          <span
                            className={`px-2 py-1 rounded text-white text-sm font-semibold ${
                              location.type === 'punch_in'
                                ? 'bg-green-500'
                                : 'bg-red-500'
                            }`}
                          >
                            {location.type === 'punch_in' ? 'Punch In' : 'Punch Out'}
                          </span>
                        </td>
                        <td className="px-4 py-2 flex items-center gap-1">
                          <Clock className="w-4 h-4 text-gray-500" />
                          {location.time || 'N/A'}
                        </td>
                        <td className="px-4 py-2">
                          {location.latitude.toFixed(4)}
                        </td>
                        <td className="px-4 py-2">
                          {location.longitude.toFixed(4)}
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-600">
                          {location.timestamp
                            ? formatISTDateTime(location.timestamp)
                            : 'N/A'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Legend */}
              <div className="mt-6 flex gap-6">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full bg-green-500"></div>
                  <span className="text-sm text-gray-600">Punch In Location</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full bg-red-500"></div>
                  <span className="text-sm text-gray-600">Punch Out Location</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-1 w-6 bg-blue-600"></div>
                  <span className="text-sm text-gray-600">Travel Route</span>
                </div>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
};

export default LocationTracker;

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, Loader,Pen, Trash2, Camera, Fuel, Gauge, TrendingUp, DollarSign, Clock, CheckCircle, LogOut, AlertCircle, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

const Vehicles = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
  const API = `${BACKEND_URL}/api`;

  // STATE - VEHICLES
  const [vehicles, setVehicles] = useState([]);
  const [showCreateVehicleDialog, setShowCreateVehicleDialog] = useState(false);
  const [newVehicle, setNewVehicle] = useState({
    vehicle_name: '',
    vehicle_type: 'Car',
    fuel_type: 'Petrol',
    registration_number: '',
    milage: '',
    status: 'Active'
  });
  const [vehiclePhotoFile, setVehiclePhotoFile] = useState(null);
  const [selectedVehicleForPhoto, setSelectedVehicleForPhoto] = useState(null);

  // STATE - VEHICLE USAGE
  const [usageRecords, setUsageRecords] = useState([]);
  const [activeUsage, setActiveUsage] = useState(null);
  const [startUsageDialogOpen, setStartUsageDialogOpen] = useState(false);
  const [completeUsageDialogOpen, setCompleteUsageDialogOpen] = useState(false);
  const [startPhotoFile, setStartPhotoFile] = useState(null);
  const [startPhotoPreview, setStartPhotoPreview] = useState(null);
  const [endPhotoFile, setEndPhotoFile] = useState(null);
  const [endPhotoPreview, setEndPhotoPreview] = useState(null);
  const [startUsageData, setStartUsageData] = useState({
    vehicle_id: '',
    employee_id: user?.employee_id || user?.id || '',
    employee_name: user?.name || '',
    start_meter_reading: '',
    notes: ''
  });
  const [completeUsageData, setCompleteUsageData] = useState({
    usage_id: '',
    end_meter_reading: '',
    notes: ''
  });

  // STATE - FUEL CLAIMS
  const [fuelClaims, setFuelClaims] = useState([]);
  const [createClaimDialogOpen, setCreateClaimDialogOpen] = useState(false);
  const [selectedClaim, setSelectedClaim] = useState(null);
  const [claimData, setClaimData] = useState({
    vehicle_usage_id: '',
    claimed_amount: '',
    price_per_liter: '100'
  });

  // STATE - SUMMARY
  const [activeTab, setActiveTab] = useState('vehicles');
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [dashboardSummary, setDashboardSummary] = useState(null);
  const [claimStatusSummary, setClaimStatusSummary] = useState(null);
  const [employeeSummary, setEmployeeSummary] = useState([]);
  const [vehicleSummary, setVehicleSummary] = useState([]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(false);

  // LOAD DATA
  useEffect(() => {
    fetchVehicles();
    fetchUsageRecords();
    fetchFuelClaims();
    if (['Admin', 'HR', 'Manager', 'Accountant'].includes(user?.role)) {
      fetchSummaryData();
    }
  }, []);

  // FETCH FUNCTIONS
  const fetchVehicles = async () => {
    try {
      const response = await axios.get(`${API}/vehicles`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setVehicles(response.data);
    } catch (error) {
      toast.error('Failed to load vehicles');
    }
  };

  const fetchUsageRecords = async () => {
    try {
      const response = await axios.get(`${API}/vehicle-usage`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setUsageRecords(response.data);
      const active = response.data.find(u => u.status === 'Active');
      setActiveUsage(active || null);
    } catch (error) {
      toast.error('Failed to load usage records');
    }
  };

  const fetchFuelClaims = async () => {
    try {
      const response = await axios.get(`${API}/fuel-expense-claims`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setFuelClaims(response.data);
    } catch (error) {
      toast.error('Failed to load fuel claims');
    }
  };

  const fetchSummaryData = async () => {
    setSummaryLoading(true);
    try {
      const [dashRes, empRes, vehRes, claimRes] = await Promise.all([
        axios.get(`${API}/vehicles/dashboard/summary`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }),
        axios.get(`${API}/vehicles/dashboard/employee-summary`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }),
        axios.get(`${API}/vehicles/dashboard/vehicle-summary`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }),
        axios.get(`${API}/vehicles/dashboard/claim-status`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      ]);
      setDashboardSummary(dashRes.data);
      setEmployeeSummary(empRes.data);
      setVehicleSummary(vehRes.data);
      setClaimStatusSummary(claimRes.data);
    } catch (error) {
      toast.error('Failed to load summary data');
    } finally {
      setSummaryLoading(false);
    }
  };

  // HANDLERS
  const formatDateTime = (dateTimeString) => {
    if (!dateTimeString) return 'N/A';
    try {
      const date = new Date(dateTimeString);
      const dateStr = date.toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'short',
        day: '2-digit'
      });
      const timeStr = date.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
      return `${dateStr} ${timeStr}`;
    } catch (error) {
      return 'Invalid Date';
    }
  };

  const handlePhotoCapture = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setStartPhotoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setStartPhotoPreview(reader.result);
      };
      reader.readAsDataURL(file);
      toast.success('Photo captured successfully');
    }
  };
  const handleEndPhotoCapture = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setEndPhotoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setEndPhotoPreview(reader.result);
      };
      reader.readAsDataURL(file);
      toast.error('Photo captured successfully');
    }
  };
  const handleStartUsage = async () => {
    if (!startUsageData.vehicle_id || !startUsageData.start_meter_reading) {
      toast.error('Please select vehicle and enter meter reading');
      return;
    }
    if (!startPhotoFile) {
      toast.error('Photo of meter reading is required for verification');
      return;
    }

    setIsSubmitting(true);
    try {
      // Create journey first
      const response = await axios.post(
        `${API}/vehicle-usage`,
        {
          vehicle_id: startUsageData.vehicle_id,
          employee_id: startUsageData.employee_id,
          employee_name: startUsageData.employee_name,
          start_meter_reading: parseFloat(startUsageData.start_meter_reading),
          notes: startUsageData.notes
        },
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );

      // Upload photo
      const formData = new FormData();
      formData.append('file', startPhotoFile);
      await axios.post(`${API}/vehicle-usage/${response.data.id}/upload-start-photo`, formData, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });

      toast.success('Journey started with photo');
      setStartUsageDialogOpen(false);
      setStartPhotoFile(null);
      setStartPhotoPreview(null);
      setStartUsageData({ 
        vehicle_id: '', 
        employee_id: user?.employee_id || user?.id || '',
        employee_name: user?.name || '',
        start_meter_reading: '', 
        notes: '' 
      });
      fetchUsageRecords();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to start usage');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCompleteUsage = async () => {
    if (!completeUsageData.end_meter_reading) {
      toast.error('Please enter ending meter reading');
      return;
    }
    if (!endPhotoFile) {
      toast.error('Photo of meter reading is required for verification');
      return;
    }

    setIsSubmitting(true);
    try {
      await axios.patch(
        `${API}/vehicle-usage/${activeUsage.id}`,
        {
          end_meter_reading: parseFloat(completeUsageData.end_meter_reading),
          notes: completeUsageData.notes
        },
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );

      // Upload end photo
      const formData = new FormData();
      formData.append('file', endPhotoFile);
      await axios.post(`${API}/vehicle-usage/${activeUsage.id}/upload-end-photo`, formData, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });

      toast.success('Journey completed with photo');
      setCompleteUsageDialogOpen(false);
      setEndPhotoFile(null);
      setEndPhotoPreview(null);
      setActiveUsage(null);
      setCompleteUsageData({ usage_id: '', end_meter_reading: '', notes: '' });
      fetchUsageRecords();
      // Refresh summary data after completing journey
      if (['Admin', 'HR', 'Manager', 'Accountant'].includes(user?.role)) {
        fetchSummaryData();
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to complete usage');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateVehicle = async () => {
    if (!newVehicle.vehicle_name || !newVehicle.registration_number || !newVehicle.milage) {
      toast.error('Please fill all required fields');
      return;
    }

    setLoading(true);
    try {
      await axios.post(`${API}/vehicles`, newVehicle, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      toast.success('Vehicle created successfully');
      setShowCreateVehicleDialog(false);
      setNewVehicle({
        vehicle_name: '',
        vehicle_type: 'Car',
        fuel_type: 'Petrol',
        registration_number: '',
        milage: '',
        status: 'Active'
      });
      fetchVehicles();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create vehicle');
    } finally {
      setLoading(false);
    }
  };

  const handleUploadVehiclePhoto = async (vehicleId) => {
    if (!vehiclePhotoFile) {
      toast.error('Please select a photo');
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', vehiclePhotoFile);
      await axios.post(`${API}/vehicles/${vehicleId}/upload-photo`, formData, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      toast.success('Photo uploaded successfully');
      setVehiclePhotoFile(null);
      setSelectedVehicleForPhoto(null);
      fetchVehicles();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to upload photo');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateClaim = async () => {
    if (!claimData.vehicle_usage_id || !claimData.claimed_amount) {
      toast.error('Please fill all required fields');
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(
        `${API}/fuel-expense-claims`,
        {
          vehicle_usage_id: claimData.vehicle_usage_id,
          claimed_amount: parseFloat(claimData.claimed_amount),
          price_per_liter: parseFloat(claimData.price_per_liter)
        },
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );
      setFuelClaims([...fuelClaims, response.data]);
      setCreateClaimDialogOpen(false);
      setClaimData({ vehicle_usage_id: '', claimed_amount: '', price_per_liter: '100' });
      toast.success('Fuel claim created');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create claim');
    } finally {
      setLoading(false);
    }
  };

  // HELPERS
  const getVehicleName = (vehicleId) => {
    const vehicle = vehicles.find(v => v.id === vehicleId);
    return vehicle?.vehicle_name || 'Unknown Vehicle';
  };

  const getClaimStatusBadge = (status) => {
    const styles = {
      'Pending': 'bg-yellow-100 text-yellow-800',
      'Approved': 'bg-green-100 text-green-800',
      'Rejected': 'bg-red-100 text-red-800',
      'Partially-Approved': 'bg-blue-100 text-blue-800'
    };
    return styles[status] || 'bg-gray-100 text-gray-800';
  };

  // RENDER
  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">Vehicle Management</h1>
          <p className="text-gray-600 mt-1">Track vehicles, monitor usage, and manage fuel expenses</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-300 flex-wrap">
        <button
          onClick={() => setActiveTab('vehicles')}
          className={`pb-2 px-4 font-semibold ${activeTab === 'vehicles' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-600'}`}
        >
          📋 Vehicles
        </button>
        <button
          onClick={() => setActiveTab('usage')}
          className={`pb-2 px-4 font-semibold ${activeTab === 'usage' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-600'}`}
        >
          🚗 Usage
        </button>
        <button
          onClick={() => setActiveTab('claims')}
          className={`pb-2 px-4 font-semibold ${activeTab === 'claims' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-600'}`}
        >
          ⛽ Claims
        </button>
        {['Admin', 'HR', 'Manager', 'Accountant'].includes(user?.role) && (
          <button
            onClick={() => setActiveTab('summary')}
            className={`pb-2 px-4 font-semibold ${activeTab === 'summary' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-600'}`}
          >
            📊 Summary
          </button>
        )}
      </div>

      {/* VEHICLES TAB */}
      {activeTab === 'vehicles' && (
        <div className="space-y-4">
          <Button onClick={() => setShowCreateVehicleDialog(true)} className="bg-blue-600 hover:bg-blue-700">
            <Plus className="h-4 w-4 mr-2" /> Add Vehicle
          </Button>

          <CreateVehicleDialog
            open={showCreateVehicleDialog}
            onOpenChange={setShowCreateVehicleDialog}
            newVehicle={newVehicle}
            setNewVehicle={setNewVehicle}
            onSubmit={handleCreateVehicle}
            loading={loading}
          />

          <VehiclePhotoDialog
            open={!!selectedVehicleForPhoto}
            onOpenChange={() => setSelectedVehicleForPhoto(null)}
            vehicleId={selectedVehicleForPhoto}
            vehiclePhotoFile={vehiclePhotoFile}
            setVehiclePhotoFile={setVehiclePhotoFile}
            onUpload={() => handleUploadVehiclePhoto(selectedVehicleForPhoto)}
            loading={loading}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {vehicles.map(vehicle => (
              <Card key={vehicle.id} className="p-4 space-y-3">
                {vehicle.photo_path && (
                  <img src={vehicle.photo_path} alt={vehicle.vehicle_name} className="w-full h-32 object-cover rounded"/>
                )}
                <h3 className="font-bold text-lg">{vehicle.vehicle_name}</h3>
                <div className="space-y-1 text-sm">
                  <p><span className="text-gray-600">Type:</span> {vehicle.vehicle_type}</p>
                  <p><span className="text-gray-600">Fuel:</span> {vehicle.fuel_type}</p>
                  <p><span className="text-gray-600">Reg:</span> {vehicle.registration_number}</p>
                  <p><span className="text-gray-600">Mileage:</span> {vehicle.milage} km/L</p>
                  <p><span className="text-gray-600">Status:</span> <span className={`px-2 py-1 rounded text-xs ${vehicle.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{vehicle.status}</span></p>
                </div>
                <Button onClick={() => setSelectedVehicleForPhoto(vehicle.id)} size="sm" className="w-full bg-gray-500">
                  <Camera className="h-4 w-4 mr-2" /> Photo
                </Button>
              </Card>
            ))}
          </div>
          {vehicles.length === 0 && <p className="text-center text-gray-500 py-8">No vehicles found</p>}
        </div>
      )}

      {/* USAGE TAB */}
      {activeTab === 'usage' && (
        <div className="space-y-4">
          {!activeUsage ? (
            <Dialog open={startUsageDialogOpen} onOpenChange={setStartUsageDialogOpen}>
              <Button className="w-full sm:w-auto bg-green-600 text-white font-medium hover:bg-green-700" onClick={() => setStartUsageDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Start Journey
              </Button>
              <DialogContent className="max-w-2xl bg-white rounded-lg border border-gray-200 shadow-xl p-0">
                <div className="bg-green-600 text-white p-6 rounded-t-lg">
                  <DialogHeader>
                    <DialogTitle className="text-xl font-bold text-white">Start Vehicle Usage</DialogTitle>
                    <p className="text-green-100 text-sm mt-1">Enter meter reading and capture photo for verification</p>
                  </DialogHeader>
                </div>
                <div className="p-6 space-y-6">
                  {/* Vehicle Selection */}
                  <div className="space-y-3">
                    <Label className="text-sm font-semibold text-gray-700">Vehicle *</Label>
                    <select
                      value={startUsageData.vehicle_id}
                      onChange={e => setStartUsageData({ ...startUsageData, vehicle_id: e.target.value })}
                      className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                    >
                      <option value="">Choose vehicle</option>
                      {vehicles.map(v => <option key={v.id} value={v.id}>{v.vehicle_name}</option>)}
                    </select>
                  </div>

                  {/* Meter Reading */}
                  <div className="space-y-3">
                    <Label className="text-sm font-semibold text-gray-700">Start Meter Reading (km) *</Label>
                    <Input
                      type="number"
                      value={startUsageData.start_meter_reading}
                      onChange={e => setStartUsageData({ ...startUsageData, start_meter_reading: e.target.value })}
                      placeholder="e.g., 45000"
                      className="h-11 border border-gray-300 rounded-lg px-4"
                    />
                  </div>

                  {/* Photo Capture Section */}
                  <div className="border-t border-gray-200 pt-6">
                    <div className="space-y-3 mb-4">
                      <Label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                        <Camera className="h-4 w-4" />
                        Meter Reading Photo * (Required for verification)
                      </Label>
                      <label className="flex items-center justify-center w-full px-4 py-6 border-2 border-dashed border-green-300 rounded-lg cursor-pointer hover:border-green-500 bg-green-50 transition">
                        <div className="text-center">
                          <Camera className="h-8 w-8 text-green-600 mx-auto mb-2" />
                          <p className="text-sm font-medium text-gray-700">Click to capture or upload photo</p>
                          <p className="text-xs text-gray-500 mt-1">Take a clear photo of the meter reading</p>
                        </div>
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={handlePhotoCapture}
                          className="hidden"
                        />
                      </label>
                      {startPhotoFile && (
                        <p className="text-xs text-green-700 font-medium">✓ Photo selected: {startPhotoFile.name}</p>
                      )}
                    </div>

                    {/* Photo Preview */}
                    {startPhotoPreview && (
                      <div className="space-y-3">
                        <p className="text-sm font-semibold text-gray-700">Photo Preview</p>
                        <div className="relative rounded-lg overflow-hidden border border-gray-200">
                          <img src={startPhotoPreview} alt="Meter reading preview" className="w-full h-64 object-cover" />
                          <button
                            onClick={() => {
                              setStartPhotoFile(null);
                              setStartPhotoPreview(null);
                            }}
                            className="absolute top-2 right-2 bg-red-500 text-white p-2 rounded-full hover:bg-red-600"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Notes */}
                  <div className="space-y-3">
                    <Label className="text-sm font-semibold text-gray-700">Notes</Label>
                    <textarea
                      value={startUsageData.notes}
                      onChange={e => setStartUsageData({ ...startUsageData, notes: e.target.value })}
                      placeholder="Trip details..."
                      rows={2}
                      className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm resize-none"
                    />
                  </div>

                  {/* Buttons */}
                  <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                    <Button variant="outline" onClick={() => {
                      setStartUsageDialogOpen(false);
                      setStartPhotoFile(null);
                      setStartPhotoPreview(null);
                    }} disabled={isSubmitting}>
                      Cancel
                    </Button>
                    <Button 
                      onClick={handleStartUsage} 
                      disabled={isSubmitting || !startPhotoFile}
                      className="bg-green-600 hover:bg-green-700 text-white"
                    >
                      {isSubmitting ? <Loader className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                      {isSubmitting ? 'Starting...' : 'Start Journey'}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          ) : (
            <Card className="p-6 border-green-200 bg-green-50 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-green-900">Active Journey</h3>
                  <p className="text-sm text-green-800 mt-1">{getVehicleName(activeUsage.vehicle_id)}</p>
                  <p className="text-xs text-green-700 mt-1">Started: {formatDateTime(activeUsage.start_date)}</p>
                </div>
                <CheckCircle className="h-6 w-6 text-green-600" />
              </div>
              <p className="text-sm text-green-800">Start Reading: <span className="font-semibold">{activeUsage.start_meter_reading} km</span></p>
              <Dialog open={completeUsageDialogOpen} onOpenChange={setCompleteUsageDialogOpen}>
                <Button className="w-full bg-orange-600 hover:bg-orange-700 text-white" onClick={() => {
                  setCompleteUsageDialogOpen(true);
                  setCompleteUsageData({ usage_id: activeUsage.id, end_meter_reading: '', notes: '' });
                }}>
                  Complete Journey
                </Button>
                <DialogContent className="max-w-lg bg-white rounded-lg border border-gray-200 shadow-xl p-0">
                  <div className="bg-orange-600 text-white p-6 rounded-t-lg">
                    <DialogHeader>
                      <DialogTitle className="text-xl font-bold text-white">Complete Journey</DialogTitle>
                      <p className="text-orange-100 text-sm mt-1">Record ending meter reading</p>
                    </DialogHeader>
                  </div>
                  <div className="space-y-6 p-6">
                    <div className="space-y-3">
                      <Label className="text-sm font-semibold text-gray-700">End Meter Reading (km) *</Label>
                      <Input
                        type="number"
                        value={completeUsageData.end_meter_reading}
                        onChange={e => setCompleteUsageData({ ...completeUsageData, end_meter_reading: e.target.value })}
                        placeholder="e.g., 45050"
                        className="h-11 border border-gray-300 rounded-lg px-4"
                      />
                    </div>
                    <div className="space-y-3">
                      <Label className="text-sm font-semibold text-gray-700">Notes</Label>
                      <textarea
                        value={completeUsageData.notes}
                        onChange={e => setCompleteUsageData({ ...completeUsageData, notes: e.target.value })}
                        placeholder="Trip summary..."
                        rows={2}
                        className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm resize-none"
                      />
                    </div>

                    {/* Photo Capture Section */}
                    <div className="border-t border-gray-200 pt-6">
                      <div className="space-y-3 mb-4">
                        <Label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                          <Camera className="h-4 w-4" />
                          Meter Reading Photo * (Required for verification)
                        </Label>
                        <label className="flex items-center justify-center w-full px-4 py-6 border-2 border-dashed border-orange-300 rounded-lg cursor-pointer hover:border-orange-500 bg-orange-50 transition">
                          <div className="text-center">
                            <Camera className="h-8 w-8 text-orange-600 mx-auto mb-2" />
                            <p className="text-sm font-medium text-gray-700">Click to capture or upload photo</p>
                            <p className="text-xs text-gray-500 mt-1">Take a clear photo of the meter reading</p>
                          </div>
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={handleEndPhotoCapture}
                            className="hidden"
                          />
                        </label>
                        {endPhotoFile && (
                          <p className="text-xs text-orange-700 font-medium">✓ Photo selected: {endPhotoFile.name}</p>
                        )}
                      </div>

                      {/* Photo Preview */}
                      {endPhotoPreview && (
                        <div className="space-y-3">
                          <p className="text-sm font-semibold text-gray-700">Photo Preview</p>
                          <div className="relative rounded-lg overflow-hidden border border-gray-200">
                            <img src={endPhotoPreview} alt="Meter reading preview" className="w-full h-64 object-cover" />
                            <button
                              onClick={() => {
                                setEndPhotoFile(null);
                                setEndPhotoPreview(null);
                              }}
                              className="absolute top-2 right-2 bg-red-500 text-white p-2 rounded-full hover:bg-red-600"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                      <Button variant="outline" onClick={() => {
                        setCompleteUsageDialogOpen(false);
                        setEndPhotoFile(null);
                        setEndPhotoPreview(null);
                      }} disabled={isSubmitting}>
                        Cancel
                      </Button>
                      <Button onClick={handleCompleteUsage} disabled={isSubmitting || !endPhotoFile} className="bg-orange-600 hover:bg-orange-700 text-white">
                        {isSubmitting ? <Loader className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                        {isSubmitting ? 'Completing...' : 'Complete'}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </Card>
          )}

          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Journey History</h3>
            {usageRecords.map(usage => (
              <Card key={usage.id} className="p-4 space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-semibold">{getVehicleName(usage.vehicle_id)}</h4>
                    <p className="text-sm text-gray-600">{usage.employee_name}</p>
                    <div className="text-xs text-gray-500 mt-2 space-y-1">
                      <p><span className="font-medium">Start:</span> {formatDateTime(usage.start_date)}</p>
                      {usage.end_date && (
                        <p><span className="font-medium">End:</span> {formatDateTime(usage.end_date)}</p>
                      )}
                    </div>
                  </div>
                  <span className={`px-3 py-1 rounded text-xs font-medium ${usage.status === 'Active' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>
                    {usage.status}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm border-t pt-3">
                  <div>
                    <p className="text-gray-600">Start</p>
                    <p className="font-medium">{usage.start_meter_reading} km</p>
                  </div>
                  {usage.end_meter_reading && (
                    <>
                      <div>
                        <p className="text-gray-600">End</p>
                        <p className="font-medium">{usage.end_meter_reading} km</p>
                      </div>
                      <div>
                        <p className="text-gray-600">Distance</p>
                        <p className="font-medium text-green-600">{usage.km_driven} km</p>
                      </div>
                      <div>
                        <p className="text-gray-600">Fuel</p>
                        <p className="font-medium text-blue-600">{usage.fuel_consumed?.toFixed(2)} L</p>
                      </div>
                    </>
                  )}
                </div>
              </Card>
            ))}
            {usageRecords.length === 0 && <p className="text-center text-gray-500 py-8">No journeys yet</p>}
          </div>
        </div>
      )}

      {/* CLAIMS TAB */}
      {activeTab === 'claims' && (
        <div className="space-y-4">
          <Dialog open={createClaimDialogOpen} onOpenChange={setCreateClaimDialogOpen}>
            <Button className="bg-purple-600 hover:bg-purple-700 text-white" onClick={() => setCreateClaimDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> Create Claim
            </Button>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Create Fuel Claim</DialogTitle>
                <DialogDescription>Claim fuel expenses for completed journeys</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Journey *</Label>
                  <select
                    value={claimData.vehicle_usage_id}
                    onChange={e => setClaimData({ ...claimData, vehicle_usage_id: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                  >
                    <option value="">Select journey</option>
                    {usageRecords
                      .filter(u => u.status === 'Completed')
                      .map(u => (
                        <option key={u.id} value={u.id}>
                          {getVehicleName(u.vehicle_id)} - {u.km_driven} km
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <Label>Price Per Liter (₹)</Label>
                  <Input
                    type="number"
                    value={claimData.price_per_liter}
                    onChange={e => setClaimData({ ...claimData, price_per_liter: e.target.value })}
                    step="0.5"
                  />
                </div>
                <div>
                  <Label>Claimed Amount (₹) *</Label>
                  <Input
                    type="number"
                    value={claimData.claimed_amount}
                    onChange={e => setClaimData({ ...claimData, claimed_amount: e.target.value })}
                    placeholder="e.g., 500"
                  />
                </div>
                <Button onClick={handleCreateClaim} disabled={loading} className="w-full">
                  {loading ? 'Creating...' : 'Create Claim'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <div className="space-y-3">
            {fuelClaims.map(claim => (
              <Card key={claim.id} className="p-4 cursor-pointer hover:shadow-md" onClick={() => setSelectedClaim(claim)}>
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-semibold">{claim.vehicle_name}</h4>
                    <p className="text-sm text-gray-600">{claim.km_driven} km • {claim.fuel_consumed?.toFixed(2)} L</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded font-medium ${getClaimStatusBadge(claim.claim_status)}`}>
                    {claim.claim_status}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-3 text-sm mt-3 border-t pt-3">
                  <div>
                    <p className="text-gray-600">Claimed</p>
                    <p className="font-semibold">₹{claim.claimed_amount}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Rate</p>
                    <p className="font-semibold">₹{claim.price_per_liter}/L</p>
                  </div>
                  {claim.approved_amount && (
                    <div>
                      <p className="text-gray-600">Approved</p>
                      <p className="font-semibold text-green-600">₹{claim.approved_amount}</p>
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
          {fuelClaims.length === 0 && <p className="text-center text-gray-500 py-8">No claims yet</p>}
        </div>
      )}

      {/* SUMMARY TAB */}
      {activeTab === 'summary' && ['Admin', 'HR', 'Manager', 'Accountant'].includes(user?.role) && (
        <div className="space-y-6">
          {summaryLoading ? (
            <Card className="p-12 text-center">
              <Loader className="h-8 w-8 animate-spin mx-auto mb-2" />
              <p className="text-gray-600">Loading summary...</p>
            </Card>
          ) : (
            <>
              {dashboardSummary && (
                <>
                  {/* KPIs Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <Card className="p-6 border-l-4 border-l-blue-500 hover:shadow-md transition">
                      <p className="text-sm text-gray-600 font-medium">Total Vehicles</p>
                      <p className="text-3xl font-bold text-gray-900 mt-2">{dashboardSummary.total_vehicles}</p>
                      <p className="text-xs text-gray-500 mt-2">{dashboardSummary.active_vehicles} Active</p>
                    </Card>
                    <Card className="p-6 border-l-4 border-l-green-500 hover:shadow-md transition">
                      <p className="text-sm text-gray-600 font-medium">Total KM</p>
                      <p className="text-3xl font-bold text-gray-900 mt-2">{dashboardSummary.total_km_driven.toLocaleString()}</p>
                      <p className="text-xs text-gray-500 mt-2">{dashboardSummary.completed_journeys} Journeys</p>
                    </Card>
                    <Card className="p-6 border-l-4 border-l-orange-500 hover:shadow-md transition">
                      <p className="text-sm text-gray-600 font-medium">Fuel Used</p>
                      <p className="text-3xl font-bold text-gray-900 mt-2">{dashboardSummary.total_fuel_used.toFixed(1)}</p>
                      <p className="text-xs text-gray-500 mt-2">Liters</p>
                    </Card>
                    <Card className="p-6 border-l-4 border-l-purple-500 hover:shadow-md transition">
                      <p className="text-sm text-gray-600 font-medium">Approved Amount</p>
                      <p className="text-3xl font-bold text-gray-900 mt-2">₹{dashboardSummary.total_approved_amount.toLocaleString()}</p>
                      <p className="text-xs text-gray-500 mt-2">{dashboardSummary.approved_claims} Claims</p>
                    </Card>
                  </div>

                  {/* Claim Status Summary */}
                  {claimStatusSummary && (
                    <Card className="p-6">
                      <h3 className="text-lg font-bold text-gray-900 mb-4">Claim Status Overview</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-sm font-semibold text-gray-700">Pending</p>
                            <span className="bg-yellow-100 text-yellow-800 text-xs font-bold px-2 py-1 rounded">New</span>
                          </div>
                          <p className="text-2xl font-bold text-gray-900">{claimStatusSummary.Pending?.count || 0}</p>
                          <p className="text-xs text-gray-600 mt-1">₹{(claimStatusSummary.Pending?.total_amount || 0).toLocaleString()}</p>
                        </div>
                        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-sm font-semibold text-gray-700">Approved</p>
                            <span className="bg-green-100 text-green-800 text-xs font-bold px-2 py-1 rounded">✓</span>
                          </div>
                          <p className="text-2xl font-bold text-gray-900">{claimStatusSummary.Approved?.count || 0}</p>
                          <p className="text-xs text-gray-600 mt-1">₹{(claimStatusSummary.Approved?.total_amount || 0).toLocaleString()}</p>
                        </div>
                        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-sm font-semibold text-gray-700">Rejected</p>
                            <span className="bg-red-100 text-red-800 text-xs font-bold px-2 py-1 rounded">✕</span>
                          </div>
                          <p className="text-2xl font-bold text-gray-900">{claimStatusSummary.Rejected?.count || 0}</p>
                          <p className="text-xs text-gray-600 mt-1">₹{(claimStatusSummary.Rejected?.total_amount || 0).toLocaleString()}</p>
                        </div>
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-sm font-semibold text-gray-700">Partial</p>
                            <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2 py-1 rounded">~</span>
                          </div>
                          <p className="text-2xl font-bold text-gray-900">{claimStatusSummary['Partially-Approved']?.count || 0}</p>
                          <p className="text-xs text-gray-600 mt-1">₹{(claimStatusSummary['Partially-Approved']?.total_amount || 0).toLocaleString()}</p>
                        </div>
                      </div>
                    </Card>
                  )}

                  {/* Employee Summary Table */}
                  {employeeSummary.length > 0 && (
                    <Card className="p-6">
                      <h3 className="text-lg font-bold text-gray-900 mb-4">Employee Journey Summary</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b-2 border-gray-200">
                              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Employee Name</th>
                              <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Journeys</th>
                              <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Total KM</th>
                              <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Fuel (L)</th>
                              <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Claimed</th>
                              <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Approved</th>
                            </tr>
                          </thead>
                          <tbody>
                            {employeeSummary.map((emp, idx) => (
                              <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50 transition">
                                <td className="px-4 py-3 font-medium text-gray-900">{emp.employee_name}</td>
                                <td className="px-4 py-3 text-right text-gray-600">{emp.total_journeys}</td>
                                <td className="px-4 py-3 text-right text-gray-600">{emp.total_km.toFixed(1)}</td>
                                <td className="px-4 py-3 text-right text-gray-600">{emp.total_fuel.toFixed(2)}</td>
                                <td className="px-4 py-3 text-right text-gray-600">₹{emp.total_claimed_amount?.toLocaleString() || 0}</td>
                                <td className="px-4 py-3 text-right">
                                  <span className="inline-block bg-green-100 text-green-800 px-3 py-1 rounded text-sm font-semibold">
                                    ₹{emp.total_approved_amount?.toLocaleString() || 0}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </Card>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

// DIALOG COMPONENTS
const CreateVehicleDialog = ({ open, onOpenChange, newVehicle, setNewVehicle, onSubmit, loading }) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Create New Vehicle</DialogTitle>
        <DialogDescription>Add a new company vehicle</DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div>
          <Label>Vehicle Name *</Label>
          <Input
            value={newVehicle.vehicle_name}
            onChange={e => setNewVehicle({ ...newVehicle, vehicle_name: e.target.value })}
            placeholder="e.g., Toyota Innova"
          />
        </div>
        <div>
          <Label>Vehicle Type *</Label>
          <select
            value={newVehicle.vehicle_type}
            onChange={e => setNewVehicle({ ...newVehicle, vehicle_type: e.target.value })}
            className="w-full border rounded px-3 py-2"
          >
            <option>Car</option>
            <option>Bike</option>
            <option>Truck</option>
            <option>Van</option>
          </select>
        </div>
        <div>
          <Label>Fuel Type *</Label>
          <select
            value={newVehicle.fuel_type}
            onChange={e => setNewVehicle({ ...newVehicle, fuel_type: e.target.value })}
            className="w-full border rounded px-3 py-2"
          >
            <option>Petrol</option>
            <option>Diesel</option>
            <option>Electric</option>
          </select>
        </div>
        <div>
          <Label>Registration Number *</Label>
          <Input
            value={newVehicle.registration_number}
            onChange={e => setNewVehicle({ ...newVehicle, registration_number: e.target.value })}
            placeholder="e.g., MH-01-AB-1234"
          />
        </div>
        <div>
          <Label>Mileage (km/liter) *</Label>
          <Input
            type="number"
            value={newVehicle.milage}
            onChange={e => setNewVehicle({ ...newVehicle, milage: e.target.value })}
            placeholder="e.g., 12.5"
            step="0.1"
          />
        </div>
        <Button onClick={onSubmit} disabled={loading} className="w-full">
          {loading ? 'Creating...' : 'Create'}
        </Button>
      </div>
    </DialogContent>
  </Dialog>
);

const VehiclePhotoDialog = ({ open, onOpenChange, vehiclePhotoFile, setVehiclePhotoFile, onUpload, loading }) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Upload Vehicle Photo</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <Input type="file" accept="image/*" onChange={e => setVehiclePhotoFile(e.target.files?.[0] || null)} />
        <Button onClick={onUpload} disabled={!vehiclePhotoFile || loading} className="w-full">
          {loading ? 'Uploading...' : 'Upload'}
        </Button>
      </div>
    </DialogContent>
  </Dialog>
);

export default Vehicles;

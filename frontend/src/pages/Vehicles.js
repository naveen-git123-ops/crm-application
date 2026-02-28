import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, Loader,Pen, Trash2, Camera, Fuel, Gauge, TrendingUp, DollarSign, Clock, CheckCircle, LogOut, AlertCircle, X } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';

const Vehicles = () => {
  const { user } = useAuth();
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
  const [previousVehicleUsage, setPreviousVehicleUsage] = useState(null);
  const [showPreviousUsageDialog, setShowPreviousUsageDialog] = useState(false);
  const [confirmedPreviousUsage, setConfirmedPreviousUsage] = useState(false);
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

  // STATE - CLAIMS APPROVAL
  const [approvalClaims, setApprovalClaims] = useState([]);
  const [approvalFilter, setApprovalFilter] = useState('Pending');
  const [selectedClaimForApproval, setSelectedClaimForApproval] = useState(null);
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const [approvalAction, setApprovalAction] = useState('Approved');
  const [approvalAmount, setApprovalAmount] = useState('');
  const [approvalNotes, setApprovalNotes] = useState('');
  const [approvingClaim, setApprovingClaim] = useState(false);

  // STATE - FUEL PRICE
  const [fuelPrice, setFuelPrice] = useState('');
  const [editingFuelPrice, setEditingFuelPrice] = useState(false);
  const [fuelPriceLoading, setFuelPriceLoading] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(false);

  // LOAD DATA
  useEffect(() => {
    fetchVehicles();
    fetchUsageRecords();
    fetchFuelClaims();
    fetchFuelPrice();
    if (['Admin', 'HR', 'Manager', 'Accountant'].includes(user?.role)) {
      fetchSummaryData();
      if (['Admin', 'Accountant'].includes(user?.role)) {
        fetchApprovalClaims('Pending');
      }
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

  const fetchFuelPrice = async () => {
    try {
      const response = await axios.get(`${API}/vehicles/fuel-price`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setFuelPrice(response.data.fuel_price_per_liter.toString());
    } catch (error) {
      console.log('Failed to load fuel price');
    }
  };

  const fetchApprovalClaims = async (status = 'All') => {
    try {
      const response = await axios.get(`${API}/fuel-expense-claims-approval?status=${status}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setApprovalClaims(response.data);
    } catch (error) {
      toast.error('Failed to load claims for approval');
      console.log(error);
    }
  };

  const handleApproveClaim = async () => {
    if (!selectedClaimForApproval) {
      toast.error('No claim selected');
      return;
    }

    if (approvalAction === 'Partially-Approved' && !approvalAmount) {
      toast.error('Please enter the approved amount for partial approval');
      return;
    }

    setApprovingClaim(true);
    try {
      const payload = {
        claim_status: approvalAction,
        approver_id: user?.id || user?.employee_id,
        approver_name: user?.name,
        approval_notes: approvalNotes
      };

      if (approvalAction === 'Partially-Approved') {
        payload.approved_amount = parseFloat(approvalAmount);
      }

      await axios.post(`${API}/fuel-expense-claims/${selectedClaimForApproval.id}/decide`, payload, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });

      toast.success(`Claim ${approvalAction.toLowerCase()} successfully`);
      setApprovalDialogOpen(false);
      setSelectedClaimForApproval(null);
      setApprovalAmount('');
      setApprovalNotes('');
      setApprovalAction('Approved');
      
      // Refresh claims
      fetchApprovalClaims(approvalFilter);
      fetchFuelClaims();
    } catch (error) {
      toast.error(`Failed to ${approvalAction.toLowerCase()} claim`);
      console.log(error);
    } finally {
      setApprovingClaim(false);
    }
  };

  const handleUpdateFuelPrice = async () => {
    if (!fuelPrice || parseFloat(fuelPrice) < 0) {
      toast.error('Please enter a valid fuel price');
      return;
    }
    
    setFuelPriceLoading(true);
    try {
      await axios.put(`${API}/vehicles/fuel-price`, 
        { fuel_price_per_liter: parseFloat(fuelPrice) },
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );
      toast.success('Fuel price updated successfully');
      setEditingFuelPrice(false);
      fetchFuelClaims();
      fetchSummaryData();
    } catch (error) {
      toast.error('Failed to update fuel price');
    } finally {
      setFuelPriceLoading(false);
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
      toast.success('Photo captured successfully');
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
    // If there was previous usage by another employee, require confirmation
    if (previousVehicleUsage && previousVehicleUsage.employee_id !== user?.employee_id && !confirmedPreviousUsage) {
      toast.error('Please confirm the previous vehicle usage details before proceeding');
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
      setPreviousVehicleUsage(null);
      setConfirmedPreviousUsage(false);
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

  const handleVehicleSelection = async (vehicleId) => {
    setStartUsageData({ ...startUsageData, vehicle_id: vehicleId });
    setConfirmedPreviousUsage(false);
    setPreviousVehicleUsage(null);
    
    if (!vehicleId) return;

    try {
      const response = await axios.get(`${API}/vehicle-usage/vehicle/${vehicleId}/last`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });

      const lastUsage = response.data;
      
      // If there's a previous usage by a different employee and it's not the current user
      if (lastUsage.id && lastUsage.employee_id !== user?.employee_id) {
        setPreviousVehicleUsage(lastUsage);
        setShowPreviousUsageDialog(true);
      }
    } catch (error) {
      console.log('No previous usage found or error checking');
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
      // Remove the claimed journey from usage records
      setUsageRecords(usageRecords.filter(u => u.id !== claimData.vehicle_usage_id));
      setCreateClaimDialogOpen(false);
      setClaimData({ vehicle_usage_id: '', claimed_amount: '', price_per_liter: '100' });
      toast.success('Fuel claim created and journey removed');
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
            <>
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
                      onChange={e => handleVehicleSelection(e.target.value)}
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
                      setStartUsageData({ 
                        vehicle_id: '', 
                        employee_id: user?.employee_id || user?.id || '',
                        employee_name: user?.name || '',
                        start_meter_reading: '', 
                        notes: '' 
                      });
                      setPreviousVehicleUsage(null);
                      setConfirmedPreviousUsage(false);
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

            {/* Previous Vehicle Usage Confirmation Dialog */}
            <Dialog open={showPreviousUsageDialog} onOpenChange={setShowPreviousUsageDialog}>
              <DialogContent className="max-w-lg bg-white rounded-lg border border-yellow-200 shadow-xl">
                <div className="bg-yellow-600 text-white p-6 rounded-t-lg -m-6 mb-6">
                  <DialogHeader>
                    <DialogTitle className="text-xl font-bold text-white flex items-center gap-2">
                      <AlertCircle className="h-5 w-5" />
                      Vehicle Previously Used
                    </DialogTitle>
                    <p className="text-yellow-100 text-sm mt-2">This vehicle was last used by another employee. Please confirm details.</p>
                  </DialogHeader>
                </div>
                {previousVehicleUsage && (
                  <div className="space-y-6 p-6">
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 space-y-3">
                      <div>
                        <p className="text-sm text-gray-600">Last User</p>
                        <p className="font-semibold text-gray-900">{previousVehicleUsage.employee_name} ({previousVehicleUsage.employee_id})</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Last Journey Status</p>
                        <p className={`font-semibold ${previousVehicleUsage.status === 'Completed' ? 'text-green-600' : 'text-red-600'}`}>
                          {previousVehicleUsage.status}
                        </p>
                      </div>
                      {previousVehicleUsage.end_meter_reading && (
                        <div>
                          <p className="text-sm text-gray-600">Last End Meter Reading</p>
                          <p className="text-lg font-semibold text-blue-600">{previousVehicleUsage.end_meter_reading} km</p>
                        </div>
                      )}
                      {previousVehicleUsage.end_date && (
                        <div>
                          <p className="text-sm text-gray-600">Journey Ended</p>
                          <p className="font-medium text-gray-700">{new Date(previousVehicleUsage.end_date).toLocaleString('en-IN')}</p>
                        </div>
                      )}
                      {!previousVehicleUsage.end_meter_reading && (
                        <div className="bg-red-100 border border-red-300 rounded p-3 mt-4">
                          <p className="text-red-800 text-sm font-semibold">⚠️ Warning: Previous journey NOT completed!</p>
                          <p className="text-red-700 text-xs mt-1">The vehicle was not properly returned or a claim was not submitted. Please verify the vehicle condition before proceeding.</p>
                        </div>
                      )}
                    </div>

                    <div className="space-y-3">
                      <p className="text-sm text-gray-700 font-semibold">Do you confirm that you are taking this vehicle now?</p>
                      <div className="flex gap-3">
                        <Button 
                          variant="outline" 
                          onClick={() => {
                            setShowPreviousUsageDialog(false);
                            setStartUsageData({ ...startUsageData, vehicle_id: '' });
                            setPreviousVehicleUsage(null);
                          }}
                          className="flex-1"
                        >
                          No, Cancel
                        </Button>
                        <Button 
                          onClick={() => {
                            setConfirmedPreviousUsage(true);
                            setShowPreviousUsageDialog(false);
                            toast.success('Ready to start journey. Please enter meter reading and photo.');
                          }}
                          className="flex-1 bg-yellow-600 hover:bg-yellow-700 text-white"
                        >
                          Yes, I Confirm
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </DialogContent>
            </Dialog>
            </>
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
                      .filter(u => u.status === 'Completed' && !fuelClaims.some(c => c.vehicle_usage_id === u.id))
                      .map(u => {
                        const journeyDate = new Date(u.start_date).toLocaleDateString('en-IN', {
                          year: 'numeric',
                          month: 'short',
                          day: '2-digit'
                        });
                        return (
                          <option key={u.id} value={u.id}>
                            {getVehicleName(u.vehicle_id)} - {u.km_driven} km ({journeyDate})
                          </option>
                        );
                      })}
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
                  <div className="flex flex-col gap-2">
                    <span className={`text-xs px-2 py-1 rounded font-medium ${getClaimStatusBadge(claim.claim_status)}`}>
                      {claim.claim_status}
                    </span>
                    <span className={`text-xs px-2 py-1 rounded font-medium ${
                      claim.claim_type === 'Over-Claimed' ? 'bg-red-100 text-red-800' :
                      claim.claim_type === 'Under-Claimed' ? 'bg-blue-100 text-blue-800' :
                      'bg-green-100 text-green-800'
                    }`}>
                      {claim.claim_type || 'Exact'}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 text-sm mt-3 border-t pt-3">
                  <div>
                    <p className="text-gray-600">Claimed</p>
                    <p className="font-semibold">₹{claim.claimed_amount}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Expected</p>
                    <p className="font-semibold">₹{claim.calculated_fuel_cost?.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Difference</p>
                    <p className={`font-semibold ${(claim.difference || 0) > 0 ? 'text-red-600' : (claim.difference || 0) < 0 ? 'text-blue-600' : 'text-green-600'}`}>
                      {(claim.difference || 0) > 0 ? '+' : ''}{claim.difference}
                    </p>
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
                  {/* Fuel Price Setting - Admin Only */}
                  {user?.role === 'Admin' && (
                    <Card className="p-6 bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-orange-200">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-lg font-bold text-gray-900 mb-2">⛽ Fuel Price Per Liter</h3>
                          <p className="text-sm text-gray-600">Set the current fuel price to calculate fuel costs</p>
                          {!editingFuelPrice && (
                            <p className="text-2xl font-bold text-orange-600 mt-2">₹{fuelPrice || '0'}</p>
                          )}
                        </div>
                        {!editingFuelPrice ? (
                          <Button onClick={() => setEditingFuelPrice(true)} className="bg-orange-600 hover:bg-orange-700">
                            <Pen className="h-4 w-4 mr-2" /> Edit Price
                          </Button>
                        ) : (
                          <div className="flex gap-2">
                            <Input 
                              type="number"
                              value={fuelPrice}
                              onChange={(e) => setFuelPrice(e.target.value)}
                              placeholder="Enter fuel price"
                              step="0.01"
                              min="0"
                              className="w-40"
                            />
                            <Button 
                              onClick={handleUpdateFuelPrice} 
                              disabled={fuelPriceLoading}
                              className="bg-green-600 hover:bg-green-700"
                            >
                              {fuelPriceLoading ? 'Saving...' : 'Save'}
                            </Button>
                            <Button 
                              onClick={() => setEditingFuelPrice(false)} 
                              variant="outline"
                              className="bg-gray-200"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </Card>
                  )}

                  {/* Cost Analysis Summary */}
                  {dashboardSummary && (
                    <Card className="p-6 bg-gradient-to-r from-cyan-50 to-blue-50 border-2 border-cyan-200">
                      <h3 className="text-lg font-bold text-gray-900 mb-4">💰 Cost Analysis</h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-white rounded-lg p-4 border-l-4 border-l-blue-500">
                          <p className="text-sm text-gray-600 font-semibold">Total Fuel Used</p>
                          <p className="text-2xl font-bold text-gray-900 mt-2">{dashboardSummary.total_fuel_used.toFixed(2)} L</p>
                          <p className="text-xs text-gray-500 mt-2">Liters consumed</p>
                        </div>
                        <div className="bg-white rounded-lg p-4 border-l-4 border-l-green-500">
                          <p className="text-sm text-gray-600 font-semibold">Should Cost</p>
                          <p className="text-2xl font-bold text-green-700 mt-2">₹{dashboardSummary.calculated_fuel_cost?.toLocaleString() || 0}</p>
                          <p className="text-xs text-gray-500 mt-2">At ₹{dashboardSummary.fuel_price_per_liter}/L</p>
                        </div>
                        <div className="bg-white rounded-lg p-4 border-l-4 border-l-orange-500">
                          <p className="text-sm text-gray-600 font-semibold">Total Claimed</p>
                          <p className="text-2xl font-bold text-orange-700 mt-2">₹{dashboardSummary.total_pending_amount?.toLocaleString() || 0}</p>
                          <p className="text-xs text-gray-500 mt-2">Pending claims</p>
                        </div>
                      </div>
                      <div className="mt-4 pt-4 border-t-2 border-gray-200">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                          <div>
                            <p className="text-xs text-gray-600">Approved Claims</p>
                            <p className="text-lg font-bold text-green-700">₹{dashboardSummary.total_approved_amount?.toLocaleString() || 0}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-600">Pending Claims</p>
                            <p className="text-lg font-bold text-yellow-700">{claimStatusSummary?.Pending?.count || 0}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-600">Rejected Claims</p>
                            <p className="text-lg font-bold text-red-700">{claimStatusSummary?.Rejected?.count || 0}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-600">Price Set</p>
                            <p className={`text-lg font-bold ${dashboardSummary.fuel_price_per_liter > 0 ? 'text-green-700' : 'text-red-700'}`}>
                              {dashboardSummary.fuel_price_per_liter > 0 ? '✓' : '✕'}
                            </p>
                          </div>
                        </div>
                      </div>
                    </Card>
                  )}

                  {/* Employee Summary Table */}
                  {employeeSummary.length > 0 && (
                    <Card className="p-6 bg-white">
                      <div className="mb-6">
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Employee Journey Summary</h3>
                        <p className="text-xs text-gray-600 mb-3">💡 Fuel Cost = Fuel Consumed × Price | Difference highlights over/under claims</p>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs mb-4">
                          <div className="bg-green-50 border border-green-200 rounded p-2">
                            <span className="font-semibold text-green-800">✓ Correct Claim</span>
                            <p className="text-green-700">Claimed ≈ Should Cost (±10%)</p>
                          </div>
                          <div className="bg-red-50 border border-red-200 rounded p-2">
                            <span className="font-semibold text-red-800">⚠ Over Claim</span>
                            <p className="text-red-700">Claimed more than 10% high</p>
                          </div>
                          <div className="bg-yellow-50 border border-yellow-200 rounded p-2">
                            <span className="font-semibold text-yellow-800">! Under Claim</span>
                            <p className="text-yellow-700">Claimed more than 10% low</p>
                          </div>
                        </div>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b-2 border-gray-200 bg-gray-50">
                              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Employee Name</th>
                              <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Journeys</th>
                              <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">KM</th>
                              <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Fuel (L)</th>
                              <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Should Cost</th>
                              <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Claimed</th>
                              <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Difference</th>
                              <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Approved</th>
                            </tr>
                          </thead>
                          <tbody>
                            {employeeSummary.map((emp, idx) => {
                              const shouldCost = emp.calculated_fuel_cost || 0;
                              const claimed = emp.total_claimed_amount || 0;
                              const difference = claimed - shouldCost;
                              const overClaim = difference > shouldCost * 0.1; // More than 10% over
                              const underClaim = difference < -shouldCost * 0.1; // More than 10% under
                              
                              return (
                                <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50 transition">
                                  <td className="px-4 py-3 font-medium text-gray-900">{emp.employee_name}</td>
                                  <td className="px-4 py-3 text-right text-gray-600">{emp.total_journeys}</td>
                                  <td className="px-4 py-3 text-right text-gray-600">{emp.total_km.toFixed(1)}</td>
                                  <td className="px-4 py-3 text-right text-gray-600">{emp.total_fuel.toFixed(2)}</td>
                                  <td className="px-4 py-3 text-right">
                                    <span className={`inline-block px-3 py-1 rounded text-sm font-semibold ${
                                      emp.fuel_price_per_liter > 0 
                                        ? 'bg-blue-100 text-blue-800' 
                                        : 'bg-gray-100 text-gray-600'
                                    }`}>
                                      ₹{shouldCost.toLocaleString()}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    <span className={`inline-block px-3 py-1 rounded text-sm font-semibold ${
                                      overClaim ? 'bg-red-100 text-red-800' : 
                                      underClaim ? 'bg-yellow-100 text-yellow-800' :
                                      'bg-green-100 text-green-800'
                                    }`}>
                                      ₹{claimed.toLocaleString()}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    <span className={`inline-block px-3 py-1 rounded text-sm font-semibold whitespace-nowrap ${
                                      overClaim ? 'bg-red-100 text-red-800' :
                                      underClaim ? 'bg-yellow-100 text-yellow-800' :
                                      'bg-gray-100 text-gray-700'
                                    }`}>
                                      {difference > 0 ? '+' : ''} ₹{difference.toLocaleString()}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    <span className="inline-block bg-green-100 text-green-800 px-3 py-1 rounded text-sm font-semibold">
                                      ₹{emp.total_approved_amount?.toLocaleString() || 0}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </Card>
                  )}

                  {/* Claims Approval Grid - Admin & Accountant Only */}
                  {['Admin', 'Accountant'].includes(user?.role) && (
                    <Card className="p-6 bg-gradient-to-r from-purple-50 to-pink-50 border-2 border-purple-200">
                      <div className="mb-6">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-lg font-bold text-gray-900">📋 Claims Approval Grid</h3>
                          <div className="flex gap-2">
                            {['Pending', 'Approved', 'Rejected', 'Partially-Approved', 'All'].map(status => (
                              <Button
                                key={status}
                                onClick={() => {
                                  setApprovalFilter(status);
                                  fetchApprovalClaims(status);
                                }}
                                variant={approvalFilter === status ? 'default' : 'outline'}
                                size="sm"
                                className={approvalFilter === status ? 'bg-purple-600 text-white' : ''}
                              >
                                {status}
                              </Button>
                            ))}
                          </div>
                        </div>
                        <p className="text-xs text-gray-600">Date-wise view of all claims with approval status and calculated costs</p>
                      </div>

                      {approvalClaims.length > 0 ? (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b-2 border-gray-300 bg-purple-100">
                                <th className="px-4 py-3 text-left font-semibold text-gray-700">Date</th>
                                <th className="px-4 py-3 text-left font-semibold text-gray-700">Employee</th>
                                <th className="px-4 py-3 text-left font-semibold text-gray-700">Vehicle</th>
                                <th className="px-4 py-3 text-right font-semibold text-gray-700">KM</th>
                                <th className="px-4 py-3 text-right font-semibold text-gray-700">Fuel (L)</th>
                                <th className="px-4 py-3 text-right font-semibold text-gray-700">Should Cost</th>
                                <th className="px-4 py-3 text-right font-semibold text-gray-700">Claimed</th>
                                <th className="px-4 py-3 text-right font-semibold text-gray-700">Difference</th>
                                <th className="px-4 py-3 text-center font-semibold text-gray-700">Status</th>
                                <th className="px-4 py-3 text-center font-semibold text-gray-700">Action</th>
                              </tr>
                            </thead>
                            <tbody>
                              {approvalClaims.map((claim, idx) => {
                                const statusBgColor = {
                                  'Pending': 'bg-yellow-50',
                                  'Approved': 'bg-green-50',
                                  'Rejected': 'bg-red-50',
                                  'Partially-Approved': 'bg-blue-50'
                                }[claim.claim_status] || 'bg-gray-50';

                                const statusColor = {
                                  'Pending': 'bg-yellow-100 text-yellow-800',
                                  'Approved': 'bg-green-100 text-green-800',
                                  'Rejected': 'bg-red-100 text-red-800',
                                  'Partially-Approved': 'bg-blue-100 text-blue-800'
                                }[claim.claim_status] || 'bg-gray-100 text-gray-800';

                                return (
                                  <tr key={idx} className={`border-b border-gray-200 hover:shadow-sm transition ${statusBgColor}`}>
                                    <td className="px-4 py-3 text-gray-700 font-medium">
                                      {new Date(claim.created_at).toLocaleDateString('en-IN')}
                                    </td>
                                    <td className="px-4 py-3 text-gray-900 font-medium">{claim.employee_name}</td>
                                    <td className="px-4 py-3 text-gray-700">{claim.vehicle_name}</td>
                                    <td className="px-4 py-3 text-right text-gray-700">{claim.km_driven?.toFixed(1)}</td>
                                    <td className="px-4 py-3 text-right text-gray-700">{claim.fuel_consumed?.toFixed(2)}</td>
                                    <td className="px-4 py-3 text-right">
                                      <span className="inline-block bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-semibold">
                                        ₹{claim.calculated_fuel_cost?.toLocaleString()}
                                      </span>
                                    </td>
                                    <td className="px-4 py-3 text-right text-gray-700 font-semibold">
                                      ₹{claim.claimed_amount?.toLocaleString()}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                      <span className={`inline-block px-2 py-1 rounded text-xs font-semibold ${
                                        claim.difference > (claim.calculated_fuel_cost * 0.1) ? 'bg-red-100 text-red-800' :
                                        claim.difference < -(claim.calculated_fuel_cost * 0.1) ? 'bg-orange-100 text-orange-800' :
                                        'bg-green-100 text-green-800'
                                      }`}>
                                        {claim.difference > 0 ? '+' : ''} ₹{claim.difference?.toLocaleString()}
                                      </span>
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                      <span className={`inline-block px-2 py-1 rounded text-xs font-semibold ${statusColor}`}>
                                        {claim.claim_status}
                                      </span>
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                      {claim.claim_status === 'Pending' ? (
                                        <Button
                                          size="sm"
                                          onClick={() => {
                                            setSelectedClaimForApproval(claim);
                                            setApprovalDialogOpen(true);
                                            setApprovalAmount(claim.calculated_fuel_cost?.toString() || '');
                                          }}
                                          className="bg-purple-600 hover:bg-purple-700 text-xs"
                                        >
                                          <CheckCircle className="h-3 w-3 mr-1" /> Approve
                                        </Button>
                                      ) : (
                                        <span className="text-xs text-gray-500">Processed</span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="text-center py-8">
                          <p className="text-gray-600">No {approvalFilter !== 'All' ? approvalFilter.toLowerCase() : 'pending'} claims</p>
                        </div>
                      )}
                    </Card>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* APPROVAL DIALOG */}
      {selectedClaimForApproval && (
        <Dialog open={approvalDialogOpen} onOpenChange={setApprovalDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Approve Fuel Claim</DialogTitle>
              <DialogDescription>Review and approve the fuel expense claim</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="bg-gray-50 border rounded-lg p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Employee:</span>
                  <span className="font-semibold">{selectedClaimForApproval.employee_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Vehicle:</span>
                  <span className="font-semibold">{selectedClaimForApproval.vehicle_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Fuel Consumed:</span>
                  <span className="font-semibold">{selectedClaimForApproval.fuel_consumed?.toFixed(2)} L</span>
                </div>
                <div className="border-t pt-2 flex justify-between">
                  <span className="text-gray-600">Should Cost (Calculated):</span>
                  <span className="font-bold text-blue-600">₹{selectedClaimForApproval.calculated_fuel_cost?.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Claimed Amount:</span>
                  <span className="font-bold text-orange-600">₹{selectedClaimForApproval.claimed_amount?.toLocaleString()}</span>
                </div>
                <div className="flex justify-between pt-2 border-t">
                  <span className="text-gray-600">Difference:</span>
                  <span className={`font-bold ${selectedClaimForApproval.difference > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {selectedClaimForApproval.difference > 0 ? '+' : ''} ₹{selectedClaimForApproval.difference?.toLocaleString()}
                  </span>
                </div>
              </div>

              <div>
                <Label>Approval Action</Label>
                <select
                  value={approvalAction}
                  onChange={(e) => {
                    setApprovalAction(e.target.value);
                    if (e.target.value === 'Approved') {
                      setApprovalAmount(selectedClaimForApproval.claimed_amount?.toString() || '');
                    } else if (e.target.value === 'Partially-Approved') {
                      setApprovalAmount(selectedClaimForApproval.calculated_fuel_cost?.toString() || '');
                    }
                  }}
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="Approved">Approve (Full Amount)</option>
                  <option value="Partially-Approved">Partially Approve (Custom Amount)</option>
                  <option value="Rejected">Reject</option>
                </select>
              </div>

              {approvalAction === 'Partially-Approved' && (
                <div>
                  <Label>Approved Amount (₹)</Label>
                  <Input
                    type="number"
                    value={approvalAmount}
                    onChange={(e) => setApprovalAmount(e.target.value)}
                    placeholder="Enter approved amount"
                  />
                </div>
              )}

              <div>
                <Label>Notes (Optional)</Label>
                <textarea
                  value={approvalNotes}
                  onChange={(e) => setApprovalNotes(e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm"
                  placeholder="Add any notes about this decision..."
                  rows="3"
                />
              </div>

              <div className="flex gap-2 pt-4">
                <Button
                  onClick={handleApproveClaim}
                  disabled={approvingClaim}
                  className="flex-1 bg-green-600 hover:bg-green-700"
                >
                  {approvingClaim ? 'Processing...' : 'Confirm'}
                </Button>
                <Button
                  onClick={() => setApprovalDialogOpen(false)}
                  variant="outline"
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
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

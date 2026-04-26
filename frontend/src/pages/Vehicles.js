import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, Loader,Pen, Trash2, Camera, Fuel, Gauge, TrendingUp, DollarSign, Clock, CheckCircle, LogOut, AlertCircle, X, Search } from 'lucide-react';
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
    own_vehicle_type: '',
    own_vehicle_milage: '',
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
  const [claimEmployeeFilter, setClaimEmployeeFilter] = useState('');
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
  const [usageStatusFilter, setUsageStatusFilter] = useState('All');
  const [usageEmployeeFilter, setUsageEmployeeFilter] = useState('All');
  const [usageSearch, setUsageSearch] = useState('');
  const [claimStatusFilter, setClaimStatusFilter] = useState('All');
  const [claimSearch, setClaimSearch] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(false);

  const MAX_METER_IMAGE_BYTES = 900 * 1024; // keep below common proxy 1MB limits

  const fileToDataUrl = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const compressImageFile = async (file, maxBytes = MAX_METER_IMAGE_BYTES) => {
    // Non-image files are not expected here, but keep a guard anyway.
    if (!file?.type?.startsWith('image/')) return file;
    if (file.size <= maxBytes) return file;

    const dataUrl = await fileToDataUrl(file);
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = dataUrl;
    });

    // Resize very large photos first to reduce payload drastically.
    const maxDim = 1600;
    const ratio = Math.min(1, maxDim / Math.max(img.width, img.height));
    const width = Math.max(1, Math.round(img.width * ratio));
    const height = Math.max(1, Math.round(img.height * ratio));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, width, height);

    // Iterate quality until below target.
    let quality = 0.9;
    let blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    while (blob && blob.size > maxBytes && quality > 0.4) {
      quality -= 0.1;
      blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    }

    if (!blob) return file;
    return new File([blob], `${Date.now()}_meter.jpg`, { type: 'image/jpeg' });
  };

  const uploadMeterPhotoWithRetry = async (usageId, file, phase = 'end') => {
    const upload = async (f) => {
      const formData = new FormData();
      formData.append('file', f);
      const endpoint =
        phase === 'start'
          ? `${API}/vehicle-usage/${usageId}/upload-start-photo`
          : `${API}/vehicle-usage/${usageId}/upload-end-photo`;
      return axios.post(endpoint, formData, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
    };

    try {
      return await upload(file);
    } catch (error) {
      // If payload is still too large, aggressively recompress and retry once.
      if (error?.response?.status === 413) {
        const tiny = await compressImageFile(file, 450 * 1024);
        return upload(tiny);
      }
      throw error;
    }
  };

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

  const handlePhotoCapture = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const normalized = await compressImageFile(file);
      setStartPhotoFile(normalized);
      const preview = await fileToDataUrl(normalized);
      setStartPhotoPreview(preview);
      if (normalized.size < file.size) {
        toast.success('Photo optimized for upload');
      } else {
        toast.success('Photo captured successfully');
      }
    } catch {
      toast.error('Could not process image. Please try again.');
    }
  };

  const handleEndPhotoCapture = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const normalized = await compressImageFile(file);
      setEndPhotoFile(normalized);
      const preview = await fileToDataUrl(normalized);
      setEndPhotoPreview(preview);
      if (normalized.size < file.size) {
        toast.success('Photo optimized for upload');
      } else {
        toast.success('Photo captured successfully');
      }
    } catch {
      toast.error('Could not process image. Please try again.');
    }
  };

  const handleStartUsage = async () => {
    // Check if using company vehicle or own vehicle
    const isOwnVehicle = !startUsageData.vehicle_id;
    
    if (isOwnVehicle) {
      // Own vehicle case
      if (!startUsageData.own_vehicle_type || !startUsageData.own_vehicle_milage) {
        toast.error('For own vehicle, please select type and enter mileage');
        return;
      }
    } else {
      // Company vehicle case
      if (!startUsageData.vehicle_id) {
        toast.error('Please select a vehicle');
        return;
      }
    }
    
    if (!startUsageData.start_meter_reading) {
      toast.error('Please enter starting meter reading');
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
      const payload = {
        vehicle_id: startUsageData.vehicle_id || null,
        employee_id: startUsageData.employee_id,
        employee_name: startUsageData.employee_name,
        start_meter_reading: parseFloat(startUsageData.start_meter_reading),
        notes: startUsageData.notes
      };
      
      // Add own vehicle fields if using own vehicle
      if (startUsageData.own_vehicle_type) {
        payload.own_vehicle_type = startUsageData.own_vehicle_type;
        payload.own_vehicle_milage = parseFloat(startUsageData.own_vehicle_milage);
      }
      
      const response = await axios.post(
        `${API}/vehicle-usage`,
        payload,
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );

      // Upload photo
      await uploadMeterPhotoWithRetry(response.data.id, startPhotoFile, 'start');

      toast.success('Journey started with photo');
      setStartUsageDialogOpen(false);
      setStartPhotoFile(null);
      setStartPhotoPreview(null);
      setStartUsageData({ 
        vehicle_id: '', 
        employee_id: user?.employee_id || user?.id || '',
        employee_name: user?.name || '',
        start_meter_reading: '',
        own_vehicle_type: '',
        own_vehicle_milage: '',
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
    const startReading = Number(activeUsage?.start_meter_reading || 0);
    const endReading = Number(completeUsageData.end_meter_reading || 0);
    if (Number.isFinite(startReading) && Number.isFinite(endReading) && endReading < startReading) {
      toast.error('Ending meter reading cannot be less than starting reading');
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
      await uploadMeterPhotoWithRetry(activeUsage.id, endPhotoFile, 'end');

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
      if (error?.response?.status === 413) {
        toast.error('Photo is still too large after optimization. Please retake from slightly farther distance.');
      } else {
        toast.error(error.response?.data?.detail || 'Failed to complete usage');
      }
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
  const normalize = (value) => String(value || '').toLowerCase();
  const getVehicleName = (vehicleId) => {
    const vehicle = vehicles.find(v => v.id === vehicleId);
    return vehicle?.vehicle_name || 'Unknown Vehicle';
  };

  const uniqueUsageEmployees = Array.from(
    new Set(usageRecords.map((u) => u.employee_name).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));

  const filteredUsageRecords = usageRecords.filter((usage) => {
    if (usageStatusFilter !== 'All' && usage.status !== usageStatusFilter) return false;
    if (usageEmployeeFilter !== 'All' && usage.employee_name !== usageEmployeeFilter) return false;
    if (usageSearch.trim()) {
      const q = normalize(usageSearch.trim());
      const vehicleName = usage.own_vehicle_type ? `own ${usage.own_vehicle_type}` : getVehicleName(usage.vehicle_id);
      const hay = `${vehicleName} ${usage.employee_name} ${usage.status} ${usage.start_meter_reading} ${usage.end_meter_reading || ''}`;
      if (!normalize(hay).includes(q)) return false;
    }
    return true;
  });

  const usageDistanceTotal = filteredUsageRecords.reduce((sum, u) => sum + Number(u.km_driven || 0), 0);
  const usageFuelTotal = filteredUsageRecords.reduce((sum, u) => sum + Number(u.fuel_consumed || 0), 0);

  const filteredClaims = fuelClaims.filter((claim) => {
    if (claimEmployeeFilter && claim.employee_name !== claimEmployeeFilter) return false;
    if (claimStatusFilter !== 'All' && claim.claim_status !== claimStatusFilter) return false;
    if (claimSearch.trim()) {
      const q = normalize(claimSearch.trim());
      const hay = `${claim.employee_name} ${claim.vehicle_name} ${claim.claim_status} ${claim.claim_type} ${claim.claimed_amount}`;
      if (!normalize(hay).includes(q)) return false;
    }
    return true;
  });

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
          <h1 className="text-3xl font-bold text-gray-900">Vehicle Management</h1>
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
              <Card key={vehicle.id} className="p-4 space-y-3 bg-white text-gray-900">
                {vehicle.photo_path && (
                  <img src={vehicle.photo_path} alt={vehicle.vehicle_name} className="w-full h-32 object-cover rounded"/>
                )}
                <h3 className="font-bold text-lg text-gray-900">{vehicle.vehicle_name}</h3>
                <div className="space-y-1 text-sm text-gray-900">
                  <p><span className="text-gray-700 font-medium">Type:</span> <span className="text-gray-900">{vehicle.vehicle_type}</span></p>
                  <p><span className="text-gray-700 font-medium">Fuel:</span> <span className="text-gray-900">{vehicle.fuel_type}</span></p>
                  <p><span className="text-gray-700 font-medium">Reg:</span> <span className="text-gray-900">{vehicle.registration_number}</span></p>
                  <p><span className="text-gray-700 font-medium">Mileage:</span> <span className="text-gray-900">{vehicle.milage} km/L</span></p>
                  <p><span className="text-gray-700 font-medium">Status:</span> <span className={`px-2 py-1 rounded text-xs ${vehicle.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{vehicle.status}</span></p>
                </div>
                <Button onClick={() => setSelectedVehicleForPhoto(vehicle.id)} size="sm" className="w-full bg-gray-500 hover:bg-gray-600 text-white">
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
                  {/* Vehicle Selection - Toggle between Company and Own Vehicle */}
                  <div className="space-y-3">
                    <Label className="text-sm font-semibold text-gray-700">Vehicle Type *</Label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setStartUsageData({ ...startUsageData, vehicle_id: '', own_vehicle_type: '', own_vehicle_milage: '' });
                          setConfirmedPreviousUsage(false);
                          setPreviousVehicleUsage(null);
                        }}
                        className={`flex-1 py-2 px-4 rounded-lg border-2 font-medium transition ${
                          !startUsageData.own_vehicle_type
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                        }`}
                      >
                        🚗 Company Vehicle
                      </button>
                      <button
                        onClick={() => setStartUsageData({ ...startUsageData, vehicle_id: '', own_vehicle_type: 'Car' })}
                        className={`flex-1 py-2 px-4 rounded-lg border-2 font-medium transition ${
                          startUsageData.own_vehicle_type
                            ? 'border-orange-500 bg-orange-50 text-orange-700'
                            : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                        }`}
                      >
                        🏍️ Own Vehicle
                      </button>
                    </div>
                  </div>

                  {/* Company Vehicle Selection */}
                  {!startUsageData.own_vehicle_type && (
                    <div className="space-y-3">
                      <Label className="text-sm font-semibold text-gray-700">Select Company Vehicle *</Label>
                      <select
                        value={startUsageData.vehicle_id}
                        onChange={e => handleVehicleSelection(e.target.value)}
                        className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                      >
                        <option value="">Choose vehicle</option>
                        {vehicles.map(v => <option key={v.id} value={v.id}>{v.vehicle_name}</option>)}
                      </select>
                    </div>
                  )}

                  {/* Own Vehicle Selection */}
                  {startUsageData.own_vehicle_type && (
                    <>
                      <div className="space-y-3">
                        <Label className="text-sm font-semibold text-gray-700">Vehicle Type *</Label>
                        <select
                          value={startUsageData.own_vehicle_type}
                          onChange={e => setStartUsageData({ ...startUsageData, own_vehicle_type: e.target.value })}
                          className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                        >
                          <option value="Car">Car</option>
                          <option value="Bike">Bike/Motorcycle</option>
                          <option value="Van">Van</option>
                          <option value="Truck">Truck</option>
                          <option value="Auto">Auto/Tuk-Tuk</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>
                      <div className="space-y-3">
                        <Label className="text-sm font-semibold text-gray-700">Mileage (km/L) *</Label>
                        <Input
                          type="number"
                          step="0.1"
                          min="0.1"
                          max="100"
                          value={startUsageData.own_vehicle_milage}
                          onChange={e => setStartUsageData({ ...startUsageData, own_vehicle_milage: e.target.value })}
                          placeholder="e.g., 12.5"
                          className="h-11 border border-gray-300 rounded-lg px-4 text-gray-900"
                        />
                        <p className="text-xs text-gray-500">How many kilometers per liter does your vehicle run?</p>
                      </div>
                    </>
                  )}

                  {/* Meter Reading */}
                  <div className="space-y-3">
                    <Label className="text-sm font-semibold text-gray-700">Start Meter Reading (km) *</Label>
                    <Input
                      type="number"
                      value={startUsageData.start_meter_reading}
                      onChange={e => setStartUsageData({ ...startUsageData, start_meter_reading: e.target.value })}
                      placeholder="e.g., 45000"
                      className="h-11 border border-gray-300 rounded-lg px-4 text-gray-900"
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
                        own_vehicle_type: '',
                        own_vehicle_milage: '',
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
              <DialogContent className="max-w-lg bg-white rounded-lg border border-gray-200 shadow-xl">
                <div className="bg-blue-600 text-white p-6 rounded-t-lg -m-6 mb-6">
                  <DialogHeader>
                    <DialogTitle className="text-xl font-bold text-white flex items-center gap-2">
                      <AlertCircle className="h-5 w-5" />
                      Vehicle Previously Used
                    </DialogTitle>
                    <p className="text-blue-100 text-sm mt-2">This vehicle was last used by another employee. Please confirm details.</p>
                  </DialogHeader>
                </div>
                {previousVehicleUsage && (
                  <div className="space-y-6 p-6">
                    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
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
                          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
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
                    {activeUsage?.start_meter_reading && completeUsageData.end_meter_reading && (
                      <p className={`text-xs ${Number(completeUsageData.end_meter_reading) >= Number(activeUsage.start_meter_reading) ? 'text-green-700' : 'text-red-700'}`}>
                        Estimated distance:{' '}
                        {Math.max(0, Number(completeUsageData.end_meter_reading || 0) - Number(activeUsage.start_meter_reading || 0)).toFixed(1)} km
                      </p>
                    )}
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
            <h3 className="text-lg font-semibold text-gray-900">Journey History</h3>
            <Card className="p-4 border border-gray-200 bg-white">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="relative md:col-span-2">
                  <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <Input
                    value={usageSearch}
                    onChange={(e) => setUsageSearch(e.target.value)}
                    placeholder="Search by vehicle, employee, status, reading..."
                    className="pl-9"
                  />
                </div>
                <select
                  value={usageStatusFilter}
                  onChange={(e) => setUsageStatusFilter(e.target.value)}
                  className="h-10 rounded-md border border-gray-300 px-3 text-sm bg-white text-gray-900"
                >
                  <option value="All">All status</option>
                  <option value="Active">Active</option>
                  <option value="Completed">Completed</option>
                </select>
                <select
                  value={usageEmployeeFilter}
                  onChange={(e) => setUsageEmployeeFilter(e.target.value)}
                  className="h-10 rounded-md border border-gray-300 px-3 text-sm bg-white text-gray-900"
                >
                  <option value="All">All employees</option>
                  {uniqueUsageEmployees.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>
              <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-600">
                <span>Rows: <strong className="text-gray-900">{filteredUsageRecords.length}</strong></span>
                <span>Total distance: <strong className="text-gray-900">{usageDistanceTotal.toFixed(1)} km</strong></span>
                <span>Total fuel: <strong className="text-gray-900">{usageFuelTotal.toFixed(2)} L</strong></span>
              </div>
            </Card>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-gray-200 bg-gray-50">
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Vehicle</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Employee</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Status</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Start (km)</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">End (km)</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Distance (km)</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Fuel (L)</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Started</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsageRecords.map(usage => (
                    <tr key={usage.id} className="border-b border-gray-100 hover:bg-gray-50 transition">
                      <td className="px-4 py-3 font-medium text-gray-900">{usage.own_vehicle_type ? `Own ${usage.own_vehicle_type}` : getVehicleName(usage.vehicle_id)}</td>
                      <td className="px-4 py-3 text-gray-700">{usage.employee_name}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${usage.status === 'Active' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>
                          {usage.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-900 font-medium">{usage.start_meter_reading}</td>
                      <td className="px-4 py-3 text-right text-gray-900 font-medium">{usage.end_meter_reading || '-'}</td>
                      <td className="px-4 py-3 text-right text-green-600 font-medium">{usage.km_driven ? usage.km_driven.toFixed(1) : '-'}</td>
                      <td className="px-4 py-3 text-right text-blue-600 font-medium">{usage.fuel_consumed ? usage.fuel_consumed.toFixed(2) : '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{formatDateTime(usage.start_date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredUsageRecords.length === 0 && <p className="text-center text-gray-500 py-8">No journeys found for selected filters</p>}
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
            <DialogContent className="max-w-lg bg-white rounded-lg border border-gray-200 shadow-xl text-gray-900">
              <DialogHeader>
                <DialogTitle className="text-gray-900">Create Fuel Claim</DialogTitle>
                <DialogDescription className="text-gray-600">Claim fuel expenses for completed journeys</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label className="text-gray-900">Journey *</Label>
                  <select
                    value={claimData.vehicle_usage_id}
                    onChange={e => setClaimData({ ...claimData, vehicle_usage_id: e.target.value })}
                    className="w-full border rounded px-3 py-2 text-gray-900 bg-white"
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
                  <Label className="text-gray-900">Price Per Liter (₹)</Label>
                  <Input
                    type="number"
                    value={claimData.price_per_liter}
                    onChange={e => setClaimData({ ...claimData, price_per_liter: e.target.value })}
                    step="0.5"
                  />
                </div>
                <div>
                  <Label className="text-gray-900">Claimed Amount (₹) *</Label>
                  <Input
                    type="number"
                    value={claimData.claimed_amount}
                    onChange={e => setClaimData({ ...claimData, claimed_amount: e.target.value })}
                    placeholder="e.g., 500"
                  />
                </div>
                <Button onClick={handleCreateClaim} disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                  {loading ? 'Creating...' : 'Create Claim'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {user?.role === 'Admin' && (
            <div className="mb-4 flex items-center gap-4 bg-gray-50 p-4 rounded-lg border border-gray-200">
              <Label className="text-gray-900 font-semibold">Filter by Employee:</Label>
              <select
                value={claimEmployeeFilter}
                onChange={e => setClaimEmployeeFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-blue-500"
              >
                <option value="">All Employees</option>
                {Array.from(new Set(fuelClaims.map(c => c.employee_name))).sort().map(empName => (
                  <option key={empName} value={empName}>{empName}</option>
                ))}
              </select>
            </div>
          )}
          <Card className="p-4 border border-gray-200 bg-white">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <Input
                  value={claimSearch}
                  onChange={(e) => setClaimSearch(e.target.value)}
                  placeholder="Search employee, vehicle, type..."
                  className="pl-9"
                />
              </div>
              <select
                value={claimStatusFilter}
                onChange={(e) => setClaimStatusFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-blue-500"
              >
                <option value="All">All status</option>
                <option value="Pending">Pending</option>
                <option value="Approved">Approved</option>
                <option value="Partially-Approved">Partially-Approved</option>
                <option value="Rejected">Rejected</option>
              </select>
              <div className="flex items-center text-sm text-gray-600">
                Showing <span className="mx-1 font-semibold text-gray-900">{filteredClaims.length}</span> claims
              </div>
            </div>
          </Card>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-gray-200 bg-gray-50">
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Employee</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Vehicle</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">KM</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Fuel (L)</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Expected (₹)</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Claimed (₹)</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Difference (₹)</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Type</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Status</th>
                  {fuelClaims.some(c => c.approved_amount) && (
                    <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Approved (₹)</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {filteredClaims.map(claim => (
                  <tr 
                    key={claim.id} 
                    className="border-b border-gray-100 hover:bg-gray-50 transition cursor-pointer"
                    onClick={() => setSelectedClaim(claim)}
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">{claim.employee_name || 'Unknown'}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{claim.vehicle_name}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{claim.km_driven}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{claim.fuel_consumed?.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right text-gray-900">
                      <span className="inline-block px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm font-semibold">
                        ₹{claim.calculated_fuel_cost?.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-900">
                      <span className="inline-block px-2 py-1 bg-orange-100 text-orange-800 rounded text-sm font-semibold">
                        ₹{claim.claimed_amount}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-900">
                      <span className={`inline-block px-2 py-1 rounded text-sm font-semibold ${
                        (claim.difference || 0) > 0 ? 'bg-red-100 text-red-800' : 
                        (claim.difference || 0) < 0 ? 'bg-blue-100 text-blue-800' :
                        'bg-green-100 text-green-800'
                      }`}>
                        {(claim.difference || 0) > 0 ? '+₹' : (claim.difference || 0) < 0 ? '-₹' : '₹'}{Math.abs(claim.difference || 0).toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block text-xs px-2 py-1 rounded font-medium ${
                        claim.claim_type === 'Over-Claimed' ? 'bg-red-100 text-red-800' :
                        claim.claim_type === 'Under-Claimed' ? 'bg-blue-100 text-blue-800' :
                        'bg-green-100 text-green-800'
                      }`}>
                        {claim.claim_type || 'Exact'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs px-2 py-1 rounded font-medium ${getClaimStatusBadge(claim.claim_status)}`}>
                        {claim.claim_status}
                      </span>
                    </td>
                    {fuelClaims.some(c => c.approved_amount) && (
                      <td className="px-4 py-3 text-right text-gray-900">
                        {claim.approved_amount ? (
                          <span className="inline-block px-2 py-1 bg-green-100 text-green-800 rounded text-sm font-semibold">
                            ₹{claim.approved_amount}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredClaims.length === 0 && <p className="text-center text-gray-500 py-8">No claims found for selected filters</p>}
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
                          <div className="bg-gray-50 border border-gray-200 rounded p-2">
                            <span className="font-semibold text-gray-800">! Under Claim</span>
                            <p className="text-gray-700">Claimed more than 10% low</p>
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
                                      underClaim ? 'bg-gray-100 text-gray-800' :
                                      'bg-green-100 text-green-800'
                                    }`}>
                                      ₹{claimed.toLocaleString()}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    <span className={`inline-block px-3 py-1 rounded text-sm font-semibold whitespace-nowrap ${
                                      overClaim ? 'bg-red-100 text-red-800' :
                                      underClaim ? 'bg-gray-100 text-gray-800' :
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
          <DialogContent className="max-w-lg bg-white rounded-lg border border-gray-200 shadow-xl text-gray-900">
            <DialogHeader>
              <DialogTitle className="text-gray-900">Approve Fuel Claim</DialogTitle>
              <DialogDescription className="text-gray-600">Review and approve the fuel expense claim</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="bg-gray-50 border rounded-lg p-4 space-y-2 text-sm text-gray-900">
                <div className="flex justify-between">
                  <span className="text-gray-700 font-medium">Employee:</span>
                  <span className="font-semibold text-gray-900">{selectedClaimForApproval.employee_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-700 font-medium">Vehicle:</span>
                  <span className="font-semibold text-gray-900">{selectedClaimForApproval.vehicle_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-700 font-medium">Fuel Consumed:</span>
                  <span className="font-semibold text-gray-900">{selectedClaimForApproval.fuel_consumed?.toFixed(2)} L</span>
                </div>
                <div className="border-t pt-2 flex justify-between">
                  <span className="text-gray-700 font-medium">Should Cost (Calculated):</span>
                  <span className="font-bold text-blue-600">₹{selectedClaimForApproval.calculated_fuel_cost?.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-700 font-medium">Claimed Amount:</span>
                  <span className="font-bold text-orange-600">₹{selectedClaimForApproval.claimed_amount?.toLocaleString()}</span>
                </div>
                <div className="flex justify-between pt-2 border-t">
                  <span className="text-gray-700 font-medium">Difference:</span>
                  <span className={`font-bold ${selectedClaimForApproval.difference > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {selectedClaimForApproval.difference > 0 ? '+' : ''} ₹{selectedClaimForApproval.difference?.toLocaleString()}
                  </span>
                </div>
              </div>

              <div>
                <Label className="text-gray-900">Approval Action</Label>
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
                  className="w-full border rounded px-3 py-2 text-gray-900 bg-white"
                >
                  <option value="Approved">Approve (Full Amount)</option>
                  <option value="Partially-Approved">Partially Approve (Custom Amount)</option>
                  <option value="Rejected">Reject</option>
                </select>
              </div>

              {approvalAction === 'Partially-Approved' && (
                <div>
                  <Label className="text-gray-900">Approved Amount (₹)</Label>
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
    <DialogContent className="max-w-lg bg-white rounded-lg border border-gray-200 shadow-xl text-gray-900">
      <DialogHeader>
        <DialogTitle className="text-gray-900">Create New Vehicle</DialogTitle>
        <DialogDescription className="text-gray-600">Add a new company vehicle</DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div>
          <Label className="text-gray-900">Vehicle Name *</Label>
          <Input
            value={newVehicle.vehicle_name}
            onChange={e => setNewVehicle({ ...newVehicle, vehicle_name: e.target.value })}
            placeholder="e.g., Toyota Innova"
          />
        </div>
        <div>
          <Label className="text-gray-900">Vehicle Type *</Label>
          <select
            value={newVehicle.vehicle_type}
            onChange={e => setNewVehicle({ ...newVehicle, vehicle_type: e.target.value })}
            className="w-full border rounded px-3 py-2 text-gray-900 bg-white"
          >
            <option>Car</option>
            <option>Bike</option>
            <option>Truck</option>
            <option>Van</option>
          </select>
        </div>
        <div>
          <Label className="text-gray-900">Fuel Type *</Label>
          <select
            value={newVehicle.fuel_type}
            onChange={e => setNewVehicle({ ...newVehicle, fuel_type: e.target.value })}
            className="w-full border rounded px-3 py-2 text-gray-900 bg-white"
          >
            <option>Petrol</option>
            <option>Diesel</option>
            <option>Electric</option>
          </select>
        </div>
        <div>
          <Label className="text-gray-900">Registration Number *</Label>
          <Input
            value={newVehicle.registration_number}
            onChange={e => setNewVehicle({ ...newVehicle, registration_number: e.target.value })}
            placeholder="e.g., MH-01-AB-1234"
          />
        </div>
        <div>
          <Label className="text-gray-900">Mileage (km/liter) *</Label>
          <Input
            type="number"
            value={newVehicle.milage}
            onChange={e => setNewVehicle({ ...newVehicle, milage: e.target.value })}
            placeholder="e.g., 12.5"
            step="0.1"
          />
        </div>
        <Button onClick={onSubmit} disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700">
          {loading ? 'Creating...' : 'Create'}
        </Button>
      </div>
    </DialogContent>
  </Dialog>
);

const VehiclePhotoDialog = ({ open, onOpenChange, vehiclePhotoFile, setVehiclePhotoFile, onUpload, loading }) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-lg bg-white rounded-lg border border-gray-200 shadow-xl text-gray-900">
      <DialogHeader>
        <DialogTitle className="text-gray-900">Upload Vehicle Photo</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <Input type="file" accept="image/*" onChange={e => setVehiclePhotoFile(e.target.files?.[0] || null)} />
        <Button onClick={onUpload} disabled={!vehiclePhotoFile || loading} className="w-full bg-blue-600 hover:bg-blue-700">
          {loading ? 'Uploading...' : 'Upload'}
        </Button>
      </div>
    </DialogContent>
  </Dialog>
);

export default Vehicles;

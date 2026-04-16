import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, Search, Mail, Phone } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;
const EMPTY_FORM = {
  customer_id: '',
  customer_name: '',
  location: '',
  contact_person: '',
  equipment_name: '',
  flowmeter_details: '',
  product_code: '',
  model_no: '',
  system_mobile_number: '',
  person_mobile_number: '',
  email_id: '',
  date_of_commissioning: '',
  url_link: '',
  user_id: '',
  password: '',
  status: 'Active',
  renewal_date: '',
  review: '',
  remarks: ''
};
const FILTER_FIELDS = [
  'customer_name',
  'location',
  'contact_person',
  'equipment_name',
  'flowmeter_details',
  'product_code',
  'model_no',
  'system_mobile_number',
  'person_mobile_number',
  'email_id',
  'date_of_commissioning',
  'url_link',
  'user_id',
  'password',
  'status',
  'renewal_date',
  'review',
  'calibration_certificate',
  'remarks'
];

const CGWFlowMetre = () => {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [filteredItems, setFilteredItems] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [inlineEditId, setInlineEditId] = useState(null);
  const [inlineEditData, setInlineEditData] = useState(EMPTY_FORM);
  const [columnFilters, setColumnFilters] = useState(
    FILTER_FIELDS.reduce((acc, key) => ({ ...acc, [key]: '' }), {})
  );

  useEffect(() => {
    fetchCustomers();
    fetchItems();
  }, []);

  useEffect(() => {
    const term = searchTerm.trim().toLowerCase();
    const filtered = items.filter(item => {
      const matchesGlobal =
        !term ||
        item.customer_name?.toLowerCase().includes(term) ||
        item.equipment_name?.toLowerCase().includes(term) ||
        item.location?.toLowerCase().includes(term) ||
        item.inventory_id?.toLowerCase().includes(term) ||
        item.product_code?.toLowerCase().includes(term) ||
        item.model_no?.toLowerCase().includes(term);

      const matchesColumns = Object.entries(columnFilters).every(([key, value]) => {
        const filterValue = value.trim().toLowerCase();
        if (!filterValue) return true;
        return String(item[key] ?? '').toLowerCase().includes(filterValue);
      });

      return matchesGlobal && matchesColumns;
    });
    setFilteredItems(filtered);
  }, [searchTerm, columnFilters, items]);

  const fetchCustomers = async () => {
    try {
      const response = await axios.get(`${API}/customers`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setCustomers(response.data);
    } catch (error) {
      console.error('Error fetching customers:', error);
    }
  };

  const fetchItems = async () => {
    try {
      const response = await axios.get(`${API}/cgw-flow-metres`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setItems(response.data);
      setFilteredItems(response.data);
    } catch (error) {
      toast.error('Failed to load inventory items');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/cgw-flow-metres`, formData, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      toast.success('Inventory item added successfully');
      setDialogOpen(false);
      resetForm();
      fetchItems();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Operation failed');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this item?')) return;
    try {
      await axios.delete(`${API}/cgw-flow-metres/${id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      toast.success('Inventory item deleted successfully');
      fetchItems();
    } catch (error) {
      toast.error('Failed to delete item');
    }
  };

  const handleEdit = (item) => {
    setInlineEditId(item.id);
    setInlineEditData({
      customer_id: item.customer_id,
      customer_name: item.customer_name,
      location: item.location || '',
      contact_person: item.contact_person || '',
      equipment_name: item.equipment_name || '',
      flowmeter_details: item.flowmeter_details || '',
      product_code: item.product_code || '',
      model_no: item.model_no || '',
      system_mobile_number: item.system_mobile_number || '',
      person_mobile_number: item.person_mobile_number || '',
      email_id: item.email_id || '',
      date_of_commissioning: item.date_of_commissioning || '',
      url_link: item.url_link || '',
      user_id: item.user_id || '',
      password: item.password || '',
      status: item.status,
      renewal_date: item.renewal_date || '',
      review: item.review || '',
      remarks: item.remarks || ''
    });
  };

  const handleInlineChange = (field, value) => {
    setInlineEditData(prev => ({ ...prev, [field]: value }));
  };

  const handleInlineSave = async (id) => {
    try {
      await axios.put(`${API}/cgw-flow-metres/${id}`, inlineEditData, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      toast.success('Inventory item updated successfully');
      setInlineEditId(null);
      setInlineEditData(EMPTY_FORM);
      fetchItems();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Update failed');
    }
  };

  const handleInlineCancel = () => {
    setInlineEditId(null);
    setInlineEditData(EMPTY_FORM);
  };

  const resetForm = () => {
    setFormData(EMPTY_FORM);
  };

  const handleCustomerChange = (e) => {
    const selectedCustomer = customers.find(c => c.id === e.target.value);
    if (selectedCustomer) {
      setFormData({
        ...formData,
        customer_id: selectedCustomer.id,
        customer_name: selectedCustomer.company_name
      });
    }
  };

  const canManage = ['Admin', 'HR'].includes(user?.role);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="cgw-flow-metre-page">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <Input
              placeholder="Search across all columns..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 border border-gray-300 h-9 rounded-md text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            />
          </div>
        </div>
        {canManage && (
          <div className="flex gap-2 shrink-0">
            <Dialog open={dialogOpen} onOpenChange={(open) => {
              setDialogOpen(open);
              if (!open) resetForm();
            }}>
              <DialogTrigger asChild>
                <Button className="bg-blue-600 text-white hover:bg-blue-700" data-testid="add-item-button">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Flow Metre
                </Button>
              </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-white rounded-lg border border-gray-200 shadow-xl p-0">
              <div className="bg-blue-600 text-white p-6 rounded-t-lg">
                <DialogHeader>
                  <DialogTitle className="text-xl font-bold text-white">Add New Flow Metre</DialogTitle>
                  <p className="text-blue-100 text-sm mt-1">
                    Create a new inventory item
                  </p>
                </DialogHeader>
              </div>
              <form onSubmit={handleSubmit} className="space-y-6 p-6">
                {/* Customer Selection */}
                <div className="space-y-2">
                  <Label htmlFor="customer_id" className="text-sm font-medium text-gray-700">Select Customer *</Label>
                  <select
                    id="customer_id"
                    value={formData.customer_id}
                    onChange={handleCustomerChange}
                    required
                    className="w-full border border-gray-300 rounded-lg px-3 h-11 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                  >
                    <option value="">Choose a customer...</option>
                    {customers.map(customer => (
                      <option key={customer.id} value={customer.id}>
                        {customer.company_name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Two Column Layout */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="location" className="text-sm font-medium text-gray-700">Location</Label>
                    <Input
                      id="location"
                      value={formData.location}
                      onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                      className="border border-gray-300 h-11 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contact_person" className="text-sm font-medium text-gray-700">Contact Person</Label>
                    <Input
                      id="contact_person"
                      value={formData.contact_person}
                      onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
                      className="border border-gray-300 h-11 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="equipment_name" className="text-sm font-medium text-gray-700">Equipment Name</Label>
                    <Input
                      id="equipment_name"
                      value={formData.equipment_name}
                      onChange={(e) => setFormData({ ...formData, equipment_name: e.target.value })}
                      className="border border-gray-300 h-11 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="system_mobile_number" className="text-sm font-medium text-gray-700">System Mobile</Label>
                    <Input
                      id="system_mobile_number"
                      value={formData.system_mobile_number}
                      onChange={(e) => setFormData({ ...formData, system_mobile_number: e.target.value })}
                      className="border border-gray-300 h-11 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="person_mobile_number" className="text-sm font-medium text-gray-700">Person Mobile</Label>
                    <Input
                      id="person_mobile_number"
                      value={formData.person_mobile_number}
                      onChange={(e) => setFormData({ ...formData, person_mobile_number: e.target.value })}
                      className="border border-gray-300 h-11 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email_id" className="text-sm font-medium text-gray-700">Email</Label>
                    <Input
                      id="email_id"
                      type="email"
                      value={formData.email_id}
                      onChange={(e) => setFormData({ ...formData, email_id: e.target.value })}
                      className="border border-gray-300 h-11 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="date_of_commissioning" className="text-sm font-medium text-gray-700">Date of Commissioning</Label>
                    <Input
                      id="date_of_commissioning"
                      type="date"
                      value={formData.date_of_commissioning}
                      onChange={(e) => setFormData({ ...formData, date_of_commissioning: e.target.value })}
                      className="border border-gray-300 h-11 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="renewal_date" className="text-sm font-medium text-gray-700">Renewal Date</Label>
                    <Input
                      id="renewal_date"
                      type="date"
                      value={formData.renewal_date}
                      onChange={(e) => setFormData({ ...formData, renewal_date: e.target.value })}
                      className="border border-gray-300 h-11 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="user_id" className="text-sm font-medium text-gray-700">User ID</Label>
                    <Input
                      id="user_id"
                      value={formData.user_id}
                      onChange={(e) => setFormData({ ...formData, user_id: e.target.value })}
                      className="border border-gray-300 h-11 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-sm font-medium text-gray-700">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="border border-gray-300 h-11 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="status" className="text-sm font-medium text-gray-700">Status</Label>
                    <select
                      id="status"
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 h-11 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    >
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                      <option value="Maintenance">Maintenance</option>
                    </select>
                  </div>
                </div>

                {/* URL Link */}
                <div className="space-y-2">
                  <Label htmlFor="url_link" className="text-sm font-medium text-gray-700">URL Link</Label>
                  <Input
                    id="url_link"
                    type="url"
                    value={formData.url_link}
                    onChange={(e) => setFormData({ ...formData, url_link: e.target.value })}
                    className="border border-gray-300 h-11 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                  />
                </div>

                {/* Flowmeter Details */}
                <div className="space-y-2">
                  <Label htmlFor="flowmeter_details" className="text-sm font-medium text-gray-700">Flowmeter/Piezometer Details</Label>
                  <textarea
                    id="flowmeter_details"
                    value={formData.flowmeter_details}
                    onChange={(e) => setFormData({ ...formData, flowmeter_details: e.target.value })}
                    rows="3"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                  />
                </div>

                {/* Telemetric System */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="product_code" className="text-sm font-medium text-gray-700">Product Code</Label>
                    <Input
                      id="product_code"
                      value={formData.product_code}
                      onChange={(e) => setFormData({ ...formData, product_code: e.target.value })}
                      className="border border-gray-300 h-11 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="model_no" className="text-sm font-medium text-gray-700">Model No</Label>
                    <Input
                      id="model_no"
                      value={formData.model_no}
                      onChange={(e) => setFormData({ ...formData, model_no: e.target.value })}
                      className="border border-gray-300 h-11 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    />
                  </div>
                </div>

                {/* Review & Remarks */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="review" className="text-sm font-medium text-gray-700">Review</Label>
                    <textarea
                      id="review"
                      value={formData.review}
                      onChange={(e) => setFormData({ ...formData, review: e.target.value })}
                      rows="2"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="remarks" className="text-sm font-medium text-gray-700">Remarks</Label>
                    <textarea
                      id="remarks"
                      value={formData.remarks}
                      onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                      rows="2"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="border-gray-300 text-gray-700 hover:bg-gray-50">
                    Cancel
                  </Button>
                  <Button type="submit" className="bg-blue-600 text-white hover:bg-blue-700">
                    Add Item
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
          </div>
        )}
      </div>

      {/* Excel-like Grid */}
      {filteredItems.length > 0 ? (
        <Card className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto table-scroll">
            <table className="w-full text-xs min-w-[1900px]">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-100">
                  <th rowSpan="2" className="text-left py-2 px-2 font-semibold text-gray-700 whitespace-nowrap">SL NO</th>
                  <th rowSpan="2" className="text-left py-2 px-2 font-semibold text-gray-700 whitespace-nowrap">CUSTOMER NAME</th>
                  <th rowSpan="2" className="text-left py-2 px-2 font-semibold text-gray-700 whitespace-nowrap">LOCATION</th>
                  <th rowSpan="2" className="text-left py-2 px-2 font-semibold text-gray-700 whitespace-nowrap">CONTACT PERSON</th>
                  <th rowSpan="2" className="text-left py-2 px-2 font-semibold text-gray-700 whitespace-nowrap">NAME OF EQUIPMENT</th>
                  <th rowSpan="2" className="text-left py-2 px-2 font-semibold text-gray-700 whitespace-nowrap">FLOWMETER/PIEZOMETER DETAILS</th>
                  <th colSpan="2" className="text-center py-2 px-2 font-semibold text-gray-700 whitespace-nowrap">TELEMETRIC SYSTEM</th>
                  <th rowSpan="2" className="text-left py-2 px-2 font-semibold text-gray-700 whitespace-nowrap">SYSTEM MOBILE NUMBER</th>
                  <th rowSpan="2" className="text-left py-2 px-2 font-semibold text-gray-700 whitespace-nowrap">PERSON MOBILE NUMBER</th>
                  <th rowSpan="2" className="text-left py-2 px-2 font-semibold text-gray-700 whitespace-nowrap">EMAIL ID</th>
                  <th rowSpan="2" className="text-left py-2 px-2 font-semibold text-gray-700 whitespace-nowrap">DATE OF COMMISSONING</th>
                  <th rowSpan="2" className="text-left py-2 px-2 font-semibold text-gray-700 whitespace-nowrap">URL LINK</th>
                  <th rowSpan="2" className="text-left py-2 px-2 font-semibold text-gray-700 whitespace-nowrap">USER ID</th>
                  <th rowSpan="2" className="text-left py-2 px-2 font-semibold text-gray-700 whitespace-nowrap">PASSWORD</th>
                  <th rowSpan="2" className="text-left py-2 px-2 font-semibold text-gray-700 whitespace-nowrap">STATUS</th>
                  <th rowSpan="2" className="text-left py-2 px-2 font-semibold text-gray-700 whitespace-nowrap">RENEWAL DATE WILL BE</th>
                  <th rowSpan="2" className="text-left py-2 px-2 font-semibold text-gray-700 whitespace-nowrap">REVIEW</th>
                  <th rowSpan="2" className="text-left py-2 px-2 font-semibold text-gray-700 whitespace-nowrap">CALIBARATION CERTIFICATE</th>
                  <th rowSpan="2" className="text-left py-2 px-2 font-semibold text-gray-700 whitespace-nowrap">REMARKS</th>
                  {canManage && (
                    <th rowSpan="2" className="text-left py-2 px-2 font-semibold text-gray-700 whitespace-nowrap">ACTIONS</th>
                  )}
                </tr>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left py-1.5 px-2 font-semibold text-gray-700 whitespace-nowrap">PRODUCT CODE</th>
                  <th className="text-left py-1.5 px-2 font-semibold text-gray-700 whitespace-nowrap">MODEL NO</th>
                </tr>
                <tr className="border-b border-gray-200 bg-white">
                  <th className="p-1"></th>
                  {[
                    'customer_name','location','contact_person','equipment_name','flowmeter_details','product_code','model_no',
                    'system_mobile_number','person_mobile_number','email_id','date_of_commissioning','url_link','user_id',
                    'password','status','renewal_date','review','calibration_certificate','remarks'
                  ].map((field) => (
                    <th key={field} className="p-1">
                      <Input
                        value={columnFilters[field]}
                        onChange={(e) => setColumnFilters(prev => ({ ...prev, [field]: e.target.value }))}
                        placeholder="Filter"
                        className="h-7 text-[11px] px-2"
                      />
                    </th>
                  ))}
                  {canManage && <th className="p-1"></th>}
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item, index) => (
                  <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50/50 align-top">
                    <td className="py-1.5 px-2 text-gray-900 whitespace-nowrap">{index + 1}</td>
                    <td className="py-1.5 px-2 font-medium text-gray-900 whitespace-nowrap">
                      {inlineEditId === item.id ? (
                        <Input value={inlineEditData.customer_name} onChange={(e) => handleInlineChange('customer_name', e.target.value)} className="h-7 text-[11px] px-2" />
                      ) : (item.customer_name || '—')}
                    </td>
                    <td className="py-1.5 px-2 text-gray-600 whitespace-nowrap">
                      {inlineEditId === item.id ? <Input value={inlineEditData.location} onChange={(e) => handleInlineChange('location', e.target.value)} className="h-7 text-[11px] px-2" /> : (item.location || '—')}
                    </td>
                    <td className="py-1.5 px-2 text-gray-600 whitespace-nowrap">
                      {inlineEditId === item.id ? <Input value={inlineEditData.contact_person} onChange={(e) => handleInlineChange('contact_person', e.target.value)} className="h-7 text-[11px] px-2" /> : (item.contact_person || '—')}
                    </td>
                    <td className="py-1.5 px-2 text-gray-600 whitespace-nowrap">
                      {inlineEditId === item.id ? <Input value={inlineEditData.equipment_name} onChange={(e) => handleInlineChange('equipment_name', e.target.value)} className="h-7 text-[11px] px-2" /> : (item.equipment_name || '—')}
                    </td>
                    <td className="py-1.5 px-2 text-gray-600 min-w-[160px]">
                      {inlineEditId === item.id ? <Input value={inlineEditData.flowmeter_details} onChange={(e) => handleInlineChange('flowmeter_details', e.target.value)} className="h-7 text-[11px] px-2" /> : (item.flowmeter_details || '—')}
                    </td>
                    <td className="py-1.5 px-2 text-gray-600 whitespace-nowrap">
                      {inlineEditId === item.id ? <Input value={inlineEditData.product_code} onChange={(e) => handleInlineChange('product_code', e.target.value)} className="h-7 text-[11px] px-2" /> : (item.product_code || '—')}
                    </td>
                    <td className="py-1.5 px-2 text-gray-600 whitespace-nowrap">
                      {inlineEditId === item.id ? <Input value={inlineEditData.model_no} onChange={(e) => handleInlineChange('model_no', e.target.value)} className="h-7 text-[11px] px-2" /> : (item.model_no || '—')}
                    </td>
                    <td className="py-1.5 px-2 text-gray-600 whitespace-nowrap">
                      {inlineEditId === item.id ? <Input value={inlineEditData.system_mobile_number} onChange={(e) => handleInlineChange('system_mobile_number', e.target.value)} className="h-7 text-[11px] px-2" /> : (item.system_mobile_number || '—')}
                    </td>
                    <td className="py-1.5 px-2 text-gray-600 whitespace-nowrap">
                      {inlineEditId === item.id ? (
                        <Input value={inlineEditData.person_mobile_number} onChange={(e) => handleInlineChange('person_mobile_number', e.target.value)} className="h-7 text-[11px] px-2" />
                      ) : item.person_mobile_number ? (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3 text-gray-400 shrink-0" />
                          {item.person_mobile_number}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="py-1.5 px-2 text-gray-600 min-w-[180px]">
                      {inlineEditId === item.id ? (
                        <Input value={inlineEditData.email_id} onChange={(e) => handleInlineChange('email_id', e.target.value)} className="h-7 text-[11px] px-2" />
                      ) : item.email_id ? (
                        <span className="flex items-center gap-1">
                          <Mail className="h-3 w-3 text-gray-400 shrink-0" />
                          <span>{item.email_id}</span>
                        </span>
                      ) : '—'}
                    </td>
                    <td className="py-1.5 px-2 text-gray-600 whitespace-nowrap">
                      {inlineEditId === item.id ? <Input type="date" value={inlineEditData.date_of_commissioning} onChange={(e) => handleInlineChange('date_of_commissioning', e.target.value)} className="h-7 text-[11px] px-2" /> : (item.date_of_commissioning || '—')}
                    </td>
                    <td className="py-1.5 px-2 text-blue-700 min-w-[140px] break-all">
                      {inlineEditId === item.id ? <Input value={inlineEditData.url_link} onChange={(e) => handleInlineChange('url_link', e.target.value)} className="h-7 text-[11px] px-2" /> : (item.url_link || '—')}
                    </td>
                    <td className="py-1.5 px-2 text-gray-600 whitespace-nowrap">
                      {inlineEditId === item.id ? <Input value={inlineEditData.user_id} onChange={(e) => handleInlineChange('user_id', e.target.value)} className="h-7 text-[11px] px-2" /> : (item.user_id || '—')}
                    </td>
                    <td className="py-1.5 px-2 text-gray-600 whitespace-nowrap">
                      {inlineEditId === item.id ? <Input value={inlineEditData.password} onChange={(e) => handleInlineChange('password', e.target.value)} className="h-7 text-[11px] px-2" /> : (item.password || '—')}
                    </td>
                    <td className="py-1.5 px-2">
                      {inlineEditId === item.id ? (
                        <select
                          value={inlineEditData.status}
                          onChange={(e) => handleInlineChange('status', e.target.value)}
                          className="h-7 text-[11px] px-2 border border-gray-300 rounded w-full"
                        >
                          <option value="Active">Active</option>
                          <option value="Inactive">Inactive</option>
                          <option value="Maintenance">Maintenance</option>
                        </select>
                      ) : (
                        <span className={`inline-flex px-1.5 py-0.5 rounded text-[11px] font-medium whitespace-nowrap ${
                          item.status === 'Active' ? 'bg-green-50 text-green-700' :
                          item.status === 'Maintenance' ? 'bg-yellow-50 text-yellow-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {item.status || '—'}
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 px-2 text-gray-600 whitespace-nowrap">
                      {inlineEditId === item.id ? <Input type="date" value={inlineEditData.renewal_date} onChange={(e) => handleInlineChange('renewal_date', e.target.value)} className="h-7 text-[11px] px-2" /> : (item.renewal_date || '—')}
                    </td>
                    <td className="py-1.5 px-2 text-gray-600 min-w-[160px]">
                      {inlineEditId === item.id ? <Input value={inlineEditData.review} onChange={(e) => handleInlineChange('review', e.target.value)} className="h-7 text-[11px] px-2" /> : (item.review || '—')}
                    </td>
                    <td className="py-1.5 px-2 text-gray-600 min-w-[160px]">{item.calibration_certificate || '—'}</td>
                    <td className="py-1.5 px-2 text-gray-600 min-w-[160px]">
                      {inlineEditId === item.id ? <Input value={inlineEditData.remarks} onChange={(e) => handleInlineChange('remarks', e.target.value)} className="h-7 text-[11px] px-2" /> : (item.remarks || '—')}
                    </td>
                    {canManage && (
                      <td className="py-1.5 px-2">
                        <div className="flex gap-1.5">
                          {inlineEditId === item.id ? (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 border-gray-200 text-xs text-green-700 hover:bg-green-50"
                                onClick={() => handleInlineSave(item.id)}
                              >
                                Save
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 border-gray-200 text-xs text-gray-700 hover:bg-gray-50"
                                onClick={handleInlineCancel}
                              >
                                Cancel
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 border-gray-200 text-xs text-gray-700 hover:bg-gray-50"
                                onClick={() => handleEdit(item)}
                              >
                                <Edit className="h-3 w-3 mr-1" />
                                Edit
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 border-gray-200 text-xs text-red-600 hover:bg-red-50"
                                onClick={() => handleDelete(item.id)}
                              >
                                <Trash2 className="h-3 w-3 mr-1" />
                                Delete
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Card className="p-12 text-center rounded-lg border border-gray-200 bg-white shadow-sm">
          <p className="text-gray-600">No inventory items found</p>
        </Card>
      )}
    </div>
  );
};

export default CGWFlowMetre;

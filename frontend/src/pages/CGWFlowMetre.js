import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, Search, Mail, Phone, Download, Upload, X, FileUp, AlertCircle, CheckCircle } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const CGWFlowMetre = () => {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [filteredItems, setFilteredItems] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [uploadingCertificate, setUploadingCertificate] = useState(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState(null);
  const fileInputRef = useRef(null);
  const [formData, setFormData] = useState({
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
  });

  useEffect(() => {
    fetchCustomers();
    fetchItems();
  }, []);

  useEffect(() => {
    const filtered = items.filter(item =>
      item.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.equipment_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.location?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.inventory_id.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredItems(filtered);
  }, [searchTerm, items]);

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
      if (editingItem) {
        await axios.put(`${API}/cgw-flow-metres/${editingItem.id}`, formData, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        toast.success('Inventory item updated successfully');
      } else {
        await axios.post(`${API}/cgw-flow-metres`, formData, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        toast.success('Inventory item added successfully');
      }
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
    setEditingItem(item);
    setFormData({
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
    setDialogOpen(true);
  };

  const handleDownloadTemplate = () => {
    // Create Excel template with proper headers
    const templateData = {
      'CUSTOMER NAME': '',
      'LOCATION': '',
      'CONTACT PERSON': '',
      'NAME OF EQUIPMENT': '',
      'FLOWMETER/PIEZOMETER DETAILS': '',
      'TELEMETRIC SYSTEM': '',
      'SYSTEM MOBILE NUMBER': '',
      'PERSON MOBILE NUMBER': '',
      'EMAIL ID': '',
      'DATE OF COMMISSONING': '',
      'URL LINK': '',
      'USER ID': '',
      'PASSWORD': '',
      'STATUS': 'Active',
      'RENEWAL DATE WILL BE': '',
      'REVIEW': '',
      'CALIBARATION CERTIFICATE': '',
      'REMARKS': ''
    };

    // Create CSV content
    const headers = Object.keys(templateData);
    const csvContent = [
      headers.join(','),
      Object.values(templateData).join(',')
    ].join('\n');

    // Create and download file
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvContent));
    element.setAttribute('download', 'CGW_FlowMetre_Template.csv');
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    
    toast.success('Template downloaded! Fill it with your data and import.');
  };

  const handleCertificateUpload = async (itemId, file) => {
    setUploadingCertificate(itemId);
    try {
      const formDataUpload = new FormData();
      formDataUpload.append('file', file);
      
      const response = await axios.post(
        `${API}/cgw-flow-metres/${itemId}/upload-certificate`,
        formDataUpload,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
            'Content-Type': 'multipart/form-data'
          }
        }
      );
      toast.success('Certificate uploaded successfully');
      fetchItems();
    } catch (error) {
      toast.error('Failed to upload certificate');
    } finally {
      setUploadingCertificate(null);
    }
  };

  const handleImportExcel = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setImporting(true);
    try {
      const formDataUpload = new FormData();
      formDataUpload.append('file', file);

      const response = await axios.post(
        `${API}/cgw-flow-metres/import/excel`,
        formDataUpload,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
            'Content-Type': 'multipart/form-data'
          }
        }
      );

      setImportResults(response.data);
      toast.success(`Imported ${response.data.imported} items successfully!`);
      
      // Refresh items after import
      setTimeout(() => {
        fetchItems();
        setImportDialogOpen(true);
      }, 500);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Import failed');
    } finally {
      setImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const resetForm = () => {
    setFormData({
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
    });
    setEditingItem(null);
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

  // Group items by customer
  const groupedByCustomer = filteredItems.reduce((acc, item) => {
    if (!acc[item.customer_name]) {
      acc[item.customer_name] = [];
    }
    acc[item.customer_name].push(item);
    return acc;
  }, {});

  const canManage = ['Admin', 'HR'].includes(user?.role);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="cgw-flow-metre-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight text-gray-900">
            CGW Flow Metre Inventory
          </h1>
          <p className="text-gray-600 text-sm mt-1">{items.length} total items</p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
              <DialogTrigger asChild>
                <Button 
                  className="bg-green-600 text-white hover:bg-green-700" 
                  data-testid="import-button"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <FileUp className="h-4 w-4 mr-2" />
                  Import Excel
                </Button>
              </DialogTrigger>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                style={{ display: 'none' }}
                onChange={handleImportExcel}
                disabled={importing}
              />
              {importResults ? (
                <DialogContent className="max-w-2xl bg-white rounded-lg border border-gray-200 shadow-xl p-0">
                  <div className="bg-green-600 text-white p-6 rounded-t-lg">
                    <DialogHeader>
                      <DialogTitle className="text-xl font-bold text-white">Import Results</DialogTitle>
                    </DialogHeader>
                  </div>
                  <div className="p-6 space-y-4">
                    <div className="flex items-center gap-3 p-4 bg-green-50 rounded-lg border border-green-200">
                      <CheckCircle className="h-5 w-5 text-green-600" />
                      <div>
                        <p className="font-semibold text-green-900">Successfully Imported</p>
                        <p className="text-sm text-green-700">{importResults.imported} items</p>
                      </div>
                    </div>
                    
                    {importResults.failed > 0 && (
                      <div className="flex items-start gap-3 p-4 bg-red-50 rounded-lg border border-red-200">
                        <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="font-semibold text-red-900">Failed Items</p>
                          <p className="text-sm text-red-700">{importResults.failed} items</p>
                        </div>
                      </div>
                    )}
                    
                    {importResults.errors && importResults.errors.length > 0 && (
                      <div className="max-h-60 overflow-y-auto p-4 bg-gray-50 rounded-lg border border-gray-200">
                        <p className="font-semibold text-gray-900 mb-2">Error Details:</p>
                        <ul className="space-y-1">
                          {importResults.errors.map((error, idx) => (
                            <li key={idx} className="text-sm text-gray-700 font-mono">
                              ⚠️ {error}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    
                    <Button 
                      onClick={() => {
                        setImportDialogOpen(false);
                        setImportResults(null);
                      }}
                      className="w-full bg-green-600 text-white hover:bg-green-700"
                    >
                      Close
                    </Button>
                  </div>
                </DialogContent>
              ) : (
                <DialogContent className="max-w-md bg-white rounded-lg border border-gray-200 shadow-xl p-0">
                  <div className="bg-green-600 text-white p-6 rounded-t-lg">
                    <DialogHeader>
                      <DialogTitle className="text-xl font-bold text-white">Import from Excel</DialogTitle>
                    </DialogHeader>
                  </div>
                  <div className="p-6 space-y-4">
                    <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                      <p className="text-sm text-blue-900">
                        <strong>Note:</strong> Your Excel file must have all the required columns. Download the template below to get the correct format.
                      </p>
                    </div>
                    
                    <div className="space-y-2">
                      <Button 
                        onClick={handleDownloadTemplate}
                        className="w-full bg-blue-600 text-white hover:bg-blue-700"
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Download Template
                      </Button>
                      <Button 
                        onClick={() => fileInputRef.current?.click()}
                        disabled={importing}
                        className="w-full bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        {importing ? 'Importing...' : 'Choose Excel File'}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              )}
            </Dialog>

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
                  <DialogTitle className="text-xl font-bold text-white">
                    {editingItem ? 'Edit Flow Metre' : 'Add New Flow Metre'}
                  </DialogTitle>
                  <p className="text-blue-100 text-sm mt-1">
                    {editingItem ? 'Update inventory details and save changes' : 'Create a new inventory item'}
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
                    {editingItem ? 'Update' : 'Add'} Item
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
          </div>
        )}
      </div>

      {/* Search */}
      <Card className="p-4 rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search by customer, equipment, location, or inventory ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 border border-gray-300 h-10 rounded-lg text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
          />
        </div>
      </Card>

      {/* Items Grouped by Customer */}
      {Object.keys(groupedByCustomer).length > 0 ? (
        Object.keys(groupedByCustomer).map((customerName) => (
          <div key={customerName} className="space-y-3">
            <div className="px-4 py-2 bg-blue-50 border-l-4 border-blue-600">
              <h2 className="text-lg font-semibold text-blue-900">{customerName}</h2>
              <p className="text-sm text-blue-700">{groupedByCustomer[customerName].length} item(s)</p>
            </div>

            <Card className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
              <div className="overflow-x-auto table-scroll">
                <table className="w-full text-sm min-w-[800px]">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">ID</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">Equipment</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">Product Code</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">Model No</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">Location</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">Contact</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">Email</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">Commissioned</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">Status</th>
                      {canManage && (
                        <th className="text-left py-3 px-4 font-semibold text-gray-700">Actions</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {groupedByCustomer[customerName].map((item) => (
                      <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                        <td className="py-3 px-4 font-mono text-gray-900">{item.inventory_id}</td>
                        <td className="py-3 px-4 font-medium text-gray-900">{item.equipment_name || '—'}</td>
                        <td className="py-3 px-4 text-gray-600">{item.product_code || '—'}</td>
                        <td className="py-3 px-4 text-gray-600">{item.model_no || '—'}</td>
                        <td className="py-3 px-4 text-gray-600">{item.location || '—'}</td>
                        <td className="py-3 px-4 text-gray-600">
                          {item.person_mobile_number ? (
                            <span className="flex items-center gap-1.5">
                              <Phone className="h-3.5 w-3 text-gray-400 shrink-0" />
                              {item.person_mobile_number}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="py-3 px-4 text-gray-600">
                          {item.email_id ? (
                            <span className="flex items-center gap-1.5">
                              <Mail className="h-3.5 w-3 text-gray-400 shrink-0" />
                              <span className="truncate max-w-[120px]" title={item.email_id}>{item.email_id}</span>
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="py-3 px-4 text-gray-600">{item.date_of_commissioning || '—'}</td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex px-2.5 py-1 rounded-md text-xs font-medium ${
                            item.status === 'Active' ? 'bg-green-50 text-green-700' :
                            item.status === 'Maintenance' ? 'bg-yellow-50 text-yellow-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {item.status}
                          </span>
                        </td>
                        {canManage && (
                          <td className="py-3 px-4">
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 border-gray-200 text-gray-700 hover:bg-gray-50"
                                onClick={() => handleEdit(item)}
                              >
                                <Edit className="h-3.5 w-3 mr-1" />
                                Edit
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 border-gray-200 text-red-600 hover:bg-red-50"
                                onClick={() => handleDelete(item.id)}
                              >
                                <Trash2 className="h-3.5 w-3 mr-1" />
                                Delete
                              </Button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        ))
      ) : (
        <Card className="p-12 text-center rounded-lg border border-gray-200 bg-white shadow-sm">
          <p className="text-gray-600">No inventory items found</p>
        </Card>
      )}
    </div>
  );
};

export default CGWFlowMetre;

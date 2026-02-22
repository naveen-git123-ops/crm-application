import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, Search, Mail, Phone, MapPin, Building2 } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export const Customers = () => {
  const { user } = useAuth();
  const [customers, setCustomers] = useState([]);
  const [filteredCustomers, setFilteredCustomers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [formData, setFormData] = useState({
    company_name: '',
    gst_number: '',
    contact_person_name: '',
    phone: '',
    email: '',
    address_line: '',
    city: '',
    state: '',
    pincode: '',
    country: 'India',
    status: 'Active'
  });

  useEffect(() => {
    fetchCustomers();
  }, []);

  useEffect(() => {
    const filtered = customers.filter(cust =>
      cust.company_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cust.contact_person_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cust.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cust.phone?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cust.customer_id.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredCustomers(filtered);
  }, [searchTerm, customers]);

  const fetchCustomers = async () => {
    try {
      const response = await axios.get(`${API}/customers`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setCustomers(response.data);
      setFilteredCustomers(response.data);
    } catch (error) {
      toast.error('Failed to load customers');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingCustomer) {
        await axios.put(`${API}/customers/${editingCustomer.id}`, formData, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        toast.success('Customer updated successfully');
      } else {
        await axios.post(`${API}/customers`, formData, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        toast.success('Customer added successfully');
      }
      setDialogOpen(false);
      resetForm();
      fetchCustomers();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Operation failed');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this customer?')) return;
    try {
      await axios.delete(`${API}/customers/${id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      toast.success('Customer deleted successfully');
      fetchCustomers();
    } catch (error) {
      toast.error('Failed to delete customer');
    }
  };

  const handleEdit = (customer) => {
    setEditingCustomer(customer);
    setFormData({
      company_name: customer.company_name,
      gst_number: customer.gst_number || '',
      contact_person_name: customer.contact_person_name,
      phone: customer.phone || '',
      email: customer.email || '',
      address_line: customer.address_line || '',
      city: customer.city || '',
      state: customer.state || '',
      pincode: customer.pincode || '',
      country: customer.country || 'India',
      status: customer.status
    });
    setDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({
      company_name: '',
      gst_number: '',
      contact_person_name: '',
      phone: '',
      email: '',
      address_line: '',
      city: '',
      state: '',
      pincode: '',
      country: 'India',
      status: 'Active'
    });
    setEditingCustomer(null);
  };

  const canManageCustomers = ['Admin', 'HR', 'Manager'].includes(user?.role);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="customers-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight text-gray-900">Customers</h1>
          <p className="text-gray-600 text-sm mt-1">{customers.length} total customers</p>
        </div>
        {canManageCustomers && (
          <Dialog open={dialogOpen} onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button className="bg-blue-600 text-white hover:bg-blue-700" data-testid="add-customer-button">
                <Plus className="h-4 w-4 mr-2" />
                Add Customer
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-white rounded-lg border border-gray-200 shadow-xl p-0">
              <div className="bg-blue-600 text-white p-6 rounded-t-lg">
                <DialogHeader>
                  <DialogTitle className="text-xl font-bold text-white">
                    {editingCustomer ? 'Edit Customer' : 'Add New Customer'}
                  </DialogTitle>
                  <p className="text-blue-100 text-sm mt-1">
                    {editingCustomer ? 'Update customer details and save changes' : 'Create a new customer profile'}
                  </p>
                </DialogHeader>
              </div>
              <form onSubmit={handleSubmit} className="space-y-6 p-6">
                {/* Basic Information */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-blue-600" />
                    Basic Information
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="company_name" className="text-sm font-medium text-gray-700">Company Name *</Label>
                      <Input
                        id="company_name"
                        data-testid="customer-company-input"
                        value={formData.company_name}
                        onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                        required
                        className="border border-gray-300 h-11 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="gst_number" className="text-sm font-medium text-gray-700">GST Number</Label>
                      <Input
                        id="gst_number"
                        data-testid="customer-gst-input"
                        value={formData.gst_number}
                        onChange={(e) => setFormData({ ...formData, gst_number: e.target.value })}
                        placeholder="e.g., 29AAPFX0000A1Z5"
                        className="border border-gray-300 h-11 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="contact_person_name" className="text-sm font-medium text-gray-700">Contact Person Name *</Label>
                      <Input
                        id="contact_person_name"
                        data-testid="customer-contact-person-input"
                        value={formData.contact_person_name}
                        onChange={(e) => setFormData({ ...formData, contact_person_name: e.target.value })}
                        required
                        className="border border-gray-300 h-11 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="status" className="text-sm font-medium text-gray-700">Status</Label>
                      <select
                        id="status"
                        data-testid="customer-status-input"
                        value={formData.status}
                        onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                        className="border border-gray-300 h-11 rounded-md text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 px-3"
                      >
                        <option value="Active">Active</option>
                        <option value="Inactive">Inactive</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Contact Information */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Phone className="h-5 w-5 text-blue-600" />
                    Contact Information
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="phone" className="text-sm font-medium text-gray-700">Phone Number</Label>
                      <Input
                        id="phone"
                        data-testid="customer-phone-input"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        placeholder="e.g., +91 9876543210"
                        className="border border-gray-300 h-11 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email" className="text-sm font-medium text-gray-700">Email Address</Label>
                      <Input
                        id="email"
                        type="email"
                        data-testid="customer-email-input"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="border border-gray-300 h-11 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                      />
                    </div>
                  </div>
                </div>

                {/* Address Information */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-blue-600" />
                    Address
                  </h3>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="address_line" className="text-sm font-medium text-gray-700">Address Line</Label>
                      <Input
                        id="address_line"
                        data-testid="customer-address-input"
                        value={formData.address_line}
                        onChange={(e) => setFormData({ ...formData, address_line: e.target.value })}
                        placeholder="e.g., Plot 123, Industrial Area"
                        className="border border-gray-300 h-11 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="city" className="text-sm font-medium text-gray-700">City</Label>
                        <Input
                          id="city"
                          data-testid="customer-city-input"
                          value={formData.city}
                          onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                          placeholder="e.g., Mumbai"
                          className="border border-gray-300 h-11 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="state" className="text-sm font-medium text-gray-700">State</Label>
                        <Input
                          id="state"
                          data-testid="customer-state-input"
                          value={formData.state}
                          onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                          placeholder="e.g., Maharashtra"
                          className="border border-gray-300 h-11 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="pincode" className="text-sm font-medium text-gray-700">Pincode</Label>
                        <Input
                          id="pincode"
                          data-testid="customer-pincode-input"
                          value={formData.pincode}
                          onChange={(e) => setFormData({ ...formData, pincode: e.target.value })}
                          placeholder="e.g., 400001"
                          className="border border-gray-300 h-11 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="border-gray-300 text-gray-700 hover:bg-gray-50">
                    Cancel
                  </Button>
                  <Button type="submit" data-testid="save-customer-button" className="bg-blue-600 text-white hover:bg-blue-700">
                    {editingCustomer ? 'Update' : 'Add'} Customer
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Search */}
      <Card className="p-4 rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            data-testid="customer-search-input"
            placeholder="Search by company name, contact person, email, phone, or customer ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 border border-gray-300 h-10 rounded-lg text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
          />
        </div>
      </Card>

      {/* Customers table grid */}
      <Card className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto table-scroll">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Customer ID</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Company Name</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Contact Person</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Phone</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Email</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">GST Number</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">City</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Status</th>
                {canManageCustomers && (
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Actions</th>
                )}
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.map((customer) => (
                <tr
                  key={customer.id}
                  className="border-b border-gray-100 hover:bg-gray-50/50"
                  data-testid={`customer-card-${customer.customer_id}`}
                >
                  <td className="py-3 px-4 font-mono text-gray-900">{customer.customer_id}</td>
                  <td className="py-3 px-4 font-medium text-gray-900">{customer.company_name}</td>
                  <td className="py-3 px-4 text-gray-600">{customer.contact_person_name}</td>
                  <td className="py-3 px-4 text-gray-600">
                    {customer.phone ? (
                      <span className="flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3 text-gray-400 shrink-0" />
                        {customer.phone}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="py-3 px-4 text-gray-600">
                    {customer.email ? (
                      <span className="flex items-center gap-1.5">
                        <Mail className="h-3.5 w-3 text-gray-400 shrink-0" />
                        <span className="truncate max-w-[160px]" title={customer.email}>{customer.email}</span>
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="py-3 px-4 text-gray-600 font-mono">{customer.gst_number || '—'}</td>
                  <td className="py-3 px-4 text-gray-600">{customer.city || '—'}</td>
                  <td className="py-3 px-4">
                    <span className={`inline-flex px-2.5 py-1 rounded-md text-xs font-medium ${
                      customer.status === 'Active' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {customer.status}
                    </span>
                  </td>
                  {canManageCustomers && (
                    <td className="py-3 px-4">
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 border-gray-200 text-gray-700 hover:bg-gray-50"
                          onClick={() => handleEdit(customer)}
                          data-testid={`edit-customer-${customer.customer_id}`}
                        >
                          <Edit className="h-3.5 w-3 mr-1" />
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 border-gray-200 text-red-600 hover:bg-red-50"
                          onClick={() => handleDelete(customer.id)}
                          data-testid={`delete-customer-${customer.customer_id}`}
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

      {filteredCustomers.length === 0 && (
        <Card className="p-12 text-center rounded-lg border border-gray-200 bg-white shadow-sm">
          <p className="text-gray-600">No customers found</p>
        </Card>
      )}
    </div>
  );
};

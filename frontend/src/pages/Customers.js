import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useRegisterPageHeader } from '@/contexts/PageHeaderContext';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, Search, Mail, Phone, MapPin, Building2, X } from 'lucide-react';
import { API_ENDPOINT } from '@/lib/apiConfig';

const API = API_ENDPOINT;

const authHeaders = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });

function customerPrimaryContact(customer) {
  const list = customer?.contacts || [];
  if (!list.length) return null;
  return list.find((c) => c.is_primary === 1 || c.is_primary === true) || list[0];
}

function customerPrimaryAddress(customer) {
  const list = customer?.addresses || [];
  if (!list.length) return null;
  return list.find((a) => a.is_primary === 1 || a.is_primary === true) || list[0];
}

function customerDisplayPhone(customer) {
  if (customer?.phone) return customer.phone;
  return customerPrimaryContact(customer)?.phone || '';
}

function customerDisplayEmail(customer) {
  if (customer?.email) return customer.email;
  return customerPrimaryContact(customer)?.email || '';
}

function customerDisplayCity(customer) {
  if (customer?.city) return customer.city;
  return customerPrimaryAddress(customer)?.city || '';
}

const ENTITY_CUSTOMER = 0;
const ENTITY_VENDOR = 1;

export const Customers = () => {
  const [activeTab, setActiveTab] = useState('customer');
  const [records, setRecords] = useState([]);
  const [filteredRecords, setFilteredRecords] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [dialogEntityType, setDialogEntityType] = useState(ENTITY_CUSTOMER);

  const entityType = activeTab === 'vendor' ? ENTITY_VENDOR : ENTITY_CUSTOMER;
  const entityLabel = activeTab === 'vendor' ? 'Vendor' : 'Customer';
  const entityLabelLower = entityLabel.toLowerCase();
  const dialogEntityLabel =
    editingRecord?.entity_type === ENTITY_VENDOR || (!editingRecord && dialogEntityType === ENTITY_VENDOR)
      ? 'Vendor'
      : 'Customer';
  const dialogEntityLabelLower = dialogEntityLabel.toLowerCase();

  const openAddDialog = (type) => {
    resetForm();
    setDialogEntityType(type);
    setEditingRecord(null);
    setDialogOpen(true);
  };

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
    status: 'Active',
    contacts: [{ contact_person_name: '', designation: '', phone: '', email: '', is_primary: 0 }],
    addresses: [{ address_line: '', city: '', state: '', pincode: '', country: 'India', is_primary: 0 }]
  });

  const recordsForActiveTab = React.useMemo(() => {
    return records.filter((row) => {
      const rowType = row.entity_type === 1 || row.entity_type === '1' ? 1 : 0;
      return entityType === ENTITY_VENDOR ? rowType === 1 : rowType === 0;
    });
  }, [records, entityType]);

  useEffect(() => {
    setSearchTerm('');
    setRecords([]);
    setFilteredRecords([]);
    setLoading(true);
    fetchRecords(entityType);
  }, [entityType, activeTab]);

  useEffect(() => {
    const term = searchTerm.toLowerCase();
    const filtered = recordsForActiveTab.filter((cust) =>
      cust.company_name.toLowerCase().includes(term) ||
      cust.contact_person_name.toLowerCase().includes(term) ||
      customerDisplayEmail(cust).toLowerCase().includes(term) ||
      customerDisplayPhone(cust).toLowerCase().includes(term) ||
      customerDisplayCity(cust).toLowerCase().includes(term) ||
      cust.customer_id.toLowerCase().includes(term)
    );
    setFilteredRecords(filtered);
  }, [searchTerm, recordsForActiveTab]);

  const fetchRecords = async (type = entityType) => {
    try {
      const response = await axios.get(`${API}/customers?entity_type=${type}`, authHeaders());
      setRecords(response.data);
      setFilteredRecords(response.data);
      return response.data;
    } catch (error) {
      toast.error(`Failed to load ${type === ENTITY_VENDOR ? 'vendors' : 'customers'}`);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      // Filter out empty contacts (only include if contact_person_name is provided)
      const filteredContacts = formData.contacts
        .filter(contact => contact.contact_person_name && contact.contact_person_name.trim())
        .map(contact => ({
          contact_person_name: contact.contact_person_name,
          designation: contact.designation || null,
          phone: contact.phone || null,
          email: contact.email || null,
          is_primary: contact.is_primary || 0
        }));

      // Filter out empty addresses (only include if address_line is provided)
      const filteredAddresses = formData.addresses
        .filter(address => address.address_line && address.address_line.trim())
        .map(address => ({
          address_line: address.address_line,
          city: address.city || null,
          state: address.state || null,
          pincode: address.pincode || null,
          country: address.country || 'India',
          is_primary: address.is_primary || 0
        }));

      const primaryContact = filteredContacts.find((c) => c.is_primary) || filteredContacts[0];
      const primaryAddress = filteredAddresses.find((a) => a.is_primary) || filteredAddresses[0];

      const dataToSubmit = {
        ...formData,
        contact_person_name: formData.contact_person_name || primaryContact?.contact_person_name || '',
        phone: formData.phone || primaryContact?.phone || null,
        email: formData.email || primaryContact?.email || null,
        address_line: formData.address_line || primaryAddress?.address_line || null,
        city: formData.city || primaryAddress?.city || null,
        state: formData.state || primaryAddress?.state || null,
        pincode: formData.pincode || primaryAddress?.pincode || null,
        country: formData.country || primaryAddress?.country || 'India',
        contacts: filteredContacts,
        addresses: filteredAddresses,
        entity_type: editingRecord?.entity_type ?? dialogEntityType,
      };

      const savedType = editingRecord?.entity_type ?? dialogEntityType;
      const savedLabel = savedType === ENTITY_VENDOR ? 'Vendor' : 'Customer';

      if (editingRecord) {
        await axios.put(`${API}/customers/${editingRecord.id}`, dataToSubmit, authHeaders());
        toast.success(`${savedLabel} updated successfully`);
      } else {
        await axios.post(`${API}/customers`, dataToSubmit, authHeaders());
        toast.success(`${savedLabel} added successfully`);
      }
      setDialogOpen(false);
      resetForm();
      fetchRecords(savedType);
    } catch (error) {
      console.error('Error:', error);
      const errorMsg = error.response?.data?.detail || 
                       (error.response?.data && error.response.data[0]?.msg) ||
                       'Operation failed';
      toast.error(errorMsg);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm(`Are you sure you want to delete this ${entityLabelLower}?`)) return;
    try {
      await axios.delete(`${API}/customers/${id}`, authHeaders());
      toast.success(`${entityLabel} deleted successfully`);
      fetchRecords(entityType);
    } catch (error) {
      toast.error('Failed to delete customer');
    }
  };

  const handleEdit = (customer) => {
    setEditingRecord(customer);
    const contactsData = customer.contacts && customer.contacts.length > 0 
      ? customer.contacts.map(c => ({ contact_person_name: c.contact_person_name, designation: c.designation || '', phone: c.phone || '', email: c.email || '', is_primary: c.is_primary || 0 }))
      : [{ contact_person_name: '', designation: '', phone: '', email: '', is_primary: 0 }];
    
    const addressesData = customer.addresses && customer.addresses.length > 0 
      ? customer.addresses.map(a => ({ address_line: a.address_line, city: a.city || '', state: a.state || '', pincode: a.pincode || '', country: a.country || 'India', is_primary: a.is_primary || 0 }))
      : [{ address_line: '', city: '', state: '', pincode: '', country: 'India', is_primary: 0 }];
    
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
      status: customer.status,
      contacts: contactsData,
      addresses: addressesData
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
      status: 'Active',
      contacts: [{ contact_person_name: '', designation: '', phone: '', email: '', is_primary: 0 }],
      addresses: [{ address_line: '', city: '', state: '', pincode: '', country: 'India', is_primary: 0 }]
    });
    setEditingRecord(null);
  };

  const addContact = () => {
    setFormData({
      ...formData,
      contacts: [...formData.contacts, { contact_person_name: '', designation: '', phone: '', email: '', is_primary: 0 }]
    });
  };

  const removeContact = (index) => {
    const updatedContacts = formData.contacts.filter((_, i) => i !== index);
    setFormData({
      ...formData,
      contacts: updatedContacts.length > 0 ? updatedContacts : [{ contact_person_name: '', designation: '', phone: '', email: '', is_primary: 0 }]
    });
  };

  const updateContact = (index, field, value) => {
    const updatedContacts = [...formData.contacts];
    updatedContacts[index][field] = value;
    setFormData({ ...formData, contacts: updatedContacts });
  };

  const addAddress = () => {
    setFormData({
      ...formData,
      addresses: [...formData.addresses, { address_line: '', city: '', state: '', pincode: '', country: 'India', is_primary: 0 }]
    });
  };

  const removeAddress = (index) => {
    const updatedAddresses = formData.addresses.filter((_, i) => i !== index);
    setFormData({
      ...formData,
      addresses: updatedAddresses.length > 0 ? updatedAddresses : [{ address_line: '', city: '', state: '', pincode: '', country: 'India', is_primary: 0 }]
    });
  };

  const updateAddress = (index, field, value) => {
    const updatedAddresses = [...formData.addresses];
    updatedAddresses[index][field] = value;
    setFormData({ ...formData, addresses: updatedAddresses });
  };

  useRegisterPageHeader({
    subtitle: `${recordsForActiveTab.length} total ${entityLabelLower}s`,
    enabled: !loading,
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="customers-page">
      <Dialog open={dialogOpen} onOpenChange={(open) => {
        setDialogOpen(open);
        if (!open) resetForm();
      }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-white rounded-lg border border-gray-200 shadow-xl p-0">
              <div className="bg-blue-600 text-white p-6 rounded-t-lg">
                <DialogHeader>
                  <DialogTitle className="text-xl font-bold text-white">
                    {editingRecord ? `Edit ${dialogEntityLabel}` : `Add New ${dialogEntityLabel}`}
                  </DialogTitle>
                  <p className="text-blue-100 text-sm mt-1">
                    {editingRecord
                      ? `Update ${dialogEntityLabelLower} details and save changes`
                      : `Create a new ${dialogEntityLabelLower} profile`}
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
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                      <Phone className="h-5 w-5 text-blue-600" />
                      Contact Information
                    </h3>
                    <Button
                      type="button"
                      size="sm"
                      className="bg-blue-600 text-white hover:bg-blue-700"
                      onClick={addContact}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add Contact
                    </Button>
                  </div>
                  <div className="space-y-4">
                    {formData.contacts && formData.contacts.map((contact, idx) => (
                      <div key={idx} className="border border-gray-300 rounded-lg p-4 bg-gray-50">
                        <div className="flex justify-between items-center mb-4">
                          <span className="text-sm font-medium text-gray-700">Contact #{idx + 1}</span>
                          {formData.contacts.length > 1 && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8 border-red-200 text-red-600 hover:bg-red-50"
                              onClick={() => removeContact(idx)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor={`contact_name_${idx}`} className="text-sm font-medium text-gray-700">Contact Person Name</Label>
                            <Input
                              id={`contact_name_${idx}`}
                              value={contact.contact_person_name}
                              onChange={(e) => updateContact(idx, 'contact_person_name', e.target.value)}
                              className="border border-gray-300 h-11 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`designation_${idx}`} className="text-sm font-medium text-gray-700">Designation</Label>
                            <Input
                              id={`designation_${idx}`}
                              value={contact.designation}
                              onChange={(e) => updateContact(idx, 'designation', e.target.value)}
                              placeholder="e.g., Manager, Director"
                              className="border border-gray-300 h-11 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`contact_phone_${idx}`} className="text-sm font-medium text-gray-700">Phone</Label>
                            <Input
                              id={`contact_phone_${idx}`}
                              value={contact.phone}
                              onChange={(e) => updateContact(idx, 'phone', e.target.value)}
                              placeholder="e.g., +91 9876543210"
                              className="border border-gray-300 h-11 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`contact_email_${idx}`} className="text-sm font-medium text-gray-700">Email</Label>
                            <Input
                              id={`contact_email_${idx}`}
                              type="email"
                              value={contact.email}
                              onChange={(e) => updateContact(idx, 'email', e.target.value)}
                              className="border border-gray-300 h-11 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Address Information */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                      <MapPin className="h-5 w-5 text-blue-600" />
                      Address
                    </h3>
                    <Button
                      type="button"
                      size="sm"
                      className="bg-blue-600 text-white hover:bg-blue-700"
                      onClick={addAddress}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add Address
                    </Button>
                  </div>
                  <div className="space-y-4">
                    {formData.addresses && formData.addresses.map((address, idx) => (
                      <div key={idx} className="border border-gray-300 rounded-lg p-4 bg-gray-50">
                        <div className="flex justify-between items-center mb-4">
                          <span className="text-sm font-medium text-gray-700">Address #{idx + 1}</span>
                          {formData.addresses.length > 1 && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8 border-red-200 text-red-600 hover:bg-red-50"
                              onClick={() => removeAddress(idx)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                        <div className="grid grid-cols-1 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor={`address_line_${idx}`} className="text-sm font-medium text-gray-700">Address Line</Label>
                            <Input
                              id={`address_line_${idx}`}
                              value={address.address_line}
                              onChange={(e) => updateAddress(idx, 'address_line', e.target.value)}
                              placeholder="e.g., Plot 123, Industrial Area"
                              className="border border-gray-300 h-11 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                            />
                          </div>
                          <div className="grid grid-cols-3 gap-4">
                            <div className="space-y-2">
                              <Label htmlFor={`city_${idx}`} className="text-sm font-medium text-gray-700">City</Label>
                              <Input
                                id={`city_${idx}`}
                                value={address.city}
                                onChange={(e) => updateAddress(idx, 'city', e.target.value)}
                                placeholder="e.g., Mumbai"
                                className="border border-gray-300 h-11 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor={`state_${idx}`} className="text-sm font-medium text-gray-700">State</Label>
                              <Input
                                id={`state_${idx}`}
                                value={address.state}
                                onChange={(e) => updateAddress(idx, 'state', e.target.value)}
                                placeholder="e.g., Maharashtra"
                                className="border border-gray-300 h-11 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor={`pincode_${idx}`} className="text-sm font-medium text-gray-700">Pincode</Label>
                              <Input
                                id={`pincode_${idx}`}
                                value={address.pincode}
                                onChange={(e) => updateAddress(idx, 'pincode', e.target.value)}
                                placeholder="e.g., 400001"
                                className="border border-gray-300 h-11 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="border-gray-300 text-gray-700 hover:bg-gray-50">
                    Cancel
                  </Button>
                  <Button type="submit" data-testid="save-customer-button" className="bg-blue-600 text-white hover:bg-blue-700">
                    {editingRecord ? 'Update' : 'Add'} {dialogEntityLabel}
                  </Button>
                </div>
              </form>
        </DialogContent>
      </Dialog>

      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          setActiveTab(value);
          setDialogOpen(false);
          resetForm();
        }}
        className="space-y-4"
      >
        <TabsList className="grid w-full max-w-md grid-cols-2 bg-gray-100 p-1 rounded-lg">
          <TabsTrigger
            value="customer"
            className="data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm rounded-md"
          >
            Customers
          </TabsTrigger>
          <TabsTrigger
            value="vendor"
            className="data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm rounded-md"
          >
            Vendors
          </TabsTrigger>
        </TabsList>

        <TabsContent value="customer" className="mt-0 space-y-4">
          <div className="flex justify-end">
            <Button
              className="bg-blue-600 text-white hover:bg-blue-700 h-9 sm:h-10 text-sm"
              data-testid="add-customer-button"
              onClick={() => openAddDialog(ENTITY_CUSTOMER)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Customer
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="vendor" className="mt-0 space-y-4">
          <div className="flex justify-end">
            <Button
              className="bg-blue-600 text-white hover:bg-blue-700 h-9 sm:h-10 text-sm"
              data-testid="add-vendor-button"
              onClick={() => openAddDialog(ENTITY_VENDOR)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Vendor
            </Button>
          </div>
        </TabsContent>

        <div className="space-y-4">
      {/* Search */}
      <Card className="p-4 rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            data-testid="customer-search-input"
            placeholder={`Search by company name, contact person, email, phone, or ${entityLabelLower} ID...`}
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
                <th className="text-left py-3 px-4 font-semibold text-gray-700">{entityLabel} ID</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Company Name</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Contact Person</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Phone</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Email</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">GST Number</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">City</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Status</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.map((customer) => (
                <tr
                  key={customer.id}
                  className="border-b border-gray-100 hover:bg-gray-50/50"
                  data-testid={`customer-card-${customer.customer_id}`}
                >
                  <td className="py-3 px-4 font-mono text-gray-900">{customer.customer_id}</td>
                  <td className="py-3 px-4 font-medium text-gray-900">{customer.company_name}</td>
                  <td className="py-3 px-4 text-gray-600">{customer.contact_person_name}</td>
                  <td className="py-3 px-4 text-gray-600">
                    {customerDisplayPhone(customer) ? (
                      <span className="flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3 text-gray-400 shrink-0" />
                        {customerDisplayPhone(customer)}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="py-3 px-4 text-gray-600">
                    {customerDisplayEmail(customer) ? (
                      <span className="flex items-center gap-1.5">
                        <Mail className="h-3.5 w-3 text-gray-400 shrink-0" />
                        <span className="truncate max-w-[160px]" title={customerDisplayEmail(customer)}>
                          {customerDisplayEmail(customer)}
                        </span>
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="py-3 px-4 text-gray-600 font-mono">{customer.gst_number || '—'}</td>
                  <td className="py-3 px-4 text-gray-600">{customerDisplayCity(customer) || '—'}</td>
                  <td className="py-3 px-4">
                    <span className={`inline-flex px-2.5 py-1 rounded-md text-xs font-medium ${
                      customer.status === 'Active' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {customer.status}
                    </span>
                  </td>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {filteredRecords.length === 0 && (
        <Card className="p-12 text-center rounded-lg border border-gray-200 bg-white shadow-sm">
          <p className="text-gray-600">No {entityLabelLower}s found</p>
        </Card>
      )}
        </div>
      </Tabs>
    </div>
  );
};

import React, { useState, useEffect, useRef, useMemo } from 'react';
import axios from 'axios';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { useRegisterPageHeader } from '@/contexts/PageHeaderContext';
import { toast } from 'sonner';
import {
  Package,
  Search,
  AlertCircle,
  CheckCircle,
  Calendar,
  Phone,
  Mail,
  Eye,
  Bell,
  Clock,
  AlertTriangle,
  TrendingUp,
  ArrowRight,
  Download,
  FileText,
  X,
  Upload,
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL  || '';
const API = `${BACKEND_URL}/api`;

const ORDER_STATUSES = ['Open', 'In Progress', 'Completed', 'Cancelled'];
const SUBSCRIPTION_STATUSES = ['Active', 'Expiring Soon', 'Expired'];

const Inventory = () => {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [orders, setOrders] = useState([]);
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSubscription, setFilterSubscription] = useState('');
  const [filterByLeadId, setFilterByLeadId] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showAddActivity, setShowAddActivity] = useState(false);
  const [activities, setActivities] = useState([]);
  const [expiringOrders, setExpiringOrders] = useState([]);
  const [sendingReminder, setSendingReminder] = useState(false);
  const [offerCopyFile, setOfferCopyFile] = useState(null);
  const [orderCopyFile, setOrderCopyFile] = useState(null);
  const [editingAll, setEditingAll] = useState(false);
  const [editFormData, setEditFormData] = useState({
    subscription_start_date: '',
    subscription_end_date: '',
    estimation: '',
  });
  const [savingEdits, setSavingEdits] = useState(false);
  const [showDocumentViewer, setShowDocumentViewer] = useState(false);
  const [viewingDocument, setViewingDocument] = useState(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);

  const axiosConfig = {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };

  // Fetch orders
  const fetchOrders = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API}/orders`, axiosConfig);
      setOrders(response.data);
      applyFilters(response.data, searchTerm, filterStatus, filterSubscription, filterByLeadId);
    } catch (error) {
      console.error('Error fetching orders:', error);
      toast.error('Failed to load orders');
    } finally {
      setLoading(false);
    }
  };

  // Fetch expiring subscriptions
  const fetchExpiringOrders = async () => {
    try {
      const response = await axios.get(`${API}/orders/search/expiring?days=30`, axiosConfig);
      setExpiringOrders(response.data);
    } catch (error) {
      console.error('Error fetching expiring orders:', error);
    }
  };

  // Fetch order activities
  const fetchOrderActivities = async (orderId) => {
    try {
      const response = await axios.get(`${API}/orders/${orderId}/activities`, axiosConfig);
      setActivities(response.data);
    } catch (error) {
      console.error('Error fetching activities:', error);
      toast.error('Failed to load activities');
    }
  };

  // Apply filters
  const applyFilters = (ordersList, search, status, subscription, leadId = null) => {
    let filtered = ordersList;

    if (search) {
      filtered = filtered.filter(order =>
        order.customer_name.toLowerCase().includes(search.toLowerCase()) ||
        order.order_id.toLowerCase().includes(search.toLowerCase()) ||
        order.contact_number?.includes(search) ||
        order.mail_id?.toLowerCase().includes(search.toLowerCase())
      );
    }

    if (status) {
      filtered = filtered.filter(order => order.order_status === status);
    }

    if (subscription) {
      filtered = filtered.filter(order => order.subscription_status === subscription);
    }

    if (leadId) {
      filtered = filtered.filter(order => order.lead_id === leadId);
    }

    setFilteredOrders(filtered);
  };

  // Initialize and check for lead filter from navigation
  useEffect(() => {
    if (location.state?.filterByLeadId) {
      setFilterByLeadId(location.state.filterByLeadId);
    }
    fetchOrders();
    fetchExpiringOrders();
  }, []);

  // Handle search
  const handleSearch = (term) => {
    setSearchTerm(term);
    applyFilters(orders, term, filterStatus, filterSubscription, filterByLeadId);
  };

  // Handle status filter
  const handleStatusFilter = (status) => {
    setFilterStatus(status);
    applyFilters(orders, searchTerm, status, filterSubscription, filterByLeadId);
  };

  // Handle subscription filter
  const handleSubscriptionFilter = (status) => {
    setFilterSubscription(status);
    applyFilters(orders, searchTerm, filterStatus, status, filterByLeadId);
  };

  // View order details
  const handleViewDetails = async (order) => {
    setSelectedOrder(order);
    await fetchOrderActivities(order.id);
    setOfferCopyFile(null);
    setOrderCopyFile(null);
    setEditingAll(false);
    setEditFormData({
      subscription_start_date: '',
      subscription_end_date: '',
      estimation: '',
    });
    setShowDetails(true);
  };

  // Send renewal reminder
  const handleSendReminder = async (orderId) => {
    try {
      await axios.post(
        `${API}/orders/${orderId}/send-renewal-reminder`,
        {},
        axiosConfig
      );
      toast.success('Renewal reminder sent successfully');
      fetchOrders();
    } catch (error) {
      console.error('Error sending reminder:', error);
      toast.error('Failed to send renewal reminder');
    }
  };

  // Add activity
  const handleAddActivity = async (e) => {
    e.preventDefault();
    const summary = e.target.summary.value;
    const activityType = e.target.activityType.value;

    if (!summary || !activityType) {
      toast.error('Please fill in all fields');
      return;
    }

    try {
      await axios.post(
        `${API}/orders/${selectedOrder.id}/activities`,
        {
          order_id: selectedOrder.id,
          activity_type: activityType,
          summary: summary,
        },
        axiosConfig
      );
      toast.success('Activity added successfully');
      e.target.reset();
      setShowAddActivity(false);
      await fetchOrderActivities(selectedOrder.id);
    } catch (error) {
      console.error('Error adding activity:', error);
      toast.error('Failed to add activity');
    }
  };

  const handleViewLead = () => {
    if (selectedOrder && selectedOrder.lead_id) {
      navigate('/leads', { state: { highlightLeadId: selectedOrder.lead_id } });
      setShowDetails(false);
    } else {
      toast.error('Lead ID not found');
    }
  };

  const handleSendReminderEmail = async (reminderDays) => {
    if (!selectedOrder) return;

    setSendingReminder(true);
    try {
      const response = await axios.post(
        `${API}/orders/${selectedOrder.id}/send-subscription-reminder`,
        {
          days_before: reminderDays,
          email: selectedOrder.mail_id,
          contact_name: selectedOrder.contact_person,
          end_date: selectedOrder.subscription_end_date,
        },
        axiosConfig
      );

      if (response.data.status === 'sent') {
        toast.success(`✓ Subscription reminder sent to ${selectedOrder.mail_id}`);
        const updatedOrder = {
          ...selectedOrder,
          [`subscription_reminder_sent_${reminderDays}`]: 'True',
        };
        setSelectedOrder(updatedOrder);
      } else if (response.data.status === 'failed') {
        toast.error(`❌ Failed to send email. ${response.data.message}`);
      } else {
        const message = response.data.message || response.data.msg || '';
        if (message.includes('successfully')) {
          toast.success(`✓ Reminder sent to ${selectedOrder.mail_id}`);
          const updatedOrder = {
            ...selectedOrder,
            [`subscription_reminder_sent_${reminderDays}`]: 'True',
          };
          setSelectedOrder(updatedOrder);
        } else {
          toast.error(message || 'Failed to send reminder email');
        }
      }
    } catch (error) {
      console.error('Error sending reminder:', error);
      toast.error('Failed to send reminder email. Please check configuration.');
    } finally {
      setSendingReminder(false);
    }
  };

  const handleOpenEditAll = () => {
    if (selectedOrder) {
      setEditFormData({
        subscription_start_date: selectedOrder.subscription_start_date ? selectedOrder.subscription_start_date.split('T')[0] : '',
        subscription_end_date: selectedOrder.subscription_end_date ? selectedOrder.subscription_end_date.split('T')[0] : '',
        estimation: selectedOrder.estimation ? String(selectedOrder.estimation) : '',
      });
      setOfferCopyFile(null);
      setOrderCopyFile(null);
      setEditingAll(true);
    }
  };

  const handleSaveEditAll = async () => {
    if (editFormData.subscription_start_date && editFormData.subscription_end_date) {
      const startDate = new Date(editFormData.subscription_start_date);
      const endDate = new Date(editFormData.subscription_end_date);
      if (startDate > endDate) {
        toast.error('Subscription start date must be before end date');
        return;
      }
    }

    setSavingEdits(true);
    try {
      const payload = {
        subscription_start_date: editFormData.subscription_start_date || null,
        subscription_end_date: editFormData.subscription_end_date || null,
        estimation: editFormData.estimation ? parseFloat(editFormData.estimation) : null,
      };

      await axios.put(`${API}/orders/${selectedOrder.id}`, payload, axiosConfig);
      toast.success('Order updated successfully');
      setEditingAll(false);
      const updatedOrder = { ...selectedOrder, ...payload };
      setSelectedOrder(updatedOrder);
      fetchOrders();
    } catch (error) {
      console.error('Error saving edits:', error);
      toast.error('Failed to save changes');
    } finally {
      setSavingEdits(false);
    }
  };

  const getDaysUntilExpiry = (endDate) => {
    if (!endDate) return null;
    const today = new Date();
    const expiryDate = new Date(endDate);
    const days = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
    return days;
  };

  // Export orders to Excel
  const handleExportToExcel = async () => {
    try {
      toast.loading('Preparing export...');
      const response = await axios.get(`${API}/orders`, axiosConfig);
      const ordersData = response.data;

      // Prepare CSV content with all order fields
      const headers = [
        'Order ID',
        'Customer Name',
        'Contact Person',
        'Contact Number',
        'Email',
        'Product',
        'Offer No',
        'PO No',
        'PO Value',
        'Order Status',
        'Subscription Status',
        'Start Date',
        'End Date',
        'Days Until Expiry',
        'Estimation',
        'Installation Status',
        'Final Payment Due',
        'Payment Date',
        'Remarks',
        'Created At',
      ];

      const rows = ordersData.map(order => [
        order.order_id,
        order.customer_name,
        order.contact_person || '',
        order.contact_number || '',
        order.mail_id || '',
        order.product || '',
        order.offer_no || '',
        order.cust_po_no || '',
        order.cust_supply_po_value || '',
        order.order_status,
        order.subscription_status,
        order.subscription_start_date ? new Date(order.subscription_start_date).toLocaleDateString() : '',
        order.subscription_end_date ? new Date(order.subscription_end_date).toLocaleDateString() : '',
        order.subscription_end_date ? getDaysUntilExpiry(order.subscription_end_date) : '',
        order.estimation || '',
        order.installation_successful || '',
        order.final_payment_due || '',
        order.final_payment_date ? new Date(order.final_payment_date).toLocaleDateString() : '',
        order.remarks || '',
        order.created_at ? new Date(order.created_at).toLocaleString() : '',
      ]);

      // Create CSV string
      const csvContent = [
        headers.map(h => `"${h}"`).join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
      ].join('\n');

      // Create and download file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `Orders_Export_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.dismiss();
      toast.success(`Exported ${ordersData.length} orders to Excel`);
    } catch (error) {
      console.error('Error exporting orders:', error);
      toast.dismiss();
      toast.error('Failed to export orders');
    }
  };

  // Download template for bulk upload
  const handleDownloadTemplate = () => {
    try {
      const headers = [
        'customer_name',
        'contact_person',
        'contact_number',
        'mail_id',
        'product',
        'offer_no',
        'cust_po_no',
        'cust_supply_po_value',
        'order_status',
        'subscription_status',
        'subscription_start_date',
        'subscription_end_date',
        'estimation',
      ];

      const sampleRow = [
        'John Doe Inc',
        'John Doe',
        '+91 9876543210',
        'john@example.com',
        'Software License',
        'OFFER-001',
        'PO-001',
        '50000',
        'Open',
        'Active',
        '2026-01-01',
        '2027-01-01',
        '5',
      ];

      const csvContent = [
        headers.join(','),
        sampleRow.join(','),
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `Orders_Template_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success('Template downloaded successfully. Fill it and import!');
    } catch (error) {
      console.error('Error downloading template:', error);
      toast.error('Failed to download template');
    }
  };

  // Handle file import
  const handleFileImport = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const text = await file.text();
      const lines = text.trim().split('\n');
      
      if (lines.length < 2) {
        toast.error('File must have headers and at least one row');
        setImporting(false);
        return;
      }

      const headers = lines[0].split(',');
      const requiredFields = ['customer_name', 'contact_number', 'order_status', 'subscription_status'];
      const missingFields = requiredFields.filter(field => !headers.includes(field));

      if (missingFields.length > 0) {
        toast.error(`Missing required fields: ${missingFields.join(', ')}`);
        setImporting(false);
        return;
      }

      const orders = [];
      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;

        const values = lines[i].split(',');
        const order = {};
        headers.forEach((header, index) => {
          order[header.trim()] = values[index]?.trim() || '';
        });

        if (!order.customer_name) {
          toast.error(`Row ${i + 1}: customer_name is required`);
          setImporting(false);
          return;
        }

        orders.push(order);
      }

      // Create orders via API
      let successCount = 0;
      let failureCount = 0;

      for (const order of orders) {
        try {
          await axios.post(`${API}/orders`, order, axiosConfig);
          successCount++;
        } catch (error) {
          console.error(`Error creating order:`, error);
          failureCount++;
        }
      }

      toast.success(`Imported ${successCount} orders successfully${failureCount > 0 ? ` (${failureCount} failed)` : ''}`);
      fetchOrders();
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      console.error('Error importing file:', error);
      toast.error('Failed to import file. Please check the format.');
    } finally {
      setImporting(false);
    }
  };

  const getOrderStatusBadgeStyle = (status) => {
    switch (status) {
      case 'Open':
        return 'bg-blue-50 text-blue-700 border border-blue-200';
      case 'In Progress':
        return 'bg-purple-50 text-purple-700 border border-purple-200';
      case 'Completed':
        return 'bg-green-50 text-green-700 border border-green-200';
      case 'Cancelled':
        return 'bg-red-50 text-red-700 border border-red-200';
      default:
        return 'bg-gray-50 text-gray-700 border border-gray-200';
    }
  };

  const getSubscriptionBadgeStyle = (status) => {
    switch (status) {
      case 'Active':
        return 'bg-green-50 text-green-700 border border-green-200';
      case 'Expiring Soon':
        return 'bg-amber-50 text-amber-700 border border-amber-200';
      case 'Expired':
        return 'bg-red-50 text-red-700 border border-red-200';
      default:
        return 'bg-gray-50 text-gray-700 border border-gray-200';
    }
  };

  const pageHeaderActions = useMemo(
    () => (
      <>
        <Button
          onClick={handleDownloadTemplate}
          variant="outline"
          size="sm"
          className="border-blue-300 text-blue-600 hover:bg-blue-50 gap-1.5 h-9 sm:h-10 text-xs sm:text-sm"
        >
          <FileText className="w-4 h-4" />
          <span className="hidden md:inline">Download Template</span>
          <span className="md:hidden">Template</span>
        </Button>
        <Button
          onClick={() => fileInputRef.current?.click()}
          disabled={importing}
          size="sm"
          className="bg-purple-600 hover:bg-purple-700 text-white gap-1.5 h-9 sm:h-10 text-xs sm:text-sm"
        >
          <Upload className="w-4 h-4" />
          {importing ? 'Importing…' : (
            <>
              <span className="hidden md:inline">Import Orders</span>
              <span className="md:hidden">Import</span>
            </>
          )}
        </Button>
        <Button
          onClick={handleExportToExcel}
          size="sm"
          className="bg-green-600 hover:bg-green-700 text-white gap-1.5 h-9 sm:h-10 text-xs sm:text-sm"
        >
          <Download className="w-4 h-4" />
          <span className="hidden md:inline">Export to Excel</span>
          <span className="md:hidden">Export</span>
        </Button>
      </>
    ),
    [importing, handleDownloadTemplate, handleExportToExcel],
  );

  useRegisterPageHeader({
    subtitle: `${orders.length} total orders`,
    actions: pageHeaderActions,
  });

  // Main render
  return (
    <div className="space-y-6" data-testid="inventory-page">
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        onChange={handleFileImport}
        className="hidden"
        aria-hidden
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-5 sm:p-6 rounded-lg border border-gray-200 bg-white shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Orders</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{orders.length}</p>
            </div>
            <div className="p-3 bg-blue-50 rounded-lg">
              <Package className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </Card>

        <Card className="p-5 sm:p-6 rounded-lg border border-gray-200 bg-white shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Active</p>
              <p className="text-3xl font-bold text-green-600 mt-2">
                {orders.filter(o => o.subscription_status === 'Active').length}
              </p>
            </div>
            <div className="p-3 bg-green-50 rounded-lg">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </Card>

        <Card className="p-5 sm:p-6 rounded-lg border border-gray-200 bg-white shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Expiring Soon</p>
              <p className="text-3xl font-bold text-amber-600 mt-2">
                {orders.filter(o => o.subscription_status === 'Expiring Soon').length}
              </p>
            </div>
            <div className="p-3 bg-amber-50 rounded-lg">
              <AlertTriangle className="w-6 h-6 text-amber-600" />
            </div>
          </div>
        </Card>

        <Card className="p-5 sm:p-6 rounded-lg border border-gray-200 bg-white shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Expired</p>
              <p className="text-3xl font-bold text-red-600 mt-2">
                {orders.filter(o => o.subscription_status === 'Expired').length}
              </p>
            </div>
            <div className="p-3 bg-red-50 rounded-lg">
              <AlertCircle className="w-6 h-6 text-red-600" />
            </div>
          </div>
        </Card>
      </div>

      {/* Lead Filter Alert */}
      {filterByLeadId && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0" />
            <p className="text-sm font-medium text-blue-900">Filtered for a specific lead</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="border-blue-300 text-blue-600 hover:bg-blue-100"
            onClick={() => {
              setFilterByLeadId(null);
              applyFilters(orders, searchTerm, filterStatus, filterSubscription, null);
            }}
          >
            Clear Filter
          </Button>
        </div>
      )}

      {/* Expiring Orders Alert */}
      {expiringOrders.length > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-amber-900">Action Required</h3>
              <p className="text-sm text-amber-800 mt-1">
                {expiringOrders.length} subscription{expiringOrders.length !== 1 ? 's' : ''} will expire within 30 days.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Search and Filters */}
      <Card className="p-6 rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Search */}
          <div className="lg:col-span-3">
            <Label className="text-sm font-medium text-gray-700 mb-2 block">Search Orders</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search by customer, order ID, phone, or email..."
                value={searchTerm}
                onChange={(e) => handleSearch(e.target.value)}
                className="pl-10 border border-gray-300 h-10 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              />
            </div>
          </div>

          {/* Order Status Filter */}
          <div>
            <Label className="text-sm font-medium text-gray-700 mb-2 block">Order Status</Label>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={filterStatus === '' ? 'default' : 'outline'}
                size="sm"
                className={`${filterStatus === '' ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                onClick={() => handleStatusFilter('')}
              >
                All
              </Button>
              {ORDER_STATUSES.map(status => (
                <Button
                  key={status}
                  variant={filterStatus === status ? 'default' : 'outline'}
                  size="sm"
                  className={`${filterStatus === status ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                  onClick={() => handleStatusFilter(status)}
                >
                  {status}
                </Button>
              ))}
            </div>
          </div>

          {/* Subscription Status Filter */}
          <div>
            <Label className="text-sm font-medium text-gray-700 mb-2 block">Subscription Status</Label>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={filterSubscription === '' ? 'default' : 'outline'}
                size="sm"
                className={`${filterSubscription === '' ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                onClick={() => handleSubscriptionFilter('')}
              >
                All
              </Button>
              {SUBSCRIPTION_STATUSES.map(status => (
                <Button
                  key={status}
                  variant={filterSubscription === status ? 'default' : 'outline'}
                  size="sm"
                  className={`${filterSubscription === status ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                  onClick={() => handleSubscriptionFilter(status)}
                >
                  {status}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* Orders List */}
      {loading ? (
        <Card className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden p-16 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600 font-medium">Loading orders...</p>
          </div>
        </Card>
      ) : filteredOrders.length === 0 ? (
        <Card className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden p-16 text-center">
          <Package className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 font-semibold">No orders found</p>
          <p className="text-sm text-gray-400 mt-2">Try adjusting your search or filters</p>
        </Card>
      ) : (
        <Card className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Order ID</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Customer</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Contact</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Product</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Order Status</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Subscription</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Days Left</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map(order => (
                  <tr key={order.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="py-3 px-4 font-mono text-gray-900 font-medium">{order.order_id}</td>
                    <td className="py-3 px-4 text-gray-900 font-medium max-w-[150px] truncate" title={order.customer_name}>{order.customer_name}</td>
                    <td className="py-3 px-4 text-gray-600">
                      <div className="text-sm">{order.contact_person || '—'}</div>
                      {order.contact_number && <div className="text-xs text-gray-500">{order.contact_number}</div>}
                    </td>
                    <td className="py-3 px-4 text-gray-600 max-w-[120px] truncate" title={order.product}>{order.product || '—'}</td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex text-xs px-2.5 py-1 rounded font-semibold ${getOrderStatusBadgeStyle(order.order_status)}`}>
                        {order.order_status}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex text-xs px-2.5 py-1 rounded font-semibold ${getSubscriptionBadgeStyle(order.subscription_status)}`}>
                        {order.subscription_status}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {order.subscription_end_date && getDaysUntilExpiry(order.subscription_end_date) !== null ? (
                        <span className={`font-bold text-sm ${
                          getDaysUntilExpiry(order.subscription_end_date) <= 0 ? 'text-red-600' :
                          getDaysUntilExpiry(order.subscription_end_date) <= 30 ? 'text-amber-600' :
                          'text-green-600'
                        }`}>
                          {getDaysUntilExpiry(order.subscription_end_date)}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 border-gray-300 hover:bg-blue-50 text-gray-700"
                          onClick={() => handleViewDetails(order)}
                        >
                          <Eye className="w-3.5 h-3.5 mr-1" />
                          View
                        </Button>
                        {order.lead_id && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 border-blue-300 text-blue-700 hover:bg-blue-50"
                            onClick={() => navigate('/leads', { state: { highlightLeadId: order.lead_id } })}
                          >
                            <ArrowRight className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        {order.subscription_status === 'Expiring Soon' && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 border-amber-300 text-amber-700 hover:bg-amber-50"
                            onClick={() => handleSendReminder(order.id)}
                          >
                            <Bell className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Order Details Sheet */}
      <Sheet open={showDetails} onOpenChange={setShowDetails}>
        <SheetContent className="w-full sm:max-w-2xl bg-white p-0 overflow-y-auto">
          <SheetHeader className="px-6 py-4 border-b border-gray-200 sticky top-0 bg-white z-10">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-lg font-bold text-gray-900">Order Details</SheetTitle>
              {selectedOrder?.lead_id && (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-blue-300 text-blue-600 hover:bg-blue-50"
                  onClick={handleViewLead}
                >
                  View Lead
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              )}
            </div>
          </SheetHeader>

          {selectedOrder && (
            <div className="p-6 space-y-6">
              {/* Basic Info */}
              <div>
                <h3 className="font-semibold text-gray-900 mb-3">Basic Information</h3>
                <div className="space-y-2 text-sm bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <div className="flex justify-between"><span className="text-gray-600">Order ID:</span> <span className="font-medium">{selectedOrder.order_id}</span></div>
                  <div className="flex justify-between"><span className="text-gray-600">Customer:</span> <span className="font-medium">{selectedOrder.customer_name}</span></div>
                  <div className="flex justify-between"><span className="text-gray-600">Contact:</span> <span className="font-medium">{selectedOrder.contact_person || '—'}</span></div>
                  <div className="flex justify-between"><span className="text-gray-600">Phone:</span> <span className="font-medium">{selectedOrder.contact_number || '—'}</span></div>
                  <div className="flex justify-between"><span className="text-gray-600">Email:</span> <span className="font-medium text-xs">{selectedOrder.mail_id || '—'}</span></div>
                </div>
              </div>

              {/* Order Info */}
              <div>
                <h3 className="font-semibold text-gray-900 mb-3">Order Information</h3>
                <div className="space-y-2 text-sm bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <div className="flex justify-between"><span className="text-gray-600">Product:</span> <span className="font-medium">{selectedOrder.product || '—'}</span></div>
                  <div className="flex justify-between"><span className="text-gray-600">PO No:</span> <span className="font-medium">{selectedOrder.cust_po_no || '—'}</span></div>
                  <div className="flex justify-between"><span className="text-gray-600">PO Value:</span> <span className="font-medium">₹{selectedOrder.cust_supply_po_value?.toLocaleString('en-IN') || '—'}</span></div>
                  <div className="flex justify-between"><span className="text-gray-600">Status:</span> <span className="font-medium">{selectedOrder.order_status}</span></div>
                </div>
              </div>

              {/* Subscription & Estimation */}
              <div>
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-semibold text-gray-900">Subscription & Estimation</h3>
                  {!editingAll && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-gray-300 hover:bg-blue-50 text-blue-600"
                      onClick={handleOpenEditAll}
                    >
                      Edit
                    </Button>
                  )}
                </div>

                {editingAll ? (
                  <div className="space-y-3 bg-blue-50 border border-blue-200 p-4 rounded-lg">
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-gray-700">Subscription Start Date</Label>
                      <Input
                        type="date"
                        value={editFormData.subscription_start_date}
                        onChange={(e) => setEditFormData({ ...editFormData, subscription_start_date: e.target.value })}
                        className="h-10 border border-gray-300"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-gray-700">Subscription End Date</Label>
                      <Input
                        type="date"
                        value={editFormData.subscription_end_date}
                        onChange={(e) => setEditFormData({ ...editFormData, subscription_end_date: e.target.value })}
                        className="h-10 border border-gray-300"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-gray-700">Estimation (Story Points)</Label>
                      <Input
                        type="number"
                        step="0.5"
                        min="0"
                        value={editFormData.estimation}
                        onChange={(e) => setEditFormData({ ...editFormData, estimation: e.target.value })}
                        className="h-10 border border-gray-300"
                      />
                    </div>
                    <div className="flex gap-2 pt-2">
                      <Button
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                        onClick={handleSaveEditAll}
                        disabled={savingEdits}
                      >
                        {savingEdits ? '...Saving' : 'Save'}
                      </Button>
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => setEditingAll(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 text-sm bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <div className="flex justify-between"><span className="text-gray-600">Start Date:</span> <span className="font-medium">{selectedOrder.subscription_start_date ? new Date(selectedOrder.subscription_start_date).toLocaleDateString() : '—'}</span></div>
                    <div className="flex justify-between"><span className="text-gray-600">End Date:</span> <span className="font-medium">{selectedOrder.subscription_end_date ? new Date(selectedOrder.subscription_end_date).toLocaleDateString() : '—'}</span></div>
                    <div className="flex justify-between"><span className="text-gray-600">Estimation:</span> <span className="font-medium">{selectedOrder.estimation || '—'}</span></div>
                    {selectedOrder.subscription_status && (
                      <div className="flex justify-between pt-2 border-t border-gray-200"><span className="text-gray-600">Subscription Status:</span> <span className={`font-medium ${selectedOrder.subscription_status === 'Active' ? 'text-green-600' : selectedOrder.subscription_status === 'Expiring Soon' ? 'text-amber-600' : 'text-red-600'}`}>{selectedOrder.subscription_status}</span></div>
                    )}
                  </div>
                )}
              </div>

              {/* Renewal Reminders */}
              {selectedOrder.subscription_end_date && (
                <div>
                  <h3 className="font-semibold text-gray-900 mb-3">Send Renewal Reminders</h3>
                  <div className="space-y-2">
                    <Button
                      size="sm"
                      className="w-full bg-green-600 hover:bg-green-700 text-white"
                      onClick={() => handleSendReminderEmail(30)}
                      disabled={sendingReminder || selectedOrder.subscription_reminder_sent_30 === 'True'}
                    >
                      {selectedOrder.subscription_reminder_sent_30 === 'True' ? '✓ 30-day reminder sent' : 'Send 30-day reminder'}
                    </Button>
                    <Button
                      size="sm"
                      className="w-full bg-amber-600 hover:bg-amber-700 text-white"
                      onClick={() => handleSendReminderEmail(7)}
                      disabled={sendingReminder || selectedOrder.subscription_reminder_sent_7 === 'True'}
                    >
                      {selectedOrder.subscription_reminder_sent_7 === 'True' ? '✓ 7-day reminder sent' : 'Send 7-day reminder'}
                    </Button>
                    <Button
                      size="sm"
                      className="w-full bg-red-600 hover:bg-red-700 text-white"
                      onClick={() => handleSendReminderEmail(1)}
                      disabled={sendingReminder || selectedOrder.subscription_reminder_sent_1 === 'True'}
                    >
                      {selectedOrder.subscription_reminder_sent_1 === 'True' ? '✓ Last-minute reminder sent' : 'Send last-minute reminder'}
                    </Button>
                  </div>
                </div>
              )}

              {/* Activities */}
              <div>
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-semibold text-gray-900">Activity Timeline</h3>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowAddActivity(!showAddActivity)}
                  >
                    + Add
                  </Button>
                </div>

                {showAddActivity && (
                  <form onSubmit={handleAddActivity} className="mb-4 p-4 bg-gray-50 border border-gray-200 rounded-lg space-y-3">
                    <div>
                      <Label htmlFor="activityType" className="text-xs font-semibold text-gray-700">Type</Label>
                      <select
                        id="activityType"
                        name="activityType"
                        className="w-full px-3 py-2 border border-gray-300 rounded text-sm mt-1"
                      >
                        <option>Update</option>
                        <option>Status Change</option>
                        <option>Renewal Reminder</option>
                        <option>Note</option>
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="summary" className="text-xs font-semibold text-gray-700">Details</Label>
                      <Input
                        id="summary"
                        name="summary"
                        placeholder="Add activity details..."
                        className="h-10 border border-gray-300 mt-1"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white" size="sm">Add</Button>
                      <Button type="button" variant="outline" className="flex-1" size="sm" onClick={() => setShowAddActivity(false)}>Cancel</Button>
                    </div>
                  </form>
                )}

                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {activities.length === 0 ? (
                    <p className="text-sm text-gray-500 bg-gray-50 p-4 rounded text-center">No activities</p>
                  ) : (
                    activities.map(activity => (
                      <div key={activity.id} className="text-sm p-3 bg-gray-50 border border-gray-200 rounded">
                        <div className="flex justify-between items-start mb-1">
                          <p className="font-medium text-gray-900">{activity.activity_type}</p>
                        </div>
                        <p className="text-gray-700">{activity.summary}</p>
                        <p className="text-xs text-gray-500 mt-2">{new Date(activity.created_at).toLocaleString()}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default Inventory;

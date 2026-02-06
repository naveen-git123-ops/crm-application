import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Upload, Download, FileText, AlertCircle } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const authHeaders = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });

const DOCUMENT_TYPES = [
  { value: 'Aadhar', label: 'Aadhar Card' },
  { value: 'PAN', label: 'PAN Card' },
  { value: 'Education Certificate', label: 'Education Certificate' },
  { value: 'Offer Letter', label: 'Offer Letter' },
  { value: 'Resume', label: 'Resume' },
  { value: 'Other', label: 'Other' },
];

export const Documents = () => {
  const { user } = useAuth();
  const [documents, setDocuments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [formData, setFormData] = useState({
    employee_id: '',
    employee_name: '',
    document_type: 'Aadhar',
    expiry_date: '',
    file: null
  });
  const [selectedEmployeeForView, setSelectedEmployeeForView] = useState('');

  const canViewAllDocuments = ['Admin', 'HR', 'Manager'].includes(user?.role);
  const canUploadForOthers = ['Admin', 'HR', 'Manager'].includes(user?.role);

  useEffect(() => {
    fetchEmployees();
    fetchDocuments();
  }, []);

  useEffect(() => {
    if (dialogOpen && !canUploadForOthers && user?.employee_id) {
      setFormData(prev => ({
        ...prev,
        employee_id: user.employee_id,
        employee_name: user.name || ''
      }));
    }
  }, [dialogOpen, canUploadForOthers, user?.employee_id, user?.name]);

  const fetchEmployees = async () => {
    try {
      const response = await axios.get(`${API}/employees`, authHeaders());
      setEmployees(response.data);
    } catch (error) {
      toast.error('Failed to load employees');
    }
  };

  const fetchDocuments = async () => {
    try {
      const response = await axios.get(`${API}/documents`, authHeaders());
      setDocuments(response.data);
    } catch (error) {
      toast.error('Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.file) {
      toast.error('Please select a file');
      return;
    }

    setUploading(true);
    const uploadFormData = new FormData();
    uploadFormData.append('file', formData.file);
    uploadFormData.append('employee_id', formData.employee_id);
    uploadFormData.append('employee_name', formData.employee_name);
    uploadFormData.append('document_type', formData.document_type);
    if (formData.expiry_date) {
      uploadFormData.append('expiry_date', formData.expiry_date);
    }

    try {
      await axios.post(`${API}/documents/upload`, uploadFormData, {
        headers: {
          ...authHeaders().headers,
          'Content-Type': 'multipart/form-data'
        }
      });
      toast.success('Document uploaded successfully');
      setDialogOpen(false);
      resetForm();
      fetchDocuments();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (documentId, fileName) => {
    try {
      const response = await axios.get(`${API}/documents/${documentId}/download`, {
        ...authHeaders(),
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Document downloaded');
    } catch (error) {
      toast.error('Download failed');
    }
  };

  const resetForm = () => {
    setFormData({
      employee_id: '',
      employee_name: '',
      document_type: 'Aadhar',
      expiry_date: '',
      file: null
    });
  };

  const handleEmployeeChange = (businessEmployeeId) => {
    const employee = employees.find(emp => emp.employee_id === businessEmployeeId);
    setFormData({
      ...formData,
      employee_id: businessEmployeeId,
      employee_name: employee ? employee.name : ''
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  const baseDocuments = canViewAllDocuments ? documents : documents.filter(doc => String(doc.employee_id) === String(user?.employee_id));
  const filteredDocuments = canViewAllDocuments && selectedEmployeeForView
    ? baseDocuments.filter(doc => String(doc.employee_id) === String(selectedEmployeeForView))
    : baseDocuments;

  return (
    <div className="space-y-6" data-testid="documents-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Documents</h1>
          <p className="text-gray-600 text-sm mt-1">Upload essential documents (Aadhar, PAN, education certificates). Who can view is set in Role Management.</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="bg-blue-600 text-white font-medium hover:bg-blue-700 h-10" data-testid="upload-document-button">
              <Upload className="h-4 w-4 mr-2" />
              Upload Document
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg bg-white border-0 shadow-2xl p-0">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-6">
              <DialogHeader>
                <DialogTitle className="text-xl font-bold text-white">Upload Document</DialogTitle>
                <p className="text-blue-100 text-sm">{canUploadForOthers ? 'Attach document for an employee' : 'Upload your essential documents after joining'}</p>
              </DialogHeader>
            </div>
            <form onSubmit={handleSubmit} className="space-y-6 p-6">
              {canUploadForOthers ? (
                <div className="space-y-2">
                  <Label htmlFor="employee" className="text-sm font-medium text-gray-700">Employee *</Label>
                  <select
                    id="employee"
                    data-testid="document-employee-select"
                    value={formData.employee_id}
                    onChange={(e) => handleEmployeeChange(e.target.value)}
                    className="flex h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    required
                  >
                    <option value="">Select employee</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.employee_id}>
                        {emp.name} ({emp.employee_id})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="space-y-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <Label className="text-sm font-medium text-gray-700">Uploading for</Label>
                  <p className="font-medium text-gray-900">{user?.name}</p>
                  <p className="text-sm text-gray-600">ID: {user?.employee_id}</p>
                  <input type="hidden" name="employee_id" value={user?.employee_id || ''} />
                  <input type="hidden" name="employee_name" value={user?.name || ''} />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="document_type" className="text-sm font-medium text-gray-700">Document Type *</Label>
                <select
                  id="document_type"
                  data-testid="document-type-select"
                  value={formData.document_type}
                  onChange={(e) => setFormData({ ...formData, document_type: e.target.value })}
                  className="flex h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  required
                >
                  {DOCUMENT_TYPES.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

                <div className="space-y-2">
                  <Label htmlFor="expiry_date" className="text-sm font-medium text-gray-700">Expiry Date (Optional)</Label>
                  <Input
                    id="expiry_date"
                    type="date"
                    data-testid="document-expiry-date"
                    value={formData.expiry_date}
                    onChange={(e) => setFormData({ ...formData, expiry_date: e.target.value })}
                    className="border border-gray-300 h-11 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="file" className="text-sm font-medium text-gray-700">File *</Label>
                  <Input
                    id="file"
                    type="file"
                    data-testid="document-file-input"
                    onChange={(e) => setFormData({ ...formData, file: e.target.files[0] })}
                    required
                    className="border border-gray-300"
                  />
                  <p className="text-xs text-gray-600">Max file size: 10MB</p>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="border-gray-300 text-gray-700 hover:bg-gray-50">
                    Cancel
                  </Button>
                  <Button type="submit" data-testid="upload-submit-button" className="bg-blue-600 text-white hover:bg-blue-700">
                    Upload
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
      </div>

      {/* Admin/HR: Select employee to view their documents */}
      {canViewAllDocuments && (
        <Card className="p-4 rounded-lg border border-gray-200 bg-white shadow-sm">
          <Label className="text-sm font-semibold text-gray-700">View documents for</Label>
          <select
            value={selectedEmployeeForView}
            onChange={(e) => setSelectedEmployeeForView(e.target.value)}
            className="mt-2 flex h-10 w-full max-w-sm rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          >
            <option value="">All employees</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.employee_id}>
                {emp.name} ({emp.employee_id})
              </option>
            ))}
          </select>
          {selectedEmployeeForView && (
            <p className="mt-2 text-sm text-gray-600">
              Showing {filteredDocuments.length} document(s) for {employees.find(e => e.employee_id === selectedEmployeeForView)?.name || selectedEmployeeForView}
            </p>
          )}
        </Card>
      )}

      {/* Employee: Your documents section */}
      {!canViewAllDocuments && (
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-blue-600" />
          <h2 className="text-lg font-semibold text-gray-900">Your documents</h2>
        </div>
      )}

      {/* Documents list */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredDocuments.map((document) => {
          const isExpired = document.expiry_date && new Date(document.expiry_date) < new Date();
          const isExpiringSoon = document.expiry_date && 
            new Date(document.expiry_date) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) &&
            !isExpired;

          return (
            <Card key={document.id} className="p-6 border border-gray-200 bg-white hover:shadow-md transition-shadow" data-testid={`document-card-${document.id}`}>
              <div className="space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <FileText className="h-5 w-5 text-indigo-600" />
                      <h3 className="text-lg font-semibold truncate text-gray-900">{document.document_type}</h3>
                    </div>
                    <p className="text-sm text-gray-600">{document.employee_name}</p>
                  </div>
                  {(isExpired || isExpiringSoon) && (
                    <AlertCircle className={`h-5 w-5 ${isExpired ? 'text-rose-500' : 'text-amber-500'}`} />
                  )}
                </div>

                <div className="space-y-2 text-sm">
                  <div>
                    <p className="text-gray-600">File Name</p>
                    <p className="font-medium truncate text-gray-900">{document.file_name}</p>
                  </div>
                  {document.expiry_date && (
                    <div>
                      <p className="text-gray-600">Expiry Date</p>
                      <p className={`font-mono font-medium ${
                        isExpired ? 'text-rose-500' : isExpiringSoon ? 'text-amber-500' : 'text-gray-900'
                      }`}>
                        {document.expiry_date}
                        {isExpired && ' (Expired)'}
                        {isExpiringSoon && ' (Expiring Soon)'}
                      </p>
                    </div>
                  )}
                  <div>
                    <p className="text-gray-600">Uploaded</p>
                    <p className="font-mono text-xs text-gray-600">{new Date(document.uploaded_at).toLocaleDateString()}</p>
                  </div>
                </div>

                <Button
                  variant="outline"
                  className="w-full border-gray-200 text-blue-600 hover:bg-blue-50 h-10"
                  onClick={() => handleDownload(document.id, document.file_name)}
                  data-testid={`download-document-${document.id}`}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      {filteredDocuments.length === 0 && (
        <Card className="p-12 text-center border border-gray-200 bg-white">
          <FileText className="h-12 w-12 mx-auto mb-2 opacity-20" />
          <p className="text-gray-600">No documents uploaded yet</p>
        </Card>
      )}
    </div>
  );
};
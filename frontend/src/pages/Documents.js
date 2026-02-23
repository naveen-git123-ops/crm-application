import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Upload, Download, FileText, AlertCircle, RefreshCw, Eye } from 'lucide-react';

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
  const [reloading, setReloading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewDocument, setPreviewDocument] = useState(null);
  const [selectedEmployeeForView, setSelectedEmployeeForView] = useState('');
  const [formData, setFormData] = useState({
    employee_id: '',
    employee_name: '',
    document_type: 'Aadhar',
    expiry_date: '',
    file: null
  });

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

  const handleReload = async () => {
    setReloading(true);
    try {
      const response = await axios.get(`${API}/documents`, authHeaders());
      setDocuments(response.data);
      toast.success('Documents reloaded');
    } catch (error) {
      toast.error('Failed to reload documents');
    } finally {
      setReloading(false);
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

  const handlePreview = (doc) => {
    setPreviewDocument(doc);
    setPreviewOpen(true);
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

  const handleEmployeeChange = (empId) => {
    const employee = employees.find(emp => emp.employee_id === empId);
    setFormData({
      ...formData,
      employee_id: empId,
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

  const baseDocuments = canViewAllDocuments 
    ? documents 
    : documents.filter(doc => String(doc.employee_id) === String(user?.employee_id));
  const filteredDocuments = canViewAllDocuments && selectedEmployeeForView
    ? baseDocuments.filter(doc => String(doc.employee_id) === String(selectedEmployeeForView))
    : baseDocuments;

  return (
    <div className="space-y-6" data-testid="documents-page">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Documents</h1>
          <p className="text-gray-600 text-sm mt-1">Upload and manage documents. Who can view is set in Role Management.</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleReload}
            disabled={reloading}
            className="border-gray-300 text-gray-700 hover:bg-gray-50 h-10"
          >
            <RefreshCw className={reloading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-blue-600 text-white font-medium hover:bg-blue-700 h-10">
                <Upload className="h-4 w-4 mr-2" />
                Upload Document
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-6 -m-6 mb-6">
                <DialogHeader>
                  <DialogTitle className="text-xl font-bold text-white">Upload Document</DialogTitle>
                  <p className="text-blue-100 text-sm mt-1">
                    {canUploadForOthers ? 'Attach document for an employee' : 'Upload your documents'}
                  </p>
                </DialogHeader>
              </div>
              <form onSubmit={handleSubmit} className="space-y-6 px-6 pb-6">
                {canUploadForOthers ? (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Employee *</Label>
                    <select
                      value={formData.employee_id}
                      onChange={(e) => handleEmployeeChange(e.target.value)}
                      className="flex h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
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
                    <Label className="text-sm font-medium">Upload for: {user?.name}</Label>
                    <p className="text-sm text-gray-600">ID: {user?.employee_id}</p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Document Type *</Label>
                  <select
                    value={formData.document_type}
                    onChange={(e) => setFormData({ ...formData, document_type: e.target.value })}
                    className="flex h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    required
                  >
                    {DOCUMENT_TYPES.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Expiry Date (Optional)</Label>
                  <Input
                    type="date"
                    value={formData.expiry_date}
                    onChange={(e) => setFormData({ ...formData, expiry_date: e.target.value })}
                    className="h-11"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">File *</Label>
                  <Input
                    type="file"
                    onChange={(e) => setFormData({ ...formData, file: e.target.files?.[0] || null })}
                    required
                    className="h-11"
                  />
                  <p className="text-xs text-gray-600">Max file size: 10MB</p>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={uploading}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    Upload
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {canViewAllDocuments && (
        <Card className="p-4 bg-white">
          <Label className="text-sm font-semibold">View documents for</Label>
          <select
            value={selectedEmployeeForView}
            onChange={(e) => setSelectedEmployeeForView(e.target.value)}
            className="mt-2 flex h-10 w-full max-w-sm rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          >
            <option value="">All employees</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.employee_id}>
                {emp.name} ({emp.employee_id})
              </option>
            ))}
          </select>
        </Card>
      )}

      {!canViewAllDocuments && (
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-blue-600" />
          <h2 className="text-lg font-semibold">Your documents</h2>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredDocuments.map((document) => {
          const isExpired = document.expiry_date && new Date(document.expiry_date) < new Date();
          const isExpiringSoon = document.expiry_date && 
            new Date(document.expiry_date) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) &&
            !isExpired;

          return (
            <Card key={document.id} className="p-6 hover:shadow-md transition-shadow bg-white">
              <div className="space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <FileText className="h-5 w-5 text-indigo-600" />
                      <h3 className="text-lg font-semibold truncate">{document.document_type}</h3>
                    </div>
                    <p className="text-sm text-gray-600">{document.employee_name}</p>
                  </div>
                  {(isExpired) && (
                    <AlertCircle className="h-5 w-5 text-red-600" />
                  )}
                </div>

                <div className="space-y-1 text-sm">
                  <p className="text-gray-600 truncate">{document.file_name}</p>
                  {document.expiry_date && (
                    <p className={isExpired ? 'text-red-600' : 'text-gray-600'}>
                      Expires: {document.expiry_date} {isExpired && '(Expired)'}
                    </p>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1 h-10"
                    onClick={() => handlePreview(document)}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    Preview
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 h-10"
                    onClick={() => handleDownload(document.id, document.file_name)}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {filteredDocuments.length === 0 && (
        <Card className="p-12 text-center bg-white">
          <FileText className="h-12 w-12 mx-auto mb-2 opacity-20" />
          <p className="text-gray-600">No documents</p>
        </Card>
      )}

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-white">
          <DialogHeader className="sticky top-0 bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-6 -m-6 mb-6">
            <DialogTitle className="text-xl font-bold text-white">
              Preview - {previewDocument?.document_type}
            </DialogTitle>
          </DialogHeader>
          
          {previewDocument && (
            <div className="px-6 pb-6 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-600 font-medium">Employee</p>
                  <p className="text-gray-900">{previewDocument.employee_name}</p>
                </div>
                <div>
                  <p className="text-gray-600 font-medium">File</p>
                  <p className="truncate text-gray-900">{previewDocument.file_name}</p>
                </div>
                {previewDocument.expiry_date && (
                  <div>
                    <p className="text-gray-600 font-medium">Expiry</p>
                    <p className="text-gray-900">{previewDocument.expiry_date}</p>
                  </div>
                )}
                <div>
                  <p className="text-gray-600 font-medium">Uploaded</p>
                  <p className="text-gray-900">{new Date(previewDocument.uploaded_at).toLocaleDateString()}</p>
                </div>
              </div>

              {previewDocument.file_path && (
                <div className="border-t pt-4">
                  <p className="text-gray-600 font-medium mb-3">Preview</p>
                  {['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(previewDocument.file_name?.split('.').pop()?.toLowerCase()) && (
                    <div className="bg-gray-50 rounded-lg p-4 flex justify-center">
                      <img src={previewDocument.file_path} alt="preview" className="max-w-full max-h-96 rounded" crossOrigin="anonymous" />
                    </div>
                  )}
                  {previewDocument.file_name?.toLowerCase().endsWith('.pdf') && (
                    <iframe src={previewDocument.file_path} className="w-full h-96 rounded" title="preview" />
                  )}
                  {!['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(previewDocument.file_name?.split('.').pop()?.toLowerCase()) && !previewDocument.file_name?.toLowerCase().endsWith('.pdf') && (
                    <div className="bg-gray-50 rounded-lg p-6 text-center">
                      <p className="text-gray-600 text-sm mb-4">Preview not available</p>
                      <Button onClick={() => handleDownload(previewDocument.id, previewDocument.file_name)}>
                        <Download className="h-4 w-4 mr-2" />
                        Download
                      </Button>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button variant="outline" onClick={() => setPreviewOpen(false)}>Close</Button>
                <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => {
                  handleDownload(previewDocument.id, previewDocument.file_name);
                  setPreviewOpen(false);
                }}>
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
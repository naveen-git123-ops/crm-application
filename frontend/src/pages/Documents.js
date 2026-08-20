import React, { useMemo, useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useRegisterPageHeader } from '@/contexts/PageHeaderContext';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import {
  Upload,
  Download,
  FileText,
  AlertCircle,
  RefreshCw,
  Eye,
  Search,
  Image as ImageIcon,
  FileArchive,
  User,
  Calendar,
  FolderOpen,
} from 'lucide-react';

import { API_ENDPOINT } from '@/lib/apiConfig';

const API = API_ENDPOINT;
const authHeaders = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
const OTHER_PREFIX = 'Other — ';

const DOCUMENT_TYPES = [
  { value: 'Aadhar', label: 'Aadhar Card' },
  { value: 'PAN', label: 'PAN Card' },
  { value: 'Education Certificate', label: 'Education Certificate' },
  { value: 'Offer Letter', label: 'Offer Letter' },
  { value: 'Resume', label: 'Resume' },
  { value: 'Other', label: 'Other' },
];

const EMPTY_UPLOAD_FORM = {
  employee_id: '',
  employee_name: '',
  document_type: 'Aadhar',
  other_document_name: '',
  expiry_date: '',
  file: null,
};

const isOtherDocumentType = (type) => {
  const t = String(type || '').trim();
  return t === 'Other' || t.startsWith('Other — ') || t.startsWith('Other - ');
};

const documentDisplayName = (type) => {
  const t = String(type || '').trim();
  if (t.startsWith('Other — ')) return t.slice(OTHER_PREFIX.length).trim() || 'Other document';
  if (t.startsWith('Other - ')) return t.slice('Other - '.length).trim() || 'Other document';
  const known = DOCUMENT_TYPES.find((d) => d.value === t);
  return known?.label || t || 'Document';
};

const documentCategoryLabel = (type) => {
  if (isOtherDocumentType(type)) return 'Other';
  const known = DOCUMENT_TYPES.find((d) => d.value === type);
  return known?.label || type || 'Document';
};

const storedDocumentType = (form) => {
  if (form.document_type !== 'Other') return form.document_type;
  const custom = String(form.other_document_name || '').trim();
  return custom ? `${OTHER_PREFIX}${custom}` : 'Other';
};

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
  const [previewBlobUrl, setPreviewBlobUrl] = useState('');
  const [previewMimeType, setPreviewMimeType] = useState('');
  const [previewTextContent, setPreviewTextContent] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [selectedEmployeeForView, setSelectedEmployeeForView] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [formData, setFormData] = useState(EMPTY_UPLOAD_FORM);

  const canViewAllDocuments = ['Admin', 'HR', 'Manager'].includes(user?.role);
  const canUploadForOthers = ['Admin', 'HR', 'Manager'].includes(user?.role);
  const bytesToSize = (bytes) => {
    const size = Number(bytes || 0);
    if (!size) return 'Unknown size';
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(2)} MB`;
  };
  const extOf = (name) => String(name || '').split('.').pop()?.toLowerCase() || '';
  const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'avif', 'jfif', 'ico'];
  const PREVIEWABLE_TEXT_EXTENSIONS = ['txt', 'csv', 'json', 'xml', 'md', 'html', 'htm', 'log'];
  const isImageFile = (doc) => IMAGE_EXTENSIONS.includes(extOf(doc?.file_name));
  const isPdfFile = (doc) => extOf(doc?.file_name) === 'pdf';
  const isTextLikeFile = (doc) => PREVIEWABLE_TEXT_EXTENSIONS.includes(extOf(doc?.file_name));
  const isHttpUrl = (v) => /^https?:\/\//i.test(String(v || ''));
  const inferredMimeType = (doc, fallback = '') => {
    const ext = extOf(doc?.file_name);
    if (ext === 'pdf') return 'application/pdf';
    if (IMAGE_EXTENSIONS.includes(ext)) return `image/${ext === 'jpg' ? 'jpeg' : ext}`;
    if (PREVIEWABLE_TEXT_EXTENSIONS.includes(ext)) return 'text/plain';
    return fallback || 'application/octet-stream';
  };

  useEffect(() => {
    return () => {
      if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl);
    };
  }, [previewBlobUrl]);

  useEffect(() => {
    fetchEmployees();
    fetchDocuments();
  }, []);

  useEffect(() => {
    if (dialogOpen && !canUploadForOthers && user?.employee_id) {
      setFormData((prev) => ({
        ...prev,
        employee_id: user.employee_id,
        employee_name: user.name || '',
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
    if (formData.file.size > 10 * 1024 * 1024) {
      toast.error('File size exceeds 10MB limit');
      return;
    }
    if (formData.document_type === 'Other' && !String(formData.other_document_name || '').trim()) {
      toast.error('Enter the name of the document you are uploading');
      return;
    }

    setUploading(true);
    const uploadFormData = new FormData();
    uploadFormData.append('file', formData.file);
    uploadFormData.append('employee_id', formData.employee_id);
    uploadFormData.append('employee_name', formData.employee_name);
    uploadFormData.append('document_type', storedDocumentType(formData));
    if (formData.expiry_date) {
      uploadFormData.append('expiry_date', formData.expiry_date);
    }

    try {
      await axios.post(`${API}/documents/upload`, uploadFormData, {
        headers: {
          ...authHeaders().headers,
          'Content-Type': 'multipart/form-data',
        },
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
        responseType: 'blob',
        validateStatus: () => true,
      });
      if (response.status >= 400) {
        toast.error(response.status === 404 ? 'File not found on server' : 'Download failed');
        return;
      }
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

  const handlePreview = async (doc) => {
    setPreviewLoading(true);
    setPreviewError('');
    setPreviewTextContent('');
    if (previewBlobUrl) {
      URL.revokeObjectURL(previewBlobUrl);
      setPreviewBlobUrl('');
    }
    setPreviewDocument(doc);
    setPreviewOpen(true);
    try {
      let response = await axios.get(`${API}/documents/${doc.id}/download`, {
        ...authHeaders(),
        responseType: 'blob',
        validateStatus: () => true,
      });

      if (response.status >= 400 && isHttpUrl(doc?.file_path)) {
        response = await axios.get(`${API}/files/stream`, {
          ...authHeaders(),
          params: { file_url: doc.file_path },
          responseType: 'blob',
          validateStatus: () => true,
        });
      }

      if (response.status >= 400) {
        setPreviewError(response.status === 404 ? 'File not found on server.' : 'Could not load preview. You can still download the file.');
        return;
      }

      const rawBlob = response.data;
      const mimeFromHeader = String(response.headers?.['content-type'] || '').toLowerCase();
      const normalizedMime = inferredMimeType(doc, mimeFromHeader || rawBlob?.type || '').toLowerCase();
      const blob = new Blob([rawBlob], { type: normalizedMime });
      const mime = normalizedMime;
      setPreviewMimeType(mime);
      setPreviewBlobUrl(URL.createObjectURL(blob));
      if (isTextLikeFile(doc) || mime.startsWith('text/') || mime.includes('json') || mime.includes('xml')) {
        try {
          const text = await blob.text();
          setPreviewTextContent(text.slice(0, 200000));
        } catch {
          setPreviewTextContent('');
        }
      }
    } catch (error) {
      setPreviewError('Could not load preview. You can still download the file.');
    } finally {
      setPreviewLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      ...EMPTY_UPLOAD_FORM,
      ...(!canUploadForOthers && user?.employee_id
        ? { employee_id: user.employee_id, employee_name: user.name || '' }
        : {}),
    });
  };

  const handleEmployeeChange = (empId) => {
    const employee = employees.find((emp) => emp.employee_id === empId);
    setFormData({
      ...formData,
      employee_id: empId,
      employee_name: employee ? employee.name : '',
    });
  };

  const handleTypeChange = (value) => {
    setFormData((prev) => ({
      ...prev,
      document_type: value,
      other_document_name: value === 'Other' ? prev.other_document_name : '',
    }));
  };

  const baseDocuments = canViewAllDocuments
    ? documents
    : documents.filter((doc) => String(doc.employee_id) === String(user?.employee_id));
  const filteredDocuments = canViewAllDocuments && selectedEmployeeForView
    ? baseDocuments.filter((doc) => String(doc.employee_id) === String(selectedEmployeeForView))
    : baseDocuments;
  const searchedDocuments = filteredDocuments.filter((doc) => {
    if (typeFilter !== 'All') {
      if (typeFilter === 'Other') {
        if (!isOtherDocumentType(doc.document_type)) return false;
      } else if (documentCategoryLabel(doc.document_type) !== typeFilter && doc.document_type !== typeFilter) {
        return false;
      }
    }
    if (!searchQuery.trim()) return true;
    const q = searchQuery.trim().toLowerCase();
    return [documentDisplayName(doc.document_type), doc.document_type, doc.employee_name, doc.employee_id, doc.file_name]
      .map((v) => String(v || '').toLowerCase())
      .some((v) => v.includes(q));
  });

  const knownTypeValues = new Set(DOCUMENT_TYPES.map((d) => d.value));
  const availableDocumentTypes = [
    'All',
    ...DOCUMENT_TYPES.map((d) => d.value),
    ...Array.from(
      new Set(
        baseDocuments
          .map((d) => d.document_type)
          .filter((t) => t && !knownTypeValues.has(t) && !isOtherDocumentType(t)),
      ),
    ),
  ];

  const now = Date.now();
  const expiredCount = baseDocuments.filter((d) => d.expiry_date && new Date(d.expiry_date).getTime() < now).length;
  const expiringSoonCount = baseDocuments.filter((d) => {
    if (!d.expiry_date) return false;
    const t = new Date(d.expiry_date).getTime();
    return t >= now && t < now + 30 * 24 * 60 * 60 * 1000;
  }).length;

  const pageHeaderActions = useMemo(
    () => (
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleReload}
          disabled={reloading}
          className="border-gray-300 text-gray-700 hover:bg-gray-50 h-9"
        >
          <RefreshCw className={reloading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
        </Button>
        <Button
          className="bg-blue-600 text-white font-medium hover:bg-blue-700 h-9"
          onClick={() => {
            resetForm();
            setDialogOpen(true);
          }}
        >
          <Upload className="h-4 w-4 mr-2" />
          Upload document
        </Button>
      </div>
    ),
    [reloading],
  );

  useRegisterPageHeader({
    subtitle: `${baseDocuments.length} document${baseDocuments.length === 1 ? '' : 's'} on file`,
    actions: pageHeaderActions,
    enabled: !loading,
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-5" data-testid="documents-page">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Total documents</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{baseDocuments.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Expiring in 30 days</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-amber-600">{expiringSoonCount}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Expired</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-rose-600">{expiredCount}</p>
        </Card>
      </div>

      <Card className="p-4">
        <div className={`grid gap-3 ${canViewAllDocuments ? 'grid-cols-1 md:grid-cols-3' : 'grid-cols-1 md:grid-cols-2'}`}>
          {canViewAllDocuments ? (
            <div>
              <Label className="text-xs font-semibold text-gray-600">Employee</Label>
              <select
                value={selectedEmployeeForView}
                onChange={(e) => setSelectedEmployeeForView(e.target.value)}
                className="mt-1.5 flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              >
                <option value="">All employees</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.employee_id}>
                    {emp.name} ({emp.employee_id})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="flex items-center gap-2 pt-6">
              <FolderOpen className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-sm font-semibold text-gray-900">Your documents</p>
                <p className="text-xs text-gray-500">{user?.name} · {user?.employee_id}</p>
              </div>
            </div>
          )}
          <div>
            <Label className="text-xs font-semibold text-gray-600">Document type</Label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="mt-1.5 flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              {availableDocumentTypes.map((typ) => (
                <option key={typ} value={typ}>
                  {typ === 'All' ? 'All types' : documentCategoryLabel(typ)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs font-semibold text-gray-600">Search</Label>
            <div className="relative mt-1.5">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Document name, file, employee..."
                className="h-10 pl-9"
              />
            </div>
          </div>
        </div>
      </Card>

      <p className="text-sm text-gray-600">
        Showing <span className="font-semibold text-gray-900">{searchedDocuments.length}</span> document
        {searchedDocuments.length === 1 ? '' : 's'}
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {searchedDocuments.map((document) => {
          const isExpired = document.expiry_date && new Date(document.expiry_date) < new Date();
          const isExpiringSoon =
            document.expiry_date &&
            new Date(document.expiry_date) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) &&
            !isExpired;
          const fileExt = extOf(document.file_name).toUpperCase() || 'FILE';
          const title = documentDisplayName(document.document_type);
          const category = documentCategoryLabel(document.document_type);

          return (
            <Card key={document.id} className="p-0 border border-gray-200 hover:border-gray-300 hover:shadow-md transition-all bg-white overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 bg-slate-50/80 flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="h-10 w-10 rounded-lg bg-white border border-gray-200 flex items-center justify-center shrink-0">
                    {isImageFile(document) ? (
                      <ImageIcon className="h-5 w-5 text-blue-600" />
                    ) : (
                      <FileText className="h-5 w-5 text-blue-600" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-gray-900 truncate" title={title}>
                      {title}
                    </h3>
                    <span className="mt-1 inline-flex items-center rounded-full bg-white border border-gray-200 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                      {category}
                    </span>
                  </div>
                </div>
                {isExpired ? <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-1" /> : null}
              </div>

              <div className="p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm text-gray-700">
                  <User className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                  <span className="truncate">{document.employee_name}</span>
                  <span className="text-xs text-gray-400 shrink-0">{document.employee_id}</span>
                </div>
                <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Document file</p>
                  <p className="text-sm text-gray-900 truncate mt-0.5" title={document.file_name}>
                    {document.file_name || 'Unnamed file'}
                  </p>
                  <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                    <span className="inline-flex px-1.5 py-0.5 rounded bg-white border border-gray-200 text-gray-700">{fileExt}</span>
                    <span>{bytesToSize(document.file_size)}</span>
                  </div>
                </div>
                {document.expiry_date ? (
                  <p className={`flex items-center gap-1.5 text-xs ${isExpired ? 'text-red-600' : isExpiringSoon ? 'text-amber-600' : 'text-gray-500'}`}>
                    <Calendar className="h-3.5 w-3.5" />
                    Expires {document.expiry_date}
                    {isExpired ? ' · Expired' : isExpiringSoon ? ' · Expiring soon' : ''}
                  </p>
                ) : (
                  <p className="text-xs text-gray-400">No expiry date</p>
                )}

                <div className="flex gap-2 pt-1">
                  <Button variant="outline" className="flex-1 h-9 text-sm" onClick={() => handlePreview(document)}>
                    <Eye className="h-4 w-4 mr-1.5" />
                    Preview
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 h-9 text-sm"
                    onClick={() => handleDownload(document.id, document.file_name)}
                  >
                    <Download className="h-4 w-4 mr-1.5" />
                    Download
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {searchedDocuments.length === 0 && (
        <Card className="p-12 text-center border border-dashed border-gray-300 bg-white">
          <FileArchive className="h-10 w-10 mx-auto mb-3 text-gray-300" />
          <p className="text-gray-800 font-medium">No documents found</p>
          <p className="text-sm text-gray-500 mt-1">Upload a file to start the employee document folder.</p>
        </Card>
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent className="max-w-lg bg-white rounded-lg border border-gray-200 shadow-xl p-0">
          <div className="border-b border-gray-200 px-5 py-4">
            <DialogHeader className="space-y-1">
              <DialogTitle className="text-lg font-semibold text-gray-900">Upload document</DialogTitle>
              <p className="text-sm text-gray-500">
                {canUploadForOthers ? 'Attach a file to an employee record' : 'Add a document to your profile'}
              </p>
            </DialogHeader>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
            {canUploadForOthers ? (
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-gray-800">Employee *</Label>
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
              <div className="rounded-lg border border-gray-200 bg-slate-50 px-3 py-2.5">
                <p className="text-sm font-medium text-gray-900">{user?.name}</p>
                <p className="text-xs text-gray-500">Employee ID {user?.employee_id}</p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-gray-800">Document type *</Label>
              <select
                value={formData.document_type}
                onChange={(e) => handleTypeChange(e.target.value)}
                className="flex h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                required
              >
                {DOCUMENT_TYPES.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {formData.document_type === 'Other' ? (
              <div className="space-y-1.5 rounded-lg border border-blue-100 bg-blue-50/60 p-3">
                <Label className="text-sm font-medium text-gray-800">Which document are you uploading? *</Label>
                <Input
                  value={formData.other_document_name}
                  onChange={(e) => setFormData({ ...formData, other_document_name: e.target.value })}
                  placeholder="e.g. Passport, Driving licence, Experience letter"
                  className="h-11 bg-white"
                  required
                  maxLength={80}
                />
                <p className="text-xs text-gray-600">This name is shown on the document after upload.</p>
              </div>
            ) : null}

            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-gray-800">Expiry date (optional)</Label>
              <Input
                type="date"
                value={formData.expiry_date}
                onChange={(e) => setFormData({ ...formData, expiry_date: e.target.value })}
                className="h-11"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-gray-800">File *</Label>
              <Input
                type="file"
                onChange={(e) => setFormData({ ...formData, file: e.target.files?.[0] || null })}
                required
                className="h-11"
              />
              {formData.file ? (
                <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Selected file</p>
                  <p className="text-sm text-gray-900 truncate mt-0.5">{formData.file.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{bytesToSize(formData.file.size)}</p>
                </div>
              ) : (
                <p className="text-xs text-gray-500">PDF, images, Office files, and archives. Maximum 10 MB.</p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={uploading} className="bg-blue-600 hover:bg-blue-700">
                {uploading ? 'Uploading…' : 'Upload'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={previewOpen}
        onOpenChange={(open) => {
          setPreviewOpen(open);
          if (!open) {
            setPreviewError('');
            setPreviewMimeType('');
            setPreviewTextContent('');
            if (previewBlobUrl) {
              URL.revokeObjectURL(previewBlobUrl);
              setPreviewBlobUrl('');
            }
          }
        }}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-white p-0">
          <div className="sticky top-0 z-10 border-b border-gray-200 bg-white px-5 py-4">
            <DialogHeader className="space-y-1">
              <DialogTitle className="text-lg font-semibold text-gray-900">
                {documentDisplayName(previewDocument?.document_type)}
              </DialogTitle>
              <p className="text-sm text-gray-500">
                {documentCategoryLabel(previewDocument?.document_type)}
                {previewDocument?.file_name ? ` · ${previewDocument.file_name}` : ''}
              </p>
            </DialogHeader>
          </div>

          {previewDocument && (
            <div className="px-5 pb-5 space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-500 text-xs font-medium uppercase tracking-wide">Employee</p>
                  <p className="text-gray-900 mt-0.5">{previewDocument.employee_name}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs font-medium uppercase tracking-wide">Document name</p>
                  <p className="text-gray-900 mt-0.5">{documentDisplayName(previewDocument.document_type)}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs font-medium uppercase tracking-wide">File</p>
                  <p className="truncate text-gray-900 mt-0.5">{previewDocument.file_name}</p>
                </div>
                {previewDocument.expiry_date && (
                  <div>
                    <p className="text-gray-500 text-xs font-medium uppercase tracking-wide">Expiry</p>
                    <p className="text-gray-900 mt-0.5">{previewDocument.expiry_date}</p>
                  </div>
                )}
                <div>
                  <p className="text-gray-500 text-xs font-medium uppercase tracking-wide">Uploaded</p>
                  <p className="text-gray-900 mt-0.5">{new Date(previewDocument.uploaded_at).toLocaleDateString()}</p>
                </div>
              </div>

              {previewDocument.file_path && (
                <div className="border-t border-gray-100 pt-4">
                  {previewLoading && (
                    <div className="bg-gray-50 rounded-lg p-10 text-center text-gray-600">
                      <RefreshCw className="h-5 w-5 mx-auto mb-2 animate-spin" />
                      Loading preview...
                    </div>
                  )}
                  {!previewLoading && previewError && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
                      <p className="text-red-700 text-sm mb-4">{previewError}</p>
                      <Button onClick={() => handleDownload(previewDocument.id, previewDocument.file_name)}>
                        <Download className="h-4 w-4 mr-2" />
                        Download
                      </Button>
                    </div>
                  )}
                  {!previewLoading && !previewError && previewBlobUrl && (isImageFile(previewDocument) || previewMimeType.startsWith('image/')) && (
                    <div className="bg-gray-50 rounded-lg p-4 flex justify-center">
                      <img src={previewBlobUrl} alt="preview" className="max-w-full max-h-[70vh] rounded" />
                    </div>
                  )}
                  {!previewLoading && !previewError && previewBlobUrl && (isPdfFile(previewDocument) || previewMimeType.includes('pdf')) && (
                    <div className="rounded border bg-white overflow-hidden">
                      <iframe
                        title="Document PDF Preview"
                        src={previewBlobUrl}
                        className="h-[70vh] w-full border-0"
                      />
                    </div>
                  )}
                  {!previewLoading && !previewError && previewBlobUrl && (isTextLikeFile(previewDocument) || previewMimeType.startsWith('text/') || previewMimeType.includes('json') || previewMimeType.includes('xml')) && (
                    <div className="rounded border bg-gray-50 p-4 h-[70vh] overflow-auto">
                      <pre className="text-xs whitespace-pre-wrap break-words text-gray-800">{previewTextContent || 'No text preview available'}</pre>
                    </div>
                  )}
                  {!previewLoading && !previewError && previewBlobUrl && !isImageFile(previewDocument) && !isPdfFile(previewDocument) && !isTextLikeFile(previewDocument) && !previewMimeType.startsWith('image/') && !previewMimeType.includes('pdf') && !previewMimeType.startsWith('text/') && (
                    <div className="bg-gray-50 rounded-lg p-6 text-center">
                      <p className="text-gray-600 text-sm mb-4">Preview not available for this file type</p>
                      <Button onClick={() => handleDownload(previewDocument.id, previewDocument.file_name)}>
                        <Download className="h-4 w-4 mr-2" />
                        Download
                      </Button>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-4 border-t border-gray-100">
                <Button variant="outline" onClick={() => setPreviewOpen(false)}>Close</Button>
                <Button
                  className="bg-blue-600 hover:bg-blue-700"
                  onClick={() => {
                    handleDownload(previewDocument.id, previewDocument.file_name);
                    setPreviewOpen(false);
                  }}
                >
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

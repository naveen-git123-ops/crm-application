import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Download, Printer, Search, CreditCard, AlertCircle } from 'lucide-react';
import html2canvas from 'html2canvas';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Company contact - update as needed
const COMPANY_NAME = 'RESOLINE TECHBIS';
const COMPANY_NUMBER = '+91 98765 43210';

export const IDCards = () => {
  const { user } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [employeePhotoUrl, setEmployeePhotoUrl] = useState(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [cardSide, setCardSide] = useState('front');
  const cardRef = useRef(null);

  useEffect(() => {
    fetchEmployees();
  }, []);

  const fetchEmployees = async () => {
    try {
      const response = await axios.get(`${API}/employees`);
      console.log('Employees fetched:', response.data);
      // Log first employee's profile photo field for debugging
      if (response.data.length > 0) {
        console.log('First employee profile_photo:', response.data[0].profile_photo);
      }
      setEmployees(response.data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching employees:', error);
      toast.error('Failed to load employees');
      setLoading(false);
    }
  };

  const filteredEmployees = employees.filter(emp =>
    emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    emp.employee_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (emp.email && emp.email.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const imageUrlToDataUrl = async (url) => {
    try {
      console.log('Starting image conversion for URL:', url);
      if (!url) {
        console.warn('No URL provided');
        return null;
      }
      
      const response = await fetch(url, { 
        credentials: 'include'
      });
      
      console.log('Fetch response status:', response.status, response.statusText);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Fetch failed - Status:', response.status, 'Response:', errorText);
        return null;
      }
      
      const blob = await response.blob();
      console.log('Blob received - size:', blob.size, 'type:', blob.type);
      
      if (blob.size === 0) {
        console.error('Received empty blob');
        return null;
      }
      
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          console.log('Image successfully converted to data URL, length:', reader.result.length);
          resolve(reader.result);
        };
        reader.onerror = (error) => {
          console.error('FileReader error:', error);
          resolve(null);
        };
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.error('Error converting image to data URL:', error);
      return null;
    }
  };

  const handlePreview = async (employee) => {
    console.log('Preview started for employee:', employee.id, employee.name);
    setSelectedEmployee(employee);
    setPreviewOpen(true);
    setCardSide('front');
    setPhotoLoading(true);
    
    // Get photo through backend proxy endpoint
    if (employee.profile_photo) {
      console.log('Employee has profile photo:', employee.profile_photo);
      // Use backend endpoint to proxy the image and avoid CORS issues
      const backendPhotoUrl = `${API}/employees/${employee.id}/photo`;
      console.log('Backend photo URL:', backendPhotoUrl);
      const dataUrl = await imageUrlToDataUrl(backendPhotoUrl);
      console.log('Photo conversion result:', dataUrl ? 'success (length: ' + dataUrl.length + ')' : 'failed - dataUrl is null');
      setEmployeePhotoUrl(dataUrl);
    } else {
      console.log('Employee has NO profile photo');
      setEmployeePhotoUrl(null);
    }
    
    setPhotoLoading(false);
  };

  const handleDownload = async () => {
    if (!cardRef.current) return;
    if (photoLoading) {
      toast.error('Photo is still loading, please wait...');
      return;
    }

    try {
      // Wait for all images in the card to load
      const images = cardRef.current.querySelectorAll('img');
      const imagePromises = Array.from(images).map(img => {
        return new Promise((resolve) => {
          console.log('Waiting for image to load:', img.src?.substring(0, 50));
          if (img.complete) {
            console.log('Image already loaded');
            resolve();
          } else {
            img.onload = () => {
              console.log('Image loaded successfully');
              resolve();
            };
            img.onerror = () => {
              console.warn('Image failed to load:', img.src);
              resolve(); // Resolve even on error to continue
            };
            // Set timeout to prevent hanging
            setTimeout(resolve, 10000);
          }
        });
      });
      
      await Promise.all(imagePromises);
      await new Promise(resolve => setTimeout(resolve, 500));

      console.log('Starting html2canvas capture');
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
        timeout: 15000,
        imageTimeout: 10000
      });
      
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = `ID-Card-${selectedEmployee.employee_id}.png`;
      link.click();
      console.log('Download completed');
      toast.success('ID card downloaded successfully');
    } catch (error) {
      console.error('Download error:', error);
      toast.error('Failed to download ID card. Please try again.');
    }
  };

  const handlePrint = async () => {
    if (!cardRef.current) return;

    try {
      // Wait for images to load
      await new Promise(resolve => setTimeout(resolve, 500));

      // Convert to canvas first for better print quality
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
        timeout: 10000
      });

      const printWindow = window.open('', '', 'width=800,height=600');
      printWindow.document.write(`
        <html>
          <head>
            <title>ID Card - ${selectedEmployee.employee_id}</title>
            <style>
              body { margin: 20px; font-family: Arial, sans-serif; }
              .print-container { display: flex; justify-content: center; align-items: center;}
              img { max-width: 210px; max-height: 330px; }
              @media print {
                body { margin: 0; }
                .print-container { display: flex; justify-content: center; page-break-after: always; }
              }
            </style>
          </head>
          <body>
            <div class="print-container">
              <img src="${canvas.toDataURL('image/png')}" alt="ID Card" />
            </div>
          </body>
        </html>
      `);
      printWindow.document.close();
      
      // Give it time to render before printing
      setTimeout(() => {
        printWindow.print();
      }, 250);
    } catch (error) {
      console.error('Print error:', error);
      toast.error('Failed to print ID card');
    }
  };

  const IDCardFront = ({ employee, photoUrl }) => (
    <div
      ref={cardRef}
      className="bg-white shadow-2xl overflow-hidden rounded-2xl"
      style={{ width: '210px', height: '330px', minWidth: '210px', minHeight: '330px' }}
    >
      <div className="h-full flex flex-col bg-white">
        {/* Header with Company Logo and Branding */}
        <div className="bg-gradient-to-r from-blue-800 via-blue-700 to-indigo-700 px-3 py-2.5 flex items-center">
          <img
            src={`${process.env.PUBLIC_URL}/logo1.png`}
            alt="Logo"
            className="h-6 w-auto object-contain"
            onError={(e) => { e.target.style.display = 'none'; }}
          />
          <div className="text-white font-black text-[9px] tracking-widest ml-2">
            {COMPANY_NAME}
          </div>
        </div>

        {/* Photo Section */}
        <div className="flex justify-center py-4 px-4">
          <div className="w-24 h-24 rounded-lg border-3 border-slate-200 shadow-md overflow-hidden flex items-center justify-center flex-shrink-0 bg-slate-50">
            {photoUrl ? (
              <img 
                src={photoUrl}
                alt={employee.name} 
                className="w-full h-full object-cover"
                crossOrigin="anonymous"
                onError={(e) => {
                  console.error('Photo display error:', e);
                  e.target.style.display = 'none';
                  if (e.target.nextElementSibling) {
                    e.target.nextElementSibling.style.display = 'flex';
                  }
                }}
              />
            ) : (
              <div className="flex items-center justify-center w-full h-full bg-slate-100">
                <span className="text-5xl font-black text-slate-300">{employee.name.charAt(0).toUpperCase()}</span>
              </div>
            )}
          </div>
        </div>

        {/* Employee Info */}
        <div className="flex-1 px-3 py-2 flex flex-col justify-between text-center">
          <div>
            <h3 className="text-sm font-black text-slate-900 leading-tight track-tight">
              {employee.name}
            </h3>
            <div className="text-[8px] font-bold text-indigo-600 uppercase tracking-wider mt-1">
              {employee.job_role || '—'}
            </div>
            <div className="text-[7px] text-slate-500 uppercase tracking-wider font-semibold">
              {employee.department || '—'}
            </div>
          </div>
        </div>

        {/* ID Badge Section */}
        <div className="px-3 py-2 border-t-2 border-slate-200">
          <div className="text-[7px] text-slate-500 uppercase font-bold tracking-wider text-center mb-1.5">
            Employee ID
          </div>
          <div className="font-mono text-sm font-black text-white bg-gradient-to-r from-blue-700 to-indigo-700 py-1.5 px-2 rounded-md text-center">
            {employee.employee_id}
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-900 px-3 py-2 flex justify-center">
          <div className="flex gap-0.5">
            {[...Array(12)].map((_, i) => (
              <div key={i} className={`${i % 2 === 0 ? 'w-1' : 'w-0.5'} h-3 bg-slate-700`}></div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  const IDCardBack = ({ employee }) => (
    <div
      ref={cardRef}
      className="bg-white shadow-2xl overflow-hidden rounded-2xl"
      style={{ width: '210px', height: '330px', minWidth: '210px', minHeight: '330px' }}
    >
      <div className="h-full flex flex-col bg-white">
        {/* Header with Company Logo and Branding */}
        <div className="bg-gradient-to-r from-blue-800 via-blue-700 to-indigo-700 px-3 py-2.5 flex items-center">
          <img
            src={`${process.env.PUBLIC_URL}/logo1.png`}
            alt="Logo"
            className="h-6 w-auto object-contain"
            onError={(e) => { e.target.style.display = 'none'; }}
          />
          <div className="text-white font-black text-[9px] tracking-widest ml-2">
            {COMPANY_NAME}
          </div>
        </div>

        <div className="px-3 py-3 flex-1 flex flex-col justify-between">
          <div>
            <h2 className="text-[9px] font-black text-slate-900 uppercase tracking-widest">Terms & Conditions</h2>
            <div className="text-[6.5px] text-slate-600 mt-1 leading-snug">
              This card is the property of {COMPANY_NAME}. Please keep it safe and secure at all times.
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <div className="text-[7px] font-bold text-indigo-600 uppercase tracking-widest mb-1">Contact Info</div>
              <div className="space-y-1">
                <div className="text-[8px] text-slate-700">
                  <span className="font-semibold">Email:</span> {employee.email || '—'}
                </div>
                <div className="text-[8px] text-slate-700">
                  <span className="font-semibold">Phone:</span> {employee.phone || '—'}
                </div>
              </div>
            </div>

            <div className="pt-2 border-t-2 border-slate-200">
              <div className="text-[7px] font-bold text-indigo-600 uppercase tracking-widest mb-1">Company</div>
              <div className="text-[8px] text-slate-700">
                {COMPANY_NUMBER}
              </div>
            </div>

            <div className="pt-2 border-t-2 border-slate-200">
              <div className="text-[7px] font-bold text-indigo-600 uppercase tracking-widest mb-1 flex items-center gap-1">
                <AlertCircle className="h-2.5 w-2.5" />
                Emergency
              </div>
              <div className="text-[8px] font-semibold text-slate-800 bg-indigo-50 px-2 py-1 rounded">
                {employee.emergency_contact || '—'}
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-200 text-center">
            <div className="text-[6px] text-slate-600 font-mono">
              If found, please return to HR Department
            </div>
            <div className="text-[5.5px] text-slate-500 mt-0.5">
              Issued: 2026 • {COMPANY_NAME.split(' ')[0]}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="idcards-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">ID Card Generator</h1>
          <p className="text-gray-600 text-sm mt-1">Generate and download employee identification cards</p>
        </div>
      </div>

      {/* Search Bar */}
      <Card className="p-4 rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="flex gap-3">
          <Input
            placeholder="Search by name, employee ID, or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="border border-gray-200 h-10"
          />
          <Button className="bg-blue-600 text-white font-medium hover:bg-blue-700 h-10 gap-2">
            <Search className="h-4 w-4" />
            Search
          </Button>
        </div>
      </Card>

      {/* Employees table */}
      <Card className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Employee ID</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Name</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Department</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Job Role</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.map((employee) => (
                <tr key={employee.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                  <td className="py-3 px-4 font-mono text-gray-900">{employee.employee_id}</td>
                  <td className="py-3 px-4 font-medium text-gray-900">{employee.name}</td>
                  <td className="py-3 px-4 text-gray-600">{employee.department || '—'}</td>
                  <td className="py-3 px-4 text-gray-600">{employee.job_role || employee.job_title || '—'}</td>
                  <td className="py-3 px-4">
                    <Dialog open={previewOpen && selectedEmployee?.id === employee.id} onOpenChange={setPreviewOpen}>
                      <DialogTrigger asChild>
                        <Button
                          size="sm"
                          className="bg-blue-600 text-white hover:bg-blue-700 h-9"
                          onClick={() => handlePreview(employee)}
                        >
                          <CreditCard className="h-4 w-4 mr-2" />
                          Generate ID
                        </Button>
                      </DialogTrigger>
                      {selectedEmployee?.id === employee.id && (
                        <DialogContent className="max-w-2xl bg-gray-50 border-0 shadow-2xl">
                          <div className="bg-blue-600 text-white p-6 -m-6 mb-0 rounded-t-lg">
                            <DialogHeader>
                              <DialogTitle className="text-2xl font-bold text-white">
                                ID Card Generator
                              </DialogTitle>
                              <p className="text-blue-100 mt-2">
                                {selectedEmployee.name} • {selectedEmployee.employee_id}
                              </p>
                            </DialogHeader>
                          </div>

                          <div className="space-y-6 p-6">
                            <div className="flex justify-center gap-4">
                              <Button
                                size="sm"
                                onClick={() => setCardSide('front')}
                                className={`px-6 py-2 ${
                                  cardSide === 'front'
                                    ? 'bg-white text-blue-600 shadow-md font-semibold'
                                    : 'bg-gray-200 text-gray-600 hover:text-gray-900'
                                }`}
                              >
                                Front Side
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => setCardSide('back')}
                                className={`px-6 py-2 ${
                                  cardSide === 'back'
                                    ? 'bg-white text-blue-600 shadow-md font-semibold'
                                    : 'bg-gray-200 text-gray-600 hover:text-gray-900'
                                }`}
                              >
                                Back Side
                              </Button>
                            </div>

                            {photoLoading && (
                              <div className="flex justify-center items-center p-4 bg-blue-50 rounded-lg border border-blue-200">
                                <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-600 border-t-transparent mr-2" />
                                <span className="text-sm text-blue-700 font-medium">Processing photo...</span>
                              </div>
                            )}

                            <div className="flex justify-center p-8 bg-gradient-to-br from-gray-100 to-gray-200 rounded-xl">
                              {cardSide === 'front' ? (
                                <IDCardFront employee={selectedEmployee} photoUrl={employeePhotoUrl} />
                              ) : (
                                <IDCardBack employee={selectedEmployee} />
                              )}
                            </div>

                            <div className="flex gap-4 justify-center p-6 bg-white rounded-lg border border-gray-200">
                              <Button
                                onClick={handleDownload}
                                disabled={photoLoading}
                                className="px-8 py-3 bg-green-600 text-white hover:bg-green-700 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                <Download className="h-5 w-5 mr-2" />
                                Download
                              </Button>
                              <Button
                                onClick={handlePrint}
                                className="px-8 py-3 border-2 border-blue-600 text-blue-600 hover:bg-blue-50 font-semibold"
                              >
                                <Printer className="h-5 w-5 mr-2" />
                                Print
                              </Button>
                            </div>
                          </div>
                        </DialogContent>
                      )}
                      </Dialog>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {filteredEmployees.length === 0 && (
        <Card className="p-12 text-center rounded-lg border border-gray-200 bg-white shadow-sm">
          <p className="text-gray-600">No employees found</p>
        </Card>
      )}
    </div>
  );
};

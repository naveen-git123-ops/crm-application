import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Download, Printer, Plus, Search, CreditCard, MapPin, Phone, AlertCircle } from 'lucide-react';
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
  const [previewOpen, setPreviewOpen] = useState(false);
  const [cardLayout, setCardLayout] = useState('vertical');
  const [cardSide, setCardSide] = useState('front');
  const cardRef = useRef(null);

  useEffect(() => {
    fetchEmployees();
  }, []);

  const fetchEmployees = async () => {
    try {
      const response = await axios.get(`${API}/employees`);
      setEmployees(response.data);
      setLoading(false);
    } catch (error) {
      toast.error('Failed to load employees');
      setLoading(false);
    }
  };

  const filteredEmployees = employees.filter(emp =>
    emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    emp.employee_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (emp.email && emp.email.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handlePreview = (employee) => {
    setSelectedEmployee(employee);
    setPreviewOpen(true);
  };

  const handleDownload = async () => {
    if (!cardRef.current) return;

    try {
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: '#ffffff',
        scale: 2
      });
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = `ID-Card-${selectedEmployee.employee_id}.png`;
      link.click();
      toast.success('ID card downloaded successfully');
    } catch (error) {
      toast.error('Failed to download ID card');
    }
  };

  const handlePrint = () => {
    if (!cardRef.current) return;

    const printWindow = window.open('', '', 'width=800,height=600');
    printWindow.document.write(cardRef.current.outerHTML);
    printWindow.document.close();
    printWindow.print();
  };

  const IDCardPreview = ({ employee, layout, side }) => {
    // Horizontal corporate ID card (CR80-style)
    if (side === 'front') {
      return (
        <div
          ref={cardRef}
          className="bg-white shadow-2xl overflow-hidden rounded-lg border border-gray-200/80"
          style={{ width: '380px', height: '240px', minWidth: '380px', minHeight: '240px' }}
        >
          <div className="h-full flex flex-col">
            {/* Top bar: logo + company */}
            <div className="flex items-center justify-between px-5 py-2.5 bg-gradient-to-r from-slate-800 via-slate-700 to-slate-800 border-b border-slate-600/50">
              <img
                src={`${process.env.PUBLIC_URL}/logo1.png`}
                alt="Logo"
                className="h-9 w-auto object-contain"
                onError={(e) => { e.target.style.display = 'none'; }}
              />
              <span className="text-white text-sm font-semibold tracking-widest uppercase">{COMPANY_NAME}</span>
            </div>
            {/* Main: photo + details in one row */}
            <div className="flex-1 flex items-stretch">
              <div className="w-28 flex-shrink-0 p-3 flex items-center justify-center bg-slate-50/80 border-r border-slate-200">
                <div className="w-20 h-24 rounded-md border border-slate-200 bg-white shadow-inner overflow-hidden flex items-center justify-center">
                  {employee.profile_photo ? (
                    <img src={BACKEND_URL + employee.profile_photo} alt={employee.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-2xl font-bold text-slate-400">{employee.name.charAt(0).toUpperCase()}</span>
                  )}
                </div>
              </div>
              <div className="flex-1 flex flex-col justify-center px-5 py-3 min-w-0">
                <h2 className="text-xl font-bold text-slate-900 tracking-tight truncate">{employee.name}</h2>
                <p className="text-sm font-medium text-slate-600 mt-0.5">{employee.job_role || employee.job_title || '—'}</p>
                <p className="text-xs text-slate-500 mt-1 uppercase tracking-wide">{employee.department || '—'}</p>
              </div>
            </div>
          </div>
        </div>
      );
    }
    // Back side: horizontal layout
    return (
      <div
        ref={cardRef}
        className="bg-white shadow-2xl overflow-hidden rounded-lg border border-gray-200/80"
        style={{ width: '380px', height: '240px', minWidth: '380px', minHeight: '240px' }}
      >
        <div className="h-full flex flex-col">
          <div className="px-5 py-2.5 bg-gradient-to-r from-slate-800 to-slate-700 text-white text-center border-b border-slate-600/50">
            <div className="text-sm font-semibold tracking-wide">{COMPANY_NAME}</div>
            <div className="text-[10px] text-slate-300 uppercase tracking-widest mt-0.5">Contact & Emergency</div>
          </div>
          <div className="flex-1 grid grid-cols-1 gap-0 p-4">
            <div className="flex gap-2 items-start">
              <MapPin className="h-3.5 w-3.5 text-slate-500 flex-shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider">Address</div>
                <div className="text-xs text-slate-800 leading-snug">{employee.address || '—'}</div>
              </div>
            </div>
            <div className="flex gap-2 items-center">
              <Phone className="h-3.5 w-3.5 text-slate-500 flex-shrink-0" />
              <div>
                <div className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider">Company</div>
                <div className="text-xs font-medium text-slate-800">{COMPANY_NUMBER}</div>
              </div>
            </div>
            <div className="flex gap-2 items-center">
              <AlertCircle className="h-3.5 w-3.5 text-slate-500 flex-shrink-0" />
              <div>
                <div className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider">Emergency</div>
                <div className="text-xs font-medium text-slate-800">{employee.emergency_contact || '—'}</div>
              </div>
            </div>
          </div>
          <div className="px-4 py-1.5 bg-slate-100/90 border-t border-slate-200 text-center text-[9px] text-slate-500">
            This card is property of {COMPANY_NAME}. In case of emergency, contact the number above.
          </div>
        </div>
      </div>
    );
  };

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
                  <DialogContent className="max-w-6xl bg-gray-50 border-0 shadow-2xl p-0">
                    <div className="bg-blue-600 text-white p-6">
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
                      {/* Card Side Toggle with better styling */}
                      <div className="flex justify-center">
                        <div className="inline-flex bg-gray-200 rounded-lg p-1">
                          <Button
                            size="sm"
                            variant={cardSide === 'front' ? 'default' : 'ghost'}
                            onClick={() => setCardSide('front')}
                            className={`px-6 py-2 rounded-md transition-all ${
                              cardSide === 'front'
                                ? 'bg-white text-blue-600 shadow-md font-semibold'
                                : 'text-gray-600 hover:text-gray-900'
                            }`}
                          >
                            Front Side
                          </Button>
                          <Button
                            size="sm"
                            variant={cardSide === 'back' ? 'default' : 'ghost'}
                            onClick={() => setCardSide('back')}
                            className={`px-6 py-2 rounded-md transition-all ${
                              cardSide === 'back'
                                ? 'bg-white text-blue-600 shadow-md font-semibold'
                                : 'text-gray-600 hover:text-gray-900'
                            }`}
                          >
                            Back Side
                          </Button>
                        </div>
                      </div>

                      {/* Card Preview with better container */}
                      <div className="flex justify-center p-8 bg-gradient-to-br from-gray-100 to-gray-200 rounded-xl">
                        <div className="transform hover:scale-105 transition-transform duration-300">
                          <IDCardPreview employee={selectedEmployee} layout={cardLayout} side={cardSide} />
                        </div>
                      </div>

                      {/* Action Buttons with better styling */}
                      <div className="flex gap-4 justify-center p-6 bg-white rounded-lg border border-gray-200">
                        <Button
                          onClick={handleDownload}
                          className="px-8 py-3 bg-green-600 text-white hover:bg-green-700 font-semibold"
                        >
                          <Download className="h-5 w-5 mr-2" />
                          Download HD
                        </Button>
                        <Button
                          onClick={handlePrint}
                          variant="outline"
                          className="px-8 py-3 border-2 border-blue-600 text-blue-600 hover:bg-blue-50 font-semibold"
                        >
                          <Printer className="h-5 w-5 mr-2" />
                          Print Card
                        </Button>
                      </div>

                      {/* Instructions */}
                      <div className="text-center text-sm text-gray-600 bg-blue-50 p-4 rounded-lg border border-blue-200">
                        <p className="font-medium text-blue-900 mb-1">Professional ID Card Ready!</p>
                        <p>Download in high quality for printing or print directly. Standard CR80 card size.</p>
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
          <Plus className="h-12 w-12 mx-auto mb-2 opacity-20" />
          <p className="text-gray-600">No employees found</p>
        </Card>
      )}
    </div>
  );
};

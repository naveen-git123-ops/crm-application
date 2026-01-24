import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Download, Printer, Plus, Search } from 'lucide-react';
import html2canvas from 'html2canvas';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export const IDCards = () => {
  const { user } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [cardLayout, setCardLayout] = useState('horizontal');
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
    if (layout === 'horizontal') {
      if (side === 'front') {
        return (
          <div
            ref={cardRef}
            className="w-96 bg-white rounded-xl p-6 text-slate-900 shadow-2xl border-2 border-slate-200"
            style={{ aspectRatio: '3.5/2.2' }}
          >
            <div className="flex justify-between items-start h-full">
              {/* Left Section */}
              <div className="flex-1">
                <div className="text-xs font-bold opacity-70 mb-1 tracking-wider text-indigo-600">EMPLOYEE ID</div>
                <div className="text-2xl font-bold mb-4 text-slate-900">{employee.employee_id}</div>
                
                <div className="space-y-2">
                  <div>
                    <div className="text-xs opacity-60 font-bold text-slate-700">NAME</div>
                    <div className="text-lg font-semibold text-slate-900">{employee.name}</div>
                  </div>
                  <div>
                    <div className="text-xs opacity-60 font-bold text-slate-700">DEPARTMENT</div>
                    <div className="text-sm text-slate-800">{employee.department || 'N/A'}</div>
                  </div>
                  <div>
                    <div className="text-xs opacity-60 font-bold text-slate-700">DESIGNATION</div>
                    <div className="text-sm text-slate-800">{employee.job_title || 'N/A'}</div>
                  </div>
                </div>
              </div>

              {/* Right Section - Avatar & Company */}
              <div className="flex flex-col items-center">
                <div className="w-20 h-24 bg-indigo-100 rounded-lg mb-2 flex items-center justify-center shadow-lg border border-indigo-300 overflow-hidden">
                  {employee.profile_photo ? (
                    <img src={BACKEND_URL + employee.profile_photo} alt={employee.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="text-4xl font-bold text-indigo-600">
                      {employee.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="text-center text-xs">
                  <div className="font-bold text-indigo-600">RESOLINE</div>
                  <div className="font-bold text-indigo-600">TECHBIS</div>
                </div>
              </div>
            </div>

            {/* Bottom Strip */}
            <div className="absolute bottom-0 left-0 right-0 bg-indigo-100 px-6 py-2 rounded-b-xl flex justify-between items-center text-xs border-t border-slate-200">
              <span className="text-slate-700">{employee.phone || employee.email || 'contact@company.com'}</span>
              <span className="text-slate-700 font-semibold">Valid 2026-2027</span>
            </div>
          </div>
        );
      } else {
        // Back side
        return (
          <div
            ref={cardRef}
            className="w-96 bg-white rounded-xl p-6 text-slate-900 shadow-2xl border-2 border-slate-200"
            style={{ aspectRatio: '3.5/2.2' }}
          >
            <div className="h-full flex flex-col justify-center items-center space-y-6">
              {/* Company Name */}
              <div className="text-center mb-2">
                <div className="text-sm font-bold text-indigo-600 tracking-widest">RESOLINE TECHBIS</div>
                <div className="text-xs text-slate-600 mt-1">Employee Identification Card</div>
              </div>

              <div className="w-full border-t border-slate-200 pt-4">
                <div className="grid grid-cols-3 gap-4">
                  {/* Blood Group */}
                  <div className="flex flex-col items-center">
                    <div className="text-xs font-bold text-slate-700 mb-2 tracking-wider">BLOOD</div>
                    <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center border-2 border-red-300 shadow-md">
                      <div className="text-lg font-bold text-red-600">{employee.blood_group || 'O+'}</div>
                    </div>
                  </div>

                  {/* Mobile */}
                  <div className="flex flex-col items-center justify-center">
                    <div className="text-xs font-bold text-slate-700 mb-2 tracking-wider">MOBILE</div>
                    <div className="text-xs font-semibold text-slate-800 text-center break-all">{employee.phone || 'N/A'}</div>
                  </div>

                  {/* Emergency Contact */}
                  <div className="flex flex-col items-center justify-center">
                    <div className="text-xs font-bold text-slate-700 mb-2 tracking-wider">EMERGENCY</div>
                    <div className="text-xs font-semibold text-slate-800 text-center break-all">{employee.emergency_contact || 'N/A'}</div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="w-full border-t border-slate-200 pt-3 text-center">
                <div className="text-xs text-slate-600">For assistance, contact HR department</div>
              </div>
            </div>
          </div>
        );
      }
    } else {
      // Vertical layout - keep original
      return (
        <div
          ref={cardRef}
          className="w-56 bg-gradient-to-b from-slate-900 to-slate-800 rounded-2xl p-4 text-white shadow-2xl flex flex-col items-center"
          style={{ aspectRatio: '2/3' }}
        >
          {/* Header Logo */}
          <div className="text-center mb-2 pb-2 border-b border-white/20 w-full">
            <div className="text-xs font-bold tracking-widest opacity-80">RESOLINE</div>
            <div className="text-xs font-bold tracking-widest">TECHBIS</div>
          </div>

          {/* Avatar */}
          <div className="w-24 h-24 bg-indigo-500 rounded-lg flex items-center justify-center mb-3 shadow-lg">
            <div className="text-5xl font-bold text-white">
              {employee.name.charAt(0).toUpperCase()}
            </div>
          </div>

          {/* Employee Info */}
          <div className="text-center flex-1 flex flex-col justify-center w-full">
            <div className="text-sm font-bold mb-1">{employee.name}</div>
            <div className="text-xs opacity-75 mb-2">{employee.job_title || 'Staff'}</div>
            <div className="text-xs font-mono bg-indigo-600/30 rounded px-2 py-1 mx-auto mb-2">
              {employee.employee_id}
            </div>
            <div className="text-xs opacity-70">{employee.department || 'HR'}</div>
          </div>

          {/* Footer */}
          <div className="w-full pt-2 border-t border-white/20 text-center text-xs opacity-75">
            <div className="mb-1">{employee.email || 'email@company.com'}</div>
            <div>Valid until 12/2027</div>
          </div>
        </div>
      );
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="idcards-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">ID Card Generator</h1>
          <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">Generate and download employee identification cards</p>
        </div>
      </div>

      {/* Search Bar */}
      <Card className="p-4 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="flex gap-3">
          <Input
            placeholder="Search by name, employee ID, or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="border border-slate-200 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-50 h-10"
          />
          <Button className="bg-indigo-600 text-white font-medium hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-700 h-10 gap-2">
            <Search className="h-4 w-4" />
            Search
          </Button>
        </div>
      </Card>

      {/* Layout Options */}
      <Card className="p-4 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="flex gap-3">
          <Label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center">
            Card Layout:
          </Label>
          <div className="flex gap-2">
            <Button
              variant={cardLayout === 'horizontal' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setCardLayout('horizontal')}
              className={`h-9 ${
                cardLayout === 'horizontal'
                  ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                  : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
              }`}
            >
              Horizontal
            </Button>
            <Button
              variant={cardLayout === 'vertical' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setCardLayout('vertical')}
              className={`h-9 ${
                cardLayout === 'vertical'
                  ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                  : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
              }`}
            >
              Vertical
            </Button>
          </div>
        </div>
      </Card>

      {/* Employees Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredEmployees.map((employee) => (
          <Card
            key={employee.id}
            className="p-4 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 bg-indigo-100 dark:bg-indigo-950 rounded-lg flex items-center justify-center flex-shrink-0">
                <div className="text-xl font-bold text-indigo-600 dark:text-indigo-400">
                  {employee.name.charAt(0).toUpperCase()}
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-slate-900 dark:text-slate-50 truncate">
                  {employee.name}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 truncate">
                  {employee.employee_id}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">
                  {employee.job_title || 'Staff'}
                </p>
              </div>

              <Dialog open={previewOpen && selectedEmployee?.id === employee.id} onOpenChange={setPreviewOpen}>
                <DialogTrigger asChild>
                  <Button
                    size="sm"
                    className="bg-indigo-600 text-white hover:bg-indigo-700 h-8 whitespace-nowrap flex-shrink-0"
                    onClick={() => handlePreview(employee)}
                  >
                    Generate
                  </Button>
                </DialogTrigger>
                {selectedEmployee?.id === employee.id && (
                  <DialogContent className="max-w-2xl dark:bg-slate-900 dark:border-slate-800">
                    <DialogHeader>
                      <DialogTitle className="text-slate-900 dark:text-slate-50">
                        ID Card Preview - {selectedEmployee.name}
                      </DialogTitle>
                    </DialogHeader>

                    <div className="flex flex-col items-center gap-6 py-6">
                      {/* Card Side Toggle */}
                      {cardLayout === 'horizontal' && (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant={cardSide === 'front' ? 'default' : 'outline'}
                            onClick={() => setCardSide('front')}
                            className={`${
                              cardSide === 'front'
                                ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                                : 'border-slate-200 dark:border-slate-800'
                            }`}
                          >
                            Front Side
                          </Button>
                          <Button
                            size="sm"
                            variant={cardSide === 'back' ? 'default' : 'outline'}
                            onClick={() => setCardSide('back')}
                            className={`${
                              cardSide === 'back'
                                ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                                : 'border-slate-200 dark:border-slate-800'
                            }`}
                          >
                            Back Side
                          </Button>
                        </div>
                      )}

                      {/* Card Preview */}
                      <div className="flex justify-center">
                        <IDCardPreview employee={selectedEmployee} layout={cardLayout} side={cardSide} />
                      </div>

                      {/* Action Buttons */}
                      <div className="flex gap-3 w-full">
                        <Button
                          onClick={handleDownload}
                          className="flex-1 bg-indigo-600 text-white hover:bg-indigo-700 h-10 gap-2"
                        >
                          <Download className="h-4 w-4" />
                          Download
                        </Button>
                        <Button
                          onClick={handlePrint}
                          variant="outline"
                          className="flex-1 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 h-10 gap-2"
                        >
                          <Printer className="h-4 w-4" />
                          Print
                        </Button>
                      </div>

                      <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
                        Download as PNG or print directly to your printer
                      </p>
                    </div>
                  </DialogContent>
                )}
              </Dialog>
            </div>
          </Card>
        ))}
      </div>

      {filteredEmployees.length === 0 && (
        <Card className="p-12 text-center border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <Plus className="h-12 w-12 mx-auto mb-2 opacity-20" />
          <p className="text-slate-600 dark:text-slate-400">No employees found</p>
        </Card>
      )}
    </div>
  );
};

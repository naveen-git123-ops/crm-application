import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Download, Printer, Plus, Search, CreditCard } from 'lucide-react';
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
    // Only vertical layout now
    if (side === 'front') {
      return (
        <div
          ref={cardRef}
          className="w-[300px] bg-white shadow-2xl rounded-lg overflow-hidden border border-gray-300"
          style={{ aspectRatio: '2/3' }}
        >
          {/* Header with Logo */}
          <div className="p-4 text-center border-b border-gray-200">
            <img 
              src={`${process.env.PUBLIC_URL}/logo1.png`}
              alt="Company Logo" 
              className="h-12 w-auto mx-auto mb-2 object-contain"
              onError={(e) => {
                e.target.style.display = 'none';
                e.target.nextSibling.style.display = 'block';
              }}
            />
            <div className="text-sm font-bold text-gray-800" style={{ display: 'none' }}>
              RESOLINE TECHBIS
            </div>
            <div className="text-xs text-gray-600">Employee Identification</div>
          </div>

          {/* Employee Photo */}
          <div className="p-4 flex justify-center">
            <div className="w-24 h-28 bg-gray-100 rounded-lg border-2 border-gray-200 flex items-center justify-center overflow-hidden">
              {employee.profile_photo ? (
                <img src={BACKEND_URL + employee.profile_photo} alt={employee.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center">
                  <div className="text-3xl font-bold text-gray-600">
                    {employee.name.charAt(0).toUpperCase()}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Employee Info */}
          <div className="px-4 pb-4 space-y-3 text-center">
            <div>
              <h1 className="text-xl font-bold text-gray-900 mb-1">{employee.name}</h1>
              <div className="text-sm text-gray-600 font-medium">ID: {employee.employee_id}</div>
            </div>
            
            <div className="bg-gray-50 rounded-lg p-3 text-xs">
              <div className="font-semibold text-gray-800 mb-1">RESOLINE TECHBIS</div>
              <div className="text-gray-600">Valid Until December 2027</div>
            </div>
          </div>
        </div>
      );
    } else {
      // Back side - All employee details
      return (
        <div
          ref={cardRef}
          className="w-[300px] bg-white shadow-2xl rounded-lg overflow-hidden border border-gray-300"
          style={{ aspectRatio: '2/3' }}
        >
          {/* Header */}
          <div className="bg-gray-800 text-white p-4 text-center">
            <div className="text-sm font-bold">RESOLINE TECHBIS</div>
            <div className="text-xs opacity-80">Employee Information</div>
          </div>

          <div className="p-4 space-y-4">
            {/* Employee Basic Info */}
            <div className="space-y-3">
              <div className="pb-3 border-b border-gray-200">
                <h2 className="text-lg font-bold text-gray-900">{employee.name}</h2>
                <div className="text-sm text-gray-600">ID: {employee.employee_id}</div>
              </div>

              {/* Contact Information */}
              <div className="space-y-3 text-sm">
                <div>
                  <div className="text-xs font-semibold text-gray-500 uppercase">Department</div>
                  <div className="font-medium text-gray-900">{employee.department || 'N/A'}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-gray-500 uppercase">Designation</div>
                  <div className="font-medium text-gray-900">{employee.job_role || employee.job_title || 'Employee'}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-gray-500 uppercase">Email</div>
                  <div className="font-medium text-gray-800 text-xs truncate">{employee.email || 'N/A'}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-gray-500 uppercase">Phone</div>
                  <div className="font-medium text-gray-900">{employee.phone || 'N/A'}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-gray-500 uppercase">Blood Group</div>
                  <div className="font-medium text-red-600">{employee.blood_group || 'N/A'}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-gray-500 uppercase">Emergency Contact</div>
                  <div className="font-medium text-gray-900">{employee.emergency_contact || 'N/A'}</div>
                </div>
              </div>
            </div>

            {/* Validity and Signature */}
            <div className="pt-3 border-t border-gray-200 space-y-3">
              <div className="flex justify-between text-sm">
                <div>
                  <div className="text-xs font-semibold text-gray-500 uppercase">Issue Date</div>
                  <div className="font-medium text-gray-900">{new Date().toLocaleDateString()}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-gray-500 uppercase">Valid Until</div>
                  <div className="font-medium text-gray-900">December 2027</div>
                </div>
              </div>

              <div className="pt-2">
                <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Authorized Signature</div>
                <div className="h-10 border-b-2 border-gray-300"></div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="bg-gray-50 px-4 py-3 border-t border-gray-200 mt-auto">
            <div className="text-center text-xs text-gray-600">
              www.resolinetechbis.com • This card is property of RESOLINE TECHBIS
            </div>
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
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">ID Card Generator</h1>
          <p className="text-gray-600 text-sm mt-1">Generate and download employee identification cards</p>
        </div>
      </div>

      {/* Search Bar */}
      <Card className="p-4 border border-gray-200 bg-white">
        <div className="flex gap-3">
          <Input
            placeholder="Search by name, employee ID, or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="border border-gray-200 h-10"
          />
          <Button className="bg-indigo-600 text-white font-medium hover:bg-indigo-700 h-10 gap-2">
            <Search className="h-4 w-4" />
            Search
          </Button>
        </div>
      </Card>

      {/* Employees Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredEmployees.map((employee) => (
          <Card
            key={employee.id}
            className="p-4 border border-gray-200 bg-white hover:shadow-md transition-shadow"
          >
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <div className="text-xl font-bold text-indigo-600">
                  {employee.name.charAt(0).toUpperCase()}
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-gray-900 truncate">
                  {employee.name}
                </h3>
                <p className="text-xs text-gray-600 truncate">
                  {employee.employee_id}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {employee.job_title || 'Staff'}
                </p>
              </div>

              <Dialog open={previewOpen && selectedEmployee?.id === employee.id} onOpenChange={setPreviewOpen}>
                <DialogTrigger asChild>
                  <Button
                    size="sm"
                    className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 h-9 whitespace-nowrap flex-shrink-0 shadow-lg transition-all duration-200"
                    onClick={() => handlePreview(employee)}
                  >
                    <CreditCard className="h-4 w-4 mr-2" />
                    Generate ID
                  </Button>
                </DialogTrigger>
                {selectedEmployee?.id === employee.id && (
                  <DialogContent className="max-w-6xl bg-gray-50 border-0 shadow-2xl">
                    <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-6 -m-6 mb-6">
                      <DialogHeader>
                        <DialogTitle className="text-2xl font-bold text-white">
                          Corporate ID Card Generator
                        </DialogTitle>
                        <p className="text-blue-100 mt-2">
                          {selectedEmployee.name} • {selectedEmployee.employee_id}
                        </p>
                      </DialogHeader>
                    </div>

                    <div className="space-y-6">
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
                          className="px-8 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white hover:from-green-700 hover:to-emerald-700 font-semibold shadow-lg transition-all duration-200"
                        >
                          <Download className="h-5 w-5 mr-2" />
                          Download HD
                        </Button>
                        <Button
                          onClick={handlePrint}
                          variant="outline"
                          className="px-8 py-3 border-2 border-blue-600 text-blue-600 hover:bg-blue-50 font-semibold transition-all duration-200"
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
            </div>
          </Card>
        ))}
      </div>

      {filteredEmployees.length === 0 && (
        <Card className="p-12 text-center border border-gray-200 bg-white">
          <Plus className="h-12 w-12 mx-auto mb-2 opacity-20" />
          <p className="text-gray-600">No employees found</p>
        </Card>
      )}
    </div>
  );
};

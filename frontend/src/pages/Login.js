import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Mail, Lock, User, Briefcase, Eye, EyeOff } from 'lucide-react';

export const Login = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: '',
    employee_id: '',
    role: 'Employee'
  });
  const [loading, setLoading] = useState(false);
  const { login, register } = useAuth();
  const navigate = useNavigate();

  const getErrorMessage = (error) => {
    const data = error.response?.data;
    
    if (Array.isArray(data?.detail)) {
      return data.detail.map(err => err.msg).join(', ');
    }
    
    if (typeof data?.detail === 'string') {
      return data.detail;
    }
    
    if (typeof data?.message === 'string') {
      return data.message;
    }
    
    return 'Authentication failed';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        await login(formData.email, formData.password);
        toast.success('Login successful!');
      } else {
        await register(formData.email, formData.password, formData.name, formData.employee_id, formData.role);
        toast.success('Registration successful!');
      }
      navigate('/dashboard');
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-screen bg-white">
      {/* Left Panel - Login Form */}
      <div className="w-1/2 flex flex-col justify-center items-center px-12 py-8 bg-white">
        <div className="w-full max-w-sm">
          {/* Logo */}
          <div className="mb-8">
            <img 
              src={`${process.env.PUBLIC_URL}/logo1.png`}
              alt="Company Logo" 
              className="h-16 object-contain"
            />
          </div>

          {/* Tab Switch */}
          <div className="flex gap-4 mb-8 border-b border-gray-300">
            <button
              type="button"
              onClick={() => setIsLogin(true)}
              className={`pb-3 font-semibold text-sm transition-all ${
                isLogin
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => setIsLogin(false)}
              className={`pb-3 font-semibold text-sm transition-all ${
                !isLogin
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Sign Up
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Registration Only Fields */}
            {!isLogin && (
              <>
                <div>
                  <div className="relative">
                    <Briefcase className="absolute left-4 top-3.5 w-5 h-5 text-gray-400" />
                    <Input
                      id="employee_id"
                      data-testid="employee-id-input"
                      value={formData.employee_id}
                      onChange={(e) => setFormData({ ...formData, employee_id: e.target.value })}
                      required
                      placeholder="Employee ID"
                      className="pl-12 h-12 border border-gray-300 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-gray-900 placeholder:text-gray-500 bg-white"
                    />
                  </div>
                </div>

                <div>
                  <div className="relative">
                    <User className="absolute left-4 top-3.5 w-5 h-5 text-gray-400" />
                    <Input
                      id="name"
                      data-testid="name-input"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                      placeholder="Full Name"
                      className="pl-12 h-12 border border-gray-300 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-gray-900 placeholder:text-gray-500 bg-white"
                    />
                  </div>
                </div>
              </>
            )}

            {/* Email Field */}
            <div>
              <div className="relative">
                <Mail className="absolute left-4 top-3.5 w-5 h-5 text-gray-400" />
                <Input
                  id="email"
                  type="email"
                  data-testid="email-input"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                  placeholder="Username"
                  className="pl-12 h-12 border border-gray-300 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-gray-900 placeholder:text-gray-500 bg-white"
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <div className="relative">
                <Lock className="absolute left-4 top-3.5 w-5 h-5 text-gray-400" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  data-testid="password-input"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                  placeholder="Password"
                  className="pl-12 pr-12 h-12 border border-gray-300 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-gray-900 placeholder:text-gray-500 bg-white"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-3.5 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transition-all mt-8"
              data-testid="submit-button"
            >
              {loading ? 'Processing...' : isLogin ? 'Login' : 'Sign Up'}
            </Button>
          </form>

          {/* Footer Link */}
          <p className="text-sm text-gray-600 text-center mt-6">
            {isLogin ? "Don't have an account? " : "Already have an account? "}
            <button 
              type="button"
              onClick={() => setIsLogin(!isLogin)}
              className="font-semibold text-blue-600 hover:text-blue-700"
            >
              {isLogin ? 'Sign Up Now' : 'Login'}
            </button>
          </p>
        </div>
      </div>

      {/* Right Panel - Branding */}
      <div className="w-1/2 bg-gradient-to-br from-blue-500 via-blue-600 to-blue-700 flex flex-col justify-center items-center px-12 py-8 relative overflow-hidden">
        {/* Background Pattern - Abstract Shapes */}
        <div className="absolute inset-0 opacity-20">
          {/* Building-like shapes */}
          <div className="absolute top-10 right-20 w-40 h-64 bg-white rounded-sm opacity-10"></div>
          <div className="absolute top-20 right-0 w-56 h-72 bg-white rounded-sm opacity-15 transform -skew-x-12"></div>
          <div className="absolute bottom-0 right-32 w-48 h-48 bg-white rounded-sm opacity-12"></div>
          <div className="absolute top-32 right-40 w-32 h-56 bg-white rounded-sm opacity-10 transform skew-y-6"></div>
          
          {/* Geometric overlay */}
          <div className="absolute top-0 right-0 w-full h-full opacity-10">
            <svg viewBox="0 0 1000 1000" className="w-full h-full" preserveAspectRatio="none">
              <defs>
                <linearGradient id="buildingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" style={{stopColor: 'white', stopOpacity: 0.1}} />
                  <stop offset="100%" style={{stopColor: 'white', stopOpacity: 0}} />
                </linearGradient>
              </defs>
              <rect x="700" y="200" width="250" height="600" fill="url(#buildingGrad)" />
              <rect x="500" y="300" width="200" height="500" fill="url(#buildingGrad)" opacity="0.8" />
            </svg>
          </div>
        </div>

        {/* Content */}
        <div className="relative z-10 text-center text-white">
          <div className="mb-12">
            <img 
              src={`${process.env.PUBLIC_URL}/logo1.png`}
              alt="Company Logo" 
              className="h-32 object-contain mx-auto"
            />
          </div>
         
          <p className="text-base text-blue-100 leading-relaxed max-w-sm font-light">
            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Aliquam non leo neque. Proin efficitur.
          </p>
        </div>
      </div>
    </div>
  );
};

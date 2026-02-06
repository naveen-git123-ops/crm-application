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
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-50 via-white to-blue-50">
      <div className="grid min-h-screen lg:grid-cols-2">
        {/* Branding Panel */}
        <div className="hidden lg:flex flex-col justify-between p-12 bg-gradient-to-br from-blue-600 via-indigo-600 to-slate-900 text-white relative overflow-hidden">
          <div className="absolute inset-0 opacity-15">
            <div className="absolute -top-16 -right-10 w-72 h-72 rounded-full bg-white" />
            <div className="absolute bottom-0 left-0 w-96 h-96 rounded-full bg-white" />
            <div className="absolute top-32 left-24 w-40 h-40 rounded-full bg-white" />
          </div>
          <div className="relative z-10">
            <img
              src={`${process.env.PUBLIC_URL}/logo1.png`}
              alt="Company Logo"
              className="h-16 object-contain"
            />
            <h1 className="mt-10 text-4xl font-bold leading-tight">
              Modern HR,
              <span className="block text-blue-200">effortless management.</span>
            </h1>
            <p className="mt-4 text-sm text-blue-100 max-w-md leading-relaxed">
              Streamline attendance, leave, and employee records with a clean, unified platform.
            </p>
          </div>
          <div className="relative z-10 text-sm text-blue-200">
            Secure access • Role-based visibility • Fast onboarding
          </div>
        </div>

        {/* Form Panel */}
        <div className="flex items-center justify-center px-6 py-12 sm:px-12">
          <div className="w-full max-w-md">
            <div className="mb-8 text-center lg:hidden">
              <img
                src={`${process.env.PUBLIC_URL}/logo1.png`}
                alt="Company Logo"
                className="h-14 object-contain mx-auto"
              />
            </div>

            <div className="bg-white border border-gray-100 shadow-xl rounded-2xl p-8">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">
                    {isLogin ? 'Welcome back' : 'Create your account'}
                  </h2>
                  <p className="text-sm text-gray-500 mt-1">
                    {isLogin ? 'Sign in to continue to your dashboard.' : 'Start managing employees in minutes.'}
                  </p>
                </div>
                <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
                  {isLogin ? 'Login' : 'Sign Up'}
                </span>
              </div>

              <div className="flex gap-3 mb-8">
                <button
                  type="button"
                  onClick={() => setIsLogin(true)}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                    isLogin
                      ? 'bg-blue-600 text-white shadow'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  Login
                </button>
                <button
                  type="button"
                  onClick={() => setIsLogin(false)}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                    !isLogin
                      ? 'bg-blue-600 text-white shadow'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  Sign Up
                </button>
              </div>

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
                          className="pl-12 h-11 border border-gray-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 text-gray-900 placeholder:text-gray-500 bg-white"
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
                          className="pl-12 h-11 border border-gray-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 text-gray-900 placeholder:text-gray-500 bg-white"
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
                      placeholder="Email address"
                      className="pl-12 h-11 border border-gray-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 text-gray-900 placeholder:text-gray-500 bg-white"
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
                      className="pl-12 pr-12 h-11 border border-gray-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 text-gray-900 placeholder:text-gray-500 bg-white"
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
                  className="w-full h-11 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transition-all"
                  data-testid="submit-button"
                >
                  {loading ? 'Processing...' : isLogin ? 'Login' : 'Sign Up'}
                </Button>

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
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

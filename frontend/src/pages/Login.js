import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Mail, Lock, User, Briefcase, Eye, EyeOff, ShieldCheck, Zap, Users } from 'lucide-react';

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

  const fieldClass =
    'pl-11 h-11 rounded-lg border-input bg-card text-foreground placeholder:text-muted-foreground';

  return (
    <div className="min-h-screen min-h-[100dvh] w-full bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <div className="grid min-h-screen min-h-[100dvh] lg:grid-cols-2">
        <div className="hidden lg:flex flex-col justify-between p-12 bg-[#0B1220] text-white relative overflow-hidden">
          <div className="absolute inset-0">
            <div className="absolute -top-24 -right-16 h-80 w-80 rounded-full bg-indigo-500/20 blur-3xl" />
            <div className="absolute bottom-0 left-0 h-96 w-96 rounded-full bg-violet-500/10 blur-3xl" />
            <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:48px_48px]" />
          </div>
          <div className="relative z-10">
            <div className="inline-flex items-center justify-center rounded-xl bg-white px-3 py-2 shadow-sm">
              <img
                src={`${process.env.PUBLIC_URL}/logo1.png`}
                alt="Company Logo"
                className="h-10 object-contain"
              />
            </div>
            <p className="mt-10 text-xs font-semibold uppercase tracking-[0.18em] text-indigo-300">
              Resoline workspace
            </p>
            <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight">
              One operating system
              <span className="block text-slate-300">for people, sales, and ops.</span>
            </h1>
            <p className="mt-4 text-sm text-slate-400 max-w-md leading-relaxed">
              Manage leads, attendance, payroll, and field operations from a single professional workspace.
            </p>
            <div className="mt-10 grid gap-4">
              {[
                { icon: ShieldCheck, label: 'Role-based access', copy: 'Every team sees only what they need.' },
                { icon: Users, label: 'Unified CRM + HR', copy: 'Leads, people, and operations in one place.' },
                { icon: Zap, label: 'Built for daily work', copy: 'Fast, mobile-ready, and consistent.' },
              ].map((item) => (
                <div key={item.label} className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-white/10">
                    <item.icon className="h-4 w-4 text-indigo-300" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{item.label}</p>
                    <p className="text-xs text-slate-400">{item.copy}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="relative z-10 text-xs text-slate-500">
            Secure access · Encrypted sessions · Internal use only
          </div>
        </div>

        <div className="flex items-center justify-center px-4 py-8 sm:px-6 sm:py-12">
          <div className="w-full max-w-[420px]">
            <div className="mb-8 text-center lg:hidden">
              <img
                src={`${process.env.PUBLIC_URL}/logo1.png`}
                alt="Company Logo"
                className="h-12 object-contain mx-auto"
              />
            </div>

            <div className="rounded-2xl border border-border bg-card p-5 sm:p-8 shadow-soft">
              <div className="mb-6">
                <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
                  {isLogin ? 'Welcome back' : 'Create your account'}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {isLogin ? 'Sign in to continue to your workspace.' : 'Set up access in a few seconds.'}
                </p>
              </div>

              <div className="mb-6 grid grid-cols-2 rounded-lg bg-muted p-1">
                <button
                  type="button"
                  onClick={() => setIsLogin(true)}
                  className={`h-10 min-h-[40px] rounded-md text-sm font-semibold transition-all ${
                    isLogin
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Login
                </button>
                <button
                  type="button"
                  onClick={() => setIsLogin(false)}
                  className={`h-10 min-h-[40px] rounded-md text-sm font-semibold transition-all ${
                    !isLogin
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Sign Up
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {!isLogin && (
                  <>
                    <div className="relative">
                      <Briefcase className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="employee_id"
                        data-testid="employee-id-input"
                        value={formData.employee_id}
                        onChange={(e) => setFormData({ ...formData, employee_id: e.target.value })}
                        required
                        placeholder="Employee ID"
                        className={fieldClass}
                      />
                    </div>

                    <div className="relative">
                      <User className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="name"
                        data-testid="name-input"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        required
                        placeholder="Full Name"
                        className={fieldClass}
                      />
                    </div>
                  </>
                )}

                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    data-testid="email-input"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                    placeholder="Email address"
                    className={fieldClass}
                  />
                </div>

                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    data-testid="password-input"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    required
                    placeholder="Password"
                    className={`${fieldClass} pr-11`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-11"
                  data-testid="submit-button"
                >
                  {loading ? 'Processing...' : isLogin ? 'Continue' : 'Create account'}
                </Button>

                <p className="text-sm text-muted-foreground text-center pt-1">
                  {isLogin ? "Don't have an account? " : 'Already have an account? '}
                  <button
                    type="button"
                    onClick={() => setIsLogin(!isLogin)}
                    className="font-semibold text-primary hover:text-primary/80"
                  >
                    {isLogin ? 'Sign up' : 'Log in'}
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

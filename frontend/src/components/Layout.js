import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { 
  LayoutDashboard, 
  Users, 
  Calendar, 
  FileText, 
  Settings, 
  LogOut,
  Menu,
  X,
  CreditCard as IDCard
} from 'lucide-react';
import { useState } from 'react';

export const Layout = ({ children }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard', roles: ['Admin', 'HR', 'Manager', 'Employee'] },
    { icon: Users, label: 'Employees', path: '/employees', roles: ['Admin', 'HR', 'Manager'] },
    { icon: Calendar, label: 'Attendance', path: '/attendance', roles: ['Admin', 'HR', 'Manager', 'Employee'] },
    { icon: FileText, label: 'Leaves', path: '/leaves', roles: ['Admin', 'HR', 'Manager', 'Employee'] },
    { icon: FileText, label: 'Documents', path: '/documents', roles: ['Admin', 'HR', 'Manager', 'Employee'] },
    { icon: IDCard, label: 'ID Cards', path: '/idcards', roles: ['Admin', 'HR', 'Manager'] },
    { icon: Settings, label: 'Settings', path: '/settings', roles: ['Admin', 'HR', 'Manager', 'Employee'] },
  ];

  const filteredNavItems = navItems.filter(item => item.roles.includes(user?.role));

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Sidebar - Desktop */}
      <aside className="hidden lg:flex flex-col w-64 border-r border-gray-200 bg-white">
        <div className="p-6 border-b border-gray-200 bg-white">
          <img 
            src={`${process.env.PUBLIC_URL}/logo1.png`}
            alt="Company Logo" 
            className="h-12 object-contain"
          />
        </div>
        
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto scrollbar-hide">
          {filteredNavItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              data-testid={`nav-${item.label.toLowerCase()}`}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors text-sm ${
                  isActive
                    ? 'bg-blue-100 text-blue-700 font-medium'
                    : 'text-gray-700 hover:bg-gray-100'
                }`
              }
            >
              <item.icon className="h-5 w-5" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-200 space-y-2">
          <div className="px-4 py-2">
            <p className="text-sm font-medium text-gray-900">{user?.name}</p>
            <p className="text-xs text-gray-600">{user?.role}</p>
          </div>
          <Button
            variant="ghost"
            className="w-full justify-start text-red-600 hover:bg-red-50 font-medium text-sm h-10"
            onClick={handleLogout}
            data-testid="logout-button"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Logout
          </Button>
        </div>
      </aside>

      {/* Mobile Sidebar */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <aside className="fixed left-0 top-0 bottom-0 w-64 bg-white border-r border-gray-200">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between bg-white">
              <img 
                src={`${process.env.PUBLIC_URL}/logo1.png`}
                alt="Company Logo" 
                className="h-10 object-contain"
              />
              <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(false)}>
                <X className="h-5 w-5 text-gray-600" />
              </Button>
            </div>
            
            <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
              {filteredNavItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={() => setSidebarOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors text-sm ${
                      isActive
                        ? 'bg-blue-100 text-blue-700 font-medium'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`
                  }
                >
                  <item.icon className="h-5 w-5" />
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </nav>

            <div className="p-4 border-t border-gray-200 space-y-2">
              <div className="px-4 py-2">
                <p className="text-sm font-medium text-gray-900">{user?.name}</p>
                <p className="text-xs text-gray-600">{user?.role}</p>
              </div>
              <Button
                variant="ghost"
                className="w-full justify-start text-red-600 hover:bg-red-50 font-medium text-sm h-10"
                onClick={handleLogout}
              >
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </Button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-16 border-b border-gray-200 bg-white flex items-center px-6 shadow-sm">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden mr-2 text-gray-600"
            onClick={() => setSidebarOpen(true)}
            data-testid="mobile-menu-button"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <h2 className="text-lg font-semibold tracking-tight text-gray-900">
            {filteredNavItems.find(item => window.location.pathname === item.path)?.label || 'Dashboard'}
          </h2>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-6 bg-gray-50">
          {children}
        </main>
      </div>
    </div>
  );
};
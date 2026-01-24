import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { Button } from '@/components/ui/button';
import { 
  LayoutDashboard, 
  Users, 
  Calendar, 
  FileText, 
  CreditCard, 
  Settings, 
  LogOut,
  Sun,
  Moon,
  Menu,
  X
} from 'lucide-react';
import { useState } from 'react';

export const Layout = ({ children }) => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
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
    { icon: CreditCard, label: 'Payroll', path: '/payroll', roles: ['Admin', 'HR', 'Employee'] },
    { icon: Settings, label: 'Settings', path: '/settings', roles: ['Admin', 'HR', 'Manager', 'Employee'] },
  ];

  const filteredNavItems = navItems.filter(item => item.roles.includes(user?.role));

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar - Desktop */}
      <aside className="hidden lg:flex flex-col w-64 border-r border-border bg-card/50 backdrop-blur-sm">
        <div className="p-6 border-b border-border">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Glass HQ</h1>
          <p className="text-xs text-muted-foreground mt-1">Employee Management</p>
        </div>
        
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto scrollbar-hide">
          {filteredNavItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              data-testid={`nav-${item.label.toLowerCase()}`}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-md transition-colors ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                }`
              }
            >
              <item.icon className="h-5 w-5" />
              <span className="font-medium">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-border space-y-2">
          <div className="px-4 py-2">
            <p className="text-sm font-medium text-foreground">{user?.name}</p>
            <p className="text-xs text-muted-foreground">{user?.role}</p>
          </div>
          <Button
            variant="ghost"
            className="w-full justify-start"
            onClick={toggleTheme}
            data-testid="theme-toggle"
          >
            {theme === 'light' ? <Moon className="h-5 w-5 mr-3" /> : <Sun className="h-5 w-5 mr-3" />}
            {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
          </Button>
          <Button
            variant="ghost"
            className="w-full justify-start text-destructive hover:text-destructive"
            onClick={handleLogout}
            data-testid="logout-button"
          >
            <LogOut className="h-5 w-5 mr-3" />
            Logout
          </Button>
        </div>
      </aside>

      {/* Mobile Sidebar */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <aside className="fixed left-0 top-0 bottom-0 w-64 bg-card border-r border-border">
            <div className="p-6 border-b border-border flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-foreground">Glass HQ</h1>
                <p className="text-xs text-muted-foreground mt-1">Employee Management</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(false)}>
                <X className="h-5 w-5" />
              </Button>
            </div>
            
            <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
              {filteredNavItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={() => setSidebarOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-3 rounded-md transition-colors ${
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                    }`
                  }
                >
                  <item.icon className="h-5 w-5" />
                  <span className="font-medium">{item.label}</span>
                </NavLink>
              ))}
            </nav>

            <div className="p-4 border-t border-border space-y-2">
              <div className="px-4 py-2">
                <p className="text-sm font-medium text-foreground">{user?.name}</p>
                <p className="text-xs text-muted-foreground">{user?.role}</p>
              </div>
              <Button variant="ghost" className="w-full justify-start" onClick={toggleTheme}>
                {theme === 'light' ? <Moon className="h-5 w-5 mr-3" /> : <Sun className="h-5 w-5 mr-3" />}
                {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
              </Button>
              <Button
                variant="ghost"
                className="w-full justify-start text-destructive hover:text-destructive"
                onClick={handleLogout}
              >
                <LogOut className="h-5 w-5 mr-3" />
                Logout
              </Button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-16 border-b border-border bg-card/50 backdrop-blur-sm flex items-center px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden mr-2"
            onClick={() => setSidebarOpen(true)}
            data-testid="mobile-menu-button"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <h2 className="text-xl font-semibold tracking-tight">
            {filteredNavItems.find(item => window.location.pathname === item.path)?.label || 'Dashboard'}
          </h2>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
};
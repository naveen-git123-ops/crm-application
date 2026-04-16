import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { 
  LayoutDashboard, 
  Users, 
  Calendar, 
  CalendarDays,
  FileText, 
  FileStack,
  Settings, 
  LogOut,
  Menu,
  X,
  CreditCard as IDCard,
  Receipt,
  Shield,
  Briefcase,
  Target,
  Package,
  CheckSquare,
  Fuel,
  MapPin,
  Droplets,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { useEffect, useState } from 'react';

export const Layout = ({ children }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('desktop-sidebar-collapsed') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('desktop-sidebar-collapsed', String(desktopSidebarCollapsed));
    } catch {
      // ignore persistence errors (private mode/storage limitations)
    }
  }, [desktopSidebarCollapsed]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard', permission: 'dashboard' },
    { icon: Target, label: 'Leads', path: '/leads', permission: 'leads' },
    { icon: Package, label: 'Inventory', path: '/inventory', permission: 'leads' },
    { icon: Users, label: 'Employees', path: '/employees', permission: 'employees' },
    { icon: Users, label: 'Customers', path: '/customers', permission: 'customers' },
    { icon: Droplets, label: 'CGW Flow Metre', path: '/cgw-flow-metre', permission: 'cgw-flow-metre' },
    { icon: CheckSquare, label: 'Tasks', path: '/tasks', permission: 'tasks' },
    { icon: Calendar, label: 'Attendance', path: '/attendance', permission: 'attendance' },
    { icon: MapPin, label: 'Location Tracker', path: '/location-tracker', permission: 'attendance' },
    { icon: FileText, label: 'Leaves', path: '/leaves', permission: 'leaves' },
    { icon: CalendarDays, label: 'Government Holidays', path: '/government-holidays', permission: 'holidays' },
    { icon: Receipt, label: 'Expenses', path: '/expenses', permission: 'expenses' },
    { icon: Fuel, label: 'Vehicle Tracking', path: '/vehicles', permission: 'vehicles' },
    { icon: Shield, label: 'Roles', path: '/roles', permission: 'roles' },
    { icon: Briefcase, label: 'Workspace', path: '/workspace', permission: 'workspace' },
    { icon: FileStack, label: 'Documents', path: '/documents', permission: 'documents' },
    { icon: IDCard, label: 'ID Cards', path: '/idcards', permission: 'idcards' },
    { icon: Settings, label: 'Settings', path: '/settings', permission: 'settings' },
  ];

  const filteredNavItems = navItems.filter(item => {
    const hasPermission =
      user?.role === 'Admin' ||
      (Array.isArray(user?.permissions) && user.permissions.includes(item.permission));
    return hasPermission;
  });

  const currentPath = window.location.pathname;
  const bottomNavItems = filteredNavItems.slice(0, 5);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Sidebar - Desktop */}
      <aside className={`hidden lg:flex flex-col border-r border-gray-200 bg-white flex-shrink-0 transition-all duration-200 ${desktopSidebarCollapsed ? 'w-20' : 'w-64'}`}>
        <div className={`border-b border-gray-200 bg-white ${desktopSidebarCollapsed ? 'p-3 flex justify-center' : 'p-6'}`}>
          <img 
            src={`${process.env.PUBLIC_URL}/logo1.png`}
            alt="Company Logo" 
            className={`${desktopSidebarCollapsed ? 'h-10' : 'h-12'} object-contain`}
          />
        </div>
        
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto scrollbar-hide">
          {filteredNavItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              data-testid={`nav-${item.label.toLowerCase()}`}
              className={({ isActive }) =>
                `flex items-center ${desktopSidebarCollapsed ? 'justify-center px-2' : 'gap-3 px-4'} py-2.5 rounded-lg transition-colors text-sm ${
                  isActive
                    ? 'bg-blue-100 text-blue-700 font-medium'
                    : 'text-gray-700 hover:bg-gray-100'
                }`
              }
              title={item.label}
            >
              <item.icon className="h-5 w-5" />
              {!desktopSidebarCollapsed && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-200 space-y-2">
          {!desktopSidebarCollapsed && (
            <div className="px-4 py-2">
              <p className="text-sm font-medium text-gray-900">{user?.name}</p>
              <p className="text-xs text-gray-600">{user?.role}</p>
            </div>
          )}
          <Button
            variant="ghost"
            className={`w-full ${desktopSidebarCollapsed ? 'justify-center px-2' : 'justify-start'} bg-red-50 text-red-700 border-red-200 hover:bg-red-100 font-medium text-sm h-10`}
            onClick={handleLogout}
            data-testid="logout-button"
            title="Logout"
          >
            <LogOut className={`h-4 w-4 ${desktopSidebarCollapsed ? '' : 'mr-2'}`} />
            {!desktopSidebarCollapsed && 'Logout'}
          </Button>
        </div>
      </aside>

      {/* Mobile Sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div 
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" 
            onClick={() => setSidebarOpen(false)} 
            aria-hidden="true"
          />
          <aside className="fixed left-0 top-0 bottom-0 w-[min(280px,85vw)] max-w-full bg-white border-r border-gray-200 shadow-xl flex flex-col pt-[env(safe-area-inset-top)]">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-white">
              <img 
                src={`${process.env.PUBLIC_URL}/logo1.png`}
                alt="Company Logo" 
                className="h-10 object-contain"
              />
              <Button variant="ghost" size="icon" className="h-11 w-11 min-h-[44px] min-w-[44px] bg-gray-200 border border-gray-300 text-gray-800 hover:bg-gray-300" onClick={() => setSidebarOpen(false)}>
                <X className="h-5 w-5" />
              </Button>
            </div>
            
            <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto overflow-x-hidden">
              {filteredNavItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={() => setSidebarOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-3 rounded-xl transition-colors text-sm min-h-[48px] ${
                      isActive
                        ? 'bg-blue-100 text-blue-700 font-medium'
                        : 'text-gray-700 hover:bg-gray-100 active:bg-gray-200'
                    }`
                  }
                >
                  <item.icon className="h-5 w-5 flex-shrink-0" />
                  <span className="truncate">{item.label}</span>
                </NavLink>
              ))}
            </nav>

            <div className="p-3 border-t border-gray-200 space-y-2 pb-[env(safe-area-inset-bottom)]">
              <div className="px-3 py-2">
                <p className="text-sm font-medium text-gray-900 truncate">{user?.name}</p>
                <p className="text-xs text-gray-600">{user?.role}</p>
              </div>
              <Button
                variant="ghost"
                className="w-full justify-start bg-red-50 text-red-700 border-red-200 hover:bg-red-100 active:bg-red-200 font-medium text-sm min-h-[48px] px-4"
                onClick={handleLogout}
              >
                <LogOut className="h-4 w-4 mr-2 flex-shrink-0" />
                Logout
              </Button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Header - touch-friendly on mobile */}
        <header className="h-14 sm:h-16 border-b border-gray-200 bg-white flex items-center px-4 sm:px-6 shadow-sm flex-shrink-0 pt-[env(safe-area-inset-top)]">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden mr-2 h-11 w-11 min-h-[44px] min-w-[44px] flex-shrink-0 bg-gray-200 border border-gray-300 text-gray-800 hover:bg-gray-300"
            onClick={() => setSidebarOpen(true)}
            data-testid="mobile-menu-button"
            aria-label="Open menu"
          >
            <Menu className="h-6 w-6" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="hidden lg:inline-flex mr-2 h-10 w-10 flex-shrink-0 border border-gray-300 text-gray-700 hover:bg-gray-100"
            onClick={() => setDesktopSidebarCollapsed(prev => !prev)}
            data-testid="desktop-sidebar-toggle"
            aria-label={desktopSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={desktopSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {desktopSidebarCollapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
          </Button>
          <h2 className="text-base sm:text-lg font-semibold tracking-tight text-gray-900 truncate">
            {filteredNavItems.find(item => currentPath === item.path)?.label || 'Dashboard'}
          </h2>
        </header>

        {/* Page Content - responsive padding, space for bottom nav on mobile */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 pb-24 sm:pb-6 bg-gray-50">
          {children}
        </main>

        {/* Bottom navigation - mobile only */}
        <nav 
          className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] flex items-center justify-around safe-area-bottom z-40"
          aria-label="Main navigation"
        >
          {bottomNavItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-0.5 py-2 px-2 min-h-[56px] min-w-[56px] rounded-lg transition-colors text-xs bg-gray-100/80 border border-transparent ${
                  isActive ? 'text-blue-600 font-medium bg-blue-50 border-blue-200' : 'text-gray-700'
                }`
              }
            >
              <item.icon className="h-6 w-6" />
              <span className="truncate max-w-[72px]">{item.label}</span>
            </NavLink>
          ))}
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="flex flex-col items-center justify-center gap-0.5 py-2 px-2 min-h-[56px] min-w-[56px] rounded-lg transition-colors text-xs bg-gray-100/80 text-gray-700 border border-gray-200 hover:bg-gray-200"
            aria-label="More menu"
          >
            <Menu className="h-6 w-6" />
            <span className="truncate max-w-[72px]">More</span>
          </button>
        </nav>
      </div>
    </div>
  );
};
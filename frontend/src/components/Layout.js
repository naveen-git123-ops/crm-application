import React from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { userHasPermission } from '@/lib/permissions';
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
  CheckSquare,
  Fuel,
  MapPin,
  Droplets,
  Eye,
  FileClock,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  BarChart3,
  BookOpen,
  Wallet,
  Package,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { PageHeaderProvider, usePageHeader, usePageHeaderActions } from '@/contexts/PageHeaderContext';
import { EmployeeLocationTracker } from '@/components/EmployeeLocationTracker';

function ClearHeaderOnNavigate() {
  const location = useLocation();
  const { clearPageHeader } = usePageHeaderActions();

  useEffect(() => {
    clearPageHeader();
  }, [location.pathname, clearPageHeader]);

  return null;
}

function AppHeaderBar({
  currentPath,
  filteredNavItems,
  desktopSidebarCollapsed,
  onOpenMobileMenu,
  onToggleDesktopSidebar,
}) {
  const header = usePageHeader();
  const title = (() => {
    if (currentPath.startsWith('/create-cgwa/')) return 'Edit CGWA';
    const exact = filteredNavItems.find((item) => currentPath === item.path);
    if (exact) return exact.label;
    const nested = filteredNavItems.find(
      (item) => item.path !== '/' && currentPath.startsWith(`${item.path}/`),
    );
    return nested?.label || 'Dashboard';
  })();

  return (
    <header className="min-h-12 sm:min-h-14 border-b border-gray-200 bg-white flex items-center gap-2.5 sm:gap-3 px-3 sm:px-5 py-2 sm:py-2.5 shadow-sm flex-shrink-0 pt-[env(safe-area-inset-top)]">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden h-10 w-10 min-h-[40px] min-w-[40px] flex-shrink-0 border border-gray-300 text-gray-700 hover:bg-gray-100"
        onClick={onOpenMobileMenu}
        data-testid="mobile-menu-button"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="hidden lg:inline-flex h-9 w-9 flex-shrink-0 border border-gray-300 text-gray-700 hover:bg-gray-100"
        onClick={onToggleDesktopSidebar}
        data-testid="desktop-sidebar-toggle"
        aria-label={desktopSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        title={desktopSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {desktopSidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </Button>
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <h2 className="text-base sm:text-lg font-semibold tracking-tight text-gray-900 truncate">{title}</h2>
        {header.subtitle ? (
          <span className="hidden sm:inline text-sm text-gray-500 truncate border-l border-gray-200 pl-2.5 ml-0.5">
            {header.subtitle}
          </span>
        ) : null}
      </div>
      {header.actions ? (
        <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2 shrink-0 max-w-[min(100%,72vw)]">
          {header.actions}
        </div>
      ) : null}
    </header>
  );
}

export const Layout = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('desktop-sidebar-collapsed') === 'true';
    } catch {
      return false;
    }
  });
  const [collapsedSections, setCollapsedSections] = useState(() => {
    try {
      const saved = localStorage.getItem('nav-sections-collapsed');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('desktop-sidebar-collapsed', String(desktopSidebarCollapsed));
    } catch {
      // ignore persistence errors (private mode/storage limitations)
    }
  }, [desktopSidebarCollapsed]);

  useEffect(() => {
    try {
      localStorage.setItem('nav-sections-collapsed', JSON.stringify(collapsedSections));
    } catch {
      // ignore persistence errors (private mode/storage limitations)
    }
  }, [collapsedSections]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const canSeeNavItem = (item) => {
    if (item.adminOnly && user?.role !== 'Admin') return false;
    if (Array.isArray(item.allowedRoles) && item.allowedRoles.length > 0) {
      return item.allowedRoles.includes(user?.role);
    }
    if (!item.permission) return true;
    return userHasPermission(user, item.permission);
  };

  const navSections = [
    {
      id: 'overview',
      label: null,
      items: [
        { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard', permission: 'dashboard' },
      ],
    },
    {
      id: 'crm',
      label: 'CRM',
      items: [
        { icon: Target, label: 'Leads', path: '/leads', permission: 'leads' },
        { icon: BookOpen, label: 'Create Ledger', path: '/customers', permission: 'customers' },
        { icon: CheckSquare, label: 'Tasks', path: '/tasks', permission: 'tasks' },
        { icon: Droplets, label: 'Create CGWA', path: '/create-cgwa', permission: 'cgw-flow-metre' },
        { icon: FileClock, label: 'My Drafts', path: '/my-cgwa-drafts', permission: 'cgw-flow-metre' },
        { icon: Eye, label: 'View CGWA', path: '/view-cgwa', permission: 'cgw-flow-metre' },
      ],
    },
    {
      id: 'employee',
      label: 'Employee',
      items: [
        { icon: Calendar, label: 'Attendance', path: '/attendance', permission: 'attendance' },
        { icon: BarChart3, label: 'Monthly Report', path: '/monthly-report', permission: 'monthly-report' },
        { icon: FileText, label: 'Leaves', path: '/leaves', permission: 'leaves' },
        { icon: MapPin, label: 'Location Tracker', path: '/location-tracker', permission: 'attendance', adminOnly: true },
      ],
    },
    {
      id: 'hr',
      label: 'HR',
      items: [
        { icon: Users, label: 'Employees', path: '/employees', permission: 'employees' },
        { icon: CalendarDays, label: 'Government Holidays', path: '/government-holidays', permission: 'holidays' },
        { icon: IDCard, label: 'ID Cards', path: '/idcards', permission: 'idcards' },
        { icon: FileStack, label: 'Documents', path: '/documents', permission: 'documents' },
        { icon: Wallet, label: 'Payroll', path: '/payroll' },
      ],
    },
    {
      id: 'operations',
      label: 'Operations',
      items: [
        { icon: Receipt, label: 'Expenses', path: '/expenses', permission: 'expenses' },
        { icon: Package, label: 'Stock Management', path: '/stock-management', permission: 'stock-management' },
        { icon: Fuel, label: 'Vehicle Tracking', path: '/vehicles', permission: 'vehicles' },
        { icon: Briefcase, label: 'Workspace', path: '/workspace', permission: 'workspace' },
      ],
    },
    {
      id: 'admin',
      label: 'Admin',
      items: [
        { icon: Shield, label: 'Roles', path: '/roles', permission: 'roles' },
        { icon: Settings, label: 'Settings', path: '/settings', permission: 'settings' },
      ],
    },
  ];

  const filteredNavSections = navSections
    .map((section) => ({
      ...section,
      items: section.items.filter(canSeeNavItem),
    }))
    .filter((section) => section.items.length > 0);

  const filteredNavItems = filteredNavSections.flatMap((section) => section.items);

  const currentPath = location.pathname;

  useEffect(() => {
    const activeSection = filteredNavSections.find((section) =>
      section.items.some((item) => currentPath === item.path || currentPath.startsWith(`${item.path}/`)),
    );
    if (activeSection?.label) {
      setCollapsedSections((prev) => {
        if (prev[activeSection.id] === false) return prev;
        return { ...prev, [activeSection.id]: false };
      });
    }
  }, [currentPath, filteredNavSections]);

  const toggleSection = (sectionId) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  };

  const isSectionCollapsed = (section) => {
    if (!section.label) return false;
    return collapsedSections[section.id] === true;
  };

  const pathIsActive = (path) => currentPath === path || currentPath.startsWith(`${path}/`);

  const renderNavLink = (item, { onNavigate, compact = false, mobile = false } = {}) => (
    <NavLink
      key={item.path}
      to={item.path}
      onClick={onNavigate}
      data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
      className={() => {
        const isActive = pathIsActive(item.path);
        return `flex items-center ${compact ? 'justify-center px-2' : 'gap-3 px-4'} ${
          mobile ? 'py-3 rounded-xl min-h-[48px]' : 'py-2.5 rounded-lg'
        } transition-colors text-sm ${
          isActive
            ? 'bg-blue-100 text-blue-700 font-medium'
            : mobile
              ? 'text-gray-700 hover:bg-gray-100 active:bg-gray-200'
              : 'text-gray-700 hover:bg-gray-100'
        }`;
      }}
      title={item.label}
    >
      <item.icon className="h-5 w-5 flex-shrink-0" />
      {!compact && <span className={mobile ? 'truncate' : ''}>{item.label}</span>}
    </NavLink>
  );

  const renderNavSection = (section, sectionIndex, { mobile = false } = {}) => {
    const collapsed = isSectionCollapsed(section);
    const compact = !mobile && desktopSidebarCollapsed;
    const showItems = !section.label || !collapsed || compact;

    return (
      <div
        key={section.id}
        className={sectionIndex > 0 ? (compact ? 'mt-3 pt-3 border-t border-gray-100' : 'mt-3') : ''}
      >
        {section.label && !compact && (
          <button
            type="button"
            onClick={() => toggleSection(section.id)}
            className={`flex w-full items-center justify-between rounded-md px-4 py-1.5 text-left transition-colors hover:bg-gray-50 ${
              mobile ? 'mb-1' : 'mb-1.5'
            }`}
            aria-expanded={!collapsed}
            aria-controls={`nav-section-${section.id}`}
          >
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              {section.label}
            </span>
            <ChevronDown
              className={`h-3.5 w-3.5 text-gray-400 transition-transform ${collapsed ? '-rotate-90' : ''}`}
            />
          </button>
        )}
        {showItems && (
          <div
            id={section.label ? `nav-section-${section.id}` : undefined}
            className={mobile ? 'space-y-0.5' : 'space-y-1'}
          >
            {section.items.map((item) =>
              renderNavLink(item, {
                onNavigate: mobile ? () => setSidebarOpen(false) : undefined,
                compact,
                mobile,
              }),
            )}
          </div>
        )}
      </div>
    );
  };
  const preferredBottomPaths = ['/dashboard', '/attendance', '/leaves', '/tasks', '/expenses'];
  const bottomNavItems = [
    ...preferredBottomPaths
      .map((path) => filteredNavItems.find((item) => item.path === path))
      .filter(Boolean),
    ...filteredNavItems.filter((item) => !preferredBottomPaths.includes(item.path)),
  ].slice(0, 5);

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
        
        <nav className="flex-1 p-4 overflow-y-auto scrollbar-hide">
          {filteredNavSections.map((section, sectionIndex) =>
            renderNavSection(section, sectionIndex, { mobile: false }),
          )}
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
            
            <nav className="flex-1 p-3 overflow-y-auto overflow-x-hidden">
              {filteredNavSections.map((section, sectionIndex) =>
                renderNavSection(section, sectionIndex, { mobile: true }),
              )}
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
        <PageHeaderProvider>
          <EmployeeLocationTracker />
          <ClearHeaderOnNavigate />
          <AppHeaderBar
            currentPath={currentPath}
            filteredNavItems={filteredNavItems}
            desktopSidebarCollapsed={desktopSidebarCollapsed}
            onOpenMobileMenu={() => setSidebarOpen(true)}
            onToggleDesktopSidebar={() => setDesktopSidebarCollapsed((prev) => !prev)}
          />

          {/* Page Content - responsive padding, space for bottom nav on mobile */}
          <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 pb-24 sm:pb-6 bg-gray-50">
            <Outlet />
          </main>
        </PageHeaderProvider>

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
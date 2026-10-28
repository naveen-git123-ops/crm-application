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
  TrendingUp,
  Phone,
  ClipboardList,
  Wrench,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { PageHeaderProvider, usePageHeader, usePageHeaderActions } from '@/contexts/PageHeaderContext';
import { EmployeeLocationTracker } from '@/components/EmployeeLocationTracker';
import { cn } from '@/lib/utils';

function ClearHeaderOnNavigate() {
  const location = useLocation();
  const { clearPageHeader } = usePageHeaderActions();

  useEffect(() => {
    clearPageHeader();
  }, [location.pathname, clearPageHeader]);

  return null;
}

function userInitials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'U';
  return parts.slice(0, 2).map((part) => part[0]).join('').toUpperCase();
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
    <header className="min-h-16 border-b border-border/70 bg-card/80 backdrop-blur-xl shadow-[0_1px_0_rgb(255_255_255/0.6)_inset] flex items-center gap-2.5 sm:gap-3 px-3 sm:px-6 py-2 sm:py-3 flex-shrink-0 pt-[max(0.5rem,env(safe-area-inset-top))]">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden h-10 w-10 min-h-[40px] min-w-[40px] flex-shrink-0 text-foreground"
        onClick={onOpenMobileMenu}
        data-testid="mobile-menu-button"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="hidden lg:inline-flex h-9 w-9 flex-shrink-0 text-muted-foreground"
        onClick={onToggleDesktopSidebar}
        data-testid="desktop-sidebar-toggle"
        aria-label={desktopSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        title={desktopSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {desktopSidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </Button>
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <h1 className="text-lg sm:text-xl font-bold tracking-tight text-foreground truncate">{title}</h1>
        {header.subtitle ? (
          <span className="hidden sm:inline-flex items-center rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground truncate ml-1">
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

  // Escape closes the mobile menu and the page behind it stops scrolling while it is open.
  useEffect(() => {
    if (!sidebarOpen) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setSidebarOpen(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [sidebarOpen]);

  // After a client-side navigation, move focus to the page content so keyboard and
  // screen-reader users do not stay stranded in the sidebar link they just activated.
  const mainRef = useRef(null);
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    mainRef.current?.focus({ preventScroll: true });
    mainRef.current?.scrollTo?.({ top: 0 });
  }, [location.pathname]);

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
        { icon: TrendingUp, label: 'Business Potential', path: '/business-potential', permission: 'business-potential' },
        { icon: Phone, label: 'BPO Desk', path: '/bpo-desk', permission: 'bpo-desk' },
        { icon: MapPin, label: 'BPO Site Visit', path: '/bpo-site-visit', permission: 'bpo-site-visit' },
        { icon: CheckSquare, label: 'Tasks', path: '/tasks', permission: 'tasks' },
      ],
    },
    {
      id: 'cgwa',
      label: 'CGWA',
      items: [
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
        { icon: ClipboardList, label: 'Operations', path: '/operations', permission: 'operations' },
        { icon: Wrench, label: 'Service & Maintenance', path: '/service-maintenance', permission: 'service-maintenance' },
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
      ],
    },
    {
      id: 'account',
      label: 'Account',
      items: [
        { icon: Settings, label: 'Settings', path: '/settings' },
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
        if (mobile) {
          return cn(
            'flex items-center gap-3 px-3 py-3 rounded-xl min-h-[48px] text-sm transition-colors',
            isActive
              ? 'bg-accent text-accent-foreground font-semibold'
              : 'text-foreground hover:bg-muted active:bg-muted',
          );
        }
        return cn(
          'group relative flex items-center text-sm transition-all duration-150',
          compact ? 'justify-center px-2 py-2.5 rounded-xl' : 'gap-3 px-3 py-2.5 rounded-xl',
          isActive
            ? 'bg-gradient-to-r from-sidebar-primary/25 via-sidebar-primary/10 to-transparent text-white font-semibold shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)] before:absolute before:left-0 before:top-2 before:bottom-2 before:w-[3px] before:rounded-r-full before:bg-sidebar-primary'
            : 'text-sidebar-muted hover:bg-white/[0.06] hover:text-white',
        );
      }}
      title={compact ? item.label : undefined}
      aria-label={compact ? item.label : undefined}
    >
      <item.icon className="h-[19px] w-[19px] flex-shrink-0 transition-transform group-hover:scale-110" />
      {!compact && <span className={mobile ? 'truncate' : 'truncate'}>{item.label}</span>}
    </NavLink>
  );

  const renderNavSection = (section, sectionIndex, { mobile = false } = {}) => {
    const collapsed = isSectionCollapsed(section);
    const compact = !mobile && desktopSidebarCollapsed;
    const showItems = !section.label || !collapsed || compact;

    return (
      <div
        key={section.id}
        className={sectionIndex > 0 ? (compact ? 'mt-3 pt-3 border-t border-white/10' : 'mt-4') : ''}
      >
        {section.label && !compact && (
          <button
            type="button"
            onClick={() => toggleSection(section.id)}
            className={cn(
              'flex w-full items-center justify-between rounded-md px-3 py-1.5 text-left transition-colors',
              mobile ? 'mb-1 hover:bg-muted' : 'mb-1 hover:bg-white/5',
            )}
            aria-expanded={!collapsed}
            aria-controls={`nav-section-${section.id}`}
          >
            <span className={cn(
              'text-[11px] font-bold uppercase tracking-[0.14em]',
              mobile ? 'text-muted-foreground' : 'text-sidebar-muted/80',
            )}>
              {section.label}
            </span>
            <ChevronDown
              className={cn(
                'h-3.5 w-3.5 transition-transform',
                mobile ? 'text-muted-foreground' : 'text-sidebar-muted',
                collapsed ? '-rotate-90' : '',
              )}
            />
          </button>
        )}
        {showItems && (
          <div
            id={section.label ? `nav-section-${section.id}` : undefined}
            className={mobile ? 'space-y-0.5' : 'space-y-0.5'}
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
    <div className="flex h-screen overflow-hidden bg-background">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <aside aria-label="Sidebar" className={cn(
        'hidden lg:flex flex-col flex-shrink-0 transition-all duration-200 bg-gradient-to-b from-sidebar to-[hsl(236,52%,6%)] text-sidebar-foreground border-r border-sidebar-border',
        desktopSidebarCollapsed ? 'w-[72px]' : 'w-64',
      )}>
        <div className={cn(
          'border-b border-white/10',
          desktopSidebarCollapsed ? 'p-3 flex justify-center' : 'px-5 py-5',
        )}>
          <div className={cn(
            'flex items-center justify-center rounded-xl bg-white shadow-sm',
            desktopSidebarCollapsed ? 'h-10 w-10 p-1.5' : 'h-12 px-3 py-2',
          )}>
            <img 
              src={`${process.env.PUBLIC_URL}/logo1.png`}
              alt="Company Logo" 
              className={cn(desktopSidebarCollapsed ? 'h-7' : 'h-8', 'object-contain')}
            />
          </div>
        </div>
        
        <nav className={cn('flex-1 overflow-y-auto scrollbar-hide', desktopSidebarCollapsed ? 'p-2' : 'p-3')}>
          {filteredNavSections.map((section, sectionIndex) =>
            renderNavSection(section, sectionIndex, { mobile: false }),
          )}
        </nav>

        <div className="p-3 border-t border-white/10 space-y-2">
          {!desktopSidebarCollapsed && (
            <div className="flex items-center gap-3 px-2 py-2">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 text-xs font-bold text-white shadow-glow ring-2 ring-white/10">
                {userInitials(user?.name)}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-white truncate">{user?.name}</p>
                <p className="text-xs text-sidebar-muted truncate">{user?.role}</p>
              </div>
            </div>
          )}
          <Button
            variant="ghost"
            className={cn(
              'w-full text-sidebar-muted hover:bg-rose-500/10 hover:text-rose-300',
              desktopSidebarCollapsed ? 'justify-center px-2' : 'justify-start',
            )}
            onClick={handleLogout}
            data-testid="logout-button"
            title="Logout"
            aria-label="Logout"
          >
            <LogOut className={cn('h-4 w-4', desktopSidebarCollapsed ? '' : 'mr-2')} />
            {!desktopSidebarCollapsed && 'Logout'}
          </Button>
        </div>
      </aside>

      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div 
            className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm" 
            onClick={() => setSidebarOpen(false)} 
            aria-hidden="true"
          />
          <aside className="fixed left-0 top-0 bottom-0 w-[min(300px,88vw)] max-w-full bg-card border-r border-border shadow-panel flex flex-col pt-[env(safe-area-inset-top)]">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <img 
                src={`${process.env.PUBLIC_URL}/logo1.png`}
                alt="Company Logo" 
                className="h-10 object-contain"
              />
              <Button variant="ghost" size="icon" className="h-11 w-11 min-h-[44px] min-w-[44px]" aria-label="Close menu" onClick={() => setSidebarOpen(false)}>
                <X className="h-5 w-5" />
              </Button>
            </div>
            
            <nav className="flex-1 p-3 overflow-y-auto overflow-x-hidden">
              {filteredNavSections.map((section, sectionIndex) =>
                renderNavSection(section, sectionIndex, { mobile: true }),
              )}
            </nav>

            <div className="p-3 border-t border-border space-y-2 pb-[env(safe-area-inset-bottom)]">
              <div className="flex items-center gap-3 px-2 py-2">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-semibold text-indigo-700">
                  {userInitials(user?.name)}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{user?.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{user?.role}</p>
                </div>
              </div>
              <Button
                variant="ghost"
                className="w-full justify-start text-rose-600 hover:bg-rose-50 hover:text-rose-700 min-h-[48px] px-4"
                onClick={handleLogout}
              >
                <LogOut className="h-4 w-4 mr-2 flex-shrink-0" />
                Logout
              </Button>
            </div>
          </aside>
        </div>
      )}

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

          <main
            id="main-content"
            ref={mainRef}
            tabIndex={-1}
            className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:p-8 pb-24 lg:pb-8 bg-background focus:outline-none"
          >
            <Outlet />
          </main>
        </PageHeaderProvider>

        <nav 
          className="lg:hidden fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur-xl border-t border-border flex items-center justify-around safe-area-bottom z-40"
          aria-label="Main navigation"
        >
          {bottomNavItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center justify-center gap-0.5 py-2 px-1.5 min-h-[56px] min-w-[56px] rounded-xl transition-colors text-xs',
                  isActive ? 'text-primary font-semibold' : 'text-muted-foreground',
                )
              }
            >
              <item.icon className="h-5 w-5" />
              <span className="truncate max-w-[72px]">{item.label}</span>
            </NavLink>
          ))}
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="flex flex-col items-center justify-center gap-0.5 py-2 px-1.5 min-h-[56px] min-w-[56px] rounded-xl transition-colors text-xs text-muted-foreground hover:text-foreground"
            aria-label="More menu"
          >
            <Menu className="h-5 w-5" />
            <span className="truncate max-w-[72px]">More</span>
          </button>
        </nav>
      </div>
    </div>
  );
};

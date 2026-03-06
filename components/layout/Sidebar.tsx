'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { MODULES } from '@/lib/mock-db';
import {
  LayoutDashboard,
  KanbanSquare,
  Users,
  PieChart,
  Banknote,
  Wallet,
  Globe,
  MenuSquare,
  ShieldAlert,
  UserCheck,
  UserRound,
  Sparkles,
  Settings,
  X,
  Camera,
  CalendarDays,
  TrendingUp,
  History,
  ListOrdered,
  BookOpen,
  Home,
  ChevronLeft,
  ChevronRight,
  Bell,
  LogOut
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const ICONS: Record<string, React.ReactNode> = {
  dashboard: <Home size={20} />,
  dispatch_board: <LayoutDashboard size={20} />,
  order_management: <KanbanSquare size={20} />,
  customer_management: <Users size={20} />,
  revenue_reports: <PieChart size={20} />,
  payroll_commissions: <Banknote size={20} />,
  cashbook_supplies: <Wallet size={20} />,
  web_booking: <Globe size={20} />,
  service_menu: <MenuSquare size={20} />,
  role_management: <ShieldAlert size={20} />,
  employee_management: <UserRound size={20} />,
  ktv_dashboard: <UserCheck size={20} />,
  ktv_attendance: <Camera size={20} />,
  ktv_leave: <CalendarDays size={20} />,
  ktv_performance: <TrendingUp size={20} />,
  ktv_history: <History size={20} />,
  turn_tracking: <ListOrdered size={20} />,
  ktv_hub: <UserCheck size={20} />,
  service_handbook: <BookOpen size={20} />,
  ai_features: <Sparkles size={20} />,
  settings: <Settings size={20} />,
};

const PATHS: Record<string, string> = {
  dashboard: '/',
  dispatch_board: '/reception/dispatch',
  order_management: '/reception/orders',
  customer_management: '/reception/crm',
  revenue_reports: '/finance/revenue',
  payroll_commissions: '/finance/payroll',
  cashbook_supplies: '/finance/cashbook',
  web_booking: '/admin/web-booking',
  service_menu: '/admin/service-menu',
  role_management: '/admin/roles',
  employee_management: '/admin/employees',
  ktv_dashboard: '/ktv/dashboard',
  ktv_attendance: '/ktv/attendance',
  ktv_leave: '/ktv/leave',
  ktv_performance: '/ktv/performance',
  ktv_history: '/ktv/history',
  turn_tracking: '/reception/turns',
  ktv_hub: '/reception/ktv-hub',
  service_handbook: '/services/handbook',
  ai_features: '/admin/ai',
  settings: '/settings',
};

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

export function Sidebar({ isOpen, onClose, isExpanded = true, onToggleExpand }: SidebarProps) {
  const { hasPermission, user, role, logout } = useAuth();
  const pathname = usePathname();
  // const [expandedGroups, setExpandedGroups] = React.useState<Record<string, boolean>>({}); // Removed

  // Group modules by their group property // Removed
  // const groupedModules = MODULES.reduce((acc, module) => { // Removed
  //   if (!acc[module.group]) { // Removed
  //     acc[module.group] = []; // Removed
  //   } // Removed
  //   acc[module.group].push(module); // Removed
  //   return acc; // Removed
  // }, {} as Record<string, typeof MODULES>); // Removed

  // Mở sẵn các group có chứa link đang active // Removed
  // React.useEffect(() => { // Removed
  //   const newExpanded = { ...expandedGroups }; // Removed
  //   let hasChanges = false; // Removed

  //   Object.entries(groupedModules).forEach(([groupName, modules]) => { // Removed
  //     const hasActiveLink = modules.some(m => { // Removed
  //       const path = PATHS[m.id]; // Removed
  //       return pathname === path || pathname.startsWith(path + '/'); // Removed
  //     }); // Removed

  //     if (hasActiveLink && !newExpanded[groupName]) { // Removed
  //       newExpanded[groupName] = true; // Removed
  //       hasChanges = true; // Removed
  //     } // Removed
  //   }); // Removed

  //   if (hasChanges) { // Removed
  //     setExpandedGroups(newExpanded); // Removed
  //   } // Removed
  //   // eslint-disable-next-line react-hooks/exhaustive-deps // Removed
  // }, [pathname]); // Removed

  // const toggleGroup = (groupName: string) => { // Removed
  //   setExpandedGroups(prev => ({ // Removed
  //     ...prev, // Removed
  //     [groupName]: !prev[groupName] // Removed
  //   })); // Removed
  // }; // Removed

  return (
    <>
      {/* Mobile Backdrop */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar Content */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 bg-white border-r border-gray-200 shadow-xl lg:shadow-none lg:translate-x-0 lg:static flex flex-col h-screen transition-all duration-300 ease-in-out ${isOpen ? 'translate-x-0' : '-translate-x-full'} ${isExpanded ? 'w-64' : 'w-20'}`}
      >
        {/* Header: User Info (replaces MENU text) */}
        <div className={`border-b border-gray-100 h-[69px] flex items-center ${isExpanded ? 'px-4 gap-3' : 'justify-center'}`}>
          {isExpanded ? (
            <>
              {/* Avatar */}
              <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-sm shrink-0">
                {user?.name?.charAt(0)}
              </div>
              {/* Name + Role */}
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm text-gray-900 truncate">{user?.name}</p>
                <p className="text-[10px] text-gray-500 font-medium truncate">{role?.name}</p>
              </div>
              {/* Actions */}
              <div className="flex items-center gap-0.5 shrink-0">
                <button className="relative p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Thông báo">
                  <Bell size={16} />
                  <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 bg-rose-500 rounded-full" />
                </button>
                <button onClick={logout} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Đăng xuất">
                  <LogOut size={16} />
                </button>
                {/* Mobile close */}
                <button onClick={onClose} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg lg:hidden">
                  <X size={16} />
                </button>
                {/* Desktop collapse toggle */}
                {onToggleExpand && (
                  <button onClick={onToggleExpand} className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg hidden lg:flex" title="Thu gọn">
                    <ChevronLeft size={16} />
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-2">
              {/* Avatar only when collapsed */}
              <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-sm cursor-pointer" title={user?.name}>
                {user?.name?.charAt(0)}
              </div>
              {/* Expand toggle */}
              {onToggleExpand && (
                <button onClick={onToggleExpand} className="p-1 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg hidden lg:flex" title="Mở rộng">
                  <ChevronRight size={14} />
                </button>
              )}
            </div>
          )}
        </div>

        <div className={`py-6 space-y-2 flex-1 overflow-y-auto w-full overflow-x-hidden ${isExpanded ? 'px-4' : 'px-3'}`}>
          {MODULES.filter(m => m.id !== 'settings' && hasPermission(m.id as any)).map(module => {
            const path = PATHS[module.id];
            const isActive = pathname === path || pathname.startsWith(path + '/');

            return (
              <Link
                key={module.id}
                href={path}
                onClick={() => {
                  if (window.innerWidth < 1024) onClose();
                }}
                title={!isExpanded ? module.name : undefined}
                className={`flex items-center ${isExpanded ? 'gap-3 px-3' : 'justify-center px-0'} py-2.5 rounded-xl transition-all duration-200 ${isActive
                  ? 'bg-indigo-50 text-indigo-700 font-medium shadow-sm border border-indigo-100/50'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
              >
                <span className={isActive ? 'text-indigo-600' : 'text-gray-400'}>
                  {ICONS[module.id]}
                </span>
                {isExpanded && <span className="text-sm truncate">{module.name}</span>}
              </Link>
            );
          })}
        </div>

        {/* Bottom Section for Settings */}
        <div className="mt-auto border-t border-gray-100 bg-white z-10 w-full pl-0 pb-10">
          {hasPermission('settings') && (
            <div className={`p-4 w-full ${!isExpanded && 'px-3'}`}>
              <Link
                href={PATHS.settings}
                onClick={() => {
                  if (window.innerWidth < 1024) onClose();
                }}
                title={!isExpanded ? "Cài Đặt" : undefined}
                className={`flex items-center ${isExpanded ? 'gap-3 px-3' : 'justify-center px-0'} py-2.5 rounded-xl transition-all duration-200 ${pathname === PATHS.settings
                  ? 'bg-indigo-50 text-indigo-700 font-medium shadow-sm border border-indigo-100/50'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
              >
                <span className={pathname === PATHS.settings ? 'text-indigo-600' : 'text-gray-400'}>
                  {ICONS.settings}
                </span>
                {isExpanded && <span className="text-sm font-medium">Cài Đặt</span>}
              </Link>
            </div>
          )}


        </div>
      </aside>
    </>
  );
}

'use client';

import React, { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/lib/auth-context';
import { Role, ModuleId } from '@/lib/types';
import { MODULES } from '@/lib/constants';

const MOCK_ROLES: Role[] = [
  {
    id: 'admin',
    name: 'Admin Tối Cao',
    permissions: [
      'dashboard', 'dispatch_board', 'order_management', 'customer_management',
      'revenue_reports', 'payroll_commissions', 'cashbook_supplies', 'web_booking',
      'service_menu', 'role_management', 'employee_management', 'ktv_hub',
      'ktv_dashboard', 'ktv_attendance', 'ktv_leave', 'ktv_performance',
      'ktv_history', 'turn_tracking', 'service_handbook', 'ai_features', 'settings',
    ],
  },
  {
    id: 'reception',
    name: 'Lễ Tân',
    permissions: ['dashboard', 'dispatch_board', 'order_management', 'customer_management', 'ktv_hub', 'turn_tracking', 'service_handbook', 'settings'],
  },
  {
    id: 'ktv',
    name: 'Kỹ Thuật Viên',
    permissions: ['ktv_dashboard', 'ktv_attendance', 'ktv_leave', 'ktv_performance', 'ktv_history', 'service_handbook', 'settings'],
  },
];
import { ShieldAlert, Check, Plus, Save, User, Key, Lock, Eye, EyeOff } from 'lucide-react';
import * as Checkbox from '@radix-ui/react-checkbox';
import * as Tabs from '@radix-ui/react-tabs';
import { motion } from 'motion/react';
import { getAllUsers } from './actions';

export default function RoleManagementPage() {
  const { hasPermission } = useAuth();
  const [roles, setRoles] = useState<Role[]>(MOCK_ROLES);
  const [users, setUsers] = useState<any[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('roles');
  const [mounted, setMounted] = useState(false);

  React.useEffect(() => {
    setMounted(true);
    async function fetchUsers() {
      const res = await getAllUsers();
      if (res.success && res.data) {
        setUsers(res.data);
      }
      setIsLoadingUsers(false);
    }
    fetchUsers();
  }, []);

  if (!mounted) return null;

  if (!hasPermission('role_management')) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <ShieldAlert size={48} className="text-red-500 mb-4" />
          <h2 className="text-xl font-bold text-gray-900">Không có quyền truy cập</h2>
          <p className="text-gray-500 mt-2">Bạn cần quyền &quot;Quản Lý Phân Quyền&quot; để xem trang này.</p>
        </div>
      </AppLayout>
    );
  }

  const togglePermission = (roleId: string, moduleId: ModuleId) => {
    setRoles(prev => prev.map(role => {
      if (role.id === roleId) {
        const hasPerm = role.permissions.includes(moduleId);
        return {
          ...role,
          permissions: hasPerm
            ? role.permissions.filter(p => p !== moduleId)
            : [...role.permissions, moduleId]
        };
      }
      return role;
    }));
  };

  const handleSave = () => {
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
      alert('Đã lưu phân quyền thành công!');
    }, 800);
  };

  const handleAddRole = () => {
    const roleName = prompt('Nhập tên Role mới:');
    if (!roleName) return;

    const newId = roleName.toLowerCase().replace(/\s+/g, '_');
    if (roles.find(r => r.id === newId)) {
      alert('Role này đã tồn tại!');
      return;
    }

    const newRole: Role = {
      id: newId,
      name: roleName,
      permissions: []
    };

    setRoles(prev => [...prev, newRole]);
    alert(`Đã thêm Role "${roleName}" thành công!`);
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Hệ Thống & Bảo Mật</h1>
            <p className="text-sm text-gray-500 mt-1">Quản lý phân quyền, tài khoản và bảo mật hệ thống.</p>
          </div>
        </div>

        <Tabs.Root value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <Tabs.List className="flex border-b border-gray-200">
            <Tabs.Trigger
              value="roles"
              className={`px-6 py-3 text-sm font-medium transition-all relative ${activeTab === 'roles' ? 'text-indigo-600' : 'text-gray-500 hover:text-gray-700'
                }`}
            >
              Phân Quyền Hệ Thống
              {activeTab === 'roles' && (
                <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600" />
              )}
            </Tabs.Trigger>
            <Tabs.Trigger
              value="accounts"
              className={`px-6 py-3 text-sm font-medium transition-all relative ${activeTab === 'accounts' ? 'text-indigo-600' : 'text-gray-500 hover:text-gray-700'
                }`}
            >
              Quản Lý Tài Khoản
              {activeTab === 'accounts' && (
                <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600" />
              )}
            </Tabs.Trigger>
          </Tabs.List>

          <Tabs.Content value="roles" className="space-y-6 outline-none">
            <div className="flex justify-end gap-3">
              <button
                onClick={handleAddRole}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 font-medium text-sm transition-colors"
              >
                <Plus size={16} />
                Thêm Role Mới
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium text-sm transition-colors disabled:opacity-70"
              >
                <Save size={16} />
                {isSaving ? 'Đang lưu...' : 'Lưu Thay Đổi'}
              </button>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden flex flex-col max-w-full">
              <div className="overflow-x-auto w-full flex-1">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr>
                      <th className="p-4 border-b border-gray-200 bg-gray-50 font-semibold text-gray-700 min-w-[200px] sticky left-0 z-10 shadow-[1px_0_0_0_#e5e7eb]">
                        Module Chức Năng
                      </th>
                      {roles.map(role => (
                        <th key={role.id} className="p-4 border-b border-gray-200 bg-gray-50 font-semibold text-gray-700 text-center min-w-[140px]">
                          {role.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {MODULES.map(module => (
                      <tr key={module.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="p-4 bg-white sticky left-0 z-10 shadow-[1px_0_0_0_#e5e7eb]">
                          <div className="font-medium text-gray-900">{module.name}</div>
                          <div className="text-xs text-gray-500 mt-0.5">{module.group}</div>
                        </td>
                        {roles.map(role => {
                          const isChecked = role.permissions.includes(module.id as ModuleId);
                          const isAdmin = role.id === 'admin';

                          return (
                            <td key={`${role.id}-${module.id}`} className="p-4 text-center">
                              <Checkbox.Root
                                checked={isChecked}
                                onCheckedChange={() => !isAdmin && togglePermission(role.id, module.id as ModuleId)}
                                disabled={isAdmin}
                                className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${isChecked
                                  ? isAdmin ? 'bg-indigo-300 text-white cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700'
                                  : 'bg-gray-100 border border-gray-300 hover:border-indigo-400'
                                  }`}
                              >
                                <Checkbox.Indicator>
                                  <Check size={16} strokeWidth={3} />
                                </Checkbox.Indicator>
                              </Checkbox.Root>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Tabs.Content>

          <Tabs.Content value="accounts" className="space-y-6 outline-none">
            <div className="space-y-4">
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
                  <User size={18} className="text-indigo-600" />
                  <h3 className="font-bold text-gray-900">Danh Sách Tài Khoản</h3>
                </div>
                <div className="divide-y divide-gray-100">
                  {isLoadingUsers ? (
                    <div className="p-8 text-center text-gray-500">Đang tải danh sách tài khoản...</div>
                  ) : users.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">Chưa có tài khoản nào.</div>
                  ) : users.map(u => (
                    <div key={u.id} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold">
                          {(u.fullName || u.username || '?').charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">{u.fullName || u.username}</div>
                          <div className="text-xs text-gray-500 flex items-center gap-2 mt-0.5">
                            <span className="bg-gray-100 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase">{u.role}</span>
                            <span>ID: {u.username}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-right">
                        <div className="text-sm font-mono text-gray-600 mr-2 px-2 py-1 bg-gray-50 rounded border border-gray-200">
                          {u.password || '***'}
                        </div>
                        <button className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Đổi quyền/Reset MK">
                          <Key size={18} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Tabs.Content>
        </Tabs.Root>
      </div>
    </AppLayout>
  );
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { Role, ModuleId } from '@/lib/types';
import { getAllUsers } from './actions';

// --- MOCK DATA ---
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

/**
 * Custom hook for Role Management page logic.
 */
export const useRoleManagement = () => {
    const { hasPermission } = useAuth();
    const [roles, setRoles] = useState<Role[]>(MOCK_ROLES);
    const [users, setUsers] = useState<any[]>([]);
    const [isLoadingUsers, setIsLoadingUsers] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [activeTab, setActiveTab] = useState('roles');
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
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

    // --- HANDLERS ---
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

        const newRole: Role = { id: newId, name: roleName, permissions: [] };
        setRoles(prev => [...prev, newRole]);
        alert(`Đã thêm Role "${roleName}" thành công!`);
    };

    const canAccessPage = hasPermission('role_management');

    return {
        // State
        roles,
        users,
        isLoadingUsers,
        isSaving,
        activeTab,
        mounted,

        // Computed
        canAccessPage,

        // Setters
        setActiveTab,

        // Handlers
        togglePermission,
        handleSave,
        handleAddRole,
    };
};

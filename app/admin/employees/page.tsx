'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/lib/auth-context';
import { Employee } from '@/lib/types';
import { getStaffList, deleteStaffMember } from './actions';
import { AddEmployeeModal } from '@/components/AddEmployeeModal';
import {
  ShieldAlert,
  Search,
  Plus,
  User,
  Phone,
  Mail,
  Star,
  CheckCircle2,
  XCircle,
  Filter,
  Trash2
} from 'lucide-react';
import Image from 'next/image';
import { EmployeeDetailModal } from '@/components/EmployeeDetailModal';

export default function EmployeeManagementPage() {
  const { hasPermission } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  const fetchEmployees = useCallback(async () => {
    setIsLoading(true);
    const res = await getStaffList();
    if (res.success && res.data) {
      const mapped: Employee[] = res.data.map((s: any) => ({
        id: s.id,
        code: s.id, // Using manual ID as code
        name: s.full_name,
        username: s.username,
        password: s.password,
        position: s.position || 'Kỹ Thuật Viên',
        experience: s.experience || '0 năm',
        status: s.status === 'ĐANG LÀM' ? 'active' : 'inactive',
        photoUrl: s.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(s.full_name)}&background=random`,
        phone: s.phone || '',
        email: s.email || '',
        dob: s.birthday || '',
        gender: s.gender || 'Nữ',
        idCard: s.id_card || '',
        bankAccount: s.bank_account || '',
        bankName: s.bank_name || '',
        joinDate: s.join_date || '',
        height: s.height || 0,
        weight: s.weight || 0,
        baseSalary: 0,
        commissionRate: 0,
        rating: 5.0, // Default mock for now
        skills: s.skills && Object.keys(s.skills).length > 0 ? s.skills : {
          hairCut: 'none', shampoo: 'basic', hairExtensionShampoo: 'none', earCleaning: 'none',
          machineShave: 'none', razorShave: 'none', facial: 'none', thaiBody: 'none',
          shiatsuBody: 'none', oilBody: 'basic', hotStoneBody: 'none', scrubBody: 'none',
          oilFoot: 'none', hotStoneFoot: 'none', acupressureFoot: 'none', heelScrub: 'none', maniPedi: 'none'
        }
      })) as Employee[];
      setEmployees(mapped);
    }
    setIsLoading(false);
  }, []);

  React.useEffect(() => {
    setMounted(true);
    fetchEmployees();
  }, [fetchEmployees]);

  const handleUpdateEmployee = useCallback((updatedEmployee: Employee) => {
    setEmployees(prev => prev.map(e => e.id === updatedEmployee.id ? updatedEmployee : e));
    setSelectedEmployee(updatedEmployee);
  }, []);

  const filteredEmployees = useMemo(() => {
    const lowerSearch = searchTerm.toLowerCase();
    return employees.filter(e =>
      e.name.toLowerCase().includes(lowerSearch) ||
      e.code.toLowerCase().includes(lowerSearch) ||
      e.phone.includes(searchTerm)
    );
  }, [employees, searchTerm]);

  const stats = useMemo(() => ({
    total: employees.length,
    active: employees.filter(e => e.status === 'active').length,
    senior: employees.filter(e => e.position.includes('Cấp Cao')).length,
    avgRating: (employees.reduce((acc, e) => acc + e.rating, 0) / employees.length).toFixed(2)
  }), [employees]);

  if (!mounted) return null;

  if (!hasPermission('employee_management')) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <ShieldAlert size={48} className="text-red-500 mb-4" />
          <h2 className="text-xl font-bold text-gray-900">Không có quyền truy cập</h2>
          <p className="text-gray-500 mt-2">Bạn cần quyền &quot;Quản Lý KTV&quot; để xem trang này.</p>
        </div>
      </AppLayout>
    );
  }

  const handleOpenDetail = (emp: Employee) => {
    setSelectedEmployee(emp);
    setIsDetailOpen(true);
  };

  const handleAddEmployee = () => {
    setIsAddModalOpen(true);
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Quản Lý KTV</h1>
            <p className="text-sm text-gray-500 mt-1">Quản lý hồ sơ, kỹ năng và thông tin chi tiết của kỹ thuật viên.</p>
          </div>
          <button
            onClick={handleAddEmployee}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium text-sm transition-colors"
          >
            <Plus size={16} />
            Thêm KTV Mới
          </button>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row gap-4 justify-between items-center bg-gray-50/50">
            <div className="relative w-full sm:w-96">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                placeholder="Tìm theo tên, mã, số điện thoại..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm"
              />
            </div>
            <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium transition-colors w-full sm:w-auto justify-center">
              <Filter size={16} />
              Bộ lọc nâng cao
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr>
                  <th className="p-4 border-b border-gray-200 bg-gray-50 font-semibold text-gray-700 text-sm">Nhân Viên</th>
                  <th className="p-4 border-b border-gray-200 bg-gray-50 font-semibold text-gray-700 text-sm">Chức Vụ</th>
                  <th className="p-4 border-b border-gray-200 bg-gray-50 font-semibold text-gray-700 text-sm">Trạng Thái</th>
                  <th className="p-4 border-b border-gray-200 bg-gray-50 font-semibold text-gray-700 text-sm">Kỹ Năng Chính</th>
                  <th className="p-4 border-b border-gray-200 bg-gray-50 font-semibold text-gray-700 text-sm text-center">Đánh Giá</th>
                  <th className="p-4 border-b border-gray-200 bg-gray-50 font-semibold text-gray-700 text-sm w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-gray-500">Đang tải dữ liệu nhân viên...</td>
                  </tr>
                ) : filteredEmployees.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-gray-500">Chưa có dữ liệu nhân viên.</td>
                  </tr>
                ) : filteredEmployees.map(emp => (
                  <tr
                    key={emp.id}
                    className="hover:bg-gray-50 transition-colors cursor-pointer group"
                    onClick={() => handleOpenDetail(emp)}
                  >
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="relative w-10 h-10 rounded-full overflow-hidden border border-gray-200">
                          <Image
                            src={emp.photoUrl}
                            alt={emp.name}
                            fill
                            className="object-cover"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">{emp.name}</div>
                          <div className="text-xs text-indigo-600 font-bold">{emp.code}</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="text-sm text-gray-900 font-medium">{emp.position}</div>
                      <div className="text-xs text-gray-500">{emp.experience} kinh nghiệm</div>
                    </td>
                    <td className="p-4">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${emp.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-700'
                        }`}>
                        {emp.status === 'active' ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                        {emp.status === 'active' ? 'Đang làm việc' : 'Đã nghỉ'}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex flex-wrap gap-1">
                        {emp.skills.shampoo !== 'none' && (
                          <span className={`px-2 py-0.5 text-[10px] rounded border ${emp.skills.shampoo === 'expert' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                            emp.skills.shampoo === 'basic' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                              'bg-amber-50 text-amber-600 border-amber-100'
                            }`}>
                            Gội đầu
                          </span>
                        )}
                        {emp.skills.oilBody !== 'none' && (
                          <span className={`px-2 py-0.5 text-[10px] rounded border ${emp.skills.oilBody === 'expert' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                            emp.skills.oilBody === 'basic' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                              'bg-amber-50 text-amber-600 border-amber-100'
                            }`}>
                            Body Dầu
                          </span>
                        )}
                        {emp.skills.facial !== 'none' && (
                          <span className={`px-2 py-0.5 text-[10px] rounded border ${emp.skills.facial === 'expert' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                            emp.skills.facial === 'basic' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                              'bg-amber-50 text-amber-600 border-amber-100'
                            }`}>
                            Facial
                          </span>
                        )}
                        <span className="px-2 py-0.5 bg-gray-50 text-gray-500 text-[10px] rounded border border-gray-100">...</span>
                      </div>
                    </td>
                    <td className="p-4 text-center">
                      <div className="flex items-center justify-center gap-1 text-amber-500 font-bold">
                        <Star size={14} fill="currentColor" />
                        {emp.rating}
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (confirm(`Hệ thống sẽ xoá tài khoản và hồ sơ của [${emp.name}]. Bạn có chắc chắn không?`)) {
                            setIsLoading(true);
                            const res = await deleteStaffMember(emp.id);
                            if (res.success) {
                              fetchEmployees();
                            } else {
                              alert(res.error || "Lỗi khi xoá nhân viên!");
                              setIsLoading(false);
                            }
                          }
                        }}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                        title="Xoá nhân viên"
                      >
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
            <div className="text-sm text-gray-500 mb-1">Tổng số KTV</div>
            <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
            <div className="text-sm text-gray-500 mb-1">Đang hoạt động</div>
            <div className="text-2xl font-bold text-emerald-600">{stats.active}</div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
            <div className="text-sm text-gray-500 mb-1">KTV Cấp Cao</div>
            <div className="text-2xl font-bold text-indigo-600">{stats.senior}</div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
            <div className="text-sm text-gray-500 mb-1">Đánh giá TB</div>
            <div className="text-2xl font-bold text-amber-500">{stats.avgRating}</div>
          </div>
        </div>
      </div>

      <EmployeeDetailModal
        key={selectedEmployee?.id || 'none'}
        employee={selectedEmployee}
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        onUpdate={handleUpdateEmployee}
      />

      <AddEmployeeModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={fetchEmployees}
      />
    </AppLayout>
  );
}

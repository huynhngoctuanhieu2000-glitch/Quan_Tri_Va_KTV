'use client';

import React, { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/lib/auth-context';
import { ShieldAlert, Search, Filter, Plus, User, Phone, Calendar, Star, MoreHorizontal } from 'lucide-react';

import { Customer } from '@/lib/types';

export default function CRMPage() {
  const { hasPermission } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  React.useEffect(() => {
    setMounted(true);
    const fetchCustomers = async () => {
      try {
        const res = await fetch('/api/customers');
        const data = await res.json();
        if (data.success) {
          setCustomers(data.data);
        }
      } catch (err) {
        console.error('Failed to fetch customers:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchCustomers();
  }, []);

  if (!mounted) return null;

  if (!hasPermission('customer_management')) {
    return (
      <AppLayout title="Quản Lý Khách Hàng">
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <ShieldAlert size={48} className="text-red-500 mb-4" />
          <h2 className="text-xl font-bold text-gray-900">Không có quyền truy cập</h2>
        </div>
      </AppLayout>
    );
  }

  const filteredCustomers = customers.filter(c => 
    (c.fullName || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
    (c.phone || '').includes(searchTerm) ||
    (c.email || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatVND = (n?: number) => n ? new Intl.NumberFormat('vi-VN').format(n) + 'đ' : '0đ';

  return (
    <AppLayout title="Quản Lý Khách Hàng">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <p className="text-sm text-gray-500">Lưu trữ thông tin, lịch sử dịch vụ và phân hạng thành viên.</p>
          <button className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium text-sm transition-colors">
            <Plus size={16} />
            Thêm Khách Hàng
          </button>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row gap-4 justify-between items-center bg-gray-50/50">
            <div className="relative w-full sm:w-96">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input 
                type="text" 
                placeholder="Tìm theo tên, SĐT, Email..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm"
              />
            </div>
            <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium transition-colors w-full sm:w-auto justify-center">
              <Filter size={16} />
              Lọc & Phân Hạng
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr>
                  <th className="p-4 border-b border-gray-200 bg-gray-50 font-semibold text-gray-700 text-sm">Khách Hàng</th>
                  <th className="p-4 border-b border-gray-200 bg-gray-50 font-semibold text-gray-700 text-sm">Hạng Thành Viên</th>
                  <th className="p-4 border-b border-gray-200 bg-gray-50 font-semibold text-gray-700 text-sm text-right">Tổng Chi Tiêu</th>
                  <th className="p-4 border-b border-gray-200 bg-gray-50 font-semibold text-gray-700 text-sm text-center">Số Lần Đến</th>
                  <th className="p-4 border-b border-gray-200 bg-gray-50 font-semibold text-gray-700 text-sm">Lần Cuối</th>
                  <th className="p-4 border-b border-gray-200 bg-gray-50 font-semibold text-gray-700 text-sm w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-gray-500">
                      Đang tải danh sách khách hàng...
                    </td>
                  </tr>
                ) : filteredCustomers.map(customer => (
                  <tr key={customer.id} className="hover:bg-gray-50 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold">
                          {(customer.fullName || '?').charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">{customer.fullName}</div>
                          <div className="text-[11px] text-gray-500 flex flex-col gap-0.5 mt-0.5">
                            <div className="flex items-center gap-1.5 line-clamp-1">
                              <Phone size={10} className="text-gray-400" /> {customer.phone}
                            </div>
                            {customer.email && (
                              <div className="flex items-center gap-1.5 text-indigo-500 font-medium line-clamp-1 italic">
                                @ {customer.email}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
                        (customer.visitCount || 0) > 10 ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        <Star size={12} />
                        {(customer.visitCount || 0) > 10 ? 'VIP' : 'Member'}
                      </span>
                    </td>
                    <td className="p-4 text-right font-medium text-gray-900">
                      {formatVND(customer.totalSpent)}
                    </td>
                    <td className="p-4 text-center text-gray-700 font-medium">
                      {customer.visitCount || 0}
                    </td>
                    <td className="p-4">
                      <div className="text-sm text-gray-600 flex items-center gap-1.5">
                        <Calendar size={14} className="text-gray-400" />
                        {customer.lastVisited ? new Date(customer.lastVisited).toLocaleDateString('vi-VN') : '---'}
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      <button className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors">
                        <MoreHorizontal size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
                {!isLoading && filteredCustomers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-gray-500">
                      Không tìm thấy khách hàng nào phù hợp.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

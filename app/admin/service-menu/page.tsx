'use client';

import React, { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/lib/auth-context';
import { ShieldAlert, Plus, Edit2, Trash2, Image as ImageIcon } from 'lucide-react';

const MOCK_SERVICES = [
  { id: 'S1', name: 'Gội Đầu Dưỡng Sinh Cơ Bản', category: 'Gội Đầu', price: 150000, duration: 45, status: 'active' },
  { id: 'S2', name: 'Gội Đầu Dưỡng Sinh VIP', category: 'Gội Đầu', price: 350000, duration: 60, status: 'active' },
  { id: 'S3', name: 'Massage Body Đá Nóng', category: 'Massage', price: 450000, duration: 90, status: 'active' },
  { id: 'S4', name: 'Massage Cổ Vai Gáy', category: 'Massage', price: 250000, duration: 45, status: 'active' },
  { id: 'S5', name: 'Chăm Sóc Da Chuyên Sâu', category: 'Chăm Sóc Da', price: 550000, duration: 75, status: 'inactive' },
];

export default function ServiceMenuPage() {
  const { hasPermission } = useAuth();
  const [activeCategory, setActiveCategory] = useState('Tất cả');
  const [mounted, setMounted] = useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  if (!hasPermission('service_menu')) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <ShieldAlert size={48} className="text-red-500 mb-4" />
          <h2 className="text-xl font-bold text-gray-900">Không có quyền truy cập</h2>
        </div>
      </AppLayout>
    );
  }

  const categories = ['Tất cả', ...Array.from(new Set(MOCK_SERVICES.map(s => s.category)))];
  
  const filteredServices = activeCategory === 'Tất cả' 
    ? MOCK_SERVICES 
    : MOCK_SERVICES.filter(s => s.category === activeCategory);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Quản Lý Menu Dịch Vụ</h1>
            <p className="text-sm text-gray-500 mt-1">Thiết lập danh sách dịch vụ, giá tiền và thời lượng.</p>
          </div>
          <button className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium text-sm transition-colors">
            <Plus size={16} />
            Thêm Dịch Vụ Mới
          </button>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                activeCategory === cat 
                  ? 'bg-indigo-600 text-white' 
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr>
                  <th className="p-4 border-b border-gray-200 bg-gray-50 font-semibold text-gray-700 text-sm w-16">Ảnh</th>
                  <th className="p-4 border-b border-gray-200 bg-gray-50 font-semibold text-gray-700 text-sm">Tên Dịch Vụ</th>
                  <th className="p-4 border-b border-gray-200 bg-gray-50 font-semibold text-gray-700 text-sm">Danh Mục</th>
                  <th className="p-4 border-b border-gray-200 bg-gray-50 font-semibold text-gray-700 text-sm text-right">Giá Tiền</th>
                  <th className="p-4 border-b border-gray-200 bg-gray-50 font-semibold text-gray-700 text-sm text-center">Thời Lượng</th>
                  <th className="p-4 border-b border-gray-200 bg-gray-50 font-semibold text-gray-700 text-sm text-center">Trạng Thái</th>
                  <th className="p-4 border-b border-gray-200 bg-gray-50 font-semibold text-gray-700 text-sm w-24"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredServices.map(service => (
                  <tr key={service.id} className="hover:bg-gray-50 transition-colors">
                    <td className="p-4">
                      <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400">
                        <ImageIcon size={20} />
                      </div>
                    </td>
                    <td className="p-4 font-medium text-gray-900">{service.name}</td>
                    <td className="p-4 text-gray-600 text-sm">{service.category}</td>
                    <td className="p-4 text-right font-medium text-indigo-600">
                      {service.price.toLocaleString()}đ
                    </td>
                    <td className="p-4 text-center text-gray-600 text-sm">
                      {service.duration} phút
                    </td>
                    <td className="p-4 text-center">
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                        service.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {service.status === 'active' ? 'Đang bán' : 'Tạm ngưng'}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-end gap-2">
                        <button className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors">
                          <Edit2 size={16} />
                        </button>
                        <button className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

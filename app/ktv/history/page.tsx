'use client';

import React from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/lib/auth-context';
import { ShieldAlert, History, Clock, Star, DollarSign } from 'lucide-react';
import { format } from 'date-fns';

const MOCK_HISTORY = [
  { id: 'ORD-1023', customer: 'Anh Tuấn', service: 'Massage Body 90p', time: '14:30 - 16:00', date: '24/02/2026', tua: 70000, tip: 100000, bonus: 0 },
  { id: 'ORD-1022', customer: 'Chị Mai', service: 'Gội Đầu Dưỡng Sinh', time: '10:00 - 11:00', date: '24/02/2026', tua: 50000, tip: 50000, bonus: 30000 },
  { id: 'ORD-1021', customer: 'Khách Lẻ', service: 'Chăm Sóc Da Cơ Bản', time: '16:00 - 17:00', date: '23/02/2026', tua: 50000, tip: 0, bonus: 0 },
  { id: 'ORD-1020', customer: 'Anh Hùng', service: 'Massage Cổ Vai Gáy', time: '13:00 - 14:00', date: '23/02/2026', tua: 60000, tip: 150000, bonus: 0 },
];

export default function KTVHistoryPage() {
  const { hasPermission } = useAuth();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  if (!hasPermission('ktv_history')) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <ShieldAlert size={48} className="text-red-500 mb-4" />
          <h2 className="text-xl font-bold text-gray-900">Không có quyền truy cập</h2>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6 max-w-4xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Lịch Sử Đơn Hàng</h1>
          <p className="text-sm text-gray-500 mt-1">Chi tiết các dịch vụ đã thực hiện và thu nhập tương ứng.</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr>
                  <th className="p-4 border-b border-gray-200 bg-gray-50 font-semibold text-gray-700">Mã Đơn</th>
                  <th className="p-4 border-b border-gray-200 bg-gray-50 font-semibold text-gray-700">Khách Hàng</th>
                  <th className="p-4 border-b border-gray-200 bg-gray-50 font-semibold text-gray-700">Dịch Vụ</th>
                  <th className="p-4 border-b border-gray-200 bg-gray-50 font-semibold text-gray-700">Thời Gian</th>
                  <th className="p-4 border-b border-gray-200 bg-gray-50 font-semibold text-gray-700 text-right">Tiền Tua</th>
                  <th className="p-4 border-b border-gray-200 bg-gray-50 font-semibold text-gray-700 text-right">Tip / Bonus</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {MOCK_HISTORY.map(order => (
                  <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                    <td className="p-4 font-medium text-indigo-600">{order.id}</td>
                    <td className="p-4 font-medium text-gray-900">{order.customer}</td>
                    <td className="p-4 text-gray-700">{order.service}</td>
                    <td className="p-4">
                      <div className="text-sm text-gray-900 flex items-center gap-1.5"><Clock size={14} className="text-gray-400" /> {order.time}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{order.date}</div>
                    </td>
                    <td className="p-4 text-right font-medium text-gray-900">
                      {order.tua.toLocaleString()}đ
                    </td>
                    <td className="p-4 text-right">
                      {order.tip > 0 && (
                        <div className="text-sm font-medium text-emerald-600 flex items-center justify-end gap-1">
                          <DollarSign size={14} /> +{order.tip.toLocaleString()}đ (Tip)
                        </div>
                      )}
                      {order.bonus > 0 && (
                        <div className="text-sm font-medium text-amber-600 flex items-center justify-end gap-1 mt-0.5">
                          <Star size={14} /> +{order.bonus.toLocaleString()}đ (Bonus)
                        </div>
                      )}
                      {order.tip === 0 && order.bonus === 0 && (
                        <span className="text-gray-400">-</span>
                      )}
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

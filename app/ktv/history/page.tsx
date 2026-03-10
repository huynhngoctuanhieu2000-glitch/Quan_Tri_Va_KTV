import React from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/lib/auth-context';
import { ShieldAlert, History, Clock, Star, DollarSign, ArrowRight, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function KTVHistoryPage() {
  const { hasPermission, user } = useAuth();
  const [mounted, setMounted] = React.useState(false);
  const [history, setHistory] = React.useState<any[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const router = useRouter();

  React.useEffect(() => {
    setMounted(true);
    if (user?.id) {
       fetchHistory();
    }
  }, [user?.id]);

  const fetchHistory = async () => {
    setIsLoading(true);
    try {
      // Fetch bookings where technicianCode contains user.id
      // technicianCode is comma separated string like "KTV001, KTV002"
      const { data, error } = await supabase
        .from('Bookings')
        .select(`
          *,
          BookingItems (
            serviceId,
            price,
            duration
          )
        `)
        .ilike('technicianCode', `%${user?.id}%`)
        .order('createdAt', { ascending: false })
        .limit(20);

      if (error) throw error;
      setHistory(data || []);
    } catch (err) {
      console.error('Error fetching history:', err);
    } finally {
      setIsLoading(false);
    }
  };

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

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'IN_PROGRESS': return { label: 'Đang làm', color: 'text-indigo-600 bg-indigo-50' };
      case 'FEEDBACK': return { label: 'Chờ đánh giá', color: 'text-blue-600 bg-blue-50' };
      case 'DONE': return { label: 'Hoàn tất', color: 'text-emerald-600 bg-emerald-50' };
      default: return { label: status, color: 'text-gray-500 bg-gray-50' };
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6 max-w-5xl mx-auto px-4 sm:px-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Lịch Sử Thông Minh</h1>
            <p className="text-sm text-gray-500 mt-1">Theo dõi đơn hàng và hỗ trợ khách hàng nhanh chóng.</p>
          </div>
          <button 
            onClick={fetchHistory}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50 transition-all"
          >
            Làm mới dữ liệu
          </button>
        </div>

        <div className="bg-white rounded-[2rem] border border-gray-100 shadow-xl shadow-gray-100/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/50">
                  <th className="p-5 font-black text-[10px] uppercase tracking-widest text-gray-400">Đơn hàng</th>
                  <th className="p-5 font-black text-[10px] uppercase tracking-widest text-gray-400">Khách hàng</th>
                  <th className="p-5 font-black text-[10px] uppercase tracking-widest text-gray-400">Dịch vụ</th>
                  <th className="p-5 font-black text-[10px] uppercase tracking-widest text-gray-400">Trạng thái</th>
                  <th className="p-5 font-black text-[10px] uppercase tracking-widest text-gray-400 text-right">Tổng thanh toán</th>
                  <th className="p-5 font-black text-[10px] uppercase tracking-widest text-gray-400 text-center">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="p-20 text-center">
                      <div className="inline-block w-8 h-8 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
                      <p className="mt-4 text-sm font-bold text-gray-400">Đang tải lịch sử...</p>
                    </td>
                  </tr>
                ) : history.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-20 text-center text-gray-400 font-medium">
                      Chưa có dữ liệu lịch sử nào.
                    </td>
                  </tr>
                ) : history.map(order => {
                  const statusInfo = getStatusLabel(order.status);
                  const firstSvc = order.BookingItems?.[0];
                  
                  return (
                    <tr key={order.id} className="hover:bg-indigo-50/10 transition-colors group">
                      <td className="p-5">
                        <span className="text-[11px] font-black text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg">#{order.billCode}</span>
                        <div className="text-[10px] text-gray-400 mt-1.5 flex items-center gap-1 font-medium">
                          <Clock size={10} /> {format(new Date(order.createdAt), 'HH:mm - dd/MM')}
                        </div>
                      </td>
                      <td className="p-5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 font-bold text-xs">
                            {order.customerName?.charAt(0) || '?'}
                          </div>
                          <div>
                            <p className="font-bold text-sm text-gray-900 leading-none">{order.customerName}</p>
                            <p className="text-[10px] text-gray-400 mt-1">{order.customerPhone || 'Không có SĐT'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-5">
                        <p className="text-sm font-medium text-gray-700 max-w-[150px] truncate">
                          {order.BookingItems?.length > 1 
                            ? `${order.BookingItems.length} dịch vụ` 
                            : (order.BookingItems?.[0]?.serviceId || '—')}
                        </p>
                      </td>
                      <td className="p-5">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold ${statusInfo.color}`}>
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="p-5 text-right">
                        <p className="text-sm font-black text-gray-900">{order.totalAmount?.toLocaleString()}đ</p>
                      </td>
                      <td className="p-5">
                        <div className="flex items-center justify-center gap-2">
                          {order.status === 'IN_PROGRESS' && (
                            <button 
                              onClick={() => router.push('/ktv/dashboard')}
                              className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-[10px] font-black flex items-center gap-1.5 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
                            >
                              Tiếp tục <ArrowRight size={12} strokeWidth={3} />
                            </button>
                          )}
                          {order.status === 'FEEDBACK' && (
                            <button 
                              onClick={() => router.push(`/ktv/dashboard?action=rate&bookingId=${order.id}`)}
                              className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-[10px] font-black flex items-center gap-1.5 hover:bg-blue-700 transition-all shadow-lg shadow-blue-100"
                            >
                              ⭐ Đánh giá
                            </button>
                          )}
                          {(order.status === 'DONE' || order.status === 'COMPLETED') && (
                            <CheckCircle2 size={18} className="text-emerald-500 opacity-50" />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

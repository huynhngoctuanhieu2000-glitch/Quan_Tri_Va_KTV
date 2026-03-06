'use client';

import React from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/lib/auth-context';
import { ShieldAlert, TrendingUp, Star, DollarSign, Calendar, CheckCircle2 } from 'lucide-react';
import * as Progress from '@radix-ui/react-progress';

export default function KTVPerformancePage() {
  const { hasPermission } = useAuth();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  if (!hasPermission('ktv_performance')) {
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Hiệu Suất & Thu Nhập</h1>
            <p className="text-sm text-gray-500 mt-1">Theo dõi KPI và thu nhập trong tháng.</p>
          </div>
          <div className="flex gap-2">
            <button className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium transition-colors flex items-center gap-2">
              <Calendar size={16} />
              Tháng Này
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* KPI Section */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2 mb-6">
              <TrendingUp size={20} className="text-indigo-500" />
              Chỉ Số KPI (Mục tiêu: 90%)
            </h2>
            
            <div className="space-y-6">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-600 font-medium">Chuyên cần (40%)</span>
                  <span className="text-emerald-600 font-bold">100%</span>
                </div>
                <Progress.Root className="h-2 bg-gray-100 rounded-full overflow-hidden" value={100}>
                  <Progress.Indicator className="h-full bg-emerald-500 transition-all duration-500" style={{ transform: `translateX(0%)` }} />
                </Progress.Root>
                <p className="text-xs text-gray-500 mt-1">Nghỉ 1/4 ngày phép</p>
              </div>
              
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-600 font-medium">Quy trình (30%)</span>
                  <span className="text-indigo-600 font-bold">85%</span>
                </div>
                <Progress.Root className="h-2 bg-gray-100 rounded-full overflow-hidden" value={85}>
                  <Progress.Indicator className="h-full bg-indigo-500 transition-all duration-500" style={{ transform: `translateX(-15%)` }} />
                </Progress.Root>
                <p className="text-xs text-gray-500 mt-1">1 lỗi quên chụp checklist</p>
              </div>
              
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-600 font-medium">Thái độ (30%)</span>
                  <span className="text-indigo-600 font-bold">95%</span>
                </div>
                <Progress.Root className="h-2 bg-gray-100 rounded-full overflow-hidden" value={95}>
                  <Progress.Indicator className="h-full bg-indigo-500 transition-all duration-500" style={{ transform: `translateX(-5%)` }} />
                </Progress.Root>
                <p className="text-xs text-gray-500 mt-1">Đánh giá trung bình: 4.8/5</p>
              </div>
            </div>
            
            <div className="mt-6 pt-4 border-t border-gray-100">
              <div className="flex justify-between items-center">
                <span className="font-medium text-gray-900">Tổng điểm KPI</span>
                <span className="text-2xl font-bold text-emerald-600">93.3%</span>
              </div>
              <p className="text-sm text-emerald-600 mt-1 flex items-center gap-1">
                <CheckCircle2 size={14} /> Đạt điều kiện nhận Bonus tháng
              </p>
            </div>
          </div>

          {/* Income Section */}
          <div className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-2xl shadow-sm p-6 text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 p-6 opacity-10">
              <DollarSign size={120} />
            </div>
            
            <h2 className="font-medium text-indigo-100 flex items-center gap-2 mb-6 relative z-10">
              <Star size={20} className="text-amber-300" />
              Tổng Thu Nhập Tạm Tính
            </h2>
            
            <div className="text-4xl font-bold mb-2 relative z-10">8,450,000đ</div>
            <p className="text-sm text-indigo-200 mb-8 relative z-10">Cập nhật lúc 23:00 hôm qua</p>
            
            <div className="space-y-4 relative z-10">
              <div className="flex justify-between items-center pb-3 border-b border-indigo-500/50">
                <span className="text-indigo-100">Lương cứng</span>
                <span className="font-semibold">4,000,000đ</span>
              </div>
              <div className="flex justify-between items-center pb-3 border-b border-indigo-500/50">
                <span className="text-indigo-100">Tiền Tua (45 tua)</span>
                <span className="font-semibold">2,250,000đ</span>
              </div>
              <div className="flex justify-between items-center pb-3 border-b border-indigo-500/50">
                <span className="text-indigo-100">Tiền Tip</span>
                <span className="font-semibold">1,700,000đ</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-amber-300 font-medium">Bonus KPI (Dự kiến)</span>
                <span className="font-bold text-amber-300">+500,000đ</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

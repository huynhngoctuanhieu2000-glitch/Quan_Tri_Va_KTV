'use client';

import React from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/lib/auth-context';
import { ShieldAlert, ListOrdered, Clock, User, CheckCircle2, Timer } from 'lucide-react';
import { motion } from 'motion/react';

import { useTurnsLogic } from './turns.logic';

export default function TurnTrackingPage() {
  const { hasPermission } = useAuth();
  const [mounted, setMounted] = React.useState(false);
  const selectedDate = new Date().toISOString().split('T')[0];
  const { turns, isLoading, refresh } = useTurnsLogic(selectedDate);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  if (!hasPermission('turn_tracking')) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <ShieldAlert size={48} className="text-red-500 mb-4" />
          <h2 className="text-xl font-bold text-gray-900">Không có quyền truy cập</h2>
        </div>
      </AppLayout>
    );
  }

  const stats = {
    ready: turns.filter(t => t.status === 'ready').length,
    working: turns.filter(t => t.status === 'working').length,
    total: turns.length
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
              <ListOrdered className="text-indigo-600" />
              Theo Dõi Thứ Tự Tua
            </h1>
            <p className="text-sm text-gray-500 mt-1">Quản lý thứ tự phục vụ của kỹ thuật viên.</p>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={refresh}
              className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Làm mới
            </button>
            <button className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm shadow-indigo-100">
              Cập nhật tua
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Main Turn List */}
          <div className="md:col-span-2 space-y-4">
            <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-gray-50 bg-gray-50/30">
                <h2 className="font-bold text-gray-900">Danh sách xếp hàng</h2>
              </div>
              <div className="divide-y divide-gray-100 min-h-[200px] flex flex-col">
                {isLoading ? (
                  <div className="flex-1 flex items-center justify-center py-20">
                    <Timer className="animate-spin text-indigo-400 mr-2" />
                    <span className="text-gray-400 font-medium">Đang tải dữ liệu...</span>
                  </div>
                ) : turns.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center py-20">
                    <User className="text-gray-200 mb-2" size={40} />
                    <span className="text-gray-400 font-medium">Chưa có ai trong danh sách tua hôm nay.</span>
                  </div>
                ) : turns.sort((a, b) => a.queue_position - b.queue_position).map((turn, index) => (
                  <motion.div 
                    key={turn.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="p-4 flex items-center justify-between hover:bg-gray-50/50 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-lg ${
                        turn.status === 'ready' ? 'bg-indigo-100 text-indigo-600' :
                        turn.status === 'working' ? 'bg-rose-100 text-rose-600' :
                        'bg-gray-100 text-gray-400'
                      }`}>
                        {turn.queue_position}
                      </div>
                      <div>
                        <div className="font-bold text-gray-900">{turn.ktvName}</div>
                        <div className="text-xs text-gray-400 uppercase tracking-wider font-bold">{turn.ktvCode}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-6">
                      <div className="text-right hidden sm:block">
                        <div className="text-xs text-gray-400">Dự kiến xong</div>
                        <div className="text-sm font-medium text-gray-600">{turn.lastTurnTime || '-'}</div>
                      </div>
                      <div className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 ${
                        turn.status === 'ready' ? 'bg-emerald-100 text-emerald-700' :
                        turn.status === 'working' ? 'bg-rose-100 text-rose-700' :
                        'bg-gray-100 text-gray-500'
                      }`}>
                        {turn.status === 'ready' ? <CheckCircle2 size={12} /> : 
                         turn.status === 'working' ? <Timer size={12} className="animate-spin" /> : 
                         null}
                        {turn.status === 'ready' ? 'Sẵn sàng' : 
                         turn.status === 'working' ? 'Đang làm' : 'Nghỉ'}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>

          {/* Stats & Info */}
          <div className="space-y-6">
            <div className="bg-indigo-600 rounded-3xl p-6 text-white shadow-lg shadow-indigo-100">
              <h3 className="font-bold text-lg mb-4">Thống kê ca trực</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-indigo-100 text-sm">Đang sẵn sàng</span>
                  <span className="text-2xl font-bold">{stats.ready}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-indigo-100 text-sm">Đang làm việc</span>
                  <span className="text-2xl font-bold">{stats.working}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-indigo-100 text-sm">Tổng nhân sự</span>
                  <span className="text-2xl font-bold">{stats.total}</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-gray-200 p-6 shadow-sm">
              <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Clock size={18} className="text-amber-500" />
                Quy tắc tua
              </h3>
              <ul className="space-y-3 text-sm text-gray-500">
                <li className="flex gap-2">
                  <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full mt-1.5 shrink-0" />
                  KTV hoàn thành đơn sẽ được xếp xuống cuối hàng đợi.
                </li>
                <li className="flex gap-2">
                  <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full mt-1.5 shrink-0" />
                  KTV mới vào ca sẽ được xếp vào vị trí cuối cùng hiện tại.
                </li>
                <li className="flex gap-2">
                  <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full mt-1.5 shrink-0" />
                  Ưu tiên KTV có thời gian chờ lâu nhất.
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

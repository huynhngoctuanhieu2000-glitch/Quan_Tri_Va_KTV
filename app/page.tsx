'use client';

// 🔧 SYSTEM CONFIGURATION
const SYSTEM_CONFIG = {
  spa_name: 'Ngan Ha Spa',
  spa_address: '123 Đường ABC, Quận 1, TP. HCM',
  internal_qr_url: 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=https://nganha-internal.com',
};

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { AppLayout } from '@/components/layout/AppLayout';
import { motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { QrCode, ExternalLink, Info, ShieldCheck, Zap, Clock, Calendar, AlertTriangle, Camera } from 'lucide-react';
import Image from 'next/image';
import * as Progress from '@radix-ui/react-progress';

export default function HomePage() {
  const { user, role } = useAuth();
  const [activeOrder, setActiveOrder] = useState<any>(null);
  const [orderStatus, setOrderStatus] = useState<'pending' | 'in_progress' | 'completed'>('pending');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const isKTV = role?.id === 'ktv';
  const router = useRouter();

  useEffect(() => {
    if (mounted && isKTV) {
      router.push('/ktv/dashboard');
    }
  }, [mounted, isKTV, router]);

  if (!mounted) return null;

  if (isKTV) {
    return (
      <AppLayout title="Dashboard">
        <div className="min-h-[80vh] flex flex-col items-center justify-center bg-[#FDFBF7]">
          <div className="w-8 h-8 rounded-full border-4 border-emerald-200 border-t-emerald-600 animate-spin"></div>
          <p className="mt-4 text-emerald-700 font-medium">Đang chuyển hướng đến bảng điều khiển...</p>
        </div>
      </AppLayout>
    );
  }


  return (
    <AppLayout title="Dashboard">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Welcome Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
              Chào mừng, <span className="text-indigo-600">{user?.name}</span>
            </h1>
            <p className="text-gray-500 mt-1">Hệ thống quản trị trung tâm {SYSTEM_CONFIG.spa_name}</p>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-400 bg-gray-50 px-4 py-2 rounded-full border border-gray-100">
            <ShieldCheck size={16} className="text-emerald-500" />
            Phiên bản 1.0.0 • Bảo mật cao
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* QR Code Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="lg:col-span-1 bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden flex flex-col"
          >
            <div className="p-6 border-b border-gray-50 bg-gray-50/30 flex items-center justify-between">
              <h2 className="font-bold text-gray-900 flex items-center gap-2">
                <QrCode size={20} className="text-indigo-600" />
                QR Truy Cập Nội Bộ
              </h2>
            </div>
            <div className="p-8 flex flex-col items-center justify-center flex-1 space-y-6">
              <div className="relative group">
                <div className="absolute -inset-4 bg-indigo-100 rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="relative bg-white p-4 rounded-2xl shadow-lg border border-gray-100">
                  <Image
                    src={SYSTEM_CONFIG.internal_qr_url}
                    alt="Internal QR Code"
                    width={200}
                    height={200}
                    className="rounded-lg"
                    referrerPolicy="no-referrer"
                  />
                </div>
              </div>
              <div className="text-center space-y-2">
                <p className="text-sm font-medium text-gray-900">Quét mã để truy cập nhanh</p>
                <p className="text-xs text-gray-400 max-w-[200px]">Dành cho nhân viên truy cập hệ thống trên thiết bị di động</p>
              </div>
              <button className="flex items-center gap-2 text-xs font-bold text-indigo-600 hover:text-indigo-700 transition-colors">
                Tải mã QR <ExternalLink size={14} />
              </button>
            </div>
          </motion.div>

          {/* Quick Info & Stats */}
          <div className="lg:col-span-2 space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-indigo-600 rounded-3xl p-6 text-white relative overflow-hidden shadow-lg shadow-indigo-200">
                <div className="relative z-10 space-y-4">
                  <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                    <Zap size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold">Thao tác nhanh</h3>
                    <p className="text-indigo-100 text-sm">Truy cập các tính năng quan trọng chỉ với 1 chạm</p>
                  </div>
                  <div className="flex gap-2">
                    <button className="px-4 py-2 bg-white text-indigo-600 text-xs font-bold rounded-lg hover:bg-indigo-50 transition-colors">
                      Tạo đơn mới
                    </button>
                    <button className="px-4 py-2 bg-indigo-500 text-white text-xs font-bold rounded-lg hover:bg-indigo-400 transition-colors">
                      Xem lịch KTV
                    </button>
                  </div>
                </div>
                <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-white/10 rounded-full blur-3xl" />
              </div>

              <div className="bg-white rounded-3xl p-6 border border-gray-200 shadow-sm space-y-4">
                <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600">
                  <Info size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Thông tin Spa</h3>
                  <div className="mt-2 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Tên:</span>
                      <span className="font-medium text-gray-900">{SYSTEM_CONFIG.spa_name}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Địa chỉ:</span>
                      <span className="font-medium text-gray-900 text-right max-w-[150px]">{SYSTEM_CONFIG.spa_address}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* System Status */}
            <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-gray-50 flex items-center justify-between">
                <h2 className="font-bold text-gray-900">Trạng thái hệ thống</h2>
                <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-500">
                  <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                  Hoạt động ổn định
                </span>
              </div>
              <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-6">
                <div className="text-center space-y-1">
                  <div className="text-2xl font-bold text-gray-900">99.9%</div>
                  <div className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Uptime</div>
                </div>
                <div className="text-center space-y-1">
                  <div className="text-2xl font-bold text-gray-900">24ms</div>
                  <div className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Latency</div>
                </div>
                <div className="text-center space-y-1">
                  <div className="text-2xl font-bold text-gray-900">12</div>
                  <div className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Active Users</div>
                </div>
                <div className="text-center space-y-1">
                  <div className="text-2xl font-bold text-gray-900">0</div>
                  <div className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Incidents</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

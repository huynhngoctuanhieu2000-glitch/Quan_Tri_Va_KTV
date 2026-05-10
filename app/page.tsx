'use client';

// 🔧 SYSTEM CONFIGURATION
const SYSTEM_CONFIG = {
  spa_name: 'Ngan Ha Spa',
  spa_address: '123 Đường ABC, Quận 1, TP. HCM',
  // Fallback, actual URL loaded from SystemConfigs API
  default_booking_url: 'https://nganha.vercel.app/',
};

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { AppLayout } from '@/components/layout/AppLayout';
import { motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { QrCode, ExternalLink, Info, ShieldCheck, Zap, Clock, Calendar, AlertTriangle, Camera, Users, CalendarOff, Briefcase } from 'lucide-react';
import Image from 'next/image';
import * as Progress from '@radix-ui/react-progress';

export default function HomePage() {
  const { user, role } = useAuth();
  const [activeOrder, setActiveOrder] = useState<any>(null);
  const [orderStatus, setOrderStatus] = useState<'pending' | 'in_progress' | 'completed'>('pending');
  const [mounted, setMounted] = useState(false);
  const [webBookingUrl, setWebBookingUrl] = useState(SYSTEM_CONFIG.default_booking_url);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    // Fetch web booking URL from SystemConfigs
    fetch('/api/system/config')
      .then(r => r.json())
      .then(json => {
        if (json.success && json.data?.web_booking_url) {
          setWebBookingUrl(json.data.web_booking_url);
        }
      })
      .catch(() => { /* use fallback */ });
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
          {/* Left Column: QR + Staff Overview */}
          <div className="lg:col-span-1 space-y-6">
          {/* QR Code Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden flex flex-col"
          >
            <div className="p-6 border-b border-gray-50 bg-gray-50/30 flex items-center justify-between">
              <h2 className="font-bold text-gray-900 flex items-center gap-2">
                <QrCode size={20} className="text-indigo-600" />
                QR Menu Khách Hàng
              </h2>
            </div>
            <div className="p-8 flex flex-col items-center justify-center flex-1 space-y-6">
              <div className="relative group">
                <div className="absolute -inset-4 bg-indigo-100 rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="relative bg-white p-4 rounded-2xl shadow-lg border border-gray-100">
                  <Image
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(webBookingUrl)}`}
                    alt="Web Booking QR Code"
                    width={200}
                    height={200}
                    className="rounded-lg"
                    referrerPolicy="no-referrer"
                  />
                </div>
              </div>
              <div className="text-center space-y-2">
                <p className="text-sm font-medium text-gray-900">Khách quét để xem menu</p>
                <p className="text-xs text-gray-400 max-w-[200px]">Quét mã QR để truy cập menu dịch vụ & đặt lịch trên web</p>
              </div>
              <button className="flex items-center gap-2 text-xs font-bold text-indigo-600 hover:text-indigo-700 transition-colors">
                Tải mã QR <ExternalLink size={14} />
              </button>
            </div>
          </motion.div>

          {/* Daily Staff Overview - below QR */}
          <DailyStaffOverview />
          </div>

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
                    <button 
                      onClick={() => router.push('/reception/dispatch')}
                      className="px-4 py-2 bg-white text-indigo-600 text-xs font-bold rounded-lg hover:bg-indigo-50 transition-colors"
                    >
                      Tạo đơn mới
                    </button>
                    <button 
                      onClick={() => router.push('/reception/ktv-hub')}
                      className="px-4 py-2 bg-indigo-500 text-white text-xs font-bold rounded-lg hover:bg-indigo-400 transition-colors"
                    >
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

// 🔧 SHIFT DISPLAY CONFIGURATION
const SHIFT_DISPLAY: Record<string, { label: string; time: string; color: string; border: string; bg: string }> = {
  SHIFT_1: { label: 'Ca 1', time: '09:00 - 17:00', color: 'text-blue-700', border: 'border-blue-200', bg: 'bg-blue-50' },
  SHIFT_2: { label: 'Ca 2', time: '11:00 - 19:00', color: 'text-amber-700', border: 'border-amber-200', bg: 'bg-amber-50' },
  SHIFT_3: { label: 'Ca 3', time: '17:00 - 00:00', color: 'text-violet-700', border: 'border-violet-200', bg: 'bg-violet-50' },
  FREE: { label: 'Ca tự do', time: '', color: 'text-emerald-700', border: 'border-emerald-200', bg: 'bg-emerald-50' },
  REQUEST: { label: 'Làm KH yêu cầu', time: '', color: 'text-teal-700', border: 'border-teal-200', bg: 'bg-teal-50' },
};

interface LeaveItem {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  status: string;
  is_extension?: boolean;
  is_sudden_off?: boolean;
  createdAt: string;
}

interface ShiftItem {
  employeeId: string;
  employeeName: string;
  shiftType: string;
}

const DailyStaffOverview = () => {
  const [leaves, setLeaves] = useState<LeaveItem[]>([]);
  const [shifts, setShifts] = useState<ShiftItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedShifts, setExpandedShifts] = useState<string[]>(['SHIFT_1', 'SHIFT_2', 'SHIFT_3', 'FREE', 'REQUEST']);

  // Get today in VN timezone
  const getVnToday = () => {
    const d = new Date();
    const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
    const vnTime = new Date(utc + (3600000 * 7));
    return vnTime.toISOString().split('T')[0];
  };

  const [selectedDate, setSelectedDate] = useState(getVnToday);

  const displayFormatted = (() => {
    const [y, m, d] = selectedDate.split('-');
    return `${d}/${m}/${y}`;
  })();

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [leaveRes, shiftRes] = await Promise.all([
          fetch(`/api/ktv/leave?from=${selectedDate}&to=${selectedDate}`),
          fetch(`/api/ktv/shift?all=true&date=${selectedDate}`),
        ]);
        const leaveJson = await leaveRes.json();
        const shiftJson = await shiftRes.json();

        if (leaveJson.success) {
          setLeaves((leaveJson.data || []).filter((l: LeaveItem) => l.status !== 'REJECTED'));
        }
        if (shiftJson.success) {
          setShifts(shiftJson.data || []);
        }
      } catch (err) {
        console.error('Failed to fetch daily overview:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [selectedDate]);

  // IDs of staff on leave
  const offIds = new Set(leaves.map(l => l.employeeId));

  // Working staff = shifts minus OFF
  const workingShifts = shifts.filter(s => !offIds.has(s.employeeId));

  // Group by shift type
  const shiftGroups: Record<string, ShiftItem[]> = {};
  workingShifts.forEach(s => {
    const key = s.shiftType || 'UNKNOWN';
    if (!shiftGroups[key]) shiftGroups[key] = [];
    shiftGroups[key].push(s);
  });

  // Order shifts logically
  const shiftOrder = ['SHIFT_1', 'SHIFT_2', 'SHIFT_3', 'FREE', 'REQUEST'];
  const orderedKeys = shiftOrder.filter(k => shiftGroups[k]);
  // Add any unknown keys
  Object.keys(shiftGroups).forEach(k => {
    if (!orderedKeys.includes(k)) orderedKeys.push(k);
  });

  const totalWorking = workingShifts.length;

  if (isLoading) {
    return (
      <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-8 text-center">
        <div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto" />
        <p className="text-sm text-gray-400 mt-3">Đang tải thông tin nhân sự...</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden"
    >
      {/* Header */}
      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center text-indigo-600 shrink-0">
            <Calendar size={16} />
          </div>
          <div>
            <h2 className="font-bold text-gray-900 text-sm">Ngày {displayFormatted}</h2>
            <p className="text-[10px] text-gray-500">
              <span className="font-bold text-red-500">{leaves.length}</span> OFF
              {' • '}
              <span className="font-bold text-emerald-600">{totalWorking}</span> làm việc
            </p>
          </div>
        </div>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="text-xs font-medium border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-200 text-gray-700 bg-white cursor-pointer"
        />
      </div>

      <div className="p-6 space-y-6">
        {/* === NHÂN SỰ OFF === */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <CalendarOff size={16} className="text-red-500" />
              <h3 className="text-sm font-black text-red-600 uppercase tracking-wider">Nhân Sự OFF</h3>
              <span className="bg-red-100 text-red-600 text-[10px] font-black px-2 py-0.5 rounded-full">{leaves.length}</span>
            </div>
          </div>

          {leaves.length === 0 ? (
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 text-center">
              <p className="text-sm text-emerald-600 font-medium">✅ Không có ai nghỉ hôm nay</p>
            </div>
          ) : (
            <div>
              {/* Tag loại nghỉ */}
              {leaves.some(l => l.is_sudden_off) && (
                <div className="flex items-center gap-1.5 mb-2">
                  <AlertTriangle size={12} className="text-red-500" />
                  <span className="text-[10px] font-black text-red-600 uppercase">Nghỉ đột xuất</span>
                </div>
              )}
              {leaves.some(l => l.is_extension) && (
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-[10px] font-black text-amber-600 uppercase">☑️ Nghỉ có phép / Gia hạn</span>
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {leaves.map(leave => (
                  <div
                    key={leave.id}
                    className={`rounded-xl border p-3 ${
                      leave.is_sudden_off
                        ? 'bg-red-50 border-red-200'
                        : 'bg-rose-50/50 border-rose-100'
                    }`}
                  >
                    <p className={`text-sm font-bold ${leave.is_sudden_off ? 'text-red-600' : 'text-rose-600'}`}>
                      {leave.employeeId}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-1">
                      Gửi lúc: {new Date(leave.createdAt).toLocaleString('vi-VN', {
                        hour: '2-digit', minute: '2-digit',
                        day: '2-digit', month: '2-digit'
                      })}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="border-t border-gray-100" />

        {/* === NHÂN SỰ LÀM VIỆC === */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Briefcase size={16} className="text-emerald-600" />
            <h3 className="text-sm font-black text-emerald-700 uppercase tracking-wider">Nhân Sự Làm Việc</h3>
            <span className="bg-emerald-100 text-emerald-700 text-[10px] font-black px-2 py-0.5 rounded-full">{totalWorking}</span>
          </div>

          {orderedKeys.length === 0 ? (
            <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 text-center">
              <p className="text-sm text-gray-400">Chưa có dữ liệu ca làm việc</p>
            </div>
          ) : (
            <div className="space-y-3">
              {orderedKeys.map(shiftKey => {
                const group = shiftGroups[shiftKey];
                const display = SHIFT_DISPLAY[shiftKey] || {
                  label: shiftKey, time: '', color: 'text-gray-700',
                  border: 'border-gray-200', bg: 'bg-gray-50'
                };
                const isOpen = expandedShifts.includes(shiftKey);

                return (
                  <div key={shiftKey} className={`rounded-xl border ${display.border} ${display.bg} overflow-hidden`}>
                    <button
                      onClick={() => setExpandedShifts(prev =>
                        prev.includes(shiftKey) ? prev.filter(k => k !== shiftKey) : [...prev, shiftKey]
                      )}
                      className="w-full flex items-center justify-between p-3 hover:opacity-80 transition-opacity cursor-pointer"
                    >
                      <p className={`text-xs font-bold ${display.color}`}>
                        {display.label}{display.time ? ` (${display.time})` : ''}
                      </p>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-black ${display.color}`}>{group.length}</span>
                        <svg
                          className={`w-3.5 h-3.5 ${display.color} transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </button>
                    {isOpen && (
                      <div className="px-3 pb-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {group.map(staff => (
                          <div
                            key={staff.employeeId}
                            className={`rounded-lg border ${display.border} bg-white/60 px-3 py-2 text-center`}
                          >
                            <p className={`text-sm font-bold ${display.color}`}>
                              {staff.employeeId}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

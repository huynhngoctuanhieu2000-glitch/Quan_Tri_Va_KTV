'use client';

// 🔧 UI CONFIGURATION
const DEFAULT_DURATION = 60; // Phút mặc định cho mỗi KTV

import React, { useState, useRef, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/lib/auth-context';
import {
  ShieldAlert, Clock, CheckCircle2, Bell, BellOff,
  Plus, Calendar as CalendarIcon, Send, Phone,
  ChevronDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { MOCK_BEDS, MOCK_ROOMS_LIST } from '@/lib/mock-db';
import { supabase } from '@/lib/supabase';
import { DispatchServiceBlock } from './_components/DispatchServiceBlock';

// ─── TYPES ────────────────────────────────────────────────────────────────────

export interface StaffAssignment {
  id: string;
  ktvId: string;
  ktvName: string;
  startTime: string;
  duration: number;
  endTime: string;
  noteForKtv: string;
}

export interface ServiceBlock {
  id: string;
  serviceName: string;
  duration: number;
  selectedRoomId: string | null;
  bedId: string | null;
  staffList: StaffAssignment[];
  adminNote: string;
  genderReq: string;
  strength: string;
  focus: string;
  avoid: string;
  customerNote: string;
}

export type DispatchStatus = 'pending' | 'dispatched' | 'in_progress' | 'done';

export interface PendingOrder {
  id: string;
  customerName: string;
  phone: string;
  time: string;
  services: ServiceBlock[];
  dispatchStatus: DispatchStatus;
}

export type StaffData = {
  id: string;
  full_name: string;
  status: string;
  gender: string;
  skills: Record<string, string>;
  phone: string;
  position: string;
  avatar_url: string;
  experience: string;
};

export type TurnQueueData = {
  id?: string;
  employee_id: string;
  date: string;
  queue_position: number;
  check_in_order: number;
  status: 'waiting' | 'working' | 'done_turn';
  turns_completed: number;
  current_order_id?: string | null;
  estimated_end_time?: string | null;
};

// ─── MOCK DATA ────────────────────────────────────────────────────────────────

const MOCK_PENDING_ORDERS: PendingOrder[] = [
  {
    id: 'ORD-1025',
    customerName: 'Chị Hoa',
    phone: '0901234567',
    time: '14:30',
    dispatchStatus: 'pending',
    services: [
      {
        id: 'svc-1',
        serviceName: 'Gội Đầu Dưỡng Sinh',
        duration: 60,
        selectedRoomId: null,
        bedId: null,
        staffList: [{ id: 'sr-1', ktvId: '', ktvName: '', startTime: '14:30', duration: 60, endTime: '15:30', noteForKtv: '' }],
        adminNote: '',
        genderReq: 'Nữ',
        strength: 'Nhẹ',
        focus: 'Đầu, Vai',
        avoid: 'Cổ',
        customerNote: '',
      }
    ],
  },
  {
    id: 'ORD-1026',
    customerName: 'Anh Tuấn',
    phone: '0987654321',
    time: '15:00',
    dispatchStatus: 'pending',
    services: [
      {
        id: 'svc-2',
        serviceName: 'Massage Body 90p',
        duration: 90,
        selectedRoomId: null,
        bedId: null,
        staffList: [{ id: 'sr-2', ktvId: '', ktvName: '', startTime: '15:00', duration: 90, endTime: '16:30', noteForKtv: '' }],
        adminNote: '',
        genderReq: 'Nam',
        strength: 'Mạnh',
        focus: 'Lưng',
        avoid: '',
        customerNote: 'Đau vai nhiều',
      },
      {
        id: 'svc-3',
        serviceName: 'Massage Chân 45p',
        duration: 45,
        selectedRoomId: null,
        bedId: null,
        staffList: [{ id: 'sr-3', ktvId: '', ktvName: '', startTime: '15:00', duration: 45, endTime: '15:45', noteForKtv: '' }],
        adminNote: '',
        genderReq: 'Ngẫu nhiên',
        strength: '',
        focus: '',
        avoid: '',
        customerNote: '',
      }
    ],
  },
];

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const calcEndTime = (start: string, duration: number): string => {
  if (!start || !duration) return '';
  const [h, m] = start.split(':').map(Number);
  const end = new Date();
  end.setHours(h, m + duration, 0, 0);
  return `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;
};

const genId = () => Math.random().toString(36).slice(2, 8);

const QUICK_SERVICES_LIST = [
  { name: 'Massage Body 60p', duration: 60 },
  { name: 'Massage Body 90p', duration: 90 },
  { name: 'Massage Chân 30p', duration: 30 },
  { name: 'Massage Chân 45p', duration: 45 },
  { name: 'Gội Đầu Dưỡng Sinh 60p', duration: 60 },
  { name: 'Chăm Sóc Da Mặt 75p', duration: 75 },
  { name: 'Scrub Tay 20p', duration: 20 },
  { name: 'Đắp Mặt Nạ 30p', duration: 30 },
  { name: 'Tẩy Tế Bào Chết 30p', duration: 30 },
  { name: 'Massage Đá Nóng 90p', duration: 90 },
];

export default function DispatchBoardPage() {
  const { hasPermission } = useAuth();
  const [mounted, setMounted] = React.useState(false);
  const [staffs, setStaffs] = useState<StaffData[]>([]);
  const [turns, setTurns] = useState<(TurnQueueData & { staff?: StaffData })[]>([]);
  const [loading, setLoading] = useState(true);

  const [orders, setOrders] = useState<PendingOrder[]>(
    MOCK_PENDING_ORDERS.map(o => ({ ...o, dispatchStatus: o.dispatchStatus ?? 'pending' }))
  );
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [leftPanelTab, setLeftPanelTab] = useState<DispatchStatus>('pending');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showAddSvcModal, setShowAddSvcModal] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    fetchData();
  }, [selectedDate]);

  const [loadingStaff, setLoadingStaff] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    setLoadingStaff(true);
    try {
      // Fetch Staff
      const { data: sData, error: sError } = await supabase.from('Staff').select('*');
      if (sError) console.error("❌ [Dispatch] Error fetching staff:", sError);
      if (sData) {
        setStaffs(sData);
        console.log(`✅ [Dispatch] Fetched ${sData.length} staff members`);
      }

      // Fetch TurnQueue for today
      const { data: tData, error: tError } = await supabase
        .from('TurnQueue')
        .select('*')
        .eq('date', selectedDate)
        .order('queue_position', { ascending: true });

      if (tError) console.error("❌ [Dispatch] Error fetching turn queue:", tError);

      if (tData && sData) {
        const merged = tData.map((t: TurnQueueData) => ({
          ...t,
          staff: sData.find(s => s.id === t.employee_id)
        }));
        setTurns(merged);
        console.log(`✅ [Dispatch] Fetched ${merged.length} turns`);
      }
    } catch (e) {
      console.error("❌ [Dispatch] Unexpected error:", e);
    }
    setLoading(false);
    setLoadingStaff(false);
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    if (dropdownOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [dropdownOpen]);

  if (!mounted) return null;

  if (!hasPermission('dispatch_board')) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <ShieldAlert size={48} className="text-red-500 mb-4" />
          <h2 className="text-xl font-bold text-gray-900">Không có quyền truy cập</h2>
        </div>
      </AppLayout>
    );
  }

  const pendingOrders = orders.filter(o => o.dispatchStatus === 'pending');
  const selectedOrder = orders.find(o => o.id === selectedOrderId) ?? null;

  const LEFT_TABS: { id: DispatchStatus; label: string; color: string; activeBg: string; dot: string }[] = [
    { id: 'pending', label: 'Chờ điều phối', color: 'text-rose-600', activeBg: 'bg-rose-500', dot: 'bg-rose-500' },
    { id: 'dispatched', label: 'Đã điều phối', color: 'text-indigo-600', activeBg: 'bg-indigo-500', dot: 'bg-indigo-500' },
    { id: 'in_progress', label: 'Đang làm', color: 'text-amber-600', activeBg: 'bg-amber-500', dot: 'bg-amber-500' },
    { id: 'done', label: 'Hoàn tất', color: 'text-emerald-600', activeBg: 'bg-emerald-500', dot: 'bg-emerald-500' },
  ];

  const displayedOrders = orders.filter(o => o.dispatchStatus === leftPanelTab);

  const updateOrder = (orderId: string, patchFn: (o: PendingOrder) => PendingOrder) => {
    setOrders(prev => prev.map(o => o.id === orderId ? patchFn(o) : o));
  };

  const updateSvcField = (orderId: string, svcId: string, patch: Partial<ServiceBlock>) => {
    updateOrder(orderId, o => ({
      ...o,
      services: o.services.map(s => s.id === svcId ? { ...s, ...patch } : s),
    }));
  };

  const selectRoom = (orderId: string, svcId: string, roomId: string) => {
    updateOrder(orderId, o => ({
      ...o,
      services: o.services.map(s => s.id === svcId
        ? { ...s, selectedRoomId: s.selectedRoomId === roomId ? null : roomId, bedId: null }
        : s
      ),
    }));
  };

  const selectBed = (orderId: string, svcId: string, bedId: string) => {
    updateOrder(orderId, o => ({
      ...o,
      services: o.services.map(s => s.id === svcId
        ? { ...s, bedId: s.bedId === bedId ? null : bedId }
        : s
      ),
    }));
  };

  const updateStaffRow = (orderId: string, svcId: string, rowId: string, patch: Partial<StaffAssignment>) => {
    updateOrder(orderId, o => ({
      ...o,
      services: o.services.map(s => s.id === svcId
        ? { ...s, staffList: s.staffList.map(r => r.id === rowId ? { ...r, ...patch } : r) }
        : s
      ),
    }));
  };

  const addStaffRow = (orderId: string, svcId: string) => {
    const svc = orders.find(o => o.id === orderId)?.services.find(s => s.id === svcId);
    const lastRow = svc?.staffList[svc.staffList.length - 1];
    const newRow: StaffAssignment = {
      id: genId(),
      ktvId: '',
      ktvName: '',
      startTime: lastRow?.startTime ?? '',
      duration: svc?.duration ?? DEFAULT_DURATION,
      endTime: lastRow?.endTime ?? '',
      noteForKtv: '',
    };
    updateOrder(orderId, o => ({
      ...o,
      services: o.services.map(s => s.id === svcId
        ? { ...s, staffList: [...s.staffList, newRow] }
        : s
      ),
    }));
  };

  const removeStaffRow = (orderId: string, svcId: string, rowId: string) => {
    updateOrder(orderId, o => ({
      ...o,
      services: o.services.map(s => s.id === svcId
        ? { ...s, staffList: s.staffList.filter(r => r.id !== rowId) }
        : s
      ),
    }));
  };

  const isDispatchReady = (order: PendingOrder): boolean =>
    order.services.every(s =>
      s.bedId !== null &&
      s.staffList.length > 0 &&
      s.staffList.every(r => r.ktvId !== '' && r.startTime !== '')
    );

  const getMissingInfo = (order: PendingOrder): string[] => {
    const missing: string[] = [];
    order.services.forEach((s, i) => {
      if (!s.selectedRoomId) missing.push(`Dịch vụ ${i + 1}: Chưa chọn Phòng`);
      else if (!s.bedId) missing.push(`Dịch vụ ${i + 1}: Chưa chọn Giường`);
      s.staffList.forEach((r, j) => {
        if (!r.ktvId) missing.push(`Dịch vụ ${i + 1} · KTV ${j + 1}: Chưa chọn KTV`);
        if (!r.startTime) missing.push(`Dịch vụ ${i + 1} · KTV ${j + 1}: Chưa nhập giờ bắt đầu`);
      });
    });
    return missing;
  };

  const addServiceBlock = (svcName: string, duration: number) => {
    if (!selectedOrderId) return;
    const now = new Date();
    const startTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const newBlock: ServiceBlock = {
      id: `svc-${genId()}`,
      serviceName: svcName,
      duration,
      selectedRoomId: null,
      bedId: null,
      staffList: [{ id: `sr-${genId()}`, ktvId: '', ktvName: '', startTime, duration, endTime: calcEndTime(startTime, duration), noteForKtv: '' }],
      adminNote: '',
      genderReq: '',
      strength: '',
      focus: '',
      avoid: '',
      customerNote: '',
    };
    setOrders(prev => prev.map(o =>
      o.id === selectedOrderId ? { ...o, services: [...o.services, newBlock] } : o
    ));
    setShowAddSvcModal(false);
  };

  const handleDispatch = async () => {
    if (!selectedOrder) return;
    const missing = getMissingInfo(selectedOrder);
    if (missing.length > 0) {
      alert(`⚠️ Vui lòng điền đầy đủ thông tin:\n\n${missing.map(m => `• ${m}`).join('\n')}`);
      return;
    }

    try {
      for (const svc of selectedOrder.services) {
        for (const row of svc.staffList) {
          const ktvId = row.ktvId;
          const currentTurn = turns.find(t => t.employee_id === ktvId);
          if (!currentTurn) continue;

          let turnsCompleted = currentTurn.turns_completed;
          let queuePos = currentTurn.queue_position;

          if (currentTurn.current_order_id !== selectedOrder.id) {
            turnsCompleted += 1;
            const maxPos = Math.max(...turns.map(t => t.queue_position), 0);
            queuePos = maxPos + 1;
          }

          await supabase.from('TurnQueue').update({
            turns_completed: turnsCompleted,
            queue_position: queuePos,
            status: 'working',
            current_order_id: selectedOrder.id,
            estimated_end_time: row.endTime,
          }).eq('employee_id', ktvId).eq('date', selectedDate);
        }
      }

      setOrders(prev => prev.map(o =>
        o.id === selectedOrder.id ? { ...o, dispatchStatus: 'dispatched' } : o
      ));
      setSelectedOrderId(null);
      setLeftPanelTab('dispatched');
      fetchData();
    } catch (err) {
      alert('Đã có lỗi xảy ra khi cập nhật hàng đợi.');
      console.error(err);
    }
  };

  return (
    <AppLayout>
      <div className="h-[calc(100vh-3rem)] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0 mb-5">
          <div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight flex items-center gap-3">
              Bảng Điều Phối Trung Tâm
              <span className="bg-rose-100 text-rose-700 text-xs px-2.5 py-1 rounded-full font-semibold animate-pulse">
                {pendingOrders.length} đơn mới
              </span>
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">Tiếp nhận và điều phối KTV / Phòng cho đơn khách hàng</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`relative p-2 rounded-full transition-colors ${soundEnabled ? 'text-indigo-600 hover:bg-indigo-50' : 'text-gray-400 hover:bg-gray-100'}`}
            >
              {soundEnabled ? <Bell size={18} /> : <BellOff size={18} />}
              {soundEnabled && <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-rose-500 rounded-full animate-ping" />}
            </button>

            <div className="relative">
              <CalendarIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="pl-9 pr-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white font-medium cursor-pointer"
              />
            </div>

            <button className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-bold text-sm transition-colors shadow-sm">
              <Plus size={15} strokeWidth={3} /> Tạo Đơn Mới
            </button>
          </div>
        </div>

        <div className="flex-1 flex gap-5 overflow-hidden">
          {/* LEFT: Order Panel */}
          <div className="w-72 shrink-0 flex flex-col border border-gray-200 bg-white rounded-2xl overflow-hidden shadow-sm">
            <div className="p-3 border-b border-gray-100 bg-white shrink-0">
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setDropdownOpen(v => !v)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl transition-all"
                >
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${LEFT_TABS.find(t => t.id === leftPanelTab)?.dot}`} />
                  <span className="flex-1 text-left">
                    <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider leading-none mb-0.5">Xem đơn theo trạng thái</span>
                    <span className={`text-sm font-black ${LEFT_TABS.find(t => t.id === leftPanelTab)?.color}`}>
                      {LEFT_TABS.find(t => t.id === leftPanelTab)?.label}
                    </span>
                  </span>
                  <span className="text-xs font-black px-2 py-0.5 rounded-full bg-gray-200">{displayedOrders.length}</span>
                  <ChevronDown size={15} className={`text-gray-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                <AnimatePresence>
                  {dropdownOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                      className="absolute top-full mt-1.5 left-0 right-0 z-20 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden"
                    >
                      {LEFT_TABS.map((tab) => (
                        <button
                          key={tab.id}
                          onClick={() => { setLeftPanelTab(tab.id); setDropdownOpen(false); }}
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left border-b border-gray-50 last:border-0"
                        >
                          <span className={`w-2 h-2 rounded-full ${tab.dot}`} />
                          <span className={`flex-1 text-sm font-bold ${leftPanelTab === tab.id ? tab.color : 'text-gray-700'}`}>
                            {tab.label}
                          </span>
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
              {displayedOrders.map(order => (
                <div
                  key={order.id}
                  onClick={() => setSelectedOrderId(order.id)}
                  className={`bg-white p-3 rounded-xl border-2 cursor-pointer transition-all ${selectedOrderId === order.id ? 'border-indigo-500 shadow-md' : 'border-gray-100 hover:border-indigo-200'}`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded">{order.id}</span>
                    <span className="text-[10px] text-gray-500 flex items-center gap-1"><Clock size={10} /> {order.time}</span>
                  </div>
                  <p className="font-bold text-sm text-gray-900">{order.customerName}</p>
                </div>
              ))}
            </div>
          </div>

          {/* CENTER: Assignment Panel */}
          <div className="flex-1 flex flex-col border border-gray-200 bg-white rounded-2xl overflow-hidden shadow-sm min-w-0">
            <div className="p-4 border-b border-gray-100 bg-gray-50 shrink-0">
              {selectedOrder ? (
                <div className="flex items-center justify-between">
                  <h2 className="font-bold text-gray-900 text-sm italic">📋 Đang xử lý: {selectedOrder.customerName}</h2>
                </div>
              ) : (
                <p className="text-sm font-medium text-gray-400">Chọn đơn hàng để tiếp tục</p>
              )}
            </div>

            {selectedOrder ? (
              <div className="flex-1 overflow-y-auto p-5 space-y-5">
                {selectedOrder.services.map((svc, idx) => (
                  <DispatchServiceBlock
                    key={svc.id}
                    svc={svc}
                    svcIndex={idx}
                    orderId={selectedOrder.id}
                    rooms={MOCK_ROOMS_LIST}
                    beds={MOCK_BEDS}
                    availableTurns={turns}
                    onUpdateSvc={updateSvcField}
                    onSelectRoom={selectRoom}
                    onSelectBed={selectBed}
                    onUpdateStaff={updateStaffRow}
                    onAddStaff={addStaffRow}
                    onRemoveStaff={removeStaffRow}
                  />
                ))}

                <button
                  onClick={() => setShowAddSvcModal(true)}
                  className="w-full py-3 border-2 border-dashed border-gray-200 rounded-2xl text-sm font-bold text-gray-400 hover:border-indigo-300 hover:text-indigo-600 transition-all flex items-center justify-center gap-2"
                >
                  <Plus size={16} /> Thêm Dịch Vụ Khác
                </button>

                <div className="pt-2">
                  <button
                    onClick={handleDispatch}
                    disabled={!isDispatchReady(selectedOrder)}
                    className={`w-full py-4 rounded-2xl font-black text-sm transition-all flex items-center justify-center gap-2 ${isDispatchReady(selectedOrder)
                      ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-xl shadow-indigo-100'
                      : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      }`}
                  >
                    <Send size={18} strokeWidth={3} /> XÁC NHẬN ĐIỀU PHỐI
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-gray-300">
                <Send size={48} className="mb-4 opacity-20" />
                <p className="text-sm font-bold">Hãy chọn một đơn hàng từ danh sách</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Svc Modal */}
      <AnimatePresence>
        {showAddSvcModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowAddSvcModal(false)} />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="relative bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">
              <div className="p-4 border-b border-gray-100 flex justify-between items-center">
                <h3 className="font-bold">Thêm dịch vụ</h3>
                <button onClick={() => setShowAddSvcModal(false)}><ChevronDown /></button>
              </div>
              <div className="p-4 grid grid-cols-1 gap-2 max-h-96 overflow-y-auto">
                {QUICK_SERVICES_LIST.map(svc => (
                  <button key={svc.name} onClick={() => addServiceBlock(svc.name, svc.duration)} className="p-3 text-left border-2 border-gray-100 rounded-xl hover:border-indigo-500 font-bold text-sm">
                    {svc.name} ({svc.duration}p)
                  </button>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </AppLayout>
  );
}

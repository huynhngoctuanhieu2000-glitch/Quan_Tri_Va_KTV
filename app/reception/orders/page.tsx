'use client';

// 🔧 UI CONFIGURATION
const ANIMATION_DURATION = 0.25;
const SLIDE_OVER_WIDTH = 'w-[420px]';

import React, { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/lib/auth-context';
import {
    ShieldAlert, Clock, User, Phone,
    Calendar as CalendarIcon, ChevronRight,
    Plus, X, CreditCard, AlertCircle, CheckCircle2,
    MessageSquare, ArrowRight, Banknote, Star
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// ─── TYPES ────────────────────────────────────────────────────────────────────

type OrderStatus = 'PREPARING' | 'IN_PROGRESS' | 'COMPLETED' | 'FEEDBACK';

const STATUS_CONFIG = [
    { id: 'PREPARING' as OrderStatus, label: 'Chuẩn bị', shortLabel: 'Chuẩn bị', color: 'text-orange-600', bg: 'bg-orange-50', activeBg: 'bg-orange-600', border: 'border-orange-200', dot: 'bg-orange-500', next: 'IN_PROGRESS' as OrderStatus, nextLabel: '▶️ Đang làm' },
    { id: 'IN_PROGRESS' as OrderStatus, label: 'Đang Tiến Hành', shortLabel: 'Đang làm', color: 'text-indigo-600', bg: 'bg-indigo-50', activeBg: 'bg-indigo-600', border: 'border-indigo-200', dot: 'bg-indigo-500', next: 'COMPLETED' as OrderStatus, nextLabel: '✅ Hoàn Tất DV' },
    { id: 'COMPLETED' as OrderStatus, label: 'Hoàn Tất Dịch Vụ', shortLabel: 'Hoàn tất', color: 'text-emerald-600', bg: 'bg-emerald-50', activeBg: 'bg-emerald-600', border: 'border-emerald-200', dot: 'bg-emerald-500', next: 'FEEDBACK' as OrderStatus, nextLabel: '⭐ Nhận xét' },
    { id: 'FEEDBACK' as OrderStatus, label: 'Nhận xét', shortLabel: 'Nhận xét', color: 'text-blue-600', bg: 'bg-blue-50', activeBg: 'bg-blue-600', border: 'border-blue-200', dot: 'bg-blue-500', next: null, nextLabel: null },
] as const;

interface ServiceItem {
    id: string;
    name: string;
    ktv: string;
    room: string;
    duration: number;
    price: number;
    addedDuring?: boolean; // Thêm trong quá trình
}

interface ActiveOrder {
    id: string;
    customerName: string;
    phone: string;
    startedAt: string;
    status: OrderStatus;
    note?: string;
    unpaid?: boolean; // Chưa thanh toán
    services: ServiceItem[];
}

// ─── MOCK DATA ────────────────────────────────────────────────────────────────

const MOCK_ACTIVE_ORDERS: ActiveOrder[] = [
    {
        id: 'ORD-1024', customerName: 'Chị Lan', phone: '0912345678',
        startedAt: '13:05', status: 'PREPARING', unpaid: false,
        services: [
            { id: 's1', name: 'Gội Đầu VIP 60p', ktv: 'Nguyễn KTV', room: 'V1-2', duration: 60, price: 250000 },
        ]
    },
    {
        id: 'ORD-1023', customerName: 'Cô Mai', phone: '0933334444',
        startedAt: '12:35', status: 'IN_PROGRESS', unpaid: false,
        services: [
            { id: 's2', name: 'Chăm Sóc Da Mặt 75p', ktv: 'Trần KTV', room: 'V3-1', duration: 75, price: 350000 },
        ]
    },
    {
        id: 'ORD-1021', customerName: 'Anh Khoa', phone: '0977112233',
        startedAt: '12:05', status: 'COMPLETED', note: 'Khách thích nhẹ tay', unpaid: true,
        services: [
            { id: 's3', name: 'Massage Body 60p', ktv: 'Phạm KTV', room: 'V2-1', duration: 60, price: 300000 },
            { id: 's4', name: 'Massage Chân 30p', ktv: 'Phạm KTV', room: 'V2-1', duration: 30, price: 150000, addedDuring: true },
        ]
    },
    {
        id: 'ORD-1020', customerName: 'Chị Thu', phone: '0988223344',
        startedAt: '11:32', status: 'FEEDBACK', unpaid: true,
        services: [
            { id: 's5', name: 'Massage Chân 45p', ktv: 'Lê KTV', room: 'T-3', duration: 45, price: 200000 },
        ]
    },
];

const QUICK_SERVICES = [
    { name: 'Massage Chân 30p', price: 150000, duration: 30 },
    { name: 'Massage Chân 45p', price: 200000, duration: 45 },
    { name: 'Chăm Sóc Da 30p', price: 180000, duration: 30 },
    { name: 'Gội Đầu 30p', price: 120000, duration: 30 },
    { name: 'Scrub Tay 20p', price: 100000, duration: 20 },
    { name: 'Tẩy Tế Bào Chết 30p', price: 150000, duration: 30 },
];

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const formatVND = (n: number) => new Intl.NumberFormat('vi-VN').format(n) + 'đ';

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function OrderManagementPage() {
    const { hasPermission } = useAuth();
    const [orders, setOrders] = useState<ActiveOrder[]>(MOCK_ACTIVE_ORDERS);
    const [mounted, setMounted] = React.useState(false);
    const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
    const [showAddService, setShowAddService] = useState(false);
    const [internalNote, setInternalNote] = useState('');
    const [draggedOrderId, setDraggedOrderId] = useState<string | null>(null);

    React.useEffect(() => { setMounted(true); }, []);
    if (!mounted) return null;

    if (!hasPermission('order_management')) {
        return (
            <AppLayout>
                <div className="flex flex-col items-center justify-center h-64 text-center">
                    <ShieldAlert size={48} className="text-red-500 mb-4" />
                    <h2 className="text-xl font-bold text-gray-900">Không có quyền truy cập</h2>
                </div>
            </AppLayout>
        );
    }

    const selectedOrder = orders.find(o => o.id === selectedOrderId) ?? null;

    // Groups for display
    const getStatusConfig = (id: OrderStatus) => STATUS_CONFIG.find(s => s.id === id)!;

    // Move order to new status
    const moveOrder = (orderId: string, newStatus: OrderStatus) => {
        setOrders(prev => prev.map(o => {
            if (o.id !== orderId) return o;
            if (o.status === newStatus) return o;

            // Business Logic: Chuyển sang COMPLETED hoặc FEEDBACK → đánh dấu unpaid
            let unpaid = o.unpaid;
            if (newStatus === 'COMPLETED' || newStatus === 'FEEDBACK') unpaid = true;

            return { ...o, status: newStatus, unpaid };
        }));
    };

    // Advance status (button click)
    const advanceStatus = (orderId: string) => {
        const order = orders.find(o => o.id === orderId);
        if (!order) return;
        const cfg = getStatusConfig(order.status);
        if (cfg.next) {
            moveOrder(orderId, cfg.next);
        }
    };

    // Add service during order
    const addService = (svc: typeof QUICK_SERVICES[0]) => {
        if (!selectedOrderId) return;
        const newItem: ServiceItem = {
            id: `added-${Date.now()}`,
            name: svc.name,
            ktv: selectedOrder?.services[0]?.ktv ?? '—',
            room: selectedOrder?.services[0]?.room ?? '—',
            duration: svc.duration,
            price: svc.price,
            addedDuring: true,
        };
        setOrders(prev => prev.map(o =>
            o.id === selectedOrderId
                ? { ...o, services: [...o.services, newItem], unpaid: true }
                : o
        ));
        setShowAddService(false);
    };

    // Save note
    const saveNote = () => {
        if (!selectedOrderId || !internalNote.trim()) return;
        setOrders(prev => prev.map(o =>
            o.id === selectedOrderId ? { ...o, note: internalNote } : o
        ));
        setInternalNote('');
    };

    // ── Render ───────────────────────────────────────────────────────────────
    return (
        <AppLayout>
            <div className="h-[calc(100vh-3rem)] flex flex-col overflow-hidden">

                {/* Header */}
                <div className="flex items-center justify-between gap-3 shrink-0 mb-4">
                    <div>
                        <h1 className="text-xl font-bold text-gray-900 tracking-tight">Quản Lý Đơn Đang Phục Vụ</h1>
                        <p className="text-xs text-gray-500 mt-0.5">
                            <span className="text-indigo-600 font-semibold">{orders.length} đơn đang theo dõi</span>
                            {' · '}
                            <span className="text-emerald-600">{orders.filter(o => o.status === 'FEEDBACK').length} chờ phản hồi</span>
                        </p>
                    </div>
                    <div className="relative">
                        <CalendarIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="date" value={selectedDate}
                            onChange={e => setSelectedDate(e.target.value)}
                            className="pl-9 pr-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white font-medium cursor-pointer"
                        />
                    </div>
                </div>

                {/* Kanban Main Area (Side-by-side Columns) */}
                <div className="flex-1 flex gap-4 overflow-x-auto pb-6 no-scrollbar min-h-0">
                    {STATUS_CONFIG.map(column => {
                        const columnOrders = orders.filter(o => o.status === column.id);
                        return (
                            <div
                                key={column.id}
                                className={`flex-1 min-w-[300px] max-w-[360px] flex flex-col bg-gray-50/40 rounded-[2rem] border-2 border-transparent transition-all duration-300 ${draggedOrderId ? 'bg-indigo-50/30 border-dashed border-indigo-200 shadow-inner' : 'hover:bg-gray-100/50'}`}
                                onDragOver={e => e.preventDefault()}
                                onDrop={() => draggedOrderId && moveOrder(draggedOrderId, column.id)}
                            >
                                {/* Column Header */}
                                <div className="p-5 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-3.5 h-3.5 rounded-full ${column.dot} shadow-lg shadow-indigo-200`} />
                                        <h2 className="text-sm font-black text-gray-800 uppercase tracking-widest leading-none">{column.shortLabel}</h2>
                                        <span className="bg-white border text-gray-400 px-2.5 py-0.5 rounded-full text-[10px] font-black shadow-sm">
                                            {columnOrders.length}
                                        </span>
                                    </div>
                                    <div className={`w-1.5 h-1.5 rounded-full ${draggedOrderId ? 'animate-pulse bg-indigo-400' : 'bg-gray-200'}`} />
                                </div>

                                {/* Order Cards (Vertical List in Column) */}
                                <div className="flex-1 overflow-y-auto space-y-4 px-3 pb-4 custom-scrollbar">
                                    <AnimatePresence mode="popLayout">
                                        {columnOrders.map(order => {
                                            const cfg = getStatusConfig(order.status);
                                            const total = order.services.reduce((sum, s) => sum + s.price, 0);
                                            const isSelected = selectedOrderId === order.id;

                                            return (
                                                <motion.div
                                                    key={order.id}
                                                    layout
                                                    initial={{ opacity: 0, scale: 0.9 }}
                                                    animate={{ opacity: 1, scale: 1 }}
                                                    exit={{ opacity: 0, scale: 0.9 }}
                                                    draggable
                                                    onDragStart={() => setDraggedOrderId(order.id)}
                                                    onDragEnd={() => setDraggedOrderId(null)}
                                                    onClick={() => { setSelectedOrderId(isSelected ? null : order.id); setInternalNote(order.note ?? ''); }}
                                                    className={`bg-white rounded-[1.5rem] border-2 cursor-grab active:cursor-grabbing transition-all shadow-sm hover:shadow-2xl hover:translate-y-[-4px] ${isSelected ? 'border-primary ring-4 ring-primary/5' : 'border-white hover:border-indigo-100'}`}
                                                >
                                                    <div className="p-4">
                                                        <div className="flex items-center justify-between mb-4">
                                                            <span className="text-[10px] font-black text-gray-400 bg-gray-50 px-2 py-0.5 rounded-lg tracking-wider">{order.id}</span>
                                                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400">
                                                                <Clock size={11} className="text-indigo-400" /> {order.startedAt}
                                                            </div>
                                                        </div>

                                                        <div className="flex items-start justify-between mb-4">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-primary rounded-2xl flex items-center justify-center text-white font-black text-sm shadow-xl shadow-indigo-100 shrink-0">
                                                                    {order.customerName.charAt(0)}
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <p className="font-black text-sm text-gray-900 leading-none mb-1 truncate">{order.customerName}</p>
                                                                    {order.unpaid && (
                                                                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-rose-50 text-rose-600 border border-rose-100 flex items-center gap-1 w-fit">
                                                                            <AlertCircle size={9} /> Chưa TT
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <p className="text-sm font-black text-gray-900 shrink-0">{formatVND(total)}</p>
                                                        </div>

                                                        {/* Mini Service List */}
                                                        <div className="bg-gray-50/50 rounded-xl p-3 space-y-2 mb-4">
                                                            {order.services.slice(0, 2).map(s => (
                                                                <div key={s.id} className="flex items-center justify-between text-[11px]">
                                                                    <span className="text-gray-500 font-bold truncate pr-2">{s.name}</span>
                                                                    <span className="text-[9px] font-black text-indigo-600 bg-white px-1.5 py-0.5 rounded-lg shadow-sm border border-indigo-50 shrink-0">{s.room}</span>
                                                                </div>
                                                            ))}
                                                            {order.services.length > 2 && (
                                                                <p className="text-[9px] text-gray-400 font-black italic">+ {order.services.length - 2} dịch vụ</p>
                                                            )}
                                                        </div>

                                                        {/* Footer Actions */}
                                                        <div className="flex items-center gap-2">
                                                            {cfg.next && (
                                                                <button
                                                                    onClick={e => { e.stopPropagation(); advanceStatus(order.id); }}
                                                                    className={`flex-1 py-2.5 rounded-xl text-[11px] font-black transition-all flex items-center justify-center gap-2 shadow-lg ${cfg.activeBg} text-white hover:opacity-90 active:scale-95`}
                                                                >
                                                                    {cfg.nextLabel}
                                                                </button>
                                                            )}
                                                            <button
                                                                onClick={e => { e.stopPropagation(); setSelectedOrderId(isSelected ? null : order.id); setInternalNote(order.note ?? ''); }}
                                                                className="px-3 py-2.5 rounded-xl text-[11px] font-black text-gray-400 bg-gray-50 hover:bg-gray-100 transition-all"
                                                            >
                                                                Chi tiết
                                                            </button>
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            );
                                        })}
                                    </AnimatePresence>

                                    {columnOrders.length === 0 && (
                                        <div className="h-32 flex flex-col items-center justify-center text-gray-300 gap-3 border-4 border-dashed border-gray-100 rounded-[2rem] bg-gray-50/50">
                                            <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-sm">
                                                <CheckCircle2 size={16} className="opacity-20" />
                                            </div>
                                            <p className="text-[10px] font-black uppercase tracking-widest">Trống</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}

                    {/* Placeholder to keep layout stable when detail panel is open */}
                    <AnimatePresence>
                        {selectedOrder && (
                            <div className={`${SLIDE_OVER_WIDTH} shrink-0 hidden lg:block`} />
                        )}
                    </AnimatePresence>
                </div>

                    {/* Detail Slide-Over Panel */}
                    <AnimatePresence>
                        {selectedOrder && (
                                <motion.div
                                    initial={{ opacity: 0, x: 40 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 40 }}
                                    transition={{ duration: ANIMATION_DURATION }}
                                    className={`${SLIDE_OVER_WIDTH} fixed top-12 right-6 bottom-6 flex flex-col bg-white border-2 border-gray-200 rounded-2xl overflow-hidden shadow-2xl z-20`}
                                >
                                {/* Panel Header */}
                                <div className="p-4 border-b border-gray-100 flex items-start justify-between">
                                    <div>
                                        <div className="flex items-center gap-2 mb-0.5">
                                            <span className="text-xs font-black text-gray-500">{selectedOrder.id}</span>
                                            {selectedOrder.unpaid && (
                                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 border border-rose-200 flex items-center gap-0.5">
                                                    <AlertCircle size={9} /> Chưa Thanh Toán
                                                </span>
                                            )}
                                        </div>
                                        <p className="font-bold text-gray-900">{selectedOrder.customerName}</p>
                                        {selectedOrder.phone && (
                                            <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                                                <Phone size={10} /> {selectedOrder.phone}
                                            </p>
                                        )}
                                    </div>
                                    <button onClick={() => setSelectedOrderId(null)} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400">
                                        <X size={16} />
                                    </button>
                                </div>

                                {/* Status Switcher */}
                                <div className="px-4 py-3 border-b border-gray-100">
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Trạng Thái</p>
                                    <div className="flex gap-1.5 flex-wrap">
                                        {STATUS_CONFIG.map(cfg => {
                                            const isActive = selectedOrder.status === cfg.id;
                                            return (
                                                <button
                                                    key={cfg.id}
                                                    onClick={() => setOrders(prev => prev.map(o =>
                                                        o.id === selectedOrderId ? { ...o, status: cfg.id } : o
                                                    ))}
                                                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border-2 transition-all ${isActive
                                                        ? `${cfg.activeBg} text-white border-transparent`
                                                        : `border-gray-200 text-gray-500 hover:border-gray-300`
                                                        }`}
                                                >
                                                    {cfg.shortLabel}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Services List */}
                                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Dịch Vụ</p>
                                        {selectedOrder.status !== 'FEEDBACK' && (
                                            <button
                                                onClick={() => setShowAddService(true)}
                                                className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded-lg transition-colors"
                                            >
                                                <Plus size={10} strokeWidth={3} /> Thêm DV
                                            </button>
                                        )}
                                    </div>

                                    {selectedOrder.services.map(s => (
                                        <div key={s.id} className={`p-3 rounded-xl border ${s.addedDuring ? 'border-orange-200 bg-orange-50' : 'border-gray-100 bg-gray-50'}`}>
                                            {s.addedDuring && (
                                                <span className="text-[9px] font-black text-orange-600 uppercase tracking-wider mb-1 flex items-center gap-0.5">
                                                    <Plus size={8} /> Thêm trong quá trình
                                                </span>
                                            )}
                                            <p className="font-bold text-sm text-gray-900">{s.name}</p>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="text-[10px] text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded font-semibold">{s.ktv}</span>
                                                <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded font-semibold">{s.room}</span>
                                                <span className="text-[10px] text-gray-500">{s.duration}p</span>
                                                <span className="ml-auto font-black text-sm text-gray-900">{formatVND(s.price)}</span>
                                            </div>
                                        </div>
                                    ))}

                                    {/* Total */}
                                    <div className="flex items-center justify-between py-2 border-t-2 border-gray-200">
                                        <span className="font-bold text-sm text-gray-700">Tổng Bill</span>
                                        <span className="font-black text-lg text-gray-900">
                                            {formatVND(selectedOrder.services.reduce((sum, s) => sum + s.price, 0))}
                                        </span>
                                    </div>

                                    {/* Note */}
                                    {selectedOrder.note && (
                                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
                                            📝 {selectedOrder.note}
                                        </div>
                                    )}

                                    {/* Add Note */}
                                    <div className="space-y-1.5">
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Thêm Ghi Chú Nội Bộ</p>
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                value={internalNote}
                                                onChange={e => setInternalNote(e.target.value)}
                                                onKeyDown={e => e.key === 'Enter' && saveNote()}
                                                placeholder="Ghi chú cho đơn này..."
                                                className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-400 outline-none"
                                            />
                                            <button onClick={saveNote} className="px-3 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700">
                                                Lưu
                                            </button>
                                        </div>
                                    </div>

                                    {/* Action Footer */}
                                    {selectedOrder.status === 'COMPLETED' && (
                                        <button
                                            onClick={() => advanceStatus(selectedOrder.id)}
                                            className="w-full py-3 rounded-xl font-bold text-sm bg-blue-600 text-white hover:bg-blue-700 flex items-center justify-center gap-2 transition-colors"
                                        >
                                            ⭐ Gọi Đánh Giá & Nhận xét
                                        </button>
                                    )}
                                    {selectedOrder.status !== 'FEEDBACK' && getStatusConfig(selectedOrder.status).next && selectedOrder.status !== 'COMPLETED' && (
                                        <button
                                            onClick={() => advanceStatus(selectedOrder.id)}
                                            className={`w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors ${getStatusConfig(selectedOrder.status).activeBg} text-white hover:opacity-90`}
                                        >
                                            {getStatusConfig(selectedOrder.status).nextLabel} <ArrowRight size={16} />
                                        </button>
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

            {/* Add Service Modal */}
            <AnimatePresence>
                {showAddService && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-black/30 z-40 backdrop-blur-sm"
                            onClick={() => setShowAddService(false)}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.96, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.96, y: 20 }}
                            transition={{ duration: 0.2 }}
                            className="fixed inset-0 flex items-center justify-center z-50 p-4"
                        >
                            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                                <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                                    <div>
                                        <h3 className="font-bold text-gray-900">Thêm Dịch Vụ</h3>
                                        <p className="text-xs text-gray-500 mt-0.5">Cho đơn {selectedOrderId} — {selectedOrder?.customerName}</p>
                                    </div>
                                    <button onClick={() => setShowAddService(false)} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400">
                                        <X size={16} />
                                    </button>
                                </div>
                                <div className="p-4 grid grid-cols-2 gap-2 max-h-80 overflow-y-auto">
                                    {QUICK_SERVICES.map(svc => (
                                        <button
                                            key={svc.name}
                                            onClick={() => addService(svc)}
                                            className="p-3 border-2 border-gray-200 rounded-xl text-left hover:border-indigo-400 hover:bg-indigo-50 transition-all"
                                        >
                                            <p className="font-bold text-sm text-gray-900">{svc.name}</p>
                                            <div className="flex items-center justify-between mt-1">
                                                <span className="text-[10px] text-gray-400">{svc.duration} phút</span>
                                                <span className="text-xs font-black text-indigo-600">{formatVND(svc.price)}</span>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </AppLayout>
    );
}

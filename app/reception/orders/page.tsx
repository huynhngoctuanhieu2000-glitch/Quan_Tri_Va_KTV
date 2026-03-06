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

type OrderStatus = 'IN_PROGRESS' | 'COMPLETED' | 'FEEDBACK' | 'DONE';

const STATUS_CONFIG = [
    { id: 'IN_PROGRESS' as OrderStatus, label: 'Đang Thực Hiện', shortLabel: 'Đang làm', color: 'text-indigo-600', bg: 'bg-indigo-50', activeBg: 'bg-indigo-600', border: 'border-indigo-200', dot: 'bg-indigo-500', next: 'COMPLETED' as OrderStatus, nextLabel: '✅ Hoàn Tất Dịch Vụ' },
    { id: 'COMPLETED' as OrderStatus, label: 'Hoàn Tất DV', shortLabel: 'Hoàn tất', color: 'text-amber-600', bg: 'bg-amber-50', activeBg: 'bg-amber-500', border: 'border-amber-200', dot: 'bg-amber-500', next: 'FEEDBACK' as OrderStatus, nextLabel: '⭐ Gọi Đánh Giá' },
    { id: 'FEEDBACK' as OrderStatus, label: 'Chờ Thanh Toán', shortLabel: 'Chờ TT', color: 'text-blue-600', bg: 'bg-blue-50', activeBg: 'bg-blue-600', border: 'border-blue-200', dot: 'bg-blue-500', next: 'DONE' as OrderStatus, nextLabel: '💳 Xác Nhận TT' },
    { id: 'DONE' as OrderStatus, label: 'Hoàn Tất', shortLabel: 'Xong', color: 'text-emerald-600', bg: 'bg-emerald-50', activeBg: 'bg-emerald-600', border: 'border-emerald-200', dot: 'bg-emerald-500', next: null, nextLabel: null },
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
        startedAt: '13:05', status: 'IN_PROGRESS', unpaid: false,
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
    {
        id: 'ORD-1019', customerName: 'Khách Lẻ', phone: '',
        startedAt: '11:02', status: 'DONE', unpaid: false,
        services: [
            { id: 's6', name: 'Massage Chân 45p', ktv: 'Lê KTV', room: 'T-1', duration: 45, price: 200000 },
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
    const [activeTab, setActiveTab] = useState<OrderStatus | 'ALL'>('ALL');
    const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
    const [showAddService, setShowAddService] = useState(false);
    const [internalNote, setInternalNote] = useState('');

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

    // Filter orders by tab
    const filteredOrders = activeTab === 'ALL'
        ? orders
        : orders.filter(o => o.status === activeTab);

    // Groups for display
    const getStatusConfig = (id: OrderStatus) => STATUS_CONFIG.find(s => s.id === id)!;

    // Advance status
    const advanceStatus = (orderId: string) => {
        setOrders(prev => prev.map(o => {
            if (o.id !== orderId) return o;
            const cfg = getStatusConfig(o.status);
            if (!cfg.next) return o;
            // Khi chuyển sang FEEDBACK → đánh dấu unpaid
            const unpaid = cfg.next === 'FEEDBACK' ? true : cfg.next === 'DONE' ? false : o.unpaid;
            return { ...o, status: cfg.next, unpaid };
        }));
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
                            <span className="text-indigo-600 font-semibold">{orders.filter(o => o.status !== 'DONE').length} đang hoạt động</span>
                            {' · '}
                            <span className="text-emerald-600">{orders.filter(o => o.status === 'DONE').length} hoàn tất hôm nay</span>
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

                {/* Status Tabs */}
                <div className="flex gap-1.5 shrink-0 mb-4 bg-gray-100 p-1 rounded-xl w-fit">
                    <button
                        onClick={() => setActiveTab('ALL')}
                        className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'ALL' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Tất Cả <span className="ml-1 text-gray-400">{orders.length}</span>
                    </button>
                    {STATUS_CONFIG.map(cfg => {
                        const count = orders.filter(o => o.status === cfg.id).length;
                        const isActive = activeTab === cfg.id;
                        return (
                            <button
                                key={cfg.id}
                                onClick={() => setActiveTab(cfg.id)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${isActive ? `${cfg.activeBg} text-white shadow` : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-white/70' : cfg.dot}`} />
                                {cfg.shortLabel}
                                <span className={`text-[10px] ${isActive ? 'text-white/70' : 'text-gray-400'}`}>{count}</span>
                            </button>
                        );
                    })}
                </div>

                {/* Main Area */}
                <div className="flex-1 flex gap-5 overflow-hidden min-h-0">

                    {/* Order List */}
                    <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                        <AnimatePresence>
                            {filteredOrders.map(order => {
                                const cfg = getStatusConfig(order.status);
                                const total = order.services.reduce((sum, s) => sum + s.price, 0);
                                const isSelected = selectedOrderId === order.id;

                                return (
                                    <motion.div
                                        key={order.id}
                                        layout
                                        initial={{ opacity: 0, y: 8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -8 }}
                                        onClick={() => { setSelectedOrderId(isSelected ? null : order.id); setInternalNote(order.note ?? ''); }}
                                        className={`bg-white rounded-2xl border-2 cursor-pointer transition-all shadow-sm hover:shadow-md ${isSelected ? 'border-indigo-400 shadow-indigo-100' : 'border-gray-200'}`}
                                    >
                                        <div className="p-4">
                                            {/* Row 1: ID + Status + Flags */}
                                            <div className="flex items-center justify-between mb-2.5">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] font-black text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{order.id}</span>
                                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color} border ${cfg.border}`}>
                                                        <span className={`inline-block w-1.5 h-1.5 rounded-full ${cfg.dot} mr-1 align-middle`} />
                                                        {cfg.shortLabel}
                                                    </span>
                                                    {order.unpaid && (
                                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 border border-rose-200 flex items-center gap-0.5">
                                                            <AlertCircle size={9} /> Chưa TT
                                                        </span>
                                                    )}
                                                </div>
                                                <span className="text-[10px] text-gray-400 flex items-center gap-1 font-medium">
                                                    <Clock size={10} /> {order.startedAt}
                                                </span>
                                            </div>

                                            {/* Row 2: Customer + Phone */}
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-7 h-7 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 font-black text-xs shrink-0">
                                                        {order.customerName.charAt(0)}
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-sm text-gray-900">{order.customerName}</p>
                                                        {order.phone && <p className="text-[10px] text-gray-400 flex items-center gap-0.5"><Phone size={9} />{order.phone}</p>}
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-sm font-black text-gray-900">{formatVND(total)}</p>
                                                    <p className="text-[10px] text-gray-400">{order.services.length} dịch vụ</p>
                                                </div>
                                            </div>

                                            {/* Services mini list */}
                                            <div className="mt-3 space-y-1">
                                                {order.services.map(s => (
                                                    <div key={s.id} className="flex items-center justify-between text-[11px]">
                                                        <span className={`flex items-center gap-1 ${s.addedDuring ? 'text-orange-600 font-bold' : 'text-gray-600'}`}>
                                                            {s.addedDuring && <Plus size={9} className="text-orange-500" />}
                                                            {s.name}
                                                        </span>
                                                        <span className="flex items-center gap-1.5 text-gray-400">
                                                            <span className="bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded font-semibold">{s.ktv.split(' ')[0]}</span>
                                                            <span className="bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-semibold">{s.room}</span>
                                                            <span className="font-semibold text-gray-500">{formatVND(s.price)}</span>
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>

                                            {/* Quick Status Buttons */}
                                            <div className="mt-3 flex items-center gap-2 border-t border-gray-100 pt-3">
                                                {cfg.next && (
                                                    <button
                                                        onClick={e => { e.stopPropagation(); advanceStatus(order.id); }}
                                                        className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold transition-all flex items-center justify-center gap-1 ${cfg.activeBg} text-white hover:opacity-90`}
                                                    >
                                                        {cfg.nextLabel}
                                                    </button>
                                                )}
                                                {order.status === 'DONE' && (
                                                    <div className="flex-1 py-1.5 rounded-lg text-[11px] font-bold text-center text-emerald-600 bg-emerald-50 flex items-center justify-center gap-1">
                                                        <CheckCircle2 size={12} /> Đã Hoàn Tất
                                                    </div>
                                                )}
                                                <button
                                                    onClick={e => { e.stopPropagation(); setSelectedOrderId(isSelected ? null : order.id); setInternalNote(order.note ?? ''); }}
                                                    className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors flex items-center gap-1"
                                                >
                                                    Chi tiết <ChevronRight size={11} />
                                                </button>
                                            </div>
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </AnimatePresence>

                        {filteredOrders.length === 0 && (
                            <div className="h-40 flex flex-col items-center justify-center text-gray-400 gap-2">
                                <CheckCircle2 size={32} className="text-emerald-300" />
                                <p className="text-sm font-medium">Không có đơn nào</p>
                            </div>
                        )}
                    </div>

                    {/* Detail Slide-Over Panel */}
                    <AnimatePresence>
                        {selectedOrder && (
                            <motion.div
                                initial={{ opacity: 0, x: 40 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 40 }}
                                transition={{ duration: ANIMATION_DURATION }}
                                className={`${SLIDE_OVER_WIDTH} shrink-0 flex flex-col bg-white border-2 border-gray-200 rounded-2xl overflow-hidden shadow-lg`}
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
                                        {selectedOrder.status !== 'DONE' && (
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
                                    {selectedOrder.status === 'FEEDBACK' && (
                                        <button
                                            onClick={() => advanceStatus(selectedOrder.id)}
                                            className="w-full py-3 rounded-xl font-bold text-sm bg-blue-600 text-white hover:bg-blue-700 flex items-center justify-center gap-2 transition-colors"
                                        >
                                            <Banknote size={16} /> Xác Nhận Thanh Toán
                                        </button>
                                    )}
                                    {selectedOrder.status !== 'DONE' && getStatusConfig(selectedOrder.status).next && selectedOrder.status !== 'FEEDBACK' && (
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

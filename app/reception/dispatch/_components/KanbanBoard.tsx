'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, Clock, AlertCircle, ArrowRight, QrCode } from 'lucide-react';
import { PendingOrder } from '../types';

type OrderStatus = 'PREPARING' | 'IN_PROGRESS' | 'COMPLETED' | 'DONE';

const STATUS_CONFIG = [
    { id: 'PREPARING' as OrderStatus, dispatchModeId: ['dispatched'], label: 'Chuẩn bị', shortLabel: 'Chuẩn bị', color: 'text-orange-600', bg: 'bg-orange-50', activeBg: 'bg-orange-600', border: 'border-orange-200', dot: 'bg-orange-500', next: 'IN_PROGRESS' as OrderStatus, nextLabel: '▶️ Bắt đầu làm' },
    { id: 'IN_PROGRESS' as OrderStatus, dispatchModeId: ['in_progress'], label: 'Đang Tiến Hành', shortLabel: 'Đang làm', color: 'text-indigo-600', bg: 'bg-indigo-50', activeBg: 'bg-indigo-600', border: 'border-indigo-200', dot: 'bg-indigo-500', next: 'COMPLETED' as OrderStatus, nextLabel: '🧹 Dọn & Nhận xét' },
    { id: 'COMPLETED' as OrderStatus, dispatchModeId: ['cleaning', 'waiting_rating'], label: 'Đang Dọn & Nhận Xét', shortLabel: 'Dọn & Nhận xét', color: 'text-purple-600', bg: 'bg-purple-50', activeBg: 'bg-purple-600', border: 'border-purple-200', dot: 'bg-purple-500', next: 'DONE' as OrderStatus, nextLabel: '✅ Đã dọn xong' },
    { id: 'DONE' as OrderStatus, dispatchModeId: ['done'], label: 'Hoàn Tất Dịch Vụ', shortLabel: 'Hoàn tất', color: 'text-emerald-600', bg: 'bg-emerald-50', activeBg: 'bg-emerald-600', border: 'border-emerald-200', dot: 'bg-emerald-500', next: null, nextLabel: null },
];

const formatVND = (n: number) => new Intl.NumberFormat('vi-VN').format(n) + 'đ';

const formatToHourMinute = (isoString?: string | null) => {
    if (!isoString) return '--:--';
    
    // Nếu truyền vào định dạng HH:mm (ví dụ "17:40") thì trả về luôn
    if (/^\d{1,2}:\d{2}$/.test(isoString)) return isoString;

    let parseString = isoString;
    // Fix timezone: Supabase trả về timestamp không có múi giờ (UTC),
    // thêm 'Z' vào cuối để trình duyệt hiểu đúng là múi giờ UTC và parse thành Local (+7)
    if (!isoString.endsWith('Z') && !isoString.includes('+')) {
        parseString = isoString.replace(' ', 'T') + 'Z';
    }

    const d = new Date(parseString);
    if (isNaN(d.getTime())) return isoString;
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

interface KanbanBoardProps {
    orders: PendingOrder[];
    onUpdateStatus: (orderId: string, status: string, bypassConfirm?: boolean) => void;
    onOpenDetail: (orderId: string) => void;
    onConfirmAddonPayment?: (orderId: string) => void;
    selectedOrderId: string | null;
    onContextMenu?: (e: React.MouseEvent | React.TouchEvent, orderId: string) => void;
}

const getEstimatedEndTime = (order: PendingOrder) => {
    let maxTime = '';
    
    // Nếu có timeEnd sẵn từ DB thì format thẳng
    if (order.timeEnd) {
        return formatToHourMinute(order.timeEnd);
    }

    if (!order.services) return null;

    for (const svc of order.services) {
        if (!svc.staffList) continue;
        for (const staff of svc.staffList) {
            if (!staff.segments) continue;
            for (const seg of staff.segments) {
                // seg.endTime thường ở định dạng "HH:mm"
                if (seg.endTime && seg.endTime > maxTime && seg.endTime !== '--:--') {
                    maxTime = seg.endTime;
                }
            }
        }
    }
    return maxTime || order.time; // Fallback về thời gian tạo đơn nếu chưa có dữ liệu điều phối
};
export function KanbanBoard({ orders, onUpdateStatus, onOpenDetail, onConfirmAddonPayment, selectedOrderId, onContextMenu }: KanbanBoardProps) {
    const [draggedOrderId, setDraggedOrderId] = useState<string | null>(null);
    const longPressTimer = React.useRef<NodeJS.Timeout | null>(null);

    // 🚀 Auto-Finisher (Backup for KTV's device)
    // Runs on the Receptionist's dashboard to ensure orders complete when time is up.
    React.useEffect(() => {
        const checkAutoFinish = () => {
            const now = new Date();
            
            orders.forEach(order => {
                if (order.dispatchStatus === 'in_progress') {
                    const estEndStr = getEstimatedEndTime(order);
                    if (estEndStr && estEndStr !== '--:--') {
                        const [h, m] = estEndStr.split(':').map(Number);
                        const estEnd = new Date();
                        estEnd.setHours(h, m, 0, 0);
                        
                        // Handle midnight crossing
                        if (h > 20 && now.getHours() < 4) {
                             estEnd.setDate(estEnd.getDate() - 1);
                        }
                        
                        // Allow 5 seconds grace period
                        if (now.getTime() >= estEnd.getTime() + 5000) {
                             console.log(`🤖 [Kanban AutoFinish] Time is up for order ${order.id} (${estEndStr}). Moving to COMPLETED...`);
                             onUpdateStatus(order.id, 'COMPLETED', true);
                        }
                    }
                }
            });
        };

        const interval = setInterval(checkAutoFinish, 30000);
        return () => clearInterval(interval);
    }, [orders, onUpdateStatus]);

    const getStatusConfig = (id: string) => STATUS_CONFIG.find(s => s.id === id) || STATUS_CONFIG[0];

    const advanceStatus = (orderId: string) => {
        const order = orders.find(o => o.id === orderId);
        if (!order) return;
        const cfg = getStatusConfig(order.rawStatus || 'PREPARING');
        if (cfg.next) {
            onUpdateStatus(orderId, cfg.next);
        }
    };

    return (
        <div className="flex-1 flex gap-4 overflow-x-auto pb-6 no-scrollbar min-h-0">
            {STATUS_CONFIG.map(column => {
                const columnOrders = orders.filter(o => column.dispatchModeId.includes(o.dispatchStatus));
                return (
                    <div
                        key={column.id}
                        className={`flex-1 min-w-[300px] max-w-[360px] flex flex-col bg-gray-50/40 rounded-[2rem] border-2 border-transparent transition-all duration-300 ${draggedOrderId ? 'bg-indigo-50/30 border-dashed border-indigo-200 shadow-inner' : 'hover:bg-gray-100/50'}`}
                        onDragOver={e => e.preventDefault()}
                        onDrop={() => draggedOrderId && onUpdateStatus(draggedOrderId, column.id)}
                    >
                        {/* Column Header */}
                        <div className="p-5 flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-3">
                                <div className={`w-3.5 h-3.5 rounded-full ${column.dot} shadow-lg shadow-indigo-200`} />
                                <h2 className="text-sm font-black text-gray-800 uppercase tracking-widest leading-none">{column.shortLabel}</h2>
                                <span className="bg-white border text-gray-400 px-2.5 py-0.5 rounded-full text-[10px] font-black shadow-sm">
                                    {columnOrders.length}
                                </span>
                            </div>
                        </div>

                        {/* Order Cards */}
                        <div className="flex-1 overflow-y-auto space-y-4 px-3 pb-4 custom-scrollbar">
                            <AnimatePresence mode="popLayout">
                                {columnOrders.map(order => {
                                    const cfg = getStatusConfig(order.rawStatus || 'PREPARING');
                                    // Use cfg from dispatchStatus mapping to display the correct next button if rawStatus varies slightly
                                    const currentCfg = STATUS_CONFIG.find(c => c.dispatchModeId.includes(order.dispatchStatus)) || cfg;
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
                                            onClick={() => onOpenDetail(order.id)}
                                            onContextMenu={(e: React.MouseEvent) => {
                                                if (onContextMenu) {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    onContextMenu(e, order.id);
                                                }
                                            }}
                                            onTouchStart={(e) => {
                                                if (!onContextMenu) return;
                                                const touch = e.touches[0];
                                                longPressTimer.current = setTimeout(() => {
                                                    if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
                                                        window.navigator.vibrate(50);
                                                    }
                                                    onContextMenu(e, order.id);
                                                }, 500);
                                            }}
                                            onTouchMove={() => {
                                                if (longPressTimer.current) clearTimeout(longPressTimer.current);
                                            }}
                                            onTouchEnd={() => {
                                                if (longPressTimer.current) clearTimeout(longPressTimer.current);
                                            }}
                                            style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
                                            className={`bg-white rounded-[1.5rem] border-2 cursor-grab active:cursor-grabbing transition-all shadow-sm hover:shadow-2xl hover:translate-y-[-4px] ${isSelected ? 'border-indigo-500 ring-4 ring-indigo-500/10' : 'border-white hover:border-indigo-100'}`}
                                        >
                                            <div className="p-4">
                                                <div className="flex items-center justify-between mb-4">
                                                    <span className="text-[10px] font-black text-gray-400 bg-gray-50 px-2 py-0.5 rounded-lg tracking-wider">{order.billCode}</span>
                                                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400">
                                                        <Clock size={11} className="text-indigo-400" /> ra ca {getEstimatedEndTime(order)}
                                                    </div>
                                                </div>

                                                <div className="flex items-start justify-between mb-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-2xl flex items-center justify-center text-white font-black text-sm shadow-xl shadow-indigo-100 shrink-0">
                                                            {order.customerName.charAt(0)}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="font-black text-sm text-gray-900 leading-none mb-1 truncate">{order.customerName}</p>
                                                            <div className="flex flex-col gap-1 items-start">
                                                                {(!order.paymentMethod || order.paymentMethod === 'Unpaid') && (
                                                                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-rose-50 text-rose-600 border border-rose-100 flex items-center gap-1 w-fit">
                                                                        <AlertCircle size={9} /> Chưa TT
                                                                    </span>
                                                                )}
                                                                {(() => {
                                                                    const unpaidAmount = order.services.reduce((acc, svc) => acc + (svc.options?.isPaid === false ? ((svc.price || 0) * (svc.quantity || 1)) : 0), 0);
                                                                    if (unpaidAmount > 0) {
                                                                        return (
                                                                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-600 border border-orange-100 flex items-center gap-1 w-fit">
                                                                                Phát sinh chưa thu: {formatVND(unpaidAmount)}
                                                                            </span>
                                                                        );
                                                                    }
                                                                    return null;
                                                                })()}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <p className="text-sm font-black text-gray-900 shrink-0">{formatVND(order.totalAmount || 0)}</p>
                                                </div>

                                                <div className="bg-gray-50/50 rounded-xl p-3 space-y-2 mb-4">
                                                    {order.services.slice(0, 2).map(s => (
                                                        <div key={s.id} className="flex items-center justify-between text-[11px]">
                                                            <span className="text-gray-500 font-bold truncate pr-2">{s.serviceName}</span>
                                                            <span className="text-[9px] font-black text-indigo-600 bg-white px-1.5 py-0.5 rounded-lg shadow-sm border border-indigo-50 shrink-0">{s.selectedRoomId || '—'}</span>
                                                        </div>
                                                    ))}
                                                    {order.services.length > 2 && (
                                                        <p className="text-[9px] text-gray-400 font-black italic">+ {order.services.length - 2} dịch vụ</p>
                                                    )}
                                                </div>

                                                {(order.timeStart || order.timeEnd) && (
                                                    <div className="flex items-center justify-between bg-indigo-50/50 rounded-xl px-4 py-2 mb-4 border border-indigo-100/50">
                                                        <div className="flex flex-col">
                                                            <span className="text-[9px] text-indigo-400 font-bold uppercase tracking-wider mb-0.5">Bắt đầu</span>
                                                            <span className="text-xs font-black text-indigo-700">{formatToHourMinute(order.timeStart)}</span>
                                                        </div>
                                                        <div className="text-indigo-300">
                                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                                                        </div>
                                                        <div className="flex flex-col text-right">
                                                            <span className="text-[9px] text-indigo-400 font-bold uppercase tracking-wider mb-0.5">Kết thúc</span>
                                                            <span className="text-xs font-black text-indigo-700">{formatToHourMinute(order.timeEnd)}</span>
                                                        </div>
                                                    </div>
                                                )}

                                                <div className="flex items-center gap-2">
                                                    {(() => {
                                                        const unpaidAmount = order.services.reduce((acc, svc) => acc + (svc.options?.isPaid === false ? ((svc.price || 0) * (svc.quantity || 1)) : 0), 0);
                                                        if (unpaidAmount > 0 && onConfirmAddonPayment) {
                                                            return (
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); onConfirmAddonPayment(order.id); }}
                                                                    className="flex-1 py-2.5 rounded-xl text-[11px] font-black transition-all flex items-center justify-center gap-2 shadow-sm bg-orange-500 text-white hover:bg-orange-600 active:scale-95"
                                                                >
                                                                    Đã thu {formatVND(unpaidAmount)}
                                                                </button>
                                                            );
                                                        }
                                                        if (currentCfg.next) {
                                                            return (
                                                                <button
                                                                    onClick={e => { e.stopPropagation(); onUpdateStatus(order.id, currentCfg.next); }}
                                                                    className={`flex-1 py-2.5 rounded-xl text-[11px] font-black transition-all flex items-center justify-center gap-2 shadow-sm ${currentCfg.activeBg || 'bg-indigo-600'} text-white hover:opacity-90 active:scale-95`}
                                                                >
                                                                    {currentCfg.nextLabel}
                                                                </button>
                                                            );
                                                        }
                                                        return null;
                                                    })()}
                                                    <button
                                                        onClick={e => { e.stopPropagation(); onOpenDetail(order.id); }}
                                                        className="px-3 py-2.5 rounded-xl text-[11px] font-black text-gray-400 bg-gray-50 hover:bg-gray-100 transition-all border border-gray-100"
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
        </div>
    );
}

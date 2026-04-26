'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, Clock, AlertCircle, ArrowRight, QrCode } from 'lucide-react';
import { PendingOrder, ServiceBlock } from '../types';

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
    onUpdateStatus: (orderId: string, newStatus: string, itemIds?: string[]) => void;
    onOpenDetail: (orderId: string) => void;
    onConfirmAddonPayment?: (orderId: string) => void;
    selectedOrderId: string | null;
    onContextMenu?: (e: React.MouseEvent, orderId: string) => void;
}

interface SubOrder {
    id: string; // bookingId_ktvSignature
    bookingId: string;
    originalOrder: PendingOrder;
    services: ServiceBlock[];
    dispatchStatus: string;
    ktvSignature: string;
}

const getEstimatedEndTime = (order: PendingOrder, servicesToCheck: ServiceBlock[] = order.services) => {
    let maxDate: Date | null = null;
    
    // Nếu có timeEnd tổng từ DB thì format thẳng (nếu check toàn order)
    if (order.timeEnd && servicesToCheck === order.services) {
        return formatToHourMinute(order.timeEnd);
    }

    if (!servicesToCheck || servicesToCheck.length === 0) return null;

    const parseHHMM = (timeStr: string) => {
        const [h, m] = timeStr.split(':').map(Number);
        const d = new Date();
        d.setHours(h, m, 0, 0);
        return d;
    };

    for (const svc of servicesToCheck) {
        if (svc.timeEnd) {
            let tEnd = svc.timeEnd;
            if (!tEnd.endsWith('Z') && !tEnd.includes('+')) {
                tEnd = tEnd.replace(' ', 'T') + 'Z';
            }
            const d = new Date(tEnd);
            if (!isNaN(d.getTime())) {
                if (!maxDate || d > maxDate) maxDate = d;
            }
        }
        
        if (!svc.staffList) continue;
        for (const staff of svc.staffList) {
            if (!staff.segments) continue;
            for (const seg of staff.segments) {
                if (seg.endTime && seg.endTime !== '--:--') {
                    const d = parseHHMM(seg.endTime);
                    if (!maxDate || d > maxDate) maxDate = d;
                }
            }
        }
    }

    if (maxDate) {
        return `${String(maxDate.getHours()).padStart(2, '0')}:${String(maxDate.getMinutes()).padStart(2, '0')}`;
    }

    return order.time; 
};

export function KanbanBoard({ orders, onUpdateStatus, onOpenDetail, onConfirmAddonPayment, selectedOrderId, onContextMenu }: KanbanBoardProps) {
    const [draggedSubOrderId, setDraggedSubOrderId] = useState<string | null>(null);
    const longPressTimer = React.useRef<NodeJS.Timeout | null>(null);

    const subOrders = React.useMemo(() => {
        const result: SubOrder[] = [];
        orders.forEach(order => {
            // Group services by assigned KTV
            const ktvGroups = new Map<string, ServiceBlock[]>();
            
            order.services.forEach(svc => {
                // Lọc bỏ 'Phòng riêng' vì đây là option
                if (svc.serviceName?.toLowerCase().includes('phòng riêng') || svc.serviceName?.toLowerCase().includes('phong rieng')) {
                    return;
                }
                
                const ktvSignature = svc.staffList.map(r => r.ktvId).filter(Boolean).join(',') || 'unassigned';
                if (!ktvGroups.has(ktvSignature)) {
                    ktvGroups.set(ktvSignature, []);
                }
                ktvGroups.get(ktvSignature)!.push(svc);
            });

            ktvGroups.forEach((services, ktvSignature) => {
                const statuses = services.map(s => s.status || 'NEW');
                let dispatchStatus = 'pending'; // Default to pending
                if (statuses.includes('in_progress') || statuses.includes('IN_PROGRESS')) dispatchStatus = 'in_progress';
                else if (statuses.includes('cleaning') || statuses.includes('waiting_rating') || statuses.includes('COMPLETED')) dispatchStatus = 'cleaning';
                else if (statuses.includes('done') || statuses.includes('DONE') || statuses.includes('CANCELLED')) dispatchStatus = 'done';
                else if (statuses.includes('dispatched') || statuses.includes('PREPARING')) dispatchStatus = 'dispatched';
                
                // Only fallback to order status if we couldn't infer from items AND order has a global status
                if (dispatchStatus === 'pending' && order.dispatchStatus !== 'pending') {
                    // But if item is explicitly NEW, it should NOT inherit a higher status from the order
                    if (!statuses.includes('NEW')) {
                        dispatchStatus = order.dispatchStatus;
                    }
                }

                result.push({
                    id: `${order.id}_${ktvSignature}`,
                    bookingId: order.id,
                    originalOrder: order,
                    services,
                    dispatchStatus,
                    ktvSignature
                });
            });
        });
        return result;
    }, [orders]);

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
                             onUpdateStatus(order.id, 'COMPLETED');
                        }
                    }
                }
            });
        };

        const interval = setInterval(checkAutoFinish, 30000);
        return () => clearInterval(interval);
    }, [orders, onUpdateStatus]);

    const getStatusConfig = (id: string) => STATUS_CONFIG.find(s => s.id === id) || STATUS_CONFIG[0];

    return (
        <div className="flex-1 flex gap-4 overflow-x-auto pb-6 no-scrollbar min-h-0">
            {STATUS_CONFIG.map(column => {
                const columnSubOrders = subOrders.filter(so => column.dispatchModeId.includes(so.dispatchStatus));
                return (
                    <div
                        key={column.id}
                        className={`flex-1 min-w-[300px] max-w-[360px] flex flex-col bg-gray-50/40 rounded-[2rem] border-2 border-transparent transition-all duration-300 ${draggedSubOrderId ? 'bg-indigo-50/30 border-dashed border-indigo-200 shadow-inner' : 'hover:bg-gray-100/50'}`}
                        onDragOver={e => e.preventDefault()}
                        onDrop={() => {
                            if (draggedSubOrderId) {
                                const draggedSubOrder = subOrders.find(so => so.id === draggedSubOrderId);
                                if (draggedSubOrder) {
                                    const itemIds = draggedSubOrder.services.map(s => s.id);
                                    let newStatus = column.id;
                                    // if column is 'COMPLETED', use 'COMPLETED'
                                    onUpdateStatus(draggedSubOrder.bookingId, newStatus, itemIds);
                                }
                                setDraggedSubOrderId(null);
                            }
                        }}
                    >
                        {/* Column Header */}
                        <div className="p-5 flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-3">
                                <div className={`w-3.5 h-3.5 rounded-full ${column.dot} shadow-lg shadow-indigo-200`} />
                                <h2 className="text-sm font-black text-gray-800 uppercase tracking-widest leading-none">{column.shortLabel}</h2>
                                <span className="bg-white border text-gray-400 px-2.5 py-0.5 rounded-full text-[10px] font-black shadow-sm">
                                    {columnSubOrders.length}
                                </span>
                            </div>
                        </div>

                        {/* Order Cards */}
                        <div className="flex-1 overflow-y-auto space-y-4 px-3 pb-4 custom-scrollbar">
                            <AnimatePresence mode="popLayout">
                                {columnSubOrders.map((subOrder: any) => {
                                    const { originalOrder: order, services } = subOrder;
                                    const cfg = getStatusConfig(subOrder.dispatchStatus || 'PREPARING');
                                    const currentCfg = STATUS_CONFIG.find(c => c.dispatchModeId.includes(subOrder.dispatchStatus)) || cfg;
                                    const isSelected = selectedOrderId === subOrder.bookingId;

                                    return (
                                        <motion.div
                                            key={subOrder.id}
                                            layout
                                            initial={{ opacity: 0, scale: 0.9 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            exit={{ opacity: 0, scale: 0.9 }}
                                            draggable
                                            onDragStart={() => setDraggedSubOrderId(subOrder.id)}
                                            onDragEnd={() => setDraggedSubOrderId(null)}
                                            onClick={() => onOpenDetail(subOrder.bookingId)}
                                            onContextMenu={(e: React.MouseEvent) => {
                                                if (onContextMenu) {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    onContextMenu(e, subOrder.bookingId);
                                                }
                                            }}
                                            onTouchStart={(e) => {
                                                if (!onContextMenu) return;
                                                const touch = e.touches[0];
                                                longPressTimer.current = setTimeout(() => {
                                                    if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
                                                        window.navigator.vibrate(50);
                                                    }
                                            onContextMenu(e as any, subOrder.bookingId);
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
                                                    <span className="text-[10px] font-black text-gray-400 bg-gray-50 px-2 py-0.5 rounded-lg tracking-wider">
                                                        {order.billCode} {services.length < order.services.length && '(Tách)'}
                                                    </span>
                                                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400">
                                                        <Clock size={11} className="text-indigo-400" /> ra ca {getEstimatedEndTime(order, services)}
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
                                                                    const unpaidAmount = order.services.reduce((acc: number, svc: any) => acc + (svc.options?.isPaid === false ? ((svc.price || 0) * (svc.quantity || 1)) : 0), 0);
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

                                                <div className="bg-gray-50/50 rounded-xl p-3 space-y-3 mb-4">
                                                    {services.map((s: any) => (
                                                        <div key={s.id} className="flex flex-col gap-1.5">
                                                            <div className="flex items-center justify-between text-[11px]">
                                                                <span className="text-gray-700 font-black truncate pr-2">{s.serviceName}</span>
                                                                <span className="text-[9px] font-black text-indigo-600 bg-white px-1.5 py-0.5 rounded-lg shadow-sm border border-indigo-50 shrink-0">P.{s.selectedRoomId || '—'}</span>
                                                            </div>
                                                            
                                                            {/* Danh sách KTV */}
                                                            {s.staffList && s.staffList.length > 0 && (
                                                                <div className="flex flex-wrap gap-1">
                                                                    {s.staffList.map((st: any, idx: number) => (
                                                                        <span key={idx} className="text-[9px] font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-md">
                                                                            👤 {st.ktvName || 'Chưa gán'}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            )}

                                                            {/* Luôn hiển thị thời gian Bắt đầu -> Kết thúc để dễ theo dõi */}
                                                            <div className="flex items-center justify-between bg-indigo-50/70 rounded-lg px-2.5 py-1.5 border border-indigo-100/50 mt-1">
                                                                <div className="flex flex-col">
                                                                    <span className="text-[8px] text-indigo-400 font-bold uppercase tracking-wider mb-0.5">Bắt đầu</span>
                                                                    <span className="text-[10px] font-black text-indigo-700">{formatToHourMinute(s.timeStart)}</span>
                                                                </div>
                                                                <div className="text-indigo-300">
                                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                                                                </div>
                                                                <div className="flex flex-col text-right">
                                                                    <span className="text-[8px] text-indigo-400 font-bold uppercase tracking-wider mb-0.5">Kết thúc</span>
                                                                    {(() => {
                                                                        const calcServiceEndTime = (startTimeStr: string | null | undefined, durationMins: number) => {
                                                                            if (!startTimeStr) return null;
                                                                            const startHHmm = formatToHourMinute(startTimeStr);
                                                                            if (startHHmm === '--:--') return null;
                                                                            const [h, m] = startHHmm.split(':').map(Number);
                                                                            const d = new Date();
                                                                            d.setHours(h, m + (durationMins || 0), 0, 0);
                                                                            return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                                                                        };
                                                                        const displayTimeEnd = s.timeEnd ? formatToHourMinute(s.timeEnd) : (s.timeStart ? calcServiceEndTime(s.timeStart, s.duration) : '--:--');
                                                                        return <span className="text-[10px] font-black text-indigo-700">{displayTimeEnd || '--:--'}</span>;
                                                                    })()}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    {(() => {
                                                        const unpaidAmount = services.reduce((acc: number, svc: any) => acc + (svc.options?.isPaid === false ? ((svc.price || 0) * (svc.quantity || 1)) : 0), 0);
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
                                                                    onClick={e => { 
                                                                        e.stopPropagation(); 
                                                                        const itemIds = services.map((s: any) => s.id);
                                                                        onUpdateStatus(order.id, currentCfg.next!, itemIds); 
                                                                    }}
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

                            {columnSubOrders.length === 0 && (
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

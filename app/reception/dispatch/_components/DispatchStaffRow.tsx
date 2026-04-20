'use client';

import React from 'react';
import { Trash2, Star, AlertCircle, CheckCircle2, ChevronDown, Plus, Printer, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { StaffData, TurnQueueData, WorkSegment } from '../types';
import { DispatchSegmentRow } from './DispatchSegmentRow';

interface StaffAssignment {
    id: string;
    ktvId: string;
    ktvName: string;
    segments: WorkSegment[];
    noteForKtv: string;
}

interface Bed {
    id: string;
    roomId: string;
}

interface Room {
    id: string;
    name: string;
    type: string;
}

interface DispatchStaffRowProps {
    row: StaffAssignment;
    svcId: string;
    orderId: string;
    serviceName: string;
    svcDuration: number;
    availableTurns: (TurnQueueData & { staff?: StaffData })[];
    rooms: Room[];
    beds: Bed[];
    busyBedIds?: string[];
    usedKtvIds?: string[];
    onUpdate: (orderId: string, svcId: string, rowId: string, patch: Partial<StaffAssignment>) => void;
    onRemove: (orderId: string, svcId: string, rowId: string) => void;
    canRemove: boolean;
    // Print ticket props
    serviceDescription?: string;
    strength?: string;
    adminNote?: string;
    customerNote?: string;
    selectedDate?: string;
    focus?: string;
    avoid?: string;
    realSvcId?: string;
}

const SERVICE_TO_SKILL: Record<string, string> = {
    'Gội đầu': 'shampoo',
    'Massage Thái': 'thaiBody',
    'Massage Dầu': 'oilBody',
    'Đá Nóng': 'hotStoneBody',
    'Massage Body': 'thaiBody',
    'Foot Dầu': 'oilFoot',
    'Ráy tai': 'earCleaning',
    'Chăm sóc da': 'facial',
    'Massage Chân': 'oilFoot',
};

const genId = () => Math.random().toString(36).substring(2, 9);

const calcEndTime = (start: string, duration: number): string => {
    if (!start || duration == null) return '';
    const [h, m] = start.split(':').map(Number);
    const end = new Date();
    end.setHours(h, m + Math.floor(duration), Math.floor((duration % 1) * 60), 0);
    return `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;
};

export const DispatchStaffRow = ({
    row, svcId, orderId, serviceName, svcDuration, availableTurns, rooms, beds, busyBedIds = [], usedKtvIds = [], onUpdate, onRemove, canRemove,
    serviceDescription, strength, adminNote, customerNote, selectedDate, focus, avoid, realSvcId
}: DispatchStaffRowProps) => {

    const targetSkill = Object.keys(SERVICE_TO_SKILL).find(k => serviceName.toLowerCase().includes(k.toLowerCase()))
        ? SERVICE_TO_SKILL[Object.keys(SERVICE_TO_SKILL).find(k => serviceName.toLowerCase().includes(k.toLowerCase()))!]
        : null;

    const [now, setNow] = React.useState(new Date());
    const [showTicketPreview, setShowTicketPreview] = React.useState(false);

    React.useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 30000); // Update every 30s
        return () => clearInterval(timer);
    }, []);

    const handleChange = (patch: Partial<StaffAssignment>) => {
        onUpdate(orderId, svcId, row.id, { ...row, ...patch });
    };

    // 🖨️ Show KTV Turn Ticket Preview
    const handlePrintTicket = () => {
        setShowTicketPreview(true);
    };

    const dateFormatted = selectedDate 
        ? new Date(selectedDate + 'T00:00:00').toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
        : new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });

    const ticketNoteText = row.noteForKtv || adminNote || '';

    const addSegment = () => {
        const lastSegment = row.segments[row.segments.length - 1];
        const startTime = lastSegment ? lastSegment.endTime : '08:00';
        
        const currentTotalMins = row.segments.reduce((sum, seg) => sum + (Number(seg.duration) || 0), 0);
        let duration = svcDuration - currentTotalMins;
        if (duration <= 0) duration = Math.min(15, svcDuration || 15); // Hỗ trợ test 1 phút
        
        const newSegment: WorkSegment = {
            id: genId(),
            roomId: null,
            bedId: null,
            startTime,
            duration,
            endTime: calcEndTime(startTime, duration)
        };
        handleChange({ segments: [...row.segments, newSegment] });
    };

    const updateSegment = (idx: number, patch: Partial<WorkSegment>) => {
        const newSegments = [...row.segments];
        newSegments[idx] = { ...newSegments[idx], ...patch };
        
        // Tự động nối giờ cho các chặng phía sau nếu giờ kết thúc chặng này thay đổi
        if (patch.endTime) {
            for (let i = idx + 1; i < newSegments.length; i++) {
                const prev = newSegments[i-1];
                newSegments[i] = { 
                    ...newSegments[i], 
                    startTime: prev.endTime,
                    endTime: calcEndTime(prev.endTime, newSegments[i].duration)
                };
            }
        }
        
        handleChange({ segments: newSegments });
    };

    const removeSegment = (idx: number) => {
        const newSegments = row.segments.filter((_, i) => i !== idx);
        handleChange({ segments: newSegments });
    };

    return (
        <>
        <div className="p-4 bg-white rounded-3xl border border-gray-100 shadow-sm space-y-5">
            <div className="flex flex-col gap-4">
                {/* KTV Header Selection */}
                <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 relative">
                        <select
                            value={row.ktvId}
                            onChange={e => {
                                const selected = availableTurns.find(t => t.employee_id === e.target.value);
                                handleChange({ ktvId: e.target.value, ktvName: selected?.staff?.full_name || '' });
                            }}
                            className="w-full pl-4 pr-10 py-3 border-2 border-gray-50 rounded-2xl text-sm font-black focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none bg-gray-50/30 transition-all appearance-none active:scale-[0.99]"
                        >
                            <option value="">— Chọn Nhân viên —</option>
                            {availableTurns.filter(t => t.status !== 'off').map((turn) => {
                                const hasSkill = targetSkill ? (turn.staff?.skills?.[targetSkill] === 'expert' || turn.staff?.skills?.[targetSkill] === 'basic') : true;
                                const isExpert = targetSkill && turn.staff?.skills?.[targetSkill] === 'expert';
                                const isUsedInOtherSvc = usedKtvIds.includes(turn.employee_id);
                                
                                return (
                                    <option 
                                        key={turn.employee_id} 
                                        value={turn.employee_id} 
                                        disabled={isUsedInOtherSvc}
                                        className={isUsedInOtherSvc ? 'text-gray-300' : (!hasSkill ? 'text-gray-300' : '')}
                                    >
                                        #{turn.queue_position} [{turn.employee_id}] {turn.staff?.full_name}
                                        {isExpert ? ' (⭐)' : ''}
                                        {isUsedInOtherSvc ? ' (🚫 Đã gán DV khác)' : (turn.status === 'working' ? ` (⌛ Đang làm đến ${turn.estimated_end_time || '--:--'})` : ' (✅ Sẵn sàng)')}
                                    </option>
                                );
                            })}
                        </select>
                        <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" />
                    </div>

                    {/* 🖨️ Print Ticket Button — only show when KTV is selected */}
                    {row.ktvId && (
                        <button
                            onClick={handlePrintTicket}
                            className="p-2.5 bg-indigo-50 text-indigo-500 hover:bg-indigo-100 border border-indigo-100 rounded-xl transition-all active:scale-90"
                            title="In phiếu tua KTV"
                        >
                            <Printer size={15} strokeWidth={2.5} />
                        </button>
                    )}

                    {canRemove && (
                        <button
                            onClick={() => onRemove(orderId, svcId, row.id)}
                            className="p-3 bg-rose-50 text-rose-500 hover:bg-rose-100 border border-rose-100 rounded-2xl transition-all active:scale-90"
                        >
                            <Trash2 size={18} strokeWidth={2.5} />
                        </button>
                    )}
                </div>

                {/* Skill Badge */}
                {row.ktvId && (
                    <div className="px-1">
                        {availableTurns.find(t => t.employee_id === row.ktvId)?.staff?.skills?.[targetSkill || ''] === 'expert' ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-600 rounded-full text-[9px] font-black border border-amber-100 uppercase tracking-tighter">
                                <Star size={10} className="fill-amber-500" /> Chuyên gia
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[9px] font-black border border-emerald-100 uppercase tracking-tighter">
                                <CheckCircle2 size={10} /> Đạt yêu cầu
                            </span>
                        )}
                    </div>
                )}

                {/* Segments Area */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between px-1">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Lộ trình làm việc</p>
                        <button
                            onClick={addSegment}
                            className="text-[9px] font-black text-indigo-600 uppercase tracking-widest bg-indigo-50 px-2 py-1 rounded-lg hover:bg-indigo-100 transition-colors flex items-center gap-1"
                        >
                            <Plus size={12} strokeWidth={3} /> Thêm Phòng
                        </button>
                    </div>

                    <div className="space-y-3">
                        {row.segments.map((seg, idx) => (
                            <DispatchSegmentRow
                                key={seg.id}
                                segment={seg}
                                segmentIndex={idx}
                                rooms={rooms}
                                beds={beds}
                                busyBedIds={busyBedIds}
                                realSvcId={realSvcId}
                                onUpdate={(patch) => updateSegment(idx, patch)}
                                onRemove={() => removeSegment(idx)}
                                canRemove={row.segments.length > 1}
                            />
                        ))}
                    </div>
                </div>
            </div>

            {/* Note Input */}
            <div className="relative pt-1 border-t border-gray-50 pt-3">
                <input
                    type="text"
                    value={row.noteForKtv}
                    onChange={e => handleChange({ noteForKtv: e.target.value })}
                    placeholder="Ghi chú riêng cho nhân viên này..."
                    className="w-full px-4 py-2 bg-indigo-50/30 border border-indigo-100 rounded-xl text-[11px] font-black text-indigo-700 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-300 transition-all"
                />
            </div>
        </div>

            {/* 🖨️ Ticket Preview Modal */}
            <AnimatePresence>
                {showTicketPreview && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" onClick={() => setShowTicketPreview(false)}>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/60 backdrop-blur-md"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 30 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 30 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 250 }}
                            onClick={(e: React.MouseEvent) => e.stopPropagation()}
                            className="relative bg-white rounded-3xl shadow-2xl w-full max-w-[400px] max-h-[90vh] overflow-y-auto"
                        >
                            {/* Close button */}
                            <button
                                onClick={() => setShowTicketPreview(false)}
                                className="absolute top-4 right-4 z-10 p-2 bg-white/80 hover:bg-white rounded-full shadow-lg border border-gray-200 transition-all active:scale-90"
                            >
                                <X size={18} className="text-gray-500" />
                            </button>

                            {/* Ticket Header */}
                            <div className="bg-slate-900 text-white px-6 py-5 flex justify-between items-center rounded-t-3xl">
                                <div className="text-4xl font-black italic tracking-tight">{row.ktvId}</div>
                                <div className="text-right">
                                    <div className="text-[11px] font-bold tracking-wider opacity-70">Phiếu Tua KTV</div>
                                    <div className="text-base font-black mt-0.5">{dateFormatted}</div>
                                </div>
                            </div>

                            {/* Ticket Content */}
                            <div className="px-5 py-5 space-y-4">
                                {/* Service Name */}
                                <div>
                                    <div className="text-2xl font-black text-red-600 uppercase leading-tight">
                                        {serviceName} ({svcDuration}&apos;)
                                    </div>
                                    {serviceDescription && (
                                        <p className="text-sm text-gray-500 font-semibold mt-1">{serviceDescription}</p>
                                    )}
                                </div>

                                {/* Segments */}
                                {row.segments.map((seg, idx) => {
                                    const roomName = rooms.find(r => r.id === seg.roomId)?.name || seg.roomId || '—';
                                    return (
                                        <div key={seg.id} className="space-y-3">
                                            {row.segments.length > 1 && (
                                                <p className="text-[11px] font-black text-indigo-600 uppercase tracking-widest text-center">
                                                    Chặng {idx + 1}
                                                </p>
                                            )}
                                            {/* Time */}
                                            <div className="border-[2.5px] border-dashed border-amber-400 rounded-2xl px-4 py-4 text-center">
                                                <p className="text-[10px] font-black text-amber-800 uppercase tracking-[3px] mb-2">Thời gian thực hiện</p>
                                                <p className="text-[32px] font-black text-red-600 leading-none tracking-tight">
                                                    {seg.startTime || '--:--'} <span className="text-red-400">→</span> {seg.endTime || '--:--'}
                                                </p>
                                            </div>
                                            {/* Room */}
                                            <div className="bg-slate-100 rounded-xl px-4 py-3 border-l-4 border-slate-500">
                                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Phòng</p>
                                                <p className="text-xl font-black text-red-600 mt-0.5">{roomName}</p>
                                            </div>
                                        </div>
                                    );
                                })}

                                {/* Customer Requirements */}
                                {(strength || focus || avoid || customerNote) && (
                                    <div className="space-y-2.5">
                                        <div className="inline-block bg-slate-800 text-white text-[10px] font-black px-3 py-1.5 rounded-lg uppercase tracking-wider">
                                            🔴 Yêu cầu khách hàng
                                        </div>
                                        <div className="space-y-2">
                                            {strength && (
                                                <div className="bg-amber-50 border-[1.5px] border-amber-400 rounded-xl px-4 py-2.5 text-sm font-black text-amber-800">
                                                    💪 Lực: {strength}
                                                </div>
                                            )}
                                            {focus && (
                                                <div className="bg-emerald-50 border-[1.5px] border-emerald-400 rounded-xl px-4 py-2.5 text-sm font-black text-emerald-800">
                                                    🎯 Tập trung: {focus}
                                                </div>
                                            )}
                                            {avoid && (
                                                <div className="bg-rose-50 border-[1.5px] border-rose-400 rounded-xl px-4 py-2.5 text-sm font-black text-rose-800">
                                                    🚫 Tránh: {avoid}
                                                </div>
                                            )}
                                            {customerNote && (
                                                <div className="bg-yellow-50 border-[1.5px] border-yellow-400 rounded-xl px-4 py-2.5 text-xs font-bold text-yellow-800 italic">
                                                    📌 {customerNote}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Admin Note */}
                                {ticketNoteText && (
                                    <div className="space-y-2.5">
                                        <div className="inline-block bg-slate-800 text-white text-[10px] font-black px-3 py-1.5 rounded-lg uppercase tracking-wider">
                                            📝 Admin dặn dò
                                        </div>
                                        <div className="bg-green-50 border-2 border-green-500 rounded-xl px-4 py-3.5 text-sm font-black text-green-900 uppercase">
                                            &quot;{ticketNoteText}&quot;
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Footer */}
                            <div className="text-center py-4 border-t border-gray-200 mt-2">
                                <p className="text-xs text-gray-400 font-semibold italic">Hệ thống Spa Ngân Hà</p>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </>
    );
};

'use client';

import React from 'react';
import { Trash2, Star, Clock, AlertCircle, CheckCircle2, ChevronDown } from 'lucide-react';
import { StaffData, TurnQueueData } from '../types';

interface StaffAssignment {
    id: string;
    ktvId: string;
    ktvName: string;
    startTime: string;
    duration: number;
    endTime: string;
    noteForKtv: string;
}

interface DispatchStaffRowProps {
    row: StaffAssignment;
    svcId: string;
    orderId: string;
    serviceName: string;
    availableTurns: (TurnQueueData & { staff?: StaffData })[];
    onUpdate: (orderId: string, svcId: string, rowId: string, patch: Partial<StaffAssignment>) => void;
    onRemove: (orderId: string, svcId: string, rowId: string) => void;
    canRemove: boolean;
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

const calcEndTime = (start: string, duration: number): string => {
    if (!start || !duration) return '';
    const [h, m] = start.split(':').map(Number);
    const end = new Date();
    end.setHours(h, m + duration, 0, 0);
    return `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;
};

export const DispatchStaffRow = ({
    row, svcId, orderId, serviceName, availableTurns, onUpdate, onRemove, canRemove
}: DispatchStaffRowProps) => {

    const targetSkill = Object.keys(SERVICE_TO_SKILL).find(k => serviceName.toLowerCase().includes(k.toLowerCase()))
        ? SERVICE_TO_SKILL[Object.keys(SERVICE_TO_SKILL).find(k => serviceName.toLowerCase().includes(k.toLowerCase()))!]
        : null;

    const [now, setNow] = React.useState(new Date());

    React.useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 30000); // Update every 30s
        return () => clearInterval(timer);
    }, []);

    const handleChange = (patch: Partial<StaffAssignment>) => {
        const merged = { ...row, ...patch };
        if (patch.startTime !== undefined || patch.duration !== undefined) {
            merged.endTime = calcEndTime(merged.startTime, merged.duration);
        }
        onUpdate(orderId, svcId, row.id, merged);
    };

    return (
        <div className="p-4 bg-white rounded-2xl border border-gray-100 shadow-sm space-y-4">
            <div className="flex flex-col gap-4">
                {/* KTV Selector */}
                <div className="w-full">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2 px-1">Kỹ thuật viên</label>
                    <div className="relative">
                        <select
                            value={row.ktvId}
                            onChange={e => {
                                const selected = availableTurns.find(t => t.employee_id === e.target.value);
                                handleChange({ ktvId: e.target.value, ktvName: selected?.staff?.full_name || '' });
                            }}
                            className="w-full pl-4 pr-10 py-3 border-2 border-gray-50 rounded-2xl text-sm font-black focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none bg-gray-50/30 transition-all appearance-none active:scale-[0.99]"
                        >
                            <option value="">— Chọn KTV trong hàng đợi —</option>
                            {availableTurns.map(turn => {
                                const hasSkill = targetSkill ? (turn.staff?.skills?.[targetSkill] === 'expert' || turn.staff?.skills?.[targetSkill] === 'basic') : true;
                                const isExpert = targetSkill && turn.staff?.skills?.[targetSkill] === 'expert';
                                const isBusy = turn.status === 'working';

                                return (
                                    <option
                                        key={turn.employee_id}
                                        value={turn.employee_id}
                                        className={!hasSkill ? 'text-gray-300' : ''}
                                    >
                                        #{turn.queue_position} [{turn.employee_id}]
                                        {isExpert ? ' (⭐ Chuyên gia)' : ''}
                                        {(() => {
                                            if (turn.status !== 'working') return ' (✅ Rảnh)';
                                            
                                            // Check time reliably
                                            if (turn.estimated_end_time) {
                                                const [h, m] = turn.estimated_end_time.split(':').map(Number);
                                                const end = new Date();
                                                end.setHours(h, m, 0, 0);
                                                if (end < now) return ' (✅ Đã xong giờ)';
                                                return ` (⌛ Bận đến ${turn.estimated_end_time})`;
                                            }
                                            return ' (⌛ Đang làm)';
                                        })()}
                                        {turn.turns_completed > 0 ? ` [Tua: ${turn.turns_completed}]` : ''}
                                        {!hasSkill ? ' [Không đủ kỹ năng]' : ''}
                                    </option>
                                );
                            })}
                        </select>
                        <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" />
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                    {/* Start Time */}
                    <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block px-1 text-center">Bắt đầu</label>
                        <input
                            type="time"
                            value={row.startTime}
                            onChange={e => handleChange({ startTime: e.target.value })}
                            className="w-full px-2 py-3 border-2 border-gray-50 rounded-xl text-xs font-black focus:border-indigo-500 outline-none text-center bg-gray-50/30 transition-all"
                        />
                    </div>

                    {/* Duration */}
                    <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block px-1 text-center">Phút</label>
                        <input
                            type="number"
                            min={5} max={300} step={5}
                            value={row.duration}
                            onChange={e => handleChange({ duration: parseInt(e.target.value) || 60 })}
                            className="w-full px-2 py-3 border-2 border-gray-50 rounded-xl text-xs font-black text-center focus:border-indigo-500 outline-none bg-gray-50/30 transition-all"
                        />
                    </div>

                    {/* End Time */}
                    <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block px-1 text-center">Kết thúc</label>
                        <div className="w-full py-3 bg-emerald-50 border-2 border-emerald-100 rounded-xl text-xs font-black text-emerald-600 text-center shadow-inner">
                            {row.endTime || '--:--'}
                        </div>
                    </div>
                </div>

                {/* Actions Row */}
                <div className="flex items-center justify-between gap-3 pt-1">
                    {/* Visual Feedback for Skills */}
                    <div className="flex-1">
                        {row.ktvId && (
                            <div className="flex items-center">
                                {availableTurns.find(t => t.employee_id === row.ktvId)?.staff?.skills?.[targetSkill || ''] === 'expert' ? (
                                    <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-600 rounded-full text-[9px] font-black border border-amber-100 uppercase tracking-tighter">
                                        <Star size={10} className="fill-amber-500" /> Chuyên gia
                                    </div>
                                ) : availableTurns.find(t => t.employee_id === row.ktvId)?.staff?.skills?.[targetSkill || ''] === 'basic' ? (
                                    <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[9px] font-black border border-emerald-100 uppercase tracking-tighter">
                                        <CheckCircle2 size={10} className="text-emerald-500" /> Đạt yêu cầu
                                    </div>
                                ) : targetSkill && (
                                    <div className="flex items-center gap-1.5 px-3 py-1 bg-rose-50 text-rose-500 rounded-full text-[9px] font-black border border-rose-100 uppercase tracking-tighter">
                                        <AlertCircle size={10} className="text-rose-500" /> Thiếu kỹ năng
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    
                    {canRemove && (
                        <button
                            onClick={() => onRemove(orderId, svcId, row.id)}
                            className="p-2.5 bg-rose-50 text-rose-500 hover:bg-rose-100 hover:text-rose-600 border border-rose-100 rounded-2xl transition-all active:scale-90 shadow-sm"
                            title="Xóa KTV"
                        >
                            <Trash2 size={18} strokeWidth={2.5} />
                        </button>
                    )}
                </div>
            </div>

            {/* Note Input */}
            <div className="relative pt-1 border-t border-gray-50 pt-3">
                <input
                    type="text"
                    value={row.noteForKtv}
                    onChange={e => handleChange({ noteForKtv: e.target.value })}
                    placeholder="Ghi chú cho KTV (VD: Lực mạnh...)"
                    className="w-full px-4 py-2 bg-indigo-50/30 border border-indigo-100 rounded-xl text-[11px] font-black text-indigo-700 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-300 transition-all"
                />
            </div>
        </div>
    );
};

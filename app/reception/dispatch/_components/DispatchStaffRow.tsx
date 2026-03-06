'use client';

import React from 'react';
import { Trash2, Star, Clock, AlertCircle, CheckCircle2 } from 'lucide-react';
import { StaffData, TurnQueueData } from '../page'; // I'll export these types from page.tsx

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

// Map service names to DB skill keys
const SERVICE_TO_SKILL: Record<string, string> = {
    'Gội đầu': 'shampoo',
    'Massage Thái': 'thaiBody',
    'Massage Dầu': 'oilBody',
    'Đá Nóng': 'hotStoneBody',
    'Massage Body': 'thaiBody', // Default for body
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

    const handleChange = (patch: Partial<StaffAssignment>) => {
        const merged = { ...row, ...patch };
        if (patch.startTime !== undefined || patch.duration !== undefined) {
            merged.endTime = calcEndTime(merged.startTime, merged.duration);
        }
        onUpdate(orderId, svcId, row.id, merged);
    };

    return (
        <div className="p-3 bg-white rounded-xl border border-gray-100 shadow-sm space-y-3">
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
                {/* KTV Selector */}
                <div className="flex-1 w-full">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1.5">Kỹ thuật viên</label>
                    <div className="relative group">
                        <select
                            value={row.ktvId}
                            onChange={e => {
                                const selected = availableTurns.find(t => t.employee_id === e.target.value);
                                handleChange({ ktvId: e.target.value, ktvName: selected?.staff?.full_name || '' });
                            }}
                            className="w-full px-3 py-2 border-2 border-gray-100 rounded-xl text-sm font-bold focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-gray-50/50 transition-all appearance-none"
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
                                        #{turn.queue_position} {turn.staff?.full_name}
                                        {isExpert ? ' (⭐ Chuyên gia)' : ''}
                                        {isBusy ? ` (⌛ Bận đến ${turn.estimated_end_time || '?'})` : ` (✅ Rảnh)`}
                                        {turn.turns_completed > 0 ? ` [Tua: ${turn.turns_completed}]` : ''}
                                        {!hasSkill ? ' [Không đủ kỹ năng]' : ''}
                                    </option>
                                );
                            })}
                        </select>
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                            <Clock size={14} />
                        </div>
                    </div>
                </div>

                <div className="flex gap-2 w-full sm:w-auto">
                    {/* Start Time */}
                    <div className="flex-1 sm:w-24">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1.5">Bắt đầu</label>
                        <input
                            type="time"
                            value={row.startTime}
                            onChange={e => handleChange({ startTime: e.target.value })}
                            className="w-full px-2 py-2 border-2 border-gray-100 rounded-xl text-sm font-bold focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none text-center bg-gray-50/50"
                        />
                    </div>

                    {/* Duration */}
                    <div className="w-16">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1.5">Phút</label>
                        <input
                            type="number"
                            min={5} max={300} step={5}
                            value={row.duration}
                            onChange={e => handleChange({ duration: parseInt(e.target.value) || 60 })}
                            className="w-full px-2 py-2 border-2 border-gray-100 rounded-xl text-sm font-black text-center focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-gray-50/50"
                        />
                    </div>

                    {/* End Time */}
                    <div className="flex-1 sm:w-24">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1.5">Kết thúc</label>
                        <div className="w-full px-2 py-2 bg-emerald-50 border-2 border-emerald-100 rounded-xl text-sm font-black text-emerald-600 text-center shadow-inner">
                            {row.endTime || '--:--'}
                        </div>
                    </div>

                    {/* Remove */}
                    {canRemove && (
                        <div className="flex items-end pb-0.5">
                            <button
                                onClick={() => onRemove(orderId, svcId, row.id)}
                                className="p-2 text-gray-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Note & Suggestions */}
            <div className="flex items-center gap-3">
                <div className="flex-1 relative">
                    <input
                        type="text"
                        value={row.noteForKtv}
                        onChange={e => handleChange({ noteForKtv: e.target.value })}
                        placeholder="Ghi chú cho KTV (VD: Lực mạnh, massage kỹ vai...)"
                        className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-[11px] font-medium text-indigo-700 focus:ring-1 focus:ring-indigo-400 outline-none bg-indigo-50/30 placeholder:text-gray-400"
                    />
                </div>

                {/* Visual Feedback for Skills */}
                {row.ktvId && (
                    <div className="flex items-center gap-1.5 shrink-0">
                        {availableTurns.find(t => t.employee_id === row.ktvId)?.staff?.skills?.[targetSkill || ''] === 'expert' ? (
                            <div className="flex items-center gap-1 px-2 py-1 bg-amber-50 text-amber-600 rounded-lg text-[10px] font-black border border-amber-100">
                                <Star size={10} className="fill-amber-500" /> CHUYÊN GIA
                            </div>
                        ) : availableTurns.find(t => t.employee_id === row.ktvId)?.staff?.skills?.[targetSkill || ''] === 'basic' ? (
                            <div className="flex items-center gap-1 px-2 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-[10px] font-black border border-emerald-100">
                                <CheckCircle2 size={10} className="text-emerald-500" /> ĐẠT YÊU CẦU
                            </div>
                        ) : targetSkill && (
                            <div className="flex items-center gap-1 px-2 py-1 bg-rose-50 text-rose-500 rounded-lg text-[10px] font-black border border-rose-100">
                                <AlertCircle size={10} className="text-rose-500" /> THIẾU KỸ NĂNG
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

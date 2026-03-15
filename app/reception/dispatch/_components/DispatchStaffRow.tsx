'use client';

import React from 'react';
import { Trash2, Star, AlertCircle, CheckCircle2, ChevronDown, Plus } from 'lucide-react';
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
    availableTurns: (TurnQueueData & { staff?: StaffData })[];
    rooms: Room[];
    beds: Bed[];
    busyBedIds?: string[];
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

const genId = () => Math.random().toString(36).substring(2, 9);

const calcEndTime = (start: string, duration: number): string => {
    if (!start || !duration) return '';
    const [h, m] = start.split(':').map(Number);
    const end = new Date();
    end.setHours(h, m + duration, 0, 0);
    return `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;
};

export const DispatchStaffRow = ({
    row, svcId, orderId, serviceName, availableTurns, rooms, beds, busyBedIds = [], onUpdate, onRemove, canRemove
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
        onUpdate(orderId, svcId, row.id, { ...row, ...patch });
    };

    const addSegment = () => {
        const lastSegment = row.segments[row.segments.length - 1];
        const startTime = lastSegment ? lastSegment.endTime : '08:00';
        const duration = 30;
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
                            {availableTurns.map(turn => {
                                const hasSkill = targetSkill ? (turn.staff?.skills?.[targetSkill] === 'expert' || turn.staff?.skills?.[targetSkill] === 'basic') : true;
                                const isExpert = targetSkill && turn.staff?.skills?.[targetSkill] === 'expert';
                                
                                return (
                                    <option key={turn.employee_id} value={turn.employee_id} className={!hasSkill ? 'text-gray-300' : ''}>
                                        #{turn.check_in_order} [{turn.employee_id}] {turn.staff?.full_name}
                                        {isExpert ? ' (⭐)' : ''}
                                        {turn.status === 'working' ? ` (⌛ Bận đến ${turn.estimated_end_time})` : ' (✅ Rảnh)'}
                                    </option>
                                );
                            })}
                        </select>
                        <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" />
                    </div>

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
    );
};

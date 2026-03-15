'use client';

import React from 'react';
import { Trash2, Bed as BedIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { WorkSegment } from '../types';

interface Bed {
    id: string;
    roomId: string;
}

interface Room {
    id: string;
    name: string;
    type: string;
}

interface DispatchSegmentRowProps {
    segment: WorkSegment;
    segmentIndex: number;
    rooms: Room[];
    beds: Bed[];
    busyBedIds?: string[];
    onUpdate: (patch: Partial<WorkSegment>) => void;
    onRemove: () => void;
    canRemove: boolean;
}

const calcEndTime = (start: string, duration: number): string => {
    if (!start || !duration) return '';
    const [h, m] = start.split(':').map(Number);
    const end = new Date();
    end.setHours(h, m + duration, 0, 0);
    return `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;
};

export const DispatchSegmentRow = ({
    segment, segmentIndex, rooms, beds, busyBedIds = [], onUpdate, onRemove, canRemove
}: DispatchSegmentRowProps) => {

    const handleChange = (patch: Partial<WorkSegment>) => {
        const merged = { ...segment, ...patch };
        if (patch.startTime !== undefined || patch.duration !== undefined) {
            merged.endTime = calcEndTime(merged.startTime, merged.duration);
        }
        onUpdate(merged);
    };

    return (
        <div className="pl-4 border-l-2 border-indigo-100 ml-2 py-2 space-y-3">
            <div className="flex items-center justify-between">
                <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest bg-indigo-50 px-2 py-0.5 rounded-lg">
                    Chặng {segmentIndex + 1}
                </span>
                {canRemove && (
                    <button
                        onClick={onRemove}
                        className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                    >
                        <Trash2 size={14} />
                    </button>
                )}
            </div>

            {/* Room & Bed Selection */}
            <div className="space-y-3 p-3 bg-slate-50/50 rounded-2xl border border-slate-100/50">
                <div className="space-y-2.5">
                    <div className="flex flex-wrap gap-1.5">
                        {rooms.map(room => {
                            const rId = room.id || (room as any).room_id;
                            const hasBeds = beds.some(b => b.roomId === rId || (b as any).room_id === rId);
                            const isSelected = segment.roomId === rId;
                            return (
                                <button
                                    key={rId}
                                    onClick={() => handleChange({ roomId: isSelected ? null : rId, bedId: null })}
                                    disabled={!hasBeds}
                                    className={`px-3 py-2 rounded-xl border-2 text-[10px] font-black transition-all active:scale-95 ${isSelected
                                        ? 'border-indigo-600 bg-indigo-600 text-white shadow-md'
                                        : hasBeds
                                            ? 'border-white bg-white text-gray-600 hover:border-indigo-100 shadow-sm'
                                            : 'border-transparent bg-transparent text-gray-300 cursor-not-allowed opacity-50'
                                        }`}
                                >
                                    {room.name || (room as any).nameVN || rId}
                                </button>
                            );
                        })}
                    </div>

                    <AnimatePresence>
                        {segment.roomId && (
                            <motion.div 
                                initial={{ opacity: 0, height: 0 }} 
                                animate={{ opacity: 1, height: 'auto' }} 
                                exit={{ opacity: 0, height: 0 }}
                                className="flex flex-wrap gap-1.5 pt-1 border-t border-slate-200/50 mt-1"
                            >
                                {beds
                                    .filter(b => b.roomId === segment.roomId)
                                    .map(bed => {
                                        const isPicked = segment.bedId === bed.id;
                                        const isBusy = busyBedIds.includes(bed.id);
                                        
                                        return (
                                            <button
                                                key={bed.id}
                                                onClick={() => !isBusy && handleChange({ bedId: bed.id })}
                                                disabled={isBusy && !isPicked}
                                                className={`px-3 py-2 rounded-xl border-2 text-[10px] font-black transition-all flex items-center gap-1.5 active:scale-95 ${
                                                    isPicked
                                                        ? 'border-emerald-500 bg-emerald-500 text-white shadow-md'
                                                        : isBusy
                                                            ? 'border-transparent bg-gray-100 text-gray-300 cursor-not-allowed opacity-50'
                                                            : 'border-white bg-white text-gray-600 hover:border-emerald-100 shadow-sm'
                                                }`}
                                            >
                                                <BedIcon size={12} className={isBusy && !isPicked ? 'text-gray-200' : ''} />
                                                {bed.id.split('-').pop()}
                                            </button>
                                        );
                                    })}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
                {/* Start Time */}
                <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block px-1 text-center">Bắt đầu</label>
                    <input
                        type="time"
                        value={segment.startTime}
                        onChange={e => handleChange({ startTime: e.target.value })}
                        className="w-full px-2 py-2.5 border-2 border-gray-50 rounded-xl text-[11px] font-black focus:border-indigo-500 outline-none text-center bg-gray-50/30 transition-all"
                    />
                </div>

                {/* Duration */}
                <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block px-1 text-center">Phút</label>
                    <input
                        type="number"
                        min={5} max={300} step={5}
                        value={segment.duration}
                        onChange={e => handleChange({ duration: parseInt(e.target.value) || 30 })}
                        className="w-full px-2 py-2.5 border-2 border-gray-50 rounded-xl text-[11px] font-black text-center focus:border-indigo-500 outline-none bg-gray-50/30 transition-all"
                    />
                </div>

                {/* End Time */}
                <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block px-1 text-center">Kết thúc</label>
                    <div className="w-full py-2.5 bg-emerald-50 border-2 border-emerald-100 rounded-xl text-[11px] font-black text-emerald-600 text-center shadow-inner">
                        {segment.endTime || '--:--'}
                    </div>
                </div>
            </div>
        </div>
    );
};

'use client';

import React from 'react';
import { Plus, AlertTriangle, UserCheck, Bed as BedIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { DispatchStaffRow } from './DispatchStaffRow';
import { ServiceBlock, StaffAssignment, StaffData, TurnQueueData } from '../page';

interface Bed {
    id: string;
    roomId: string;
}

interface Room {
    id: string;
    name: string;
    type: string;
}

interface DispatchServiceBlockProps {
    svc: ServiceBlock;
    svcIndex: number;
    orderId: string;
    rooms: Room[];
    beds: Bed[];
    busyBedIds?: string[];
    availableTurns: (TurnQueueData & { staff?: StaffData })[];
    onUpdateSvc: (orderId: string, svcId: string, patch: Partial<ServiceBlock>) => void;
    onSelectRoom: (orderId: string, svcId: string, roomId: string) => void;
    onSelectBed: (orderId: string, svcId: string, bedId: string) => void;
    onUpdateStaff: (orderId: string, svcId: string, rowId: string, patch: Partial<StaffAssignment>) => void;
    onAddStaff: (orderId: string, svcId: string) => void;
    onRemoveStaff: (orderId: string, svcId: string, rowId: string) => void;
}

export const DispatchServiceBlock = ({
    svc, svcIndex, orderId, rooms, beds, busyBedIds = [], availableTurns,
    onUpdateSvc, onSelectRoom, onSelectBed, onUpdateStaff, onAddStaff, onRemoveStaff
}: DispatchServiceBlockProps) => {

    return (
        <div className="border border-gray-100 rounded-3xl overflow-hidden bg-white shadow-sm transition-all hover:shadow-md hover:border-indigo-100">
            {/* Service Header */}
            <div className="bg-gray-50/80 px-4 py-4 lg:px-6 flex items-center justify-between border-b border-gray-100 backdrop-blur-sm">
                <div className="flex items-center gap-3">
                    <span className="bg-indigo-600 text-white text-[10px] font-black px-3 py-1.5 rounded-xl uppercase tracking-widest shadow-lg shadow-indigo-100">
                        {svcIndex + 1}
                    </span>
                    <div className="flex flex-col">
                        <h3 className="font-black text-gray-900 text-base leading-tight">{svc.serviceName}</h3>
                        {svc.serviceDescription && (
                            <p className="text-[11px] text-gray-500 font-medium mt-1 line-clamp-2 max-w-[250px]">
                                {svc.serviceDescription}
                            </p>
                        )}
                    </div>
                    <span className="hidden sm:inline-block text-xs text-gray-400 font-bold bg-white px-2 py-1 rounded-lg border border-gray-100">{svc.duration}p</span>
                </div>
            </div>

            <div className="p-4 lg:p-6 space-y-6">
                {/* Customer Requirements */}
                {(svc.genderReq || svc.strength || svc.focus || svc.avoid || svc.customerNote) && (
                    <div className="bg-amber-50/50 border border-amber-100 rounded-2xl p-4 space-y-3 shadow-inner">
                        <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest flex items-center gap-2">
                            <AlertTriangle size={14} className="text-amber-500" /> Yêu Cầu Từ Khách
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {svc.genderReq && svc.genderReq !== 'Ngẫu nhiên' && (
                                <span className="px-3 py-1.5 rounded-xl text-[10px] font-black border bg-purple-50 text-purple-700 border-purple-100 flex items-center gap-1.5 shadow-sm">
                                    <UserCheck size={12} /> {svc.genderReq}
                                </span>
                            )}
                            {svc.strength && (
                                <span className="px-3 py-1.5 rounded-xl text-[10px] font-black border bg-orange-50 text-orange-700 border-orange-100 shadow-sm">
                                    💪 {svc.strength}
                                </span>
                            )}
                            {svc.focus && (
                                <span className="px-3 py-1.5 rounded-xl text-[10px] font-black border bg-emerald-50 text-emerald-700 border-emerald-100 shadow-sm">
                                    🎯 {svc.focus}
                                </span>
                            )}
                            {svc.avoid && (
                                <span className="px-3 py-1.5 rounded-xl text-[10px] font-black border bg-rose-50 text-rose-700 border-rose-100 shadow-sm">
                                    🚫 {svc.avoid}
                                </span>
                            )}
                        </div>
                        {svc.customerNote && (
                            <p className="text-xs text-amber-800 bg-white/60 p-3 rounded-xl font-bold italic border border-amber-100 line-clamp-2">
                                &quot;{svc.customerNote}&quot;
                            </p>
                        )}
                    </div>
                )}

                {/* RoomSelector */}
                <div className="space-y-4">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block px-1">
                        Vị trí thực hiện <span className="text-rose-500">*</span>
                    </label>
                    <div className="flex flex-col lg:flex-row gap-4 lg:items-start">
                        {/* Step 1: Chọn Phòng */}
                        <div className="flex-1 space-y-2.5">
                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest px-1 leading-none">Phòng</p>
                            <div className="flex flex-wrap gap-2">
                                {rooms.map(room => {
                                    const rId = room.id || (room as any).room_id;
                                    const hasBeds = beds.some(b => b.roomId === rId || (b as any).room_id === rId);
                                    const isSelected = svc.selectedRoomId === rId;
                                    return (
                                        <button
                                            key={rId}
                                            onClick={() => onSelectRoom(orderId, svc.id, rId)}
                                            disabled={!hasBeds}
                                            className={`px-4 py-3 rounded-2xl border-2 text-[11px] font-black transition-all active:scale-95 ${isSelected
                                                ? 'border-indigo-600 bg-indigo-600 text-white shadow-lg shadow-indigo-100'
                                                : hasBeds
                                                    ? 'border-gray-100 bg-gray-50/50 text-gray-600 hover:border-indigo-200'
                                                    : 'border-gray-50 bg-gray-50/30 text-gray-300 cursor-not-allowed'
                                                }`}
                                        >
                                            {room.name || (room as any).nameVN || rId}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Step 2: Chọn Giường */}
                        <div className="flex-1 space-y-2.5">
                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest px-1 leading-none">Giường</p>
                            {svc.selectedRoomId ? (
                                <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap gap-2">
                                    {beds
                                        .filter(b => b.roomId === svc.selectedRoomId)
                                        .map(bed => {
                                            const isPicked = svc.bedId === bed.id;
                                            const isBusy = busyBedIds.includes(bed.id);
                                            
                                            return (
                                                <button
                                                    key={bed.id}
                                                    onClick={() => !isBusy && onSelectBed(orderId, svc.id, bed.id)}
                                                    disabled={isBusy && !isPicked}
                                                    className={`px-3 py-3 rounded-2xl border-2 text-[11px] font-black transition-all flex items-center gap-2 active:scale-95 ${
                                                        isPicked
                                                            ? 'border-emerald-500 bg-emerald-500 text-white shadow-lg shadow-emerald-100'
                                                            : isBusy
                                                                ? 'border-gray-100 bg-gray-100 text-gray-300 cursor-not-allowed opacity-50'
                                                                : 'border-gray-100 bg-gray-50/50 text-gray-600 hover:border-emerald-200'
                                                    }`}
                                                >
                                                    <BedIcon size={14} className={isBusy ? 'text-gray-200' : ''} />
                                                    {bed.id.split('-').pop()}
                                                    {isBusy && !isPicked && <span className="text-[8px] opacity-60">(Bận)</span>}
                                                </button>
                                            );
                                        })}
                                </motion.div>
                            ) : (
                                <div className="p-4 border border-dashed border-gray-200 rounded-2xl bg-slate-50/30 text-center">
                                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest italic leading-none py-1">Vui lòng chọn phòng</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Staff Selection Area */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between px-1">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                            Kỹ thuật viên <span className="text-rose-500">*</span>
                        </label>
                        <button
                            onClick={() => onAddStaff(orderId, svc.id)}
                            className="text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:text-indigo-800 transition-colors flex items-center gap-1.5"
                        >
                            <Plus size={14} strokeWidth={3} /> Thêm KTV
                        </button>
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                        {svc.staffList.map((row) => (
                            <DispatchStaffRow
                                key={row.id}
                                row={row}
                                svcId={svc.id}
                                orderId={orderId}
                                serviceName={svc.serviceName}
                                availableTurns={availableTurns}
                                onUpdate={onUpdateStaff}
                                onRemove={onRemoveStaff}
                                canRemove={svc.staffList.length > 1}
                            />
                        ))}
                    </div>
                </div>

                <div className="space-y-3 pt-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block px-1">Ghi chú điều phối</label>
                    <textarea
                        value={svc.adminNote}
                        onChange={e => onUpdateSvc(orderId, svc.id, { adminNote: e.target.value })}
                        placeholder="VD: Khách cần thư giãn tuyệt đối, không nói chuyện..."
                        rows={2}
                        className="w-full px-4 py-3 border border-gray-100 rounded-2xl text-sm font-medium focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none bg-gray-50/50 transition-all resize-none shadow-inner"
                    />
                </div>
            </div>
        </div>
    );
};

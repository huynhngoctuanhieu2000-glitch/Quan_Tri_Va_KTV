'use client';

import React from 'react';
import { Plus, AlertTriangle, UserCheck, Trash2 } from 'lucide-react';
import { DispatchStaffRow } from './DispatchStaffRow';
import { ServiceBlock, StaffAssignment, StaffData, TurnQueueData } from '../types';

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
    onUpdateStaff: (orderId: string, svcId: string, rowId: string, patch: Partial<StaffAssignment>) => void;
    onAddStaff: (orderId: string, svcId: string) => void;
    onRemoveStaff: (orderId: string, svcId: string, rowId: string) => void;
    onRemoveSvc?: (orderId: string, svcId: string) => void;
}

export const DispatchServiceBlock = ({
    svc, svcIndex, orderId, rooms, beds, busyBedIds = [], availableTurns,
    onUpdateSvc, onUpdateStaff, onAddStaff, onRemoveStaff, onRemoveSvc
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

                {onRemoveSvc && (
                    <button
                        onClick={() => onRemoveSvc(orderId, svc.id)}
                        className="p-2.5 bg-rose-50 text-rose-500 hover:bg-rose-100 hover:text-rose-600 border border-rose-100 rounded-2xl transition-all active:scale-90 shadow-sm"
                        title="Xóa dịch vụ"
                    >
                        <Trash2 size={18} strokeWidth={2.5} />
                    </button>
                )}
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

                {/* Staff Selection Area */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between px-1">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                            Nhân viên & Phòng <span className="text-rose-500">*</span>
                        </label>
                        <button
                            onClick={() => onAddStaff(orderId, svc.id)}
                            className="text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:text-indigo-800 transition-colors flex items-center gap-1.5"
                        >
                            <Plus size={14} strokeWidth={3} /> Thêm KTV/Phòng
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
                                rooms={rooms}
                                beds={beds}
                                busyBedIds={busyBedIds}
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

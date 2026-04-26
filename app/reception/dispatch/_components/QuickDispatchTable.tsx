'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Printer, X, ChevronDown, Plus, Clock } from 'lucide-react';
import { ServiceBlock, StaffData, TurnQueueData, WorkSegment } from '../types';

// 🔧 UI CONFIGURATION
const TAG_COLORS = ['bg-indigo-100 text-indigo-700', 'bg-emerald-100 text-emerald-700', 'bg-amber-100 text-amber-700', 'bg-rose-100 text-rose-700', 'bg-cyan-100 text-cyan-700'];

interface Room { id: string; name: string; type: string; }
interface Bed { id: string; roomId: string; }

interface ServiceGroup {
  serviceName: string;
  items: ServiceBlock[];
  displayName: string;
  startTime: string;
  endTime: string;
  selectedKtvIds: string[];
  note: string;
}

interface QuickDispatchTableProps {
  services: ServiceBlock[];
  orderId: string;
  rooms: Room[];
  beds: Bed[];
  availableTurns: (TurnQueueData & { staff?: StaffData })[];
  busyBedIds: string[];
  onUpdateServices: (updatedServices: ServiceBlock[]) => void;
  onPrintGroup: (group: ServiceGroup) => void;
  customerReqs?: { genderReq?: string; strength?: string; focus?: string; avoid?: string; customerNote?: string; };
}

const SERVICE_TO_SKILL: Record<string, string> = {
  'Gội đầu': 'shampoo', 'Massage Thái': 'thaiBody', 'Massage Dầu': 'oilBody',
  'Đá Nóng': 'hotStoneBody', 'Massage Body': 'thaiBody', 'Foot Dầu': 'oilFoot',
  'Ráy Combo': 'earCombo', 'Ráy Chuyên': 'earChuyen', 'Chăm sóc da': 'facial',
  'Tinh dầu': 'oilBody', 'Chăm sóc': 'thaiBody',
};

const calcEndTime = (start: string, duration: number): string => {
  if (!start || !duration) return '';
  const [h, m] = start.split(':').map(Number);
  const d = new Date(); d.setHours(h, m + duration, 0, 0);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const getCurrentTime = () => {
  const n = new Date();
  return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
};

const genId = () => Math.random().toString(36).substring(2, 9);

export const QuickDispatchTable = ({
  services, orderId, rooms, beds, availableTurns, busyBedIds,
  onUpdateServices, onPrintGroup, customerReqs
}: QuickDispatchTableProps) => {

  const isInitializedRef = useRef(false);
  // Fingerprint to detect services changes (e.g. after switching from detail mode)
  const servicesFingerprintRef = useRef('');

  // Group services by serviceName + duration
  const initialGroups = useMemo(() => {
    const map = new Map<string, ServiceBlock[]>();
    services.forEach(svc => {
      if (svc.serviceName?.toLowerCase().includes('phòng riêng')) return;
      const key = `${svc.serviceName}_${svc.duration}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(svc);
    });
    return map;
  }, [services]);

  // State per group (includes selectedRoomIds for manual room pick)
  type GroupState = {
    displayName: string; startTime: string; endTime: string;
    selectedKtvIds: string[]; selectedRoomIds: string[];
    note: string; duration: number;
  };
  const [groupStates, setGroupStates] = useState<Map<string, GroupState>>(new Map());

  // Build fingerprint from current services data
  const buildFingerprint = (svcs: ServiceBlock[]) =>
    svcs.map(s => `${s.id}|${s.staffList?.[0]?.ktvId || ''}|${s.staffList?.[0]?.segments?.[0]?.roomId || ''}|${s.staffList?.[0]?.segments?.[0]?.startTime || ''}`).join(';');

  // Initialize / re-initialize group states when services change
  useEffect(() => {
    const fp = buildFingerprint(services);
    if (fp === servicesFingerprintRef.current) return;
    servicesFingerprintRef.current = fp;

    const newStates = new Map<string, GroupState>();
    initialGroups.forEach((items, groupKey) => {
      const duration = items[0]?.duration || 0;
      const existingKtvIds = items.flatMap(item => item.staffList.map(s => s.ktvId)).filter(Boolean);
      const existingRoomIds = items.map(item => item.staffList?.[0]?.segments?.[0]?.roomId || '');
      const st = items[0]?.staffList?.[0]?.segments?.[0]?.startTime || getCurrentTime();
      newStates.set(groupKey, {
        displayName: items[0]?.options?.displayName || '',
        startTime: st,
        endTime: calcEndTime(st, duration),
        selectedKtvIds: existingKtvIds,
        selectedRoomIds: existingRoomIds,
        note: items[0]?.staffList?.[0]?.noteForKtv || '',
        duration,
      });
    });
    if (newStates.size > 0) {
      setGroupStates(newStates);
    }
  }, [initialGroups, services]);

  // All selected KTV IDs across all groups
  const allSelectedKtvIds = useMemo(() => {
    const ids: string[] = [];
    groupStates.forEach(g => ids.push(...g.selectedKtvIds));
    return ids;
  }, [groupStates]);

  // Auto-assign first available bed in a room (avoiding duplicates)
  const getAvailableBedInRoom = (roomId: string, excludeBedIds: string[]): string | null => {
    const allExcluded = [...busyBedIds, ...excludeBedIds];
    const roomBeds = beds.filter(b => b.roomId === roomId);
    for (const bed of roomBeds) {
      if (!allExcluded.includes(bed.id)) return bed.id;
    }
    return null;
  };

  // Sync group states back to parent services
  const syncToServices = (nextStates: Map<string, GroupState>) => {
    const updatedServices = [...services];
    const globalUsedBedIds: string[] = [];

    nextStates.forEach((state, groupKey) => {
      const items = initialGroups.get(groupKey);
      if (!items) return;

      items.forEach((item, idx) => {
        const svcIdx = updatedServices.findIndex(s => s.id === item.id);
        if (svcIdx === -1) return;

        const ktvId = state.selectedKtvIds[idx] || '';
        const ktvTurn = availableTurns.find(t => t.employee_id === ktvId);
        const ktvName = ktvTurn?.staff?.full_name || ktvId;
        const roomId = state.selectedRoomIds?.[idx] || null;

        // Auto-pick first available bed in chosen room
        let bedId: string | null = null;
        if (roomId) {
          bedId = getAvailableBedInRoom(roomId, globalUsedBedIds);
          if (bedId) globalUsedBedIds.push(bedId);
        }

        const segment: WorkSegment = {
          id: updatedServices[svcIdx].staffList?.[0]?.segments?.[0]?.id || `seg-${genId()}`,
          roomId: roomId,
          bedId: bedId,
          startTime: state.startTime,
          duration: item.duration,
          endTime: calcEndTime(state.startTime, item.duration),
        };

        updatedServices[svcIdx] = {
          ...updatedServices[svcIdx],
          staffList: [{
            id: updatedServices[svcIdx].staffList?.[0]?.id || `st-${item.id}-${ktvId}`,
            ktvId,
            ktvName,
            segments: [segment],
            noteForKtv: state.note,
          }],
          options: {
            ...updatedServices[svcIdx].options,
            displayName: state.displayName || undefined,
          },
        };
      });
    });
    onUpdateServices(updatedServices);
  };

  // Track user-driven changes for deferred sync
  const pendingSyncRef = useRef(false);

  const updateGroup = (groupKey: string, patch: Partial<{ displayName: string; startTime: string; endTime: string; selectedKtvIds: string[]; note: string; selectedRoomIds: string[]; }>) => {
    setGroupStates(prev => {
      const next = new Map(prev);
      const current = next.get(groupKey);
      if (!current) return prev;
      const updated = { ...current, ...patch };
      if (patch.startTime) {
        updated.endTime = calcEndTime(patch.startTime, current.duration);
      }
      next.set(groupKey, updated);
      return next;
    });
    pendingSyncRef.current = true;
  };

  // Deferred sync — runs AFTER groupStates has settled (avoids setState-during-render)
  useEffect(() => {
    if (!pendingSyncRef.current) return;
    pendingSyncRef.current = false;
    // Update fingerprint to match what we're about to push to parent
    servicesFingerprintRef.current = '___pending___';
    syncToServices(groupStates);
  }, [groupStates]);

  return (
    <div className="space-y-5">
      {/* Customer Requirements Banner */}
      {customerReqs && (customerReqs.genderReq || customerReqs.strength || customerReqs.focus || customerReqs.avoid || customerReqs.customerNote) && (
        <div className="bg-amber-50/50 border border-amber-100 rounded-2xl p-3 space-y-2">
          <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest">⚠️ Yêu Cầu Từ Khách</p>
          <div className="flex flex-wrap gap-1.5">
            {customerReqs.genderReq && customerReqs.genderReq !== 'Ngẫu nhiên' && (
              <span className="px-2.5 py-1 rounded-xl text-[10px] font-black bg-purple-50 text-purple-700 border border-purple-100">🧑 {customerReqs.genderReq}</span>
            )}
            {customerReqs.strength && (
              <span className="px-2.5 py-1 rounded-xl text-[10px] font-black bg-orange-50 text-orange-700 border border-orange-100">💪 {customerReqs.strength}</span>
            )}
            {customerReqs.focus && (
              <span className="px-2.5 py-1 rounded-xl text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-100">🎯 {customerReqs.focus}</span>
            )}
            {customerReqs.avoid && (
              <span className="px-2.5 py-1 rounded-xl text-[10px] font-black bg-rose-50 text-rose-700 border border-rose-100">🚫 {customerReqs.avoid}</span>
            )}
          </div>
          {customerReqs.customerNote && (
            <p className="text-xs text-amber-800 bg-white/60 p-2 rounded-xl font-bold italic border border-amber-100">&quot;{customerReqs.customerNote}&quot;</p>
          )}
        </div>
      )}

      {/* Service Groups */}
      {Array.from(initialGroups.entries()).map(([groupKey, items]) => {
        const state = groupStates.get(groupKey);
        if (!state) return null;
        const count = items.length;
        const duration = items[0]?.duration || 0;
        const displayServiceName = items[0]?.serviceName || groupKey.split('_')[0];

        // Find matching skill for this service
        const targetSkill = Object.keys(SERVICE_TO_SKILL).find(k => displayServiceName.toLowerCase().includes(k.toLowerCase()))
          ? SERVICE_TO_SKILL[Object.keys(SERVICE_TO_SKILL).find(k => displayServiceName.toLowerCase().includes(k.toLowerCase()))!]
          : null;

        return (
          <ServiceGroupCard
            key={groupKey}
            serviceName={displayServiceName}
            count={count}
            duration={duration}
            state={state}
            targetSkill={targetSkill}
            availableTurns={availableTurns}
            allSelectedKtvIds={allSelectedKtvIds}
            rooms={rooms}
            beds={beds}
            onUpdate={(patch) => updateGroup(groupKey, patch)}
            onPrint={() => onPrintGroup({ serviceName: displayServiceName, items, ...state })}
            customerReqs={customerReqs}
          />
        );
      })}
    </div>
  );
};

// ─── Service Group Card ──────────────────────────────────────────

interface ServiceGroupCardProps {
  serviceName: string;
  count: number;
  duration: number;
  state: { displayName: string; startTime: string; endTime: string; selectedKtvIds: string[]; note: string; selectedRoomIds?: string[]; };
  targetSkill: string | null;
  availableTurns: (TurnQueueData & { staff?: StaffData })[];
  allSelectedKtvIds: string[];
  rooms: Room[];
  beds: Bed[];
  onUpdate: (patch: Partial<{ displayName: string; startTime: string; endTime: string; selectedKtvIds: string[]; note: string; selectedRoomIds: string[]; }>) => void;
  onPrint: () => void;
  customerReqs?: { genderReq?: string; strength?: string; focus?: string; avoid?: string; customerNote?: string; };
}

const ServiceGroupCard = ({
  serviceName, count, duration, state, targetSkill,
  availableTurns, allSelectedKtvIds, rooms, beds, onUpdate, onPrint, customerReqs
}: ServiceGroupCardProps) => {
  const [isKtvDropdownOpen, setIsKtvDropdownOpen] = useState(false);
  const [ktvSearch, setKtvSearch] = useState('');
  const [showTicketForIdx, setShowTicketForIdx] = useState<number | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsKtvDropdownOpen(false);
        setKtvSearch('');
      }
    };
    if (isKtvDropdownOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isKtvDropdownOpen]);

  const removeKtv = (ktvId: string) => {
    const idx = state.selectedKtvIds.indexOf(ktvId);
    const newRoomIds = [...(state.selectedRoomIds || [])];
    if (idx >= 0) newRoomIds.splice(idx, 1);
    onUpdate({ selectedKtvIds: state.selectedKtvIds.filter(id => id !== ktvId), selectedRoomIds: newRoomIds });
  };

  const addKtv = (ktvId: string) => {
    if (state.selectedKtvIds.length >= count) return;
    onUpdate({ selectedKtvIds: [...state.selectedKtvIds, ktvId] });
    setKtvSearch('');
    if (state.selectedKtvIds.length + 1 >= count) setIsKtvDropdownOpen(false);
  };

  const updateRoomForIdx = (idx: number, roomId: string) => {
    const newRoomIds = [...(state.selectedRoomIds || [])];
    while (newRoomIds.length <= idx) newRoomIds.push('');
    newRoomIds[idx] = roomId;
    onUpdate({ selectedRoomIds: newRoomIds });
  };

  const filteredTurns = availableTurns
    .filter(t => t.status !== 'off')
    .filter(t => !state.selectedKtvIds.includes(t.employee_id))
    .filter(t => {
      if (!ktvSearch) return true;
      const term = ktvSearch.toLowerCase();
      return t.employee_id.toLowerCase().includes(term) || (t.staff?.full_name || '').toLowerCase().includes(term);
    });

  const isFull = state.selectedKtvIds.length >= count;
  const dateFormatted = new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });

  // Color for KTV badge background
  const getBadgeBg = (idx: number) => {
    const colors = ['bg-indigo-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-cyan-500'];
    return colors[idx % colors.length];
  };

  return (
    <>
    <div className="border border-gray-100 rounded-3xl overflow-hidden bg-white shadow-sm hover:shadow-md transition-all">
      {/* Header */}
      <div className="bg-gray-50/80 px-4 py-3 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h3 className="font-black text-gray-900 text-sm">{serviceName}</h3>
          <span className="bg-indigo-600 text-white text-[10px] font-black px-2.5 py-1 rounded-xl">x{count}</span>
          <span className="text-xs text-gray-400 font-bold">{duration}p</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-400 font-bold shrink-0">Tên in phiếu:</span>
          <input
            type="text"
            value={state.displayName}
            onChange={e => onUpdate({ displayName: e.target.value })}
            placeholder={serviceName}
            className="px-3 py-1.5 border border-gray-200 rounded-xl text-xs font-bold w-40 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 outline-none bg-white"
          />
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Time Row */}
        <div className="flex items-center gap-3 bg-indigo-50/70 rounded-2xl px-4 py-3 border border-indigo-100/50">
          <Clock size={14} className="text-indigo-500 shrink-0" />
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black text-indigo-600 uppercase">Bắt đầu</span>
            <input
              type="time"
              value={state.startTime}
              onChange={e => onUpdate({ startTime: e.target.value })}
              className="px-2 py-1 border border-indigo-200 rounded-xl text-xs font-black text-indigo-700 bg-white focus:ring-2 focus:ring-indigo-500/20 outline-none"
            />
          </div>
          <span className="text-indigo-300">→</span>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black text-indigo-600 uppercase">Kết thúc</span>
            <span className="px-2 py-1 border border-indigo-200 rounded-xl text-xs font-black text-indigo-700 bg-indigo-50">{state.endTime || '--:--'}</span>
          </div>
        </div>

        {/* KTV Multi-Select */}
        <div className="space-y-2">
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">
            Nhân viên ({state.selectedKtvIds.length}/{count})
          </label>
          <div className="relative" ref={dropdownRef}>
            <div
              className="min-h-[44px] w-full px-3 py-2 border-2 border-gray-100 rounded-2xl bg-gray-50/30 flex flex-wrap gap-1.5 items-center cursor-text"
              onClick={() => !isFull && setIsKtvDropdownOpen(true)}
            >
              {state.selectedKtvIds.map((ktvId, idx) => {
                const turn = availableTurns.find(t => t.employee_id === ktvId);
                const name = turn?.staff?.full_name || ktvId;
                return (
                  <span key={ktvId} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-black ${TAG_COLORS[idx % TAG_COLORS.length]} border`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    {name}
                    <button onClick={(e) => { e.stopPropagation(); removeKtv(ktvId); }} className="ml-0.5 hover:opacity-60">
                      <X size={12} />
                    </button>
                  </span>
                );
              })}
              {!isFull && (
                <input
                  type="text"
                  value={ktvSearch}
                  onChange={e => { setKtvSearch(e.target.value); if (!isKtvDropdownOpen) setIsKtvDropdownOpen(true); }}
                  onFocus={() => setIsKtvDropdownOpen(true)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && ktvSearch.trim()) {
                      e.preventDefault();
                      const term = ktvSearch.toLowerCase().trim();
                      const match = availableTurns.find(t => t.employee_id.toLowerCase() === term || t.staff?.full_name?.toLowerCase() === term);
                      if (match) {
                        addKtv(match.employee_id);
                      } else {
                        addKtv(ktvSearch.trim());
                      }
                      setKtvSearch('');
                    }
                  }}
                  placeholder={state.selectedKtvIds.length === 0 ? '+ Chọn KTV...' : '+ Thêm...'}
                  className="flex-1 min-w-[80px] bg-transparent border-none outline-none text-xs font-bold placeholder:text-gray-400"
                />
              )}
            </div>

            {/* Dropdown */}
            {isKtvDropdownOpen && (
              <div className="absolute z-50 w-full mt-1 bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-gray-100 overflow-hidden">
                <div className="max-h-52 overflow-y-auto p-1.5 space-y-0.5">
                  {filteredTurns.map(turn => {
                    const hasSkill = targetSkill ? turn.staff?.skills?.[targetSkill] === true : true;
                    const isUsedElsewhere = allSelectedKtvIds.includes(turn.employee_id) && !state.selectedKtvIds.includes(turn.employee_id);
                    return (
                      <div
                        key={turn.employee_id}
                        onClick={() => { if (!isUsedElsewhere) addKtv(turn.employee_id); }}
                        className={`px-3 py-2 rounded-xl text-sm font-bold cursor-pointer transition-all flex items-center justify-between
                          ${isUsedElsewhere ? 'opacity-40 cursor-not-allowed bg-gray-50' : 'hover:bg-indigo-50 active:scale-[0.98]'}
                          ${!hasSkill ? 'text-gray-400' : 'text-gray-700'}`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded-md font-black text-slate-500">#{turn.check_in_order}</span>
                          <span>[{turn.employee_id}] {turn.staff?.full_name}</span>
                        </div>
                        <span className={`text-[10px] font-semibold ${turn.status === 'working' ? 'text-amber-500' : 'text-emerald-500'}`}>
                          {isUsedElsewhere ? '🚫 Đã gán nhóm khác' : turn.status === 'working' ? `⌛ Đến ${turn.estimated_end_time || '--:--'}` : '✅ Sẵn sàng'}
                        </span>
                      </div>
                    );
                  })}
                  {/* Nhập ngoài custom text */}
                  {ktvSearch.trim() && !availableTurns.some(t => t.employee_id.toLowerCase() === ktvSearch.trim().toLowerCase() || t.staff?.full_name?.toLowerCase() === ktvSearch.trim().toLowerCase()) && (
                    <div
                      onClick={() => {
                        addKtv(ktvSearch.trim());
                        setKtvSearch('');
                      }}
                      className="w-full text-left px-3 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 cursor-pointer hover:bg-emerald-50 text-emerald-700 active:scale-[0.98] border border-dashed border-emerald-200 mt-2"
                    >
                      <Plus size={16} className="text-emerald-500" />
                      <span>Nhập tên ngoài: <strong className="text-emerald-800">{ktvSearch.trim()}</strong></span>
                    </div>
                  )}
                  {filteredTurns.length === 0 && !ktvSearch.trim() && (
                    <p className="text-center text-xs text-gray-400 py-4 font-bold">Không tìm thấy KTV phù hợp</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Per-KTV Room Selection + Print */}
        {state.selectedKtvIds.length > 0 && (
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Phòng & In phiếu</label>
            <div className="space-y-2">
              {state.selectedKtvIds.map((ktvId, idx) => {
                const turn = availableTurns.find(t => t.employee_id === ktvId);
                const name = turn?.staff?.full_name || ktvId;
                const selectedRoom = (state.selectedRoomIds || [])[idx] || '';
                return (
                  <div key={ktvId} className="flex items-center gap-2 bg-gray-50/50 rounded-xl px-3 py-2 border border-gray-100">
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black text-white ${getBadgeBg(idx)}`}>
                      {idx + 1}
                    </span>
                    <span className="text-xs font-bold text-gray-700 truncate min-w-[60px]">{name}</span>
                    <select
                      value={selectedRoom}
                      onChange={e => updateRoomForIdx(idx, e.target.value)}
                      className="flex-1 px-2 py-1.5 border border-gray-200 rounded-xl text-xs font-bold bg-white focus:ring-2 focus:ring-indigo-500/20 outline-none"
                    >
                      <option value="">— Chọn phòng —</option>
                      {rooms.map(r => (
                        <option key={r.id} value={r.id}>{r.name || r.id}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => setShowTicketForIdx(idx)}
                      className="p-1.5 bg-indigo-50 text-indigo-500 hover:bg-indigo-100 border border-indigo-100 rounded-lg transition-all active:scale-90"
                      title="In phiếu KTV"
                    >
                      <Printer size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Note Row */}
        <input
          type="text"
          value={state.note}
          onChange={e => onUpdate({ note: e.target.value })}
          placeholder="Ghi chú chung cho KTV..."
          className="w-full px-4 py-2.5 border border-gray-100 rounded-2xl text-xs font-medium focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-400 outline-none bg-gray-50/50"
        />
      </div>
    </div>

    {/* 🖨️ Ticket Preview Modal — same style as DispatchStaffRow */}
    {showTicketForIdx !== null && (() => {
      const idx = showTicketForIdx;
      const ktvId = state.selectedKtvIds[idx] || '';
      const turn = availableTurns.find(t => t.employee_id === ktvId);
      const roomId = (state.selectedRoomIds || [])[idx] || '';
      const roomName = rooms.find(r => r.id === roomId)?.name || roomId || '—';
      const ticketServiceName = state.displayName || serviceName;
      const ticketNote = state.note;

      return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" onClick={() => setShowTicketForIdx(null)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-md" />
          <div
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
            className="relative bg-white rounded-3xl shadow-2xl w-full max-w-[400px] max-h-[90vh] overflow-y-auto"
          >
            <button
              onClick={() => setShowTicketForIdx(null)}
              className="absolute top-4 right-4 z-10 p-2 bg-white/80 hover:bg-white rounded-full shadow-lg border border-gray-200 transition-all active:scale-90"
            >
              <X size={18} className="text-gray-500" />
            </button>

            {/* Ticket Header */}
            <div className="bg-slate-900 text-white px-6 py-5 flex justify-between items-center rounded-t-3xl">
              <div className="text-4xl font-black italic tracking-tight">{ktvId}</div>
              <div className="text-right">
                <div className="text-[11px] font-bold tracking-wider opacity-70">Phiếu Tua KTV</div>
                <div className="text-base font-black mt-0.5">{dateFormatted}</div>
              </div>
            </div>

            {/* Ticket Content */}
            <div className="px-5 py-5 space-y-4">
              <div>
                <div className="text-2xl font-black text-red-600 uppercase leading-tight">
                  {ticketServiceName} ({duration}&apos;)
                </div>
              </div>

              {/* Time */}
              <div className="border-[2.5px] border-dashed border-amber-400 rounded-2xl px-4 py-4 text-center">
                <p className="text-[10px] font-black text-amber-800 uppercase tracking-[3px] mb-2">Thời gian thực hiện</p>
                <p className="text-[32px] font-black text-red-600 leading-none tracking-tight">
                  {state.startTime || '--:--'} <span className="text-red-400">→</span> {state.endTime || '--:--'}
                </p>
              </div>

              {/* Room */}
              <div className="bg-slate-100 rounded-xl px-4 py-3 border-l-4 border-slate-500">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Phòng</p>
                <p className="text-xl font-black text-red-600 mt-0.5">{roomName}</p>
              </div>

              {/* Customer Requirements */}
              {customerReqs && (customerReqs.strength || customerReqs.focus || customerReqs.avoid || customerReqs.customerNote) && (
                <div className="bg-amber-50/50 border border-amber-100 rounded-2xl p-4 space-y-3 shadow-inner">
                  <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest flex items-center gap-2">⚠️ Yêu Cầu Khách Hàng</p>
                  <div className="flex flex-wrap gap-2">
                    {customerReqs.strength && (
                      <span className="px-3 py-1.5 rounded-xl text-[10px] font-black border bg-orange-50 text-orange-700 border-orange-100 shadow-sm">💪 Lực: {customerReqs.strength}</span>
                    )}
                    {customerReqs.focus && (
                      <span className="px-3 py-1.5 rounded-xl text-[10px] font-black border bg-emerald-50 text-emerald-700 border-emerald-100 shadow-sm">🎯 Tập trung: {customerReqs.focus}</span>
                    )}
                    {customerReqs.avoid && (
                      <span className="px-3 py-1.5 rounded-xl text-[10px] font-black border bg-rose-50 text-rose-700 border-rose-100 shadow-sm">🚫 Tránh: {customerReqs.avoid}</span>
                    )}
                  </div>
                  {customerReqs.customerNote && (
                    <div className="bg-white/60 px-3 py-2.5 rounded-xl border border-amber-200/50">
                      <p className="text-xs font-bold text-amber-900 italic flex items-start gap-2"><span className="text-amber-400 mt-0.5">📌</span> {customerReqs.customerNote}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Admin Note */}
              {ticketNote && (
                <div className="bg-green-50/50 border border-green-200 rounded-2xl p-4 space-y-3 shadow-inner">
                  <p className="text-[10px] font-black text-green-700 uppercase tracking-widest flex items-center gap-2">📝 Admin Dặn Dò</p>
                  <div className="bg-white/60 px-3 py-2.5 rounded-xl border border-green-200/50">
                    <p className="text-xs font-bold text-green-900 flex items-start gap-2 uppercase"><span className="text-green-500 mt-0.5">💬</span> &quot;{ticketNote}&quot;</p>
                  </div>
                </div>
              )}
            </div>

            <div className="text-center py-4 border-t border-gray-200 mt-2">
              <p className="text-xs text-gray-400 font-semibold italic">Hệ thống Spa Ngân Hà</p>
            </div>
          </div>
        </div>
      );
    })()}
    </>
  );
};

'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Printer, X, ChevronDown, ChevronUp, Plus, Clock } from 'lucide-react';
import { ServiceBlock, StaffData, TurnQueueData, WorkSegment } from '../types';

// 🛠 UI CONFIGURATION
const TAG_COLORS = ['bg-indigo-100 text-indigo-700', 'bg-emerald-100 text-emerald-700', 'bg-amber-100 text-amber-700', 'bg-rose-100 text-rose-700', 'bg-cyan-100 text-cyan-700'];

interface Room { id: string; name: string; type: string; }
interface Bed { id: string; roomId: string; }

interface ServiceGroup {
  serviceName: string;
  items: ServiceBlock[];
  displayName: string;
  selectedKtvIds: string[];
  selectedRoomIds: string[];
  ktvStartTimes: string[];
  ktvEndTimes: string[];
  ktvNotes: string[];
  note: string;
  duration: number;
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

  // State per group (includes per-KTV times, rooms, durations)
  type GroupState = {
    displayName: string;
    selectedKtvIds: string[]; selectedRoomIds: string[];
    ktvStartTimes: string[]; ktvEndTimes: string[];
    ktvDurations: number[]; ktvNotes: string[]; ktvBedIds: string[];
    note: string; duration: number;
  };
  const [groupStates, setGroupStates] = useState<Map<string, GroupState>>(new Map());

  // Build fingerprint from current services data
  const buildFingerprint = (svcs: ServiceBlock[]) =>
    svcs.map(s => `${s.id}|${s.staffList?.map(st => `${st.ktvId}:${st.segments?.[0]?.roomId || ''}:${st.segments?.[0]?.startTime || ''}`).join(',')}`).join(';');

  // Initialize / re-initialize group states when services change
  useEffect(() => {
    const fp = buildFingerprint(services);
    if (fp === servicesFingerprintRef.current) return;
    servicesFingerprintRef.current = fp;

    const defaultTime = getCurrentTime();
    const newStates = new Map<string, GroupState>();
    initialGroups.forEach((items, groupKey) => {
      const duration = items[0]?.duration || 0;
      // Collect all KTVs across all items (including multi-staff per item)
      const ktvIds: string[] = [];
      const roomIds: string[] = [];
      const startTimes: string[] = [];
      const endTimes: string[] = [];
      const ktvNotesList: string[] = [];
      const bedIdsList: string[] = [];
      items.forEach(item => {
        if (item.staffList.length > 0) {
          item.staffList.forEach(staff => {
            if (staff.ktvId) {
              ktvIds.push(staff.ktvId);
              roomIds.push(staff.segments?.[0]?.roomId || '');
              startTimes.push(staff.segments?.[0]?.startTime || defaultTime);
              endTimes.push(staff.segments?.[0]?.endTime || calcEndTime(staff.segments?.[0]?.startTime || defaultTime, duration));
              ktvNotesList.push(staff.noteForKtv || '');
              bedIdsList.push(staff.segments?.[0]?.bedId || '');
            }
          });
        }
      });
      if (ktvIds.length === 0) {
        startTimes.push(defaultTime);
        endTimes.push(calcEndTime(defaultTime, duration));
      }
      newStates.set(groupKey, {
        displayName: items[0]?.options?.displayName || '',
        selectedKtvIds: ktvIds,
        selectedRoomIds: roomIds,
        ktvStartTimes: startTimes,
        ktvEndTimes: endTimes,
        ktvDurations: ktvIds.map((_, i) => {
          const st = startTimes[i] || defaultTime;
          const et = endTimes[i] || '';
          if (!st || !et) return duration;
          const [sh, sm] = st.split(':').map(Number);
          const [eh, em] = et.split(':').map(Number);
          const diff = (eh * 60 + em) - (sh * 60 + sm);
          return diff > 0 ? diff : duration;
        }),
        ktvNotes: ktvNotesList,
        ktvBedIds: bedIdsList,
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
      const ktvCount = state.selectedKtvIds.length;
      const itemCount = items.length;

      if (ktvCount <= itemCount) {
        // Normal: 1 KTV per service item
        items.forEach((item, idx) => {
          const svcIdx = updatedServices.findIndex(s => s.id === item.id);
          if (svcIdx === -1) return;
          const ktvId = state.selectedKtvIds[idx] || '';
          const ktvTurn = availableTurns.find(t => t.employee_id === ktvId);
          const ktvName = ktvTurn?.staff?.full_name || ktvId;
          const roomId = state.selectedRoomIds?.[idx] || null;
          let bedId: string | null = null;
          if (roomId) { bedId = getAvailableBedInRoom(roomId, globalUsedBedIds); if (bedId) globalUsedBedIds.push(bedId); }
          const st = state.ktvStartTimes?.[idx] || getCurrentTime();
          const segment: WorkSegment = {
            id: updatedServices[svcIdx].staffList?.[0]?.segments?.[0]?.id || `seg-${genId()}`,
            roomId, bedId, startTime: st, duration: item.duration,
            endTime: state.ktvEndTimes?.[idx] || calcEndTime(st, item.duration),
          };
          updatedServices[svcIdx] = {
            ...updatedServices[svcIdx],
            staffList: [{ id: updatedServices[svcIdx].staffList?.[0]?.id || `st-${item.id}-${ktvId}`, ktvId, ktvName, segments: [segment], noteForKtv: state.ktvNotes?.[idx] || state.note || '' }],
            options: { ...updatedServices[svcIdx].options, displayName: state.displayName || undefined },
          };
        });
      } else {
        // Multi-KTV per service: distribute KTVs across items, extras go as additional staffList entries
        items.forEach((item, itemIdx) => {
          const svcIdx = updatedServices.findIndex(s => s.id === item.id);
          if (svcIdx === -1) return;
          // Find which KTVs belong to this item
          const staffEntries: { ktvId: string; ktvName: string; roomId: string | null; bedId: string | null; startTime: string; endTime: string; }[] = [];
          // Each item gets at least 1 KTV, extras distributed round-robin
          for (let ki = 0; ki < ktvCount; ki++) {
            if (ki % itemCount !== itemIdx) continue;
            const ktvId = state.selectedKtvIds[ki] || '';
            const ktvTurn = availableTurns.find(t => t.employee_id === ktvId);
            const ktvName = ktvTurn?.staff?.full_name || ktvId;
            const roomId = state.selectedRoomIds?.[ki] || null;
            let bedId: string | null = null;
            if (roomId) { bedId = getAvailableBedInRoom(roomId, globalUsedBedIds); if (bedId) globalUsedBedIds.push(bedId); }
            const st = state.ktvStartTimes?.[ki] || getCurrentTime();
            staffEntries.push({ ktvId, ktvName, roomId, bedId, startTime: st, endTime: state.ktvEndTimes?.[ki] || calcEndTime(st, item.duration) });
          }
          updatedServices[svcIdx] = {
            ...updatedServices[svcIdx],
            staffList: staffEntries.map((e, si) => ({
              id: updatedServices[svcIdx].staffList?.[si]?.id || `st-${item.id}-${e.ktvId}`,
              ktvId: e.ktvId, ktvName: e.ktvName,
              segments: [{ id: updatedServices[svcIdx].staffList?.[si]?.segments?.[0]?.id || `seg-${genId()}`, roomId: e.roomId, bedId: e.bedId, startTime: e.startTime, duration: item.duration, endTime: e.endTime }],
              noteForKtv: state.ktvNotes?.[staffEntries.indexOf(e)] || state.note || '',
            })),
            options: { ...updatedServices[svcIdx].options, displayName: state.displayName || undefined },
          };
        });
      }
    });
    onUpdateServices(updatedServices);
  };

  // Track user-driven changes for deferred sync
  const pendingSyncRef = useRef(false);

  const updateGroup = (groupKey: string, patch: Partial<GroupState>) => {
    setGroupStates(prev => {
      const next = new Map(prev);
      const current = next.get(groupKey);
      if (!current) return prev;
      const updated = { ...current, ...patch };
      next.set(groupKey, updated);
      return next;
    });
    pendingSyncRef.current = true;
  };

  // Deferred sync â€” runs AFTER groupStates has settled (avoids setState-during-render)
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
            busyBedIds={busyBedIds}
            onUpdate={(patch) => updateGroup(groupKey, patch)}
            onPrint={() => onPrintGroup({ serviceName: displayServiceName, items, ...state })}
            customerReqs={customerReqs}
          />
        );
      })}
    </div>
  );
};


// --- Service Group Card ---

interface ServiceGroupCardProps {
  serviceName: string;
  count: number;
  duration: number;
  state: { displayName: string; selectedKtvIds: string[]; selectedRoomIds?: string[]; ktvStartTimes?: string[]; ktvEndTimes?: string[]; ktvDurations?: number[]; ktvNotes?: string[]; ktvBedIds?: string[]; note: string; duration: number; };
  targetSkill: string | null;
  availableTurns: (TurnQueueData & { staff?: StaffData })[];
  allSelectedKtvIds: string[];
  rooms: Room[];
  beds: Bed[];
  busyBedIds: string[];
  onUpdate: (patch: Record<string, unknown>) => void;
  onPrint: () => void;
  customerReqs?: { genderReq?: string; strength?: string; focus?: string; avoid?: string; customerNote?: string; };
}

const MAX_KTV_PER_GROUP = 10;

const ServiceGroupCard = ({
  serviceName, count, duration, state, targetSkill,
  availableTurns, allSelectedKtvIds, rooms, beds, busyBedIds, onUpdate, onPrint, customerReqs
}: ServiceGroupCardProps) => {
  const [isKtvDropdownOpen, setIsKtvDropdownOpen] = useState(false);
  const [ktvSearch, setKtvSearch] = useState('');
  const [showTicketForIdx, setShowTicketForIdx] = useState<number | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) { setIsKtvDropdownOpen(false); setKtvSearch(''); }
    };
    if (isKtvDropdownOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isKtvDropdownOpen]);

  const removeKtv = (ktvId: string) => {
    const idx = state.selectedKtvIds.indexOf(ktvId);
    const newRoomIds = [...(state.selectedRoomIds || [])];
    const newStarts = [...(state.ktvStartTimes || [])];
    const newEnds = [...(state.ktvEndTimes || [])];
    const newDurs = [...(state.ktvDurations || [])];
    const newNotes = [...(state.ktvNotes || [])];
    const newBeds = [...(state.ktvBedIds || [])];
    if (idx >= 0) { newRoomIds.splice(idx, 1); newStarts.splice(idx, 1); newEnds.splice(idx, 1); newDurs.splice(idx, 1); newNotes.splice(idx, 1); newBeds.splice(idx, 1); }
    onUpdate({ selectedKtvIds: state.selectedKtvIds.filter(id => id !== ktvId), selectedRoomIds: newRoomIds, ktvStartTimes: newStarts, ktvEndTimes: newEnds, ktvDurations: newDurs, ktvNotes: newNotes, ktvBedIds: newBeds });
  };

  const moveKtv = (fromIdx: number, toIdx: number) => {
    if (toIdx < 0 || toIdx >= state.selectedKtvIds.length) return;
    const swap = <T,>(arr: T[] | undefined): T[] => {
      if (!arr) return [];
      const copy = [...arr];
      [copy[fromIdx], copy[toIdx]] = [copy[toIdx], copy[fromIdx]];
      return copy;
    };
    onUpdate({
      selectedKtvIds: swap(state.selectedKtvIds),
      selectedRoomIds: swap(state.selectedRoomIds),
      ktvStartTimes: swap(state.ktvStartTimes),
      ktvEndTimes: swap(state.ktvEndTimes),
      ktvDurations: swap(state.ktvDurations as number[]),
      ktvNotes: swap(state.ktvNotes),
      ktvBedIds: swap(state.ktvBedIds),
    });
  };

  const addKtv = (ktvId: string) => {
    if (state.selectedKtvIds.length >= MAX_KTV_PER_GROUP) return;
    const defaultStart = (state.ktvStartTimes || [])[0] || getCurrentTime();
    const defaultEnd = calcEndTime(defaultStart, duration);
    onUpdate({ selectedKtvIds: [...state.selectedKtvIds, ktvId], ktvStartTimes: [...(state.ktvStartTimes || []), defaultStart], ktvEndTimes: [...(state.ktvEndTimes || []), defaultEnd], ktvDurations: [...(state.ktvDurations || []), duration], ktvNotes: [...(state.ktvNotes || []), ''], ktvBedIds: [...(state.ktvBedIds || []), ''] });
    setKtvSearch('');
  };

  const updateRoomForIdx = (idx: number, roomId: string) => {
    const arr = [...(state.selectedRoomIds || [])]; while (arr.length <= idx) arr.push(''); arr[idx] = roomId;
    // Auto-assign bed
    const bedArr = [...(state.ktvBedIds || [])]; while (bedArr.length <= idx) bedArr.push('');
    if (roomId) {
      const usedBeds = bedArr.filter((_, i) => i !== idx).filter(Boolean);
      const roomBeds = beds.filter(b => b.roomId === roomId);
      const allExcluded = [...busyBedIds, ...usedBeds];
      const freeBed = roomBeds.find(b => !allExcluded.includes(b.id));
      bedArr[idx] = freeBed?.id || '';
    } else {
      bedArr[idx] = '';
    }
    onUpdate({ selectedRoomIds: arr, ktvBedIds: bedArr });
  };

  const updateNoteForIdx = (idx: number, note: string) => {
    const arr = [...(state.ktvNotes || [])]; while (arr.length <= idx) arr.push(''); arr[idx] = note; onUpdate({ ktvNotes: arr });
  };

  // Duration presets for sequential split (always include full service duration)
  const DURATION_PRESETS = [30, 45, 60, 70, 90, 120].filter(d => d <= duration);

  const isSequentialMode = state.selectedKtvIds.length > count;

  const updateDurationForIdx = (idx: number, newDur: number) => {
    const durations = [...(state.ktvDurations || state.selectedKtvIds.map(() => duration))];
    const starts = [...(state.ktvStartTimes || [])];
    const ends = [...(state.ktvEndTimes || [])];
    while (durations.length <= idx) durations.push(duration);
    while (starts.length <= idx) starts.push(getCurrentTime());
    while (ends.length <= idx) ends.push('');

    durations[idx] = newDur;
    ends[idx] = calcEndTime(starts[idx], newDur);

    // Chain subsequent KTVs: each starts where previous ends
    for (let i = idx + 1; i < state.selectedKtvIds.length; i++) {
      while (durations.length <= i) durations.push(0);
      while (starts.length <= i) starts.push('');
      while (ends.length <= i) ends.push('');
      starts[i] = ends[i - 1];
      // Remaining = total - sum of all previous
      const usedSoFar = durations.slice(0, i).reduce((a, b) => a + b, 0);
      durations[i] = Math.max(0, duration - usedSoFar);
      ends[i] = calcEndTime(starts[i], durations[i]);
    }
    onUpdate({ ktvDurations: durations, ktvStartTimes: starts, ktvEndTimes: ends });
  };

  const updateTimeForIdx = (idx: number, field: 'start' | 'end', value: string) => {
    if (field === 'start') {
      const s = [...(state.ktvStartTimes || [])]; const e = [...(state.ktvEndTimes || [])];
      const d = [...(state.ktvDurations || state.selectedKtvIds.map(() => duration))];
      while (s.length <= idx) s.push(getCurrentTime()); while (e.length <= idx) e.push('');
      while (d.length <= idx) d.push(duration);
      s[idx] = value; e[idx] = calcEndTime(value, d[idx]);
      // Chain next KTVs
      for (let i = idx + 1; i < state.selectedKtvIds.length; i++) {
        while (s.length <= i) s.push(''); while (e.length <= i) e.push('');
        while (d.length <= i) d.push(0);
        s[i] = e[i - 1];
        e[i] = calcEndTime(s[i], d[i]);
      }
      onUpdate({ ktvStartTimes: s, ktvEndTimes: e, ktvDurations: d });
    } else {
      const e = [...(state.ktvEndTimes || [])]; while (e.length <= idx) e.push(''); e[idx] = value; onUpdate({ ktvEndTimes: e });
    }
  };

  const filteredTurns = availableTurns.filter(t => t.status !== 'off').filter(t => !state.selectedKtvIds.includes(t.employee_id)).filter(t => {
    if (!ktvSearch) return true; const term = ktvSearch.toLowerCase();
    return t.employee_id.toLowerCase().includes(term) || (t.staff?.full_name || '').toLowerCase().includes(term);
  });

  const dateFormatted = new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const getBadgeBg = (i: number) => ['bg-indigo-500','bg-emerald-500','bg-amber-500','bg-rose-500','bg-cyan-500'][i % 5];

  return (<>
    <div className="border border-gray-100 rounded-3xl overflow-visible bg-white shadow-sm hover:shadow-md transition-all">
      <div className="bg-gray-50/80 px-4 py-3 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2 rounded-t-3xl">
        <div className="flex items-center gap-2">
          <h3 className="font-black text-gray-900 text-sm">{serviceName}</h3>
          <span className="bg-indigo-600 text-white text-[10px] font-black px-2.5 py-1 rounded-xl">x{count}</span>
          <span className="text-xs text-gray-400 font-bold">{duration}p</span>
          {state.selectedKtvIds.length > count && <span className="bg-amber-100 text-amber-700 text-[10px] font-black px-2 py-0.5 rounded-lg border border-amber-200">+{state.selectedKtvIds.length - count} nối tiếp</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-400 font-bold shrink-0">Tên in phiếu:</span>
          <input type="text" value={state.displayName} onChange={e => onUpdate({ displayName: e.target.value })} placeholder={serviceName}
            className="px-3 py-1.5 border border-gray-200 rounded-xl text-xs font-bold w-40 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 outline-none bg-white" />
        </div>
      </div>

      <div className="p-4 space-y-4">
        <div className="space-y-2">
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Nhân viên ({state.selectedKtvIds.length})</label>
          <div className="relative" ref={dropdownRef}>
            <div className="min-h-[44px] w-full px-3 py-2 border-2 border-gray-100 rounded-2xl bg-gray-50/30 flex flex-wrap gap-1.5 items-center cursor-text" onClick={() => setIsKtvDropdownOpen(true)}>
              {state.selectedKtvIds.map((ktvId, idx) => { const t = availableTurns.find(t => t.employee_id === ktvId); const n = ktvId; return (
                <span key={`${ktvId}-${idx}`} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-black ${TAG_COLORS[idx % TAG_COLORS.length]} border`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />{n}
                  <button onClick={(e) => { e.stopPropagation(); removeKtv(ktvId); }} className="ml-0.5 hover:opacity-60"><X size={12} /></button>
                </span>); })}
              <input type="text" value={ktvSearch} onChange={e => { setKtvSearch(e.target.value); if (!isKtvDropdownOpen) setIsKtvDropdownOpen(true); }} onFocus={() => setIsKtvDropdownOpen(true)}
                onKeyDown={(e) => { if (e.key === 'Enter' && ktvSearch.trim()) { e.preventDefault(); const term = ktvSearch.toLowerCase().trim(); const m = availableTurns.find(t => t.employee_id.toLowerCase() === term || t.staff?.full_name?.toLowerCase() === term); if (m) addKtv(m.employee_id); else addKtv(ktvSearch.trim()); setKtvSearch(''); } }}
                placeholder={state.selectedKtvIds.length === 0 ? '+ Chọn KTV...' : '+ Thêm...'} className="flex-1 min-w-[80px] bg-transparent border-none outline-none text-xs font-bold placeholder:text-gray-400" />
            </div>
            {isKtvDropdownOpen && (
              <div className="absolute z-50 w-full mt-1 bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-gray-100 overflow-hidden">
                <div className="max-h-52 overflow-y-auto p-1.5 space-y-0.5">
                  {filteredTurns.map(turn => { const hasSkill = targetSkill ? turn.staff?.skills?.[targetSkill] === true : true; const isUsed = allSelectedKtvIds.includes(turn.employee_id) && !state.selectedKtvIds.includes(turn.employee_id); return (
                    <div key={turn.employee_id} onClick={() => { if (!isUsed) addKtv(turn.employee_id); }}
                      className={`px-3 py-2 rounded-xl text-sm font-bold cursor-pointer transition-all flex items-center justify-between ${isUsed ? 'opacity-40 cursor-not-allowed bg-gray-50' : 'hover:bg-indigo-50 active:scale-[0.98]'} ${!hasSkill ? 'text-gray-400' : 'text-gray-700'}`}>
                      <div className="flex items-center gap-2"><span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded-md font-black text-slate-500">#{turn.check_in_order}</span><span>{turn.employee_id}</span></div>
                      <span className={`text-[10px] font-semibold ${turn.status === 'working' ? 'text-amber-500' : 'text-emerald-500'}`}>{isUsed ? '🚫 Đã gán nhóm khác' : turn.status === 'working' ? `⌛ Đến ${turn.estimated_end_time || '--:--'}` : '✅ Sẵn sàng'}</span>
                    </div>); })}
                  {ktvSearch.trim() && !availableTurns.some(t => t.employee_id.toLowerCase() === ktvSearch.trim().toLowerCase() || t.staff?.full_name?.toLowerCase() === ktvSearch.trim().toLowerCase()) && (
                    <div onClick={() => { addKtv(ktvSearch.trim()); setKtvSearch(''); }} className="w-full text-left px-3 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 cursor-pointer hover:bg-emerald-50 text-emerald-700 active:scale-[0.98] border border-dashed border-emerald-200 mt-2">
                      <Plus size={16} className="text-emerald-500" /><span>Nhập tên ngoài: <strong className="text-emerald-800">{ktvSearch.trim()}</strong></span>
                    </div>)}
                  {filteredTurns.length === 0 && !ktvSearch.trim() && <p className="text-center text-xs text-gray-400 py-4 font-bold">Không tìm thấy KTV phù hợp</p>}
                </div>
              </div>)}
          </div>
        </div>

        {state.selectedKtvIds.length > 0 && (
          <div className="space-y-2">
            <div className="space-y-2">
              {state.selectedKtvIds.map((ktvId, idx) => {
                const t = availableTurns.find(t => t.employee_id === ktvId);
                const name = ktvId;
                const selRoom = (state.selectedRoomIds || [])[idx] || '';
                const selBed = (state.ktvBedIds || [])[idx] || '';
                const startT = (state.ktvStartTimes || [])[idx] || '';
                const endT = (state.ktvEndTimes || [])[idx] || '';
                const ktvDur = (state.ktvDurations || [])[idx] || duration;
                const ktvNote = (state.ktvNotes || [])[idx] || '';
                const roomBedsList = selRoom ? beds.filter(b => b.roomId === selRoom) : [];
                return (
                <div key={`${ktvId}-${idx}`} className="bg-gray-50/50 rounded-xl px-3 py-2.5 border border-gray-100 space-y-1.5">
                  {/* Row 1: Name | Room | Bed | Duration | Time | Print */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black text-white shrink-0 ${getBadgeBg(idx)}`}>{idx + 1}</span>
                    {state.selectedKtvIds.length >= 2 && (
                      <div className="flex flex-col gap-0.5 shrink-0">
                        <button onClick={() => moveKtv(idx, idx - 1)} disabled={idx === 0} className={`p-0.5 rounded leading-none ${idx === 0 ? 'text-gray-200' : 'text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 active:scale-90'} transition-all`}><ChevronUp size={16} strokeWidth={2.5} /></button>
                        <button onClick={() => moveKtv(idx, idx + 1)} disabled={idx === state.selectedKtvIds.length - 1} className={`p-0.5 rounded leading-none ${idx === state.selectedKtvIds.length - 1 ? 'text-gray-200' : 'text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 active:scale-90'} transition-all`}><ChevronDown size={16} strokeWidth={2.5} /></button>
                      </div>
                    )}
                    <span className="text-xs font-bold text-gray-700 truncate max-w-[100px]">{name}</span>
                    <select value={selRoom} onChange={e => updateRoomForIdx(idx, e.target.value)} className="w-[70px] px-1.5 py-1 border border-gray-200 rounded-lg text-[11px] font-bold bg-white focus:ring-2 focus:ring-indigo-500/20 outline-none">
                      <option value="">P.</option>
                      {rooms.map(r => <option key={r.id} value={r.id}>{r.name || r.id}</option>)}
                    </select>
                    {selRoom && (<span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md border border-emerald-100 shrink-0">{selBed ? `G.${roomBedsList.findIndex(b => b.id === selBed) + 1}` : String.fromCharCode(8212)}</span>)}
                    <select value={ktvDur} onChange={e => updateDurationForIdx(idx, Number(e.target.value))} className="w-[65px] px-1 py-1 border border-amber-200 rounded-lg text-[11px] font-black text-amber-700 bg-amber-50 focus:ring-2 focus:ring-amber-400/20 outline-none">
                      {[...DURATION_PRESETS, ktvDur].filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b).map(d => (<option key={d} value={d}>{d}p</option>))}
                    </select>
                    <div className="flex items-center gap-1">
                      <input type="time" value={startT} onChange={e => updateTimeForIdx(idx, 'start', e.target.value)} className="px-1.5 py-1 border border-indigo-200 rounded-lg text-[11px] font-black text-indigo-700 bg-white focus:ring-2 focus:ring-indigo-500/20 outline-none w-[82px]" />
                      <span className="text-indigo-300 text-[10px]">&rarr;</span>
                      <span className="px-1.5 py-1 border border-indigo-200 rounded-lg text-[11px] font-black text-indigo-700 bg-indigo-50/50 w-[60px] text-center">{endT || '--:--'}</span>
                    </div>
                    <button onClick={() => setShowTicketForIdx(idx)} className="p-1.5 bg-indigo-50 text-indigo-500 hover:bg-indigo-100 border border-indigo-100 rounded-lg transition-all active:scale-90 shrink-0" title="In phiếu"><Printer size={12} /></button>
                  </div>
                  {/* Row 2: Per-KTV Note | Dispatch button */}
                  <div className="flex items-center gap-2 ml-6">
                    <input type="text" value={ktvNote} onChange={e => updateNoteForIdx(idx, e.target.value)} placeholder="Ghi chú riêng..." className="flex-1 px-2.5 py-1.5 border border-gray-100 rounded-xl text-[11px] font-medium focus:ring-2 focus:ring-indigo-500/10 outline-none bg-white placeholder:text-gray-300" />
                    <button onClick={() => onPrint()} className="px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-[10px] font-black rounded-xl transition-all active:scale-95 shrink-0 flex items-center gap-1"><ChevronDown size={10} className="rotate-[-90deg]" />DP</button>
                  </div>
                </div>
              ); })}
            </div>
          </div>
        )}
      </div>
    </div>

    {showTicketForIdx !== null && (() => {
      const idx = showTicketForIdx; const ktvId = state.selectedKtvIds[idx] || ''; const rId = (state.selectedRoomIds || [])[idx] || '';
      const rName = rooms.find(r => r.id === rId)?.name || rId || '---'; const tName = state.displayName || serviceName;
      const sT = (state.ktvStartTimes || [])[idx] || '--:--'; const eT = (state.ktvEndTimes || [])[idx] || '--:--';
      const ticketDur = (state.ktvDurations || [])[idx] || duration;
      const ticketNote = (state.ktvNotes || [])[idx] || '';
      return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" onClick={() => setShowTicketForIdx(null)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-md" />
          <div onClick={(e: React.MouseEvent) => e.stopPropagation()} className="relative bg-white rounded-3xl shadow-2xl w-full max-w-[400px] max-h-[90vh] overflow-y-auto">
            <button onClick={() => setShowTicketForIdx(null)} className="absolute top-4 right-4 z-10 p-2 bg-white/80 hover:bg-white rounded-full shadow-lg border border-gray-200 transition-all active:scale-90"><X size={18} className="text-gray-500" /></button>
            <div className="bg-slate-900 text-white px-6 py-5 flex justify-between items-center rounded-t-3xl">
              <div className="text-4xl font-black italic tracking-tight">{ktvId}</div>
              <div className="text-right"><div className="text-[11px] font-bold tracking-wider opacity-70">Phiếu Tua KTV</div><div className="text-base font-black mt-0.5">{dateFormatted}</div></div>
            </div>
            <div className="px-5 py-5 space-y-4">
              <div className="text-2xl font-black text-red-600 uppercase leading-tight">{tName} ({ticketDur}&apos;)</div>
              <div className="border-[2.5px] border-dashed border-amber-400 rounded-2xl px-4 py-4 text-center">
                <p className="text-[10px] font-black text-amber-800 uppercase tracking-[3px] mb-2">Thời gian thực hiện</p>
                <p className="text-[32px] font-black text-red-600 leading-none tracking-tight">{sT} <span className="text-red-400">&rarr;</span> {eT}</p>
              </div>
              <div className="bg-slate-100 rounded-xl px-4 py-3 border-l-4 border-slate-500">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Phòng</p>
                <p className="text-xl font-black text-red-600 mt-0.5">{rName}</p>
              </div>
              {customerReqs && (customerReqs.strength || customerReqs.focus || customerReqs.avoid || customerReqs.customerNote) && (
                <div className="bg-amber-50/50 border border-amber-100 rounded-2xl p-4 space-y-3 shadow-inner">
                  <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest">⚠️ Yêu Cầu Khách Hàng</p>
                  <div className="flex flex-wrap gap-2">
                    {customerReqs.strength && <span className="px-3 py-1.5 rounded-xl text-[10px] font-black border bg-orange-50 text-orange-700 border-orange-100">💪 Lực: {customerReqs.strength}</span>}
                    {customerReqs.focus && <span className="px-3 py-1.5 rounded-xl text-[10px] font-black border bg-emerald-50 text-emerald-700 border-emerald-100">{customerReqs.focus}</span>}
                    {customerReqs.avoid && <span className="px-3 py-1.5 rounded-xl text-[10px] font-black border bg-rose-50 text-rose-700 border-rose-100">🚫 Tránh: {customerReqs.avoid}</span>}
                  </div>
                  {customerReqs.customerNote && <div className="bg-white/60 px-3 py-2.5 rounded-xl border border-amber-200/50"><p className="text-xs font-bold text-amber-900 italic">{customerReqs.customerNote}</p></div>}
                </div>)}
              {ticketNote && (
                <div className="bg-green-50/50 border border-green-200 rounded-2xl p-4 space-y-3 shadow-inner">
                  <p className="text-[10px] font-black text-green-700 uppercase tracking-widest">📝 Admin Dặn Dò</p>
                  <div className="bg-white/60 px-3 py-2.5 rounded-xl border border-green-200/50"><p className="text-xs font-bold text-green-900 uppercase">{ticketNote}</p></div>
                </div>)}
            </div>
            <div className="text-center py-4 border-t border-gray-200 mt-2"><p className="text-xs text-gray-400 font-semibold italic">Hệ thống Spa Ngân Hà</p></div>
          </div>
        </div>);
    })()}
    </>);
};

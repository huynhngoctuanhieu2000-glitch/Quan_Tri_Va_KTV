'use client';

// 🔧 UI CONFIGURATION
const ANIMATION_DURATION = 0.2;

import React, { useState, useRef, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/lib/auth-context';
import {
    ClipboardList, Camera, Users, CheckCircle2, Timer, Clock,
    MapPin, RotateCcw, ArrowDown, ArrowUp, ChevronRight,
    UserCheck, Wifi, WifiOff, Star, Moon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Image from 'next/image';
import { format } from 'date-fns';

import { supabase } from '@/lib/supabase';

// ─── TYPES ────────────────────────────────────────────────────────────────────

type Tab = 'turns' | 'attendance' | 'ktv-list';

type StaffData = {
    id: string;
    full_name: string;
    status: string;
    gender: string;
    skills: Record<string, string>;
    phone: string;
    position: string;
    avatar_url: string;
    experience: string;
};

type AttendanceRecord = {
    id?: string;
    employee_id: string;
    date: string;
    check_in_time?: string;
    check_out_time?: string;
    status: 'on_duty' | 'absent' | 'off_leave' | 'off_duty';
};

type TurnQueueData = {
    id?: string;
    employee_id: string;
    date: string;
    queue_position: number;
    check_in_order: number;
    status: 'waiting' | 'working' | 'done_turn';
    turns_completed: number;
    current_order_id?: string | null;
    estimated_end_time?: string | null;
    last_served_at?: string | null;
};

// ─── TAB CONFIG ───────────────────────────────────────────────────────────────

type AttendanceStatus = 'on_duty' | 'absent' | 'off_leave' | 'off_duty';
const ATT_OPTIONS: { id: AttendanceStatus; label: string; color: string }[] = [
    { id: 'on_duty', label: 'Có mặt', color: 'bg-emerald-500 text-white' },
    { id: 'absent', label: 'Vắng', color: 'bg-rose-500 text-white' },
    { id: 'off_duty', label: 'Tan ca', color: 'bg-amber-500 text-white' },
    { id: 'off_leave', label: 'Nghỉ phép', color: 'bg-slate-500 text-white' },
];
const TABS: { id: Tab; label: string; icon: React.ReactNode; short: string }[] = [
    { id: 'turns', label: 'Sổ Tua', short: 'Sổ tua', icon: <ClipboardList size={16} /> },
    { id: 'attendance', label: 'Điểm Danh', short: 'Chấm công', icon: <Camera size={16} /> },
    { id: 'ktv-list', label: 'Danh Sách KTV', short: 'DS KTV', icon: <Users size={16} /> },
];

// ──────────────────────────────────────────────────────────────────────────────
// TAB 1: CANH TUA
// ──────────────────────────────────────────────────────────────────────────────

// ──────────────────────────────────────────────────────────────────────────────
// TAB 1: CANH TUA
// ──────────────────────────────────────────────────────────────────────────────

const TurnTab = ({ staffs }: { staffs: StaffData[] }) => {
    const [turns, setTurns] = useState<(TurnQueueData & { staff?: StaffData })[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (staffs.length > 0) {
            fetchTurns();
        }
    }, [staffs]);

    const fetchTurns = async () => {
        setLoading(true);
        const today = new Date().toISOString().split('T')[0];
        const { data } = await supabase
            .from('TurnQueue')
            .select('*')
            .eq('date', today)
            .order('queue_position', { ascending: true });

        if (data) {
            const merged = data.map((t: TurnQueueData) => ({
                ...t,
                staff: staffs.find(s => s.id === t.employee_id)
            }));
            setTurns(merged);
        } else {
            setTurns([]);
        }
        setLoading(false);
    };

    const updatePosition = async (turnId: string, newPos: number) => {
        await supabase.from('TurnQueue').update({ queue_position: newPos }).eq('id', turnId);
    };

    const moveUp = async (ktvId: string) => {
        const idx = turns.findIndex(t => t.employee_id === ktvId);
        if (idx <= 0) return;

        const currentTurn = turns[idx];
        const prevTurn = turns[idx - 1];

        // Swap positions optimistically
        const next = [...turns];
        [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
        setTurns(next);

        // Update DB
        await Promise.all([
            updatePosition(currentTurn.id!, prevTurn.queue_position),
            updatePosition(prevTurn.id!, currentTurn.queue_position)
        ]);
        fetchTurns(); // Refresh to ensure sync
    };

    const moveDown = async (ktvId: string) => {
        const idx = turns.findIndex(t => t.employee_id === ktvId);
        if (idx >= turns.length - 1 || idx === -1) return;

        const currentTurn = turns[idx];
        const nextTurn = turns[idx + 1];

        // Swap positions optimistically
        const next = [...turns];
        [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
        setTurns(next);

        // Update DB
        await Promise.all([
            updatePosition(currentTurn.id!, nextTurn.queue_position),
            updatePosition(nextTurn.id!, currentTurn.queue_position)
        ]);
        fetchTurns(); // Refresh to ensure sync
    };

    const resetTurns = async () => {
        // Reset queue_position to match check_in_order
        const next = [...turns].sort((a, b) => a.check_in_order - b.check_in_order);

        // DB batch update
        for (let i = 0; i < next.length; i++) {
            const pos = i + 1;
            await updatePosition(next[i].id!, pos);
        }
        fetchTurns();
    };

    const readyCount = turns.filter(t => t.status === 'waiting').length;
    const workingCount = turns.filter(t => t.status === 'working').length;

    if (loading) return <div className="p-10 text-center text-gray-500">Đang tải hàng đợi...</div>;

    return (
        <div className="space-y-4">
            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
                {[
                    { label: 'Sẵn Sàng', value: readyCount, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
                    { label: 'Đang Làm', value: workingCount, color: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-200' },
                    { label: 'Tổng Ca', value: turns.length, color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-200' },
                ].map(s => (
                    <div key={s.label} className={`${s.bg} border ${s.border} rounded-xl p-3 text-center`}>
                        <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mt-0.5">{s.label}</p>
                    </div>
                ))}
            </div>

            {/* Queue */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="font-bold text-gray-900 text-sm">Sổ hàng đợi tua</h3>
                    <button
                        onClick={resetTurns}
                        className="flex items-center gap-1 text-xs text-gray-500 hover:text-indigo-600 font-semibold transition-colors"
                    >
                        <RotateCcw size={12} /> Đặt lại theo chấm công
                    </button>
                </div>

                <div className="divide-y divide-gray-50 min-h-[100px]">
                    {turns.length === 0 ? (
                        <div className="p-8 text-center text-gray-400 text-sm">
                            Chưa có KTV nào điểm danh hôm nay
                        </div>
                    ) : turns.map((turn, idx) => (
                        <motion.div
                            layout
                            transition={{ duration: ANIMATION_DURATION }}
                            key={turn.employee_id}
                            className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50/50 transition-colors"
                        >
                            {/* Position badge */}
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm font-black shrink-0 shadow-sm ${turn.status === 'waiting' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' :
                                turn.status === 'working' ? 'bg-rose-100 text-rose-600 border border-rose-200' :
                                    'bg-gray-100 text-gray-500 border border-gray-200'
                                }`}>
                                {turn.queue_position}
                            </div>

                            {/* Name */}
                            <div className="flex-1 min-w-0">
                                <p className="font-bold text-sm text-gray-900 truncate">{turn.staff?.full_name || 'Không rõ'}</p>
                                <div className="flex items-center gap-2 mt-0.5">
                                    <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">{turn.employee_id}</span>
                                    {turn.turns_completed > 0 && (
                                        <span className="text-[10px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded font-bold border border-indigo-100">
                                            Đã làm {turn.turns_completed} tua
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Status badge */}
                            <div className={`px-2.5 py-1.5 rounded-xl text-[10px] font-bold flex items-center gap-1 shrink-0 ${turn.status === 'waiting' ? 'bg-emerald-100 text-emerald-700' :
                                turn.status === 'working' ? 'bg-rose-100 text-rose-700' :
                                    'bg-gray-100 text-gray-500'
                                }`}>
                                {turn.status === 'waiting' ? <CheckCircle2 size={10} /> :
                                    turn.status === 'working' ? <Timer size={10} className="animate-spin" /> :
                                        <Moon size={10} />}
                                <span className="hidden sm:inline">
                                    {turn.status === 'waiting' ? 'Sẵn sàng' : 'Đang làm'}
                                </span>
                            </div>

                            {/* Move buttons */}
                            <div className="flex flex-col gap-0.5 shrink-0 ml-2">
                                <button
                                    onClick={() => moveUp(turn.employee_id)}
                                    disabled={idx === 0}
                                    className="p-1 hover:bg-indigo-50 rounded-md text-gray-400 hover:text-indigo-600 disabled:opacity-25 transition-colors border border-transparent hover:border-indigo-100"
                                >
                                    <ArrowUp size={12} strokeWidth={3} />
                                </button>
                                <button
                                    onClick={() => moveDown(turn.employee_id)}
                                    disabled={idx === turns.length - 1}
                                    className="p-1 hover:bg-indigo-50 rounded-md text-gray-400 hover:text-indigo-600 disabled:opacity-25 transition-colors border border-transparent hover:border-indigo-100"
                                >
                                    <ArrowDown size={12} strokeWidth={3} />
                                </button>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>

            {/* Rules */}
            <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4">
                <h4 className="font-bold text-indigo-800 text-xs uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <Clock size={12} /> Quy Tắc Sổ Tua
                </h4>
                <ul className="space-y-2 text-xs text-indigo-700 font-medium">
                    {[
                        'KTV điểm danh trước → Tua trước',
                        'KTV hoàn thành đơn → Xuống cuối hàng đợi',
                        'Chỉ tính tua khi phục vụ 2 bill khác nhau',
                    ].map((rule, i) => (
                        <li key={i} className="flex items-start gap-2">
                            <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full mt-1 shrink-0" />
                            {rule}
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
};

// ──────────────────────────────────────────────────────────────────────────────
// TAB 2: ĐIỂM DANH (Admin view)
// ──────────────────────────────────────────────────────────────────────────────

const AttendanceTab = ({ staffs }: { staffs: StaffData[] }) => {
    const [attendances, setAttendances] = useState<Record<string, AttendanceRecord>>({});
    const [loading, setLoading] = useState(true);
    const [now] = useState(new Date());

    useEffect(() => {
        fetchAttendances();
    }, []);

    const fetchAttendances = async () => {
        setLoading(true);
        const today = new Date().toISOString().split('T')[0];
        const { data } = await supabase
            .from('DailyAttendance')
            .select('*')
            .eq('date', today);

        const map: Record<string, AttendanceRecord> = {};
        if (data) {
            data.forEach((r: any) => map[r.employee_id] = r);
        }
        setAttendances(map);
        setLoading(false);
    };

    const setStatus = async (staffId: string, status: AttendanceRecord['status']) => {
        const today = new Date().toISOString().split('T')[0];
        const currentTime = format(new Date(), 'HH:mm:ss');
        const existing = attendances[staffId];

        // 1. Check if record exists for today
        const { data: existingAtt } = await supabase
            .from('DailyAttendance')
            .select('id')
            .eq('employee_id', staffId)
            .eq('date', today)
            .maybeSingle();

        const payload = {
            employee_id: staffId,
            date: today,
            status: status,
            check_in_time: (status === 'on_duty' && !existing?.check_in_time) ? currentTime : (existing?.check_in_time || null),
            check_out_time: status === 'off_duty' ? currentTime : (existing?.check_out_time || null),
        };

        // 2. Insert or Update DailyAttendance
        let attData, attError;
        if (existingAtt) {
            const { data: d, error: e } = await supabase
                .from('DailyAttendance')
                .update(payload)
                .eq('id', existingAtt.id)
                .select()
                .single();
            attData = d;
            attError = e;
        } else {
            const { data: d, error: e } = await supabase
                .from('DailyAttendance')
                .insert(payload)
                .select()
                .single();
            attData = d;
            attError = e;
        }

        if (attError) {
            console.error("❌ [KTVHub] Error saving attendance:", attError.message, attError.details, attError.hint);
            return;
        }

        setAttendances(prev => ({ ...prev, [staffId]: attData }));

        // Auto Manage TurnQueue
        if (status === 'on_duty') {
            if (!existing || existing.status !== 'on_duty') {
                // Find max check_in_order
                const { data: currentQueue } = await supabase
                    .from('TurnQueue')
                    .select('check_in_order, queue_position')
                    .eq('date', today);

                let maxOrder = 0;
                let maxPos = 0;
                currentQueue?.forEach(q => {
                    if (q.check_in_order > maxOrder) maxOrder = q.check_in_order;
                    if (q.queue_position > maxPos) maxPos = q.queue_position;
                });

                // 3. Check if turn exists
                const { data: existingTurn } = await supabase
                    .from('TurnQueue')
                    .select('id')
                    .eq('employee_id', staffId)
                    .eq('date', today)
                    .maybeSingle();

                const turnPayload = {
                    employee_id: staffId,
                    date: today,
                    check_in_order: maxOrder + 1,
                    queue_position: maxPos + 1,
                    status: 'waiting',
                    turns_completed: 0
                };

                if (existingTurn) {
                    await supabase
                        .from('TurnQueue')
                        .update(turnPayload)
                        .eq('id', existingTurn.id);
                } else {
                    await supabase
                        .from('TurnQueue')
                        .insert(turnPayload);
                }
            }
        } else {
            // Remove from TurnQueue if not on_duty (absent, off_leave, off_duty)
            await supabase
                .from('TurnQueue')
                .delete()
                .eq('employee_id', staffId)
                .eq('date', today);
        }
    };

    const counts = { on_duty: 0, absent: 0, off_leave: 0, off_duty: 0 };
    Object.values(attendances).forEach(a => {
        if (a.status === 'on_duty') counts.on_duty++;
        if (a.status === 'absent') counts.absent++;
        if (a.status === 'off_leave') counts.off_leave++;
        if (a.status === 'off_duty') counts.off_duty++;
    });

    if (loading) return <div className="p-10 text-center text-gray-500">Đang tải dữ liệu...</div>;

    return (
        <div className="space-y-4">
            {/* Date & Stats */}
            <div className="bg-white border border-gray-200 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                    <div>
                        <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Ngày điểm danh</p>
                        <p className="font-black text-gray-900 text-sm">{format(now, 'EEEE, dd/MM/yyyy')}</p>
                    </div>
                    <p className="text-2xl font-black text-indigo-600">{format(now, 'HH:mm')}</p>
                </div>
                <div className="grid grid-cols-4 gap-2">
                    <div className="flex-1 text-center">
                        <p className="text-2xl font-black text-emerald-600">{counts.on_duty}</p>
                        <p className="text-[10px] text-gray-500 flex items-center justify-center gap-1">
                            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" /> Có mặt
                        </p>
                    </div>
                    <div className="flex-1 text-center">
                        <p className="text-2xl font-black text-rose-500">{counts.absent}</p>
                        <p className="text-[10px] text-gray-500 flex items-center justify-center gap-1">
                            <span className="w-1.5 h-1.5 bg-rose-500 rounded-full" /> Vắng
                        </p>
                    </div>
                    <div className="flex-1 text-center">
                        <p className="text-2xl font-black text-amber-500">{counts.off_duty || 0}</p>
                        <p className="text-[10px] text-gray-500 flex items-center justify-center gap-1">
                            <span className="w-1.5 h-1.5 bg-amber-500 rounded-full" /> Tan ca
                        </p>
                    </div>
                    <div className="flex-1 text-center">
                        <p className="text-2xl font-black text-slate-500">{counts.off_leave}</p>
                        <p className="text-[10px] text-gray-500 flex items-center justify-center gap-1">
                            <span className="w-1.5 h-1.5 bg-slate-500 rounded-full" /> Nghỉ phép
                        </p>
                    </div>
                </div>
            </div>

            {/* KTV Attendance List */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100">
                    <h3 className="font-bold text-gray-900 text-sm">Danh Sách Chấm Công Hôm Nay</h3>
                </div>
                <div className="divide-y divide-gray-50 max-h-[500px] overflow-y-auto">
                    {staffs.map(staff => {
                        const currentAtt = attendances[staff.id];
                        const currentStatus = currentAtt?.status || 'absent';
                        const checkInTime = currentAtt?.check_in_time;

                        return (
                            <div key={staff.id} className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3 hover:bg-gray-50/50 transition-colors">
                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                    {/* Avatar */}
                                    <div className="relative shrink-0">
                                        <img src={staff.avatar_url || `https://ui-avatars.com/api/?name=${staff.full_name}&background=random`} alt={staff.full_name} className="w-10 h-10 rounded-full object-cover border-2 border-white shadow-sm" />
                                        <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${currentStatus === 'on_duty' ? 'bg-emerald-400' :
                                            currentStatus === 'absent' ? 'bg-rose-400' :
                                                currentStatus === 'off_duty' ? 'bg-amber-400' : 'bg-gray-300'
                                            }`} />
                                    </div>

                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                        <p className="font-bold text-sm text-gray-900 truncate">{staff.full_name}</p>
                                        <p className="text-[10px] text-gray-400 font-bold uppercase">{staff.id}</p>
                                        {checkInTime && currentStatus === 'on_duty' && (
                                            <p className="text-[10px] text-emerald-600 font-semibold flex items-center gap-0.5 mt-0.5">
                                                <CheckCircle2 size={9} /> Tới lúc {checkInTime.substring(0, 5)}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                {/* Status selector */}
                                <div className="flex gap-1 shrink-0 w-full sm:w-auto">
                                    {(['on_duty', 'absent', 'off_duty', 'off_leave'] as const).map(s => (
                                        <button
                                            key={s}
                                            onClick={() => setStatus(staff.id, s)}
                                            className={`flex-1 sm:flex-none px-2 py-1.5 sm:py-1 rounded-lg text-[10px] font-bold transition-all border ${currentStatus === s
                                                ? s === 'on_duty' ? 'bg-emerald-500 text-white border-emerald-500 shadow-sm' :
                                                    s === 'absent' ? 'bg-rose-500 text-white border-rose-500 shadow-sm' :
                                                        s === 'off_duty' ? 'bg-amber-500 text-white border-amber-500 shadow-sm' :
                                                            'bg-gray-500 text-white border-gray-500 shadow-sm'
                                                : 'border-gray-200 text-gray-500 hover:border-gray-300 bg-white'
                                                }`}
                                        >
                                            {s === 'on_duty' ? 'Có mặt' : s === 'absent' ? 'Vắng' : s === 'off_duty' ? 'Tan ca' : 'Nghỉ phép'}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

// ──────────────────────────────────────────────────────────────────────────────
// TAB 3: DANH SÁCH KTV
// ──────────────────────────────────────────────────────────────────────────────

const KTVListTab = ({ staffs }: { staffs: StaffData[] }) => {
    const typeofSkillValue = (val: any) => typeof val === 'string' ? val : 'basic';
    const skillEntries = (skills: any) =>
        Object.entries(skills || {}).filter(([, v]) => typeofSkillValue(v) === 'expert' || typeofSkillValue(v) === 'basic');

    const SKILL_LABELS: Record<string, string> = {
        shampoo: 'Gội đầu', thaiBody: 'Massage Thái', oilBody: 'Massage Dầu',
        hotStoneBody: 'Đá Nóng', oilFoot: 'Foot Dầu', acupressureFoot: 'Foot Bấm Huyệt',
        facial: 'Chăm Sóc Da', hairCut: 'Cắt Tóc', earCleaning: 'Ráy Tai',
    };

    return (
        <div className="space-y-3">
            {staffs.map(emp => {
                const expertSkills = skillEntries(emp.skills).filter(([, v]) => typeofSkillValue(v) === 'expert');
                const Avatar = emp.avatar_url || `https://ui-avatars.com/api/?name=${emp.full_name}&background=random`;

                return (
                    <div key={emp.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col sm:flex-row">
                        <div className="p-4 flex items-start gap-4 flex-1">
                            {/* Avatar */}
                            <div className="relative shrink-0">
                                <img src={Avatar} alt={emp.full_name} className="w-14 h-14 rounded-2xl object-cover border-2 border-gray-100 shadow-sm" />
                                <span className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white ${emp.status === 'ĐANG LÀM' ? 'bg-emerald-400' : 'bg-gray-400'}`} />
                            </div>

                            {/* Main info */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                    <p className="font-black text-gray-900 text-base">{emp.full_name}</p>
                                    <span className="text-[10px] font-bold bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded border border-gray-200">{emp.id}</span>
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${emp.gender === 'Nữ' || emp.gender === 'Female' ? 'bg-pink-100 text-pink-600 border border-pink-200' : 'bg-blue-100 text-blue-600 border border-blue-200'}`}>
                                        {emp.gender || 'Nam'}
                                    </span>
                                </div>
                                <p className="text-[11px] text-gray-500 font-medium">{emp.position || 'Kỹ Thuật Viên'} · {emp.experience || '1 năm kinh nghiệm'}</p>

                                {/* Rating (mock for real DB) */}
                                <div className="flex items-center gap-1 mt-1.5">
                                    <Star size={12} className="text-amber-400 fill-amber-400" />
                                    <span className="text-xs font-bold text-amber-600">5.0</span>
                                    <span className="text-[10px] text-gray-400 ml-1.5 font-medium">Hoa hồng 10%</span>
                                </div>

                                {/* Skills */}
                                {expertSkills.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 mt-2.5">
                                        {expertSkills.slice(0, 4).map(([key]) => (
                                            <span key={key} className="text-[10px] px-2 py-1 bg-indigo-50/80 text-indigo-700 rounded-lg font-bold border border-indigo-100/50">
                                                {SKILL_LABELS[key] || key}
                                            </span>
                                        ))}
                                        {expertSkills.length > 4 && (
                                            <span className="text-[10px] px-2 py-1 bg-gray-100 text-gray-500 rounded-lg font-bold border border-gray-200">
                                                +{expertSkills.length - 4}
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                        {/* Status dot mobile/desktop adapt */}
                        <div className={`shrink-0 flex items-center justify-center p-3 sm:px-4 sm:border-l border-t sm:border-t-0 border-gray-100 ${emp.status === 'ĐANG LÀM' ? 'bg-emerald-50/30' : 'bg-gray-50'}`}>
                            <div className={`px-3 py-1.5 rounded-xl text-xs font-bold shadow-sm ${emp.status === 'ĐANG LÀM' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-gray-200 text-gray-500 border border-gray-300'
                                }`}>
                                {emp.status === 'ĐANG LÀM' ? '● Đang làm việc' : '○ Đã nghỉ'}
                            </div>
                        </div>
                    </div>
                );
            })}

            {staffs.length === 0 && (
                <div className="text-center py-12 text-gray-400">
                    <Users size={36} className="mx-auto mb-3 text-gray-200" />
                    <p className="text-sm font-medium">Chưa có KTV nào trong database</p>
                </div>
            )}
        </div>
    );
};

// ──────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ──────────────────────────────────────────────────────────────────────────────

export default function KTVHubPage() {
    const { hasPermission } = useAuth();
    const [mounted, setMounted] = useState(false);
    const [activeTab, setActiveTab] = useState<Tab>('turns');

    const [staffs, setStaffs] = useState<StaffData[]>([]);
    const [loadingStaff, setLoadingStaff] = useState(true);

    useEffect(() => {
        setMounted(true);
        fetchStaff();
    }, []);

    const fetchStaff = async () => {
        setLoadingStaff(true);
        try {
            const { data, error } = await supabase.from('Staff').select('*');
            if (error) {
                console.error("❌ [KTVHub] Error fetching staff:", error);
            }
            if (data) {
                setStaffs(data);
                console.log(`✅ [KTVHub] Fetched ${data.length} staff members`);
            }
        } catch (e) {
            console.error("❌ [KTVHub] Unexpected error:", e);
        } finally {
            setLoadingStaff(false);
        }
    };

    if (!mounted) return null;

    if (!hasPermission('turn_tracking') && !hasPermission('ktv_attendance')) {
        return (
            <AppLayout>
                <div className="flex flex-col items-center justify-center h-64 text-center">
                    <UserCheck size={48} className="text-red-500 mb-4" />
                    <h2 className="text-xl font-bold text-gray-900">Không có quyền truy cập</h2>
                </div>
            </AppLayout>
        );
    }

    return (
        <AppLayout>
            <div className="max-w-3xl mx-auto space-y-5">
                {/* Header */}
                <div>
                    <h1 className="text-xl font-bold text-gray-900 tracking-tight">Sổ Tua KTV</h1>
                    <p className="text-xs text-gray-500 mt-0.5">Sổ tua · Điểm danh · Danh sách kỹ thuật viên</p>
                </div>

                {/* Tab Bar */}
                <div className="flex gap-1.5 bg-gray-100 p-1.5 rounded-2xl w-full">
                    {TABS.map(tab => {
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-sm font-bold transition-all ${isActive
                                    ? 'bg-white shadow-sm text-indigo-700 border border-gray-200/50'
                                    : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'
                                    }`}
                            >
                                <span className={isActive ? 'text-indigo-600' : 'text-gray-400'}>{tab.icon}</span>
                                <span className="hidden sm:inline">{tab.label}</span>
                                <span className="sm:hidden">{tab.short}</span>
                            </button>
                        );
                    })}
                </div>

                {/* Tab Content */}
                <AnimatePresence mode="wait">
                    <motion.div
                        key={activeTab}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: ANIMATION_DURATION }}
                        className="pb-20"
                    >
                        {loadingStaff ? (
                            <div className="flex flex-col items-center justify-center py-20 gap-3">
                                <RotateCcw size={32} className="text-indigo-400 animate-spin" />
                                <p className="text-sm font-medium text-gray-400 font-black italic">Đang tải danh sách KTV...</p>
                            </div>
                        ) : (
                            <>
                                {activeTab === 'turns' && <TurnTab staffs={staffs} />}
                                {activeTab === 'attendance' && <AttendanceTab staffs={staffs} />}
                                {activeTab === 'ktv-list' && <KTVListTab staffs={staffs} />}
                            </>
                        )}
                    </motion.div>
                </AnimatePresence>
            </div>
        </AppLayout>
    );
}

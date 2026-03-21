'use client';

import React from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/lib/auth-context';
import {
    ShieldAlert, TrendingUp, TrendingDown, DollarSign, Users, Calendar,
    Star, Activity, ChevronRight, Loader2, BarChart3, Award, Coins, Globe
} from 'lucide-react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, LineChart, Line, Legend
} from 'recharts';
import { useRevenueReport } from './RevenueReport.logic';

// 🔧 UI CONFIGURATION
const PIE_COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
const DATE_PRESETS = [
    { key: 'today', label: 'Hôm nay' },
    { key: 'week', label: 'Tuần này' },
    { key: 'month', label: 'Tháng này' },
    { key: 'custom', label: 'Tuỳ chọn' },
] as const;

// Language Display Labels
const LANG_DISPLAY: Record<string, { label: string; flag: string }> = {
    'vi': { label: 'Việt', flag: '🇻🇳' },
    'en': { label: 'English', flag: '🇬🇧' },
    'ko': { label: '한국어', flag: '🇰🇷' },
    'zh': { label: '中文', flag: '🇨🇳' },
    'jp': { label: '日本語', flag: '🇯🇵' },
};

// ─── Filter Chip Bar ──────────────────────────────────────────────────────────
const FilterChipBar = ({ label, icon, options, selected, onSelect }: {
    label: string;
    icon: React.ReactNode;
    options: { key: string; label: string }[];
    selected: string;
    onSelect: (key: string) => void;
}) => (
    <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
        <span className="text-xs text-gray-400 shrink-0 flex items-center gap-1">{icon}{label}</span>
        {options.map(o => (
            <button
                key={o.key}
                onClick={() => onSelect(o.key)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                    selected === o.key
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'bg-gray-100 text-gray-600 active:bg-gray-200'
                }`}
            >
                {o.label}
            </button>
        ))}
    </div>
);

// ─── KPI Card ─────────────────────────────────────────────────────────────────
const KPICard = ({ title, value, subtitle, change, icon, color }: {
    title: string;
    value: string;
    subtitle?: string;
    change?: number;
    icon: React.ReactNode;
    color: string;
}) => {
    const isPositive = (change || 0) >= 0;
    return (
        <div className={`bg-white p-5 rounded-2xl border border-gray-100 shadow-sm`}>
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-gray-500">{title}</h3>
                <div className={`p-2 ${color} rounded-xl`}>
                    {icon}
                </div>
            </div>
            <div className="text-3xl font-black text-gray-900 tracking-tight">{value}</div>
            {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
            {change !== undefined && change !== 0 && (
                <p className={`text-xs font-bold mt-2 flex items-center gap-1 ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                    {isPositive ? '+' : ''}{change}% so với kỳ trước
                </p>
            )}
        </div>
    );
};

// ─── Custom Tooltip ───────────────────────────────────────────────────────────
const ChartTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-white shadow-xl rounded-xl border border-gray-100 px-4 py-3 text-sm">
            <p className="font-bold text-gray-700 mb-1">{label}</p>
            {payload.map((p: any, i: number) => (
                <p key={i} className="text-gray-500">
                    <span className="font-bold" style={{ color: p.color }}>{p.name}: </span>
                    {typeof p.value === 'number' ? p.value.toLocaleString('vi-VN') : p.value}
                </p>
            ))}
        </div>
    );
};

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function RevenueReportsPage() {
    const { hasPermission } = useAuth();
    const [mounted, setMounted] = React.useState(false);
    const report = useRevenueReport();
    const [filterLang, setFilterLang] = React.useState('all');

    React.useEffect(() => { setMounted(true); }, []);
    if (!mounted) return null;

    if (!hasPermission('revenue_reports')) {
        return (
            <AppLayout>
                <div className="flex flex-col items-center justify-center h-64 text-center">
                    <ShieldAlert size={48} className="text-red-500 mb-4" />
                    <h2 className="text-xl font-bold text-gray-900">Không có quyền truy cập</h2>
                </div>
            </AppLayout>
        );
    }

    const { summary } = report.data;
    const formatDate = (d: string) => {
        const parts = d.split('-');
        return parts.length === 3 ? `${parts[2]}/${parts[1]}` : d;
    };

    return (
        <AppLayout>
            <div className="space-y-6 max-w-5xl mx-auto">
                {/* ─── Header ─────────────────────────────────────────── */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Doanh Thu & Báo Cáo</h1>
                        <p className="text-sm text-gray-500 mt-1">Tổng quan tình hình kinh doanh của Spa.</p>
                    </div>
                </div>

                {/* ─── Date Picker ────────────────────────────────────── */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 space-y-2.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <Calendar size={14} className="text-gray-400 shrink-0" />
                        {DATE_PRESETS.map(b => (
                            <button
                                key={b.key}
                                onClick={() => report.setDatePreset(b.key)}
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                                    report.datePreset === b.key
                                        ? 'bg-indigo-600 text-white shadow-sm'
                                        : 'bg-gray-100 text-gray-600 active:bg-gray-200'
                                }`}
                            >
                                {b.label}
                            </button>
                        ))}
                    </div>
                    {report.datePreset === 'custom' && (
                        <div className="flex items-center gap-2 flex-wrap">
                            <input
                                type="date" value={report.dateFrom}
                                onChange={e => report.setDateFrom(e.target.value)}
                                className="border border-gray-200 rounded-xl px-2.5 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 flex-1 min-w-[120px]"
                            />
                            <ChevronRight size={14} className="text-gray-300 shrink-0" />
                            <input
                                type="date" value={report.dateTo}
                                onChange={e => report.setDateTo(e.target.value)}
                                className="border border-gray-200 rounded-xl px-2.5 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 flex-1 min-w-[120px]"
                            />
                            <button
                                onClick={report.applyCustomDate}
                                className="px-3 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold active:scale-95 transition-all"
                            >
                                Xem
                            </button>
                        </div>
                    )}
                </div>

                {/* ─── Loading ────────────────────────────────────────── */}
                {report.isLoading && (
                    <div className="py-10 text-center">
                        <Loader2 size={28} className="animate-spin text-indigo-400 mx-auto" />
                        <p className="mt-3 text-sm text-gray-400">Đang tải báo cáo...</p>
                    </div>
                )}

                {!report.isLoading && (
                    <>
                        {/* ─── Filter Chips ───────────────────────── */}
                        {report.data.languageBreakdown.length > 0 && (
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 space-y-2">
                                <FilterChipBar
                                    label="Ngôn ngữ"
                                    icon={<Globe size={12} />}
                                    options={[
                                        { key: 'all', label: 'Tất cả' },
                                        ...report.data.languageBreakdown.map(lb => ({
                                            key: lb.lang,
                                            label: lb.lang,
                                        }))
                                    ]}
                                    selected={filterLang}
                                    onSelect={setFilterLang}
                                />
                            </div>
                        )}

                        {/* ─── KPI Cards ─────────────────────────────── */}
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                            <KPICard
                                title="Tổng Doanh Thu"
                                value={report.formatVND(summary.revenue)}
                                subtitle={report.formatFullVND(summary.revenue)}
                                change={summary.revenueChange}
                                icon={<DollarSign size={18} />}
                                color="bg-emerald-50 text-emerald-600"
                            />
                            <KPICard
                                title="Số Đơn Hàng"
                                value={String(summary.orders)}
                                change={summary.ordersChange}
                                icon={<BarChart3 size={18} />}
                                color="bg-indigo-50 text-indigo-600"
                            />
                            <KPICard
                                title="Khách Hàng Mới"
                                value={String(summary.newCustomers)}
                                change={summary.customersChange}
                                icon={<Users size={18} />}
                                color="bg-purple-50 text-purple-600"
                            />
                            <KPICard
                                title="TB / Đơn"
                                value={report.formatVND(summary.avgPerOrder)}
                                icon={<Activity size={18} />}
                                color="bg-amber-50 text-amber-600"
                            />
                            <KPICard
                                title="Đánh Giá TB"
                                value={summary.avgRating > 0 ? `${summary.avgRating} ★` : '—'}
                                subtitle={summary.avgRating >= 4 ? 'Xuất sắc' : summary.avgRating >= 3 ? 'Tốt' : ''}
                                icon={<Star size={18} />}
                                color="bg-yellow-50 text-yellow-600"
                            />
                            <KPICard
                                title="Tổng Tip"
                                value={summary.totalTip > 0 ? report.formatVND(summary.totalTip) : '0đ'}
                                icon={<Award size={18} />}
                                color="bg-rose-50 text-rose-600"
                            />
                            <KPICard
                                title="Tổng Tiền Tua"
                                value={summary.totalCommission > 0 ? report.formatVND(summary.totalCommission) : '0đ'}
                                subtitle={summary.totalCommission > 0 ? report.formatFullVND(summary.totalCommission) : undefined}
                                icon={<Coins size={18} />}
                                color="bg-cyan-50 text-cyan-600"
                            />
                        </div>

                        {/* ─── Charts Row 1 ──────────────────────────── */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            {/* Daily Revenue Bar Chart */}
                            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                                <h3 className="text-base font-bold text-gray-900 mb-4">Doanh Thu Theo Ngày</h3>
                                {report.data.dailyRevenue.length > 0 ? (
                                    <div className="h-64 w-full">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={report.data.dailyRevenue.map(d => ({
                                                ...d, label: formatDate(d.date),
                                                revenueK: Math.round(d.revenue / 1000),
                                            }))}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                                                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 11 }} />
                                                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 11 }} tickFormatter={(v) => `${v}K`} />
                                                <Tooltip content={<ChartTooltip />} />
                                                <Bar dataKey="revenueK" name="Doanh thu (K)" fill="#4f46e5" radius={[6, 6, 0, 0]} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                ) : (
                                    <div className="h-64 flex items-center justify-center text-gray-300 text-sm">Chưa có dữ liệu</div>
                                )}
                            </div>

                            {/* Service Breakdown Pie */}
                            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                                <h3 className="text-base font-bold text-gray-900 mb-4">Cơ Cấu Dịch Vụ</h3>
                                {report.data.serviceBreakdown.length > 0 ? (
                                    <>
                                        <div className="h-52 w-full">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <PieChart>
                                                    <Pie
                                                        data={report.data.serviceBreakdown}
                                                        cx="50%" cy="50%"
                                                        innerRadius={55} outerRadius={90}
                                                        paddingAngle={3}
                                                        dataKey="revenue"
                                                        nameKey="name"
                                                    >
                                                        {report.data.serviceBreakdown.map((_, idx) => (
                                                            <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                                                        ))}
                                                    </Pie>
                                                    <Tooltip content={<ChartTooltip />} />
                                                </PieChart>
                                            </ResponsiveContainer>
                                        </div>
                                        <div className="flex flex-wrap justify-center gap-3 mt-2">
                                            {report.data.serviceBreakdown.slice(0, 6).map((s, idx) => (
                                                <div key={idx} className="flex items-center gap-1.5 text-xs text-gray-600">
                                                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }} />
                                                    <span className="truncate max-w-[100px]">{s.name}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                ) : (
                                    <div className="h-52 flex items-center justify-center text-gray-300 text-sm">Chưa có dữ liệu</div>
                                )}
                            </div>
                        </div>

                        {/* ─── Charts Row 2: Language + Top KTV ────── */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            {/* Language Breakdown Donut */}
                            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                                <h3 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
                                    <Globe size={16} className="text-indigo-500" />
                                    Cơ Cấu Khách Theo Ngôn Ngữ
                                </h3>
                                {report.data.languageBreakdown.length > 0 ? (
                                    <>
                                        <div className="h-52 w-full">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <PieChart>
                                                    <Pie
                                                        data={report.data.languageBreakdown}
                                                        cx="50%" cy="50%"
                                                        innerRadius={55} outerRadius={90}
                                                        paddingAngle={3}
                                                        dataKey="orders"
                                                        nameKey="lang"
                                                    >
                                                        {report.data.languageBreakdown.map((_, idx) => (
                                                            <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                                                        ))}
                                                    </Pie>
                                                    <Tooltip content={<ChartTooltip />} />
                                                </PieChart>
                                            </ResponsiveContainer>
                                        </div>
                                        <div className="space-y-2 mt-2">
                                            {report.data.languageBreakdown.map((lb, idx) => {
                                                const totalOrders = report.data.languageBreakdown.reduce((s, l) => s + l.orders, 0);
                                                const pct = totalOrders > 0 ? Math.round((lb.orders / totalOrders) * 100) : 0;
                                                return (
                                                    <div key={idx} className="flex items-center justify-between text-sm">
                                                        <div className="flex items-center gap-2">
                                                            <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }} />
                                                            <span className="text-gray-700 font-medium">{lb.lang}</span>
                                                        </div>
                                                        <div className="flex items-center gap-3">
                                                            <span className="text-xs text-gray-400">{lb.orders} đơn</span>
                                                            <span className="text-xs font-bold text-indigo-600">{pct}%</span>
                                                            <span className="text-xs text-gray-500">{report.formatVND(lb.revenue)}</span>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </>
                                ) : (
                                    <div className="h-52 flex items-center justify-center text-gray-300 text-sm">Chưa có dữ liệu</div>
                                )}
                            </div>
                            {/* Top KTV */}
                            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                                <h3 className="text-base font-bold text-gray-900 mb-4">Top Kỹ Thuật Viên</h3>
                                {report.data.topKTV.length > 0 ? (
                                    <div className="space-y-3">
                                        {report.data.topKTV.slice(0, 5).map((ktv, idx) => {
                                            const maxRevenue = report.data.topKTV[0]?.revenue || 1;
                                            const pct = Math.round((ktv.revenue / maxRevenue) * 100);
                                            return (
                                                <div key={ktv.code} className="flex items-center gap-3">
                                                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                                                        idx === 0 ? 'bg-amber-100 text-amber-700' :
                                                        idx === 1 ? 'bg-gray-100 text-gray-600' :
                                                        idx === 2 ? 'bg-orange-100 text-orange-600' :
                                                        'bg-gray-50 text-gray-400'
                                                    }`}>
                                                        {idx + 1}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex justify-between items-baseline mb-1">
                                                            <span className="text-sm font-bold text-gray-800 truncate">{ktv.name}</span>
                                                            <span className="text-xs font-bold text-indigo-600 shrink-0 ml-2">
                                                                {report.formatVND(ktv.revenue)}
                                                            </span>
                                                        </div>
                                                        <div className="h-1.5 bg-gray-100 rounded-full">
                                                            <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                                                        </div>
                                                        <p className="text-[10px] text-gray-400 mt-0.5">{ktv.orders} đơn</p>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="h-48 flex items-center justify-center text-gray-300 text-sm">Chưa có dữ liệu</div>
                                )}
                            </div>

                            {/* Peak Hours */}
                            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                                <h3 className="text-base font-bold text-gray-900 mb-4">Khung Giờ Cao Điểm</h3>
                                {report.data.peakHours.length > 0 ? (
                                    <div className="h-52 w-full">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <LineChart data={report.data.peakHours}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                                                <XAxis dataKey="hour" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 10 }} />
                                                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 11 }} />
                                                <Tooltip content={<ChartTooltip />} />
                                                <Line
                                                    type="monotone" dataKey="count" name="Số đơn"
                                                    stroke="#10b981" strokeWidth={2.5}
                                                    dot={{ r: 3, fill: '#10b981' }}
                                                    activeDot={{ r: 5, stroke: '#10b981' }}
                                                />
                                            </LineChart>
                                        </ResponsiveContainer>
                                    </div>
                                ) : (
                                    <div className="h-52 flex items-center justify-center text-gray-300 text-sm">Chưa có dữ liệu</div>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </AppLayout>
    );
}

'use client';

import React from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/lib/auth-context';
import {
    ShieldAlert, TrendingUp, TrendingDown, DollarSign, Users, Calendar,
    Star, Activity, ChevronRight, Loader2, BarChart3, Award, Coins, Globe, X, Phone, Mail,
    Package, Receipt, Calculator, PieChart as PieChartIcon, Clock, Crown, Download, BedDouble, Gauge
} from 'lucide-react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, LineChart, Line, Legend
} from 'recharts';
import { useRevenueReport, GroupBy } from './RevenueReport.logic';

// 🔧 UI CONFIGURATION
const PIE_COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
const DATE_PRESETS = [
    { key: 'today', label: 'Hôm nay' },
    { key: 'week', label: 'Tuần này' },
    { key: 'month', label: 'Tháng này' },
    { key: 'year', label: 'Năm này' },
    { key: 'custom', label: 'Tuỳ chọn' },
] as const;

const GROUP_BY_OPTIONS: { key: GroupBy; label: string }[] = [
    { key: 'hour', label: 'Giờ' },
    { key: 'day', label: 'Ngày' },
    { key: 'week', label: 'Tuần' },
    { key: 'month', label: 'Tháng' },
];

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => ({ value: i, label: `${i}:00` }));

const KTV_DISPLAY_LIMIT = 5;

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
const KPICard = ({ title, value, subtitle, change, icon, color, href, onClick }: {
    title: string;
    value: string;
    subtitle?: string;
    change?: number;
    icon: React.ReactNode;
    color: string;
    href?: string;
    onClick?: () => void;
}) => {
    const isPositive = (change || 0) >= 0;
    const isClickable = !!(href || onClick);
    const handleClick = (e: React.MouseEvent) => {
        if (onClick) { e.preventDefault(); onClick(); }
    };
    const Wrapper = href ? 'a' : 'div';
    return (
        <Wrapper href={href || undefined} onClick={isClickable ? handleClick : undefined} className={`bg-white p-5 rounded-2xl border border-gray-100 shadow-sm block ${isClickable ? 'cursor-pointer active:scale-[0.98] transition-transform hover:shadow-md' : ''}`}>
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-gray-500">{title}</h3>
                <div className="flex items-center gap-1.5">
                    {isClickable && <ChevronRight size={14} className="text-gray-300" />}
                    <div className={`p-2 ${color} rounded-xl`}>
                        {icon}
                    </div>
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
        </Wrapper>
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
    const [showNewCustomers, setShowNewCustomers] = React.useState(false);
    const [showAllKTV, setShowAllKTV] = React.useState(false);

    React.useEffect(() => { setMounted(true); }, []);
    if (!mounted) return null;

    if (!hasPermission('revenue_reports')) {
        return (
            <AppLayout title="Báo Cáo">
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

    // Get chart data based on groupBy
    const getRevenueChartData = () => {
        switch (report.groupBy) {
            case 'hour':
                return report.data.hourlyRevenue.map(h => ({
                    label: h.label,
                    revenue: h.revenue,
                    revenueK: Math.round(h.revenue / 1000),
                    orders: h.orders,
                }));
            case 'week':
                return report.data.weeklyRevenue.map(w => ({
                    label: formatDate(w.week),
                    revenue: w.revenue,
                    revenueK: Math.round(w.revenue / 1000),
                    orders: w.orders,
                }));
            case 'month':
                return report.data.monthlyRevenue.map(m => ({
                    label: m.month.substring(5), // MM from YYYY-MM
                    revenue: m.revenue,
                    revenueK: Math.round(m.revenue / 1000),
                    orders: m.orders,
                }));
            default: // day
                return report.data.dailyRevenue.map(d => ({
                    label: formatDate(d.date),
                    revenue: d.revenue,
                    revenueK: Math.round(d.revenue / 1000),
                    orders: d.orders,
                }));
        }
    };

    const revenueChartData = getRevenueChartData();
    const chartTitle = { hour: 'Doanh Thu Theo Giờ', day: 'Doanh Thu Theo Ngày', week: 'Doanh Thu Theo Tuần', month: 'Doanh Thu Theo Tháng' }[report.groupBy];

    // Find KTV with highest tip
    const topTipKTV = report.data.topKTV.length > 0
        ? report.data.topKTV.reduce((max, k) => k.totalTip > max.totalTip ? k : max, report.data.topKTV[0])
        : null;

    const displayedKTV = showAllKTV ? report.data.topKTV : report.data.topKTV.slice(0, KTV_DISPLAY_LIMIT);

    return (
        <AppLayout title="Báo Cáo">
            <div className="space-y-6 max-w-5xl mx-auto">
                {/* ─── Header ─────────────────────────────────────────── */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-black text-gray-900 tracking-tight">Báo Cáo Doanh Thu</h1>
                        <p className="text-sm text-gray-500">Tổng quan tình hình kinh doanh của Spa.</p>
                    </div>
                    {!report.isLoading && report.data.summary.orders > 0 && (
                        <button
                            onClick={report.exportToCSV}
                            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-sm font-bold shadow-sm transition-all active:scale-95"
                        >
                            <Download size={16} />
                            Xuất Excel
                        </button>
                    )}
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

                        {/* ─── KPI Cards (10 chỉ số) ──────────────────── */}
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                            {/* #1 Tổng Doanh Thu */}
                            <KPICard
                                title="Tổng Doanh Thu"
                                value={report.formatVND(summary.revenue)}
                                subtitle={report.formatFullVND(summary.revenue)}
                                change={summary.revenueChange}
                                icon={<DollarSign size={18} />}
                                color="bg-emerald-50 text-emerald-600"
                            />
                            {/* #2 Số Lượng DV */}
                            <KPICard
                                title="Số Lượng DV"
                                value={String(summary.totalServiceCount)}
                                subtitle={`${summary.orders} đơn`}
                                icon={<Package size={18} />}
                                color="bg-blue-50 text-blue-600"
                            />
                            {/* #3 Tổng Giá Trị DV */}
                            <KPICard
                                title="Tổng Giá Trị DV"
                                value={report.formatVND(summary.totalServiceRevenue)}
                                subtitle={report.formatFullVND(summary.totalServiceRevenue)}
                                icon={<Receipt size={18} />}
                                color="bg-teal-50 text-teal-600"
                            />
                            {/* #4 CP TB / DV */}
                            <KPICard
                                title="CP TB / DV"
                                value={report.formatVND(summary.costPerService)}
                                subtitle="Tiền tua TB / dịch vụ"
                                icon={<Calculator size={18} />}
                                color="bg-orange-50 text-orange-600"
                            />
                            {/* #5 Tỷ Lệ Chi Phí */}
                            <KPICard
                                title="Tỷ Lệ Chi Phí"
                                value={`${summary.costRatio}%`}
                                subtitle="Tua / Doanh thu"
                                icon={<PieChartIcon size={18} />}
                                color="bg-rose-50 text-rose-600"
                            />
                            {/* #6 Số Khách */}
                            <KPICard
                                title="Số Khách"
                                value={String(summary.uniqueCustomers)}
                                subtitle={`${summary.newCustomers} khách mới`}
                                change={summary.customersChange}
                                icon={<Users size={18} />}
                                color="bg-purple-50 text-purple-600"
                                onClick={() => setShowNewCustomers(true)}
                            />
                            {/* #7 TB / Khách */}
                            <KPICard
                                title="TB / Khách"
                                value={report.formatVND(summary.avgBillPerCustomer)}
                                subtitle={`TB/đơn: ${report.formatVND(summary.avgPerOrder)}`}
                                icon={<Activity size={18} />}
                                color="bg-amber-50 text-amber-600"
                            />
                            {/* Đánh Giá TB */}
                            <KPICard
                                title="Đánh Giá TB"
                                value={summary.avgRating > 0 ? `${summary.avgRating} ★` : '—'}
                                subtitle={summary.avgRating >= 4 ? 'Xuất sắc' : summary.avgRating >= 3 ? 'Tốt' : ''}
                                icon={<Star size={18} />}
                                color="bg-yellow-50 text-yellow-600"
                            />
                            {/* Tổng Tip */}
                            <KPICard
                                title="Tổng Tip"
                                value={summary.totalTip > 0 ? report.formatVND(summary.totalTip) : '0đ'}
                                icon={<Award size={18} />}
                                color="bg-pink-50 text-pink-600"
                            />
                            {/* DT / Giường */}
                            <KPICard
                                title="DT / Giường"
                                value={report.formatVND(summary.revenuePerBed)}
                                subtitle={`${summary.totalBeds} giường`}
                                icon={<BedDouble size={18} />}
                                color="bg-indigo-50 text-indigo-600"
                            />
                            {/* Lấp đầy Giường */}
                            <KPICard
                                title="Lấp đầy Giường"
                                value={`${summary.bedOccupancy}%`}
                                subtitle={summary.bedOccupancy >= 80 ? 'Cao tải' : summary.bedOccupancy >= 50 ? 'Ổn định' : 'Còn trống nhiều'}
                                icon={<Gauge size={18} />}
                                color={summary.bedOccupancy >= 80 ? 'bg-red-50 text-red-600' : summary.bedOccupancy >= 50 ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}
                            />
                        </div>

                        {/* ─── Revenue Chart + Group By ─────────────────── */}
                        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                                <h3 className="text-base font-bold text-gray-900">{chartTitle}</h3>
                                <div className="flex items-center gap-1">
                                    {GROUP_BY_OPTIONS.map(o => (
                                        <button
                                            key={o.key}
                                            onClick={() => report.applyGroupBy(o.key)}
                                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                                                report.groupBy === o.key
                                                    ? 'bg-indigo-600 text-white'
                                                    : 'bg-gray-100 text-gray-500 active:bg-gray-200'
                                            }`}
                                        >
                                            {o.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            {/* Hour range picker — only visible when groupBy = 'hour' */}
                            {report.groupBy === 'hour' && (
                                <div className="flex items-center gap-2 mb-4 flex-wrap">
                                    <Clock size={14} className="text-gray-400" />
                                    <span className="text-xs text-gray-500">Từ</span>
                                    <select
                                        value={report.hourFrom}
                                        onChange={e => report.applyHourFilter(Number(e.target.value), report.hourTo)}
                                        className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                    >
                                        {HOUR_OPTIONS.map(h => (
                                            <option key={h.value} value={h.value}>{h.label}</option>
                                        ))}
                                    </select>
                                    <span className="text-xs text-gray-500">đến</span>
                                    <select
                                        value={report.hourTo}
                                        onChange={e => report.applyHourFilter(report.hourFrom, Number(e.target.value))}
                                        className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                    >
                                        {HOUR_OPTIONS.map(h => (
                                            <option key={h.value} value={h.value}>{h.label}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                            {revenueChartData.length > 0 ? (
                                <div className="h-64 w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={revenueChartData}>
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

                        {/* ─── Charts Row: Service + Language ──────────── */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
                        </div>

                        {/* ─── KTV Section (#8 #9 #10) ──────────────────── */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            {/* Top KTV */}
                            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                                <h3 className="text-base font-bold text-gray-900 mb-4">Bảng Xếp Hạng KTV</h3>
                                {report.data.topKTV.length > 0 ? (
                                    <>
                                        <div className="space-y-2.5">
                                            {displayedKTV.map((ktv, idx) => {
                                                const maxRevenue = report.data.topKTV[0]?.revenue || 1;
                                                const pct = Math.round((ktv.revenue / maxRevenue) * 100);
                                                const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '';
                                                const isTopTip = topTipKTV && ktv.code === topTipKTV.code && ktv.totalTip > 0;
                                                return (
                                                    <div key={ktv.code} className="bg-gray-50 rounded-xl p-3.5 border border-gray-100">
                                                        {/* Row 1: Name + Orders + Rating */}
                                                        <div className="flex items-center justify-between mb-2">
                                                            <div className="flex items-center gap-2">
                                                                {medal ? (
                                                                    <span className="text-base">{medal}</span>
                                                                ) : (
                                                                    <span className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-[10px] font-black text-gray-500">{idx + 1}</span>
                                                                )}
                                                                <span className="text-sm font-bold text-gray-800">{ktv.name}</span>
                                                                {isTopTip && (
                                                                    <span className="px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700 text-[9px] font-black flex items-center gap-0.5">
                                                                        <Crown size={9} /> Top Tip
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                {ktv.avgRating > 0 && (
                                                                    <span className="px-1.5 py-0.5 rounded-md bg-yellow-50 text-yellow-700 text-[10px] font-bold">
                                                                        {ktv.avgRating} ★ <span className="text-gray-400 font-normal">({ktv.ratingCount})</span>
                                                                    </span>
                                                                )}
                                                                <span className="text-[11px] text-gray-400 font-medium">{ktv.orders} đơn</span>
                                                            </div>
                                                        </div>
                                                        {/* Progress bar */}
                                                        <div className="h-1.5 bg-gray-200 rounded-full mb-2.5">
                                                            <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                                                        </div>
                                                        {/* Row 2: Revenue + Commission + Tip */}
                                                        <div className="flex items-center justify-between text-xs flex-wrap gap-1">
                                                            <div className="flex items-center gap-1.5">
                                                                <DollarSign size={12} className="text-emerald-500" />
                                                                <span className="text-gray-500">DT:</span>
                                                                <span className="font-bold text-indigo-600">{report.formatVND(ktv.revenue)}</span>
                                                            </div>
                                                            <div className="flex items-center gap-1.5">
                                                                <Coins size={12} className="text-cyan-500" />
                                                                <span className="text-gray-500">Tua:</span>
                                                                <span className="font-bold text-cyan-600">{report.formatVND(ktv.commission || 0)}</span>
                                                            </div>
                                                            {ktv.totalTip > 0 && (
                                                                <div className="flex items-center gap-1.5">
                                                                    <Award size={12} className="text-pink-500" />
                                                                    <span className="text-gray-500">Tip:</span>
                                                                    <span className="font-bold text-pink-600">{report.formatVND(ktv.totalTip)}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        {/* Show all / Show less */}
                                        {report.data.topKTV.length > KTV_DISPLAY_LIMIT && (
                                            <button
                                                onClick={() => setShowAllKTV(!showAllKTV)}
                                                className="w-full mt-3 py-2 text-xs font-bold text-indigo-600 bg-indigo-50 rounded-xl active:bg-indigo-100 transition-all"
                                            >
                                                {showAllKTV ? 'Thu gọn' : `Xem tất cả ${report.data.topKTV.length} KTV`}
                                            </button>
                                        )}
                                        {/* Tổng Tiền Tua */}
                                        <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <Coins size={16} className="text-cyan-600" />
                                                <span className="text-sm font-bold text-gray-700">Tổng Tiền Tua</span>
                                            </div>
                                            <div className="text-right">
                                                <span className="text-lg font-black text-cyan-600">
                                                    {report.formatVND(summary.totalCommission)}
                                                </span>
                                                {summary.totalCommission > 0 && (
                                                    <p className="text-[10px] text-gray-400">{report.formatFullVND(summary.totalCommission)}</p>
                                                )}
                                            </div>
                                        </div>
                                    </>
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
            {/* New Customer Modal */}
            <NewCustomerModal
                isOpen={showNewCustomers}
                onClose={() => setShowNewCustomers(false)}
                customers={report.data.newCustomerList}
                formatDate={(d: string) => {
                    try { return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
                    catch { return d; }
                }}
            />
        </AppLayout>
    );
}

// ─── New Customer Modal (iOS-style bottom sheet) ─────────────────────────
const NewCustomerModal = ({ isOpen, onClose, customers, formatDate }: {
    isOpen: boolean;
    onClose: () => void;
    customers: { id: string; name: string; phone: string; email: string; createdAt: string }[];
    formatDate: (d: string) => string;
}) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-3xl max-h-[80vh] flex flex-col shadow-2xl">
                {/* Handle */}
                <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mt-3 sm:hidden" />
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-gray-100">
                    <div>
                        <h2 className="text-lg font-black text-gray-900">Khách Hàng Mới</h2>
                        <p className="text-xs text-gray-400 mt-0.5">{customers.length} khách trong kỳ</p>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center active:scale-90 transition-transform">
                        <X size={16} className="text-gray-500" />
                    </button>
                </div>
                {/* List */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {customers.length === 0 ? (
                        <div className="py-12 text-center text-gray-300 text-sm">Chưa có khách hàng mới</div>
                    ) : (
                        customers.map((c, idx) => (
                            <div key={c.id || idx} className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-bold text-gray-800">{c.name}</span>
                                    <span className="text-[10px] text-gray-400">{formatDate(c.createdAt)}</span>
                                </div>
                                <div className="flex items-center gap-4 mt-2">
                                    {c.phone && !c.phone.startsWith('GUEST') && (
                                        <a href={`tel:${c.phone}`} className="flex items-center gap-1 text-xs text-indigo-600">
                                            <Phone size={11} /> {c.phone}
                                        </a>
                                    )}
                                    {c.email && !c.email.includes('no-email') && (
                                        <span className="flex items-center gap-1 text-xs text-gray-500 truncate">
                                            <Mail size={11} /> {c.email}
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

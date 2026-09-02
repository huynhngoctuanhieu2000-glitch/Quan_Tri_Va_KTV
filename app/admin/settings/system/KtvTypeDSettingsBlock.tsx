import React, { useState, useEffect } from 'react';
import { Save, Loader2, CheckCircle2, DollarSign, Star, Coins, AlertTriangle, ShieldCheck } from 'lucide-react';
import { apiClient } from '@/lib/apiClient';
import { API } from '@/lib/api-endpoints';

export function KtvTypeDSettingsBlock() {
    const [configs, setConfigs] = useState<any>({});
    const [isLoading, setIsLoading] = useState(true);
    const [savingGroup, setSavingGroup] = useState<string | null>(null);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

    useEffect(() => {
        fetchConfigs();
    }, []);

    const fetchConfigs = async () => {
        try {
            const data = await apiClient.get<any>(API.ADMIN.SETTINGS_SYSTEM);
            if (data.data) {
                // Ensure json objects are parsed if they are strings, but usually they are already parsed by API
                const parsed = { ...data.data };
                if (typeof parsed.ktv_type_d_rating_deduction === 'string') {
                    try { parsed.ktv_type_d_rating_deduction = JSON.parse(parsed.ktv_type_d_rating_deduction); } catch(e){}
                }
                if (typeof parsed.ktv_type_d_discipline_rules === 'string') {
                    try { parsed.ktv_type_d_discipline_rules = JSON.parse(parsed.ktv_type_d_discipline_rules); } catch(e){}
                }
                
                // Defaults
                if (!parsed.ktv_type_d_rating_deduction) {
                    parsed.ktv_type_d_rating_deduction = { "0": 0, "1": 0.75, "2": 0.5, "3": 0.25, "4": 0 };
                }
                if (!parsed.ktv_type_d_discipline_rules) { parsed.ktv_type_d_discipline_rules = { "ABSENT_NO_NOTICE":10, "ABSENT_EARLY_NOTICE":5, "LATE_NO_UPDATE":5, "ORDER_REJECT_MULTIPLIER":3 }; }
                setConfigs(parsed);
            }
        } catch (error) {
            console.error('Error fetching type d configs', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSaveGroup = async (keys: string[], groupName: string) => {
        setSavingGroup(groupName);
        setSaveStatus('idle');
        try {
            const payload: any = {};
            keys.forEach(k => {
                payload[k] = configs[k];
            });
            const result = await apiClient.patch<any>(API.ADMIN.SETTINGS_SYSTEM, payload);
            if (result.success) {
                setSaveStatus('success');
                setTimeout(() => setSaveStatus('idle'), 3000);
            } else {
                setSaveStatus('error');
            }
        } catch (error) {
            console.error('Error saving configs', error);
            setSaveStatus('error');
        } finally {
            setSavingGroup(null);
        }
    };

    const handleChange = (key: string, value: any) => {
        setConfigs((prev: any) => ({ ...prev, [key]: value }));
    };

    if (isLoading) {
        return (
            <div className="flex justify-center p-12">
                <Loader2 size={32} className="animate-spin text-indigo-500" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* 1. Khung giá tua */}
                <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                                <DollarSign size={20} className="text-blue-500" />
                            </div>
                            <h2 className="text-lg font-black text-gray-900">Khung giá tua (VNĐ/Giờ)</h2>
                        </div>
                        <SaveButton group="rates" savingGroup={savingGroup} saveStatus={saveStatus} onClick={() => handleSaveGroup(['ktv_type_d_vip_rate_per_60m', 'ktv_type_d_pt_rate_per_60m'], 'rates')} />
                    </div>
                    <div className="space-y-4">
                        <NumberInput label="Rate VIP - dịch vụ mã NHP / NHT / VIP" value={configs.ktv_type_d_vip_rate_per_60m ?? 180000} onChange={(v: any) => handleChange('ktv_type_d_vip_rate_per_60m', v)} suffix="VNĐ/giờ" />
                        <NumberInput label="Rate Phổ thông - các dịch vụ còn lại (NHS...)" value={configs.ktv_type_d_pt_rate_per_60m ?? 100000} onChange={(v: any) => handleChange('ktv_type_d_pt_rate_per_60m', v)} suffix="VNĐ/giờ" />
                    </div>
                </div>

                {/* 2. Bonus */}
                <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center">
                                <Coins size={20} className="text-amber-500" />
                            </div>
                            <h2 className="text-lg font-black text-gray-900">Bonus Điểm</h2>
                        </div>
                        <SaveButton group="bonus" savingGroup={savingGroup} saveStatus={saveStatus} onClick={() => handleSaveGroup(['ktv_type_d_bonus_points', 'ktv_bonus_rate_TYPE_D', 'enable_ktv_bonus_TYPE_D'], 'bonus')} />
                    </div>
                    <div className="space-y-4">
                        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                            <div>
                                <p className="font-bold text-gray-900">Trạng thái Bonus</p>
                                <p className="text-xs text-gray-500">Bật/tắt thưởng điểm cho TYPE_D</p>
                            </div>
                            <Toggle value={configs.enable_ktv_bonus_TYPE_D ?? false} onChange={(v: any) => handleChange('enable_ktv_bonus_TYPE_D', v)} />
                        </div>
                        <NumberInput label="Điểm cơ bản mỗi tua" value={configs.ktv_type_d_bonus_points ?? 20} onChange={(v: any) => handleChange('ktv_type_d_bonus_points', v)} suffix="Điểm" />
                        <NumberInput label="Tỉ lệ quy đổi điểm" value={configs.ktv_bonus_rate_TYPE_D ?? 1000} onChange={(v: any) => handleChange('ktv_bonus_rate_TYPE_D', v)} suffix="VNĐ/1đ" />
                    </div>
                </div>

                {/* 3. Phụ & Quỹ */}
                <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center">
                                <ShieldCheck size={20} className="text-emerald-500" />
                            </div>
                            <h2 className="text-lg font-black text-gray-900">Phụ phí & Quỹ</h2>
                        </div>
                        <SaveButton group="funds" savingGroup={savingGroup} saveStatus={saveStatus} onClick={() => handleSaveGroup(['ktv_type_d_internal_fund', 'ktv_type_d_internal_fund_enabled', 'ktv_type_d_reactivation_fee', 'ktv_deposit_amount_TYPE_D'], 'funds')} />
                    </div>
                    <div className="space-y-4">
                        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                            <div>
                                <p className="font-bold text-gray-900">Thu quỹ nội bộ</p>
                                <p className="text-xs text-gray-500">Thu tự động mỗi tháng</p>
                            </div>
                            <Toggle value={configs.ktv_type_d_internal_fund_enabled ?? false} onChange={(v: any) => handleChange('ktv_type_d_internal_fund_enabled', v)} />
                        </div>
                        <NumberInput label="Mức thu quỹ nội bộ" value={configs.ktv_type_d_internal_fund ?? 250000} onChange={(v: any) => handleChange('ktv_type_d_internal_fund', v)} />
                        <NumberInput label="Phí kích hoạt lại" value={configs.ktv_type_d_reactivation_fee ?? 1000000} onChange={(v: any) => handleChange('ktv_type_d_reactivation_fee', v)} />
                        <NumberInput label="Tiền cọc ví" value={configs.ktv_deposit_amount_TYPE_D ?? 1000000} onChange={(v: any) => handleChange('ktv_deposit_amount_TYPE_D', v)} />
                        <p className="text-xs text-gray-400 italic mt-2">* Phí bảo trì và Giặt đồ dùng chung mức global.</p>
                    </div>
                </div>

                {/* 4. Khấu trừ theo sao */}
                <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-rose-50 rounded-xl flex items-center justify-center">
                                <Star size={20} className="text-rose-500" />
                            </div>
                            <h2 className="text-lg font-black text-gray-900">Khấu trừ đánh giá (%)</h2>
                        </div>
                        <SaveButton group="stars" savingGroup={savingGroup} saveStatus={saveStatus} onClick={() => handleSaveGroup(['ktv_type_d_rating_deduction'], 'stars')} />
                    </div>
                    <div className="space-y-3">
                        {[0,1,2,3,4].map(star => (
                            <div key={star} className="flex items-center gap-4">
                                <div className="w-16 font-bold text-gray-700">{star} Sao</div>
                                <NumberInput
                                    value={((configs.ktv_type_d_rating_deduction?.[star] !== undefined ? configs.ktv_type_d_rating_deduction[star] : (star === 4 ? 0 : 1))) * 100}
                                    onChange={(v: any) => {
                                        const newVal = { ...configs.ktv_type_d_rating_deduction, [star]: v / 100 };
                                        handleChange('ktv_type_d_rating_deduction', newVal);
                                    }}
                                    suffix="%"
                                />
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* 5. Kỷ luật trừ giờ */}
            <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-gray-100">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center">
                            <AlertTriangle size={20} className="text-red-500" />
                        </div>
                        <h2 className="text-lg font-black text-gray-900">Kỷ luật trừ giờ tích lũy</h2>
                    </div>
                    <SaveButton group="discipline" savingGroup={savingGroup} saveStatus={saveStatus} onClick={() => handleSaveGroup(['ktv_type_d_discipline_rules'], 'discipline')} />
                </div>
                
                <div className="space-y-4 max-w-2xl">
                    <NumberInput label="Bỏ lịch / báo trễ (từ 07:00)" value={configs.ktv_type_d_discipline_rules?.ABSENT_NO_NOTICE ?? 10} onChange={(v:any) => handleChange('ktv_type_d_discipline_rules', {...configs.ktv_type_d_discipline_rules, ABSENT_NO_NOTICE: v})} suffix="Giờ" />
                    <NumberInput label="Báo vắng hoặc trễ (trước 06:59)" value={configs.ktv_type_d_discipline_rules?.ABSENT_EARLY_NOTICE ?? 5} onChange={(v:any) => handleChange('ktv_type_d_discipline_rules', {...configs.ktv_type_d_discipline_rules, ABSENT_EARLY_NOTICE: v})} suffix="Giờ" />
                    <NumberInput label="Đi trễ không cập nhật" value={configs.ktv_type_d_discipline_rules?.LATE_NO_UPDATE ?? 5} onChange={(v:any) => handleChange('ktv_type_d_discipline_rules', {...configs.ktv_type_d_discipline_rules, LATE_NO_UPDATE: v})} suffix="Giờ" />
                    <NumberInput label="Từ chối tua đã gán (hệ số x thời lượng)" value={configs.ktv_type_d_discipline_rules?.ORDER_REJECT_MULTIPLIER ?? 3} onChange={(v:any) => handleChange('ktv_type_d_discipline_rules', {...configs.ktv_type_d_discipline_rules, ORDER_REJECT_MULTIPLIER: v})} suffix="x giờ tua" />
                </div>
            </div>
        </div>
    );
}

// ----- UI Helpers -----

function SaveButton({ group, savingGroup, saveStatus, onClick }: any) {
    return (
        <div className="flex items-center gap-3">
            {saveStatus === 'success' && savingGroup === group && (
                <span className="text-emerald-500 text-xs font-bold flex items-center gap-1"><CheckCircle2 size={14} /> Đã lưu</span>
            )}
            <button
                onClick={onClick}
                disabled={savingGroup === group}
                className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-bold uppercase tracking-wider text-xs hover:bg-indigo-700 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50"
            >
                {savingGroup === group ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Lưu
            </button>
        </div>
    );
}

function NumberInput({ label, value, onChange, suffix = 'VNĐ' }: any) {
    const [displayValue, setDisplayValue] = useState('');

    useEffect(() => {
        setDisplayValue(value ? Number(value).toLocaleString('vi-VN') : '0');
    }, [value]);

    const handleChange = (e: any) => {
        const raw = e.target.value.replace(/[^0-9]/g, '');
        setDisplayValue(raw ? Number(raw).toLocaleString('vi-VN') : '');
    };

    const handleBlur = () => {
        const raw = displayValue.replace(/[^0-9]/g, '');
        onChange(raw ? Number(raw) : 0);
    };

    return (
        <div>
            {label && <label className="block text-xs font-black uppercase tracking-wider text-gray-500 mb-2">{label}</label>}
            <div className="relative">
                <input
                    type="text"
                    value={displayValue}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    className="w-full bg-gray-50 border-2 border-gray-100 rounded-xl px-4 py-3 text-lg font-bold text-gray-900 focus:border-indigo-400 focus:ring-0 transition-colors"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-gray-400">{suffix}</span>
            </div>
        </div>
    );
}

function Toggle({ value, onChange }: any) {
    return (
        <button
            onClick={() => onChange(!value)}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                value ? 'bg-indigo-500' : 'bg-gray-300'
            }`}
        >
            <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    value ? 'translate-x-5' : 'translate-x-0'
                }`}
            />
        </button>
    );
}

import { FeatureFlagsTypeA, FeatureFlagsTypeB, FeatureFlagsTypeD } from '../types/staff.types';

export const DEFAULT_KPI_TARGET_HOURS = 80;
export const DEFAULT_TRAVEL_MINUTES = 15;

export const WORK_TYPE_LABELS = {
    TYPE_A: 'Cơ bản',
    TYPE_B: 'Hợp tác',
    TYPE_C: 'Nhập tay',
    TYPE_D: 'Khoán'
};

export const DEFAULT_FEATURE_FLAGS_TYPE_A: FeatureFlagsTypeA = {
    overtime_enabled: true,
    shift_bonus_enabled: true
};

export const DEFAULT_FEATURE_FLAGS_TYPE_B: FeatureFlagsTypeB = {
    fixed_order_bonus_enabled: true,
    vip_menu_enabled: true,
    kpi_target_hours: DEFAULT_KPI_TARGET_HOURS
};

export const DEFAULT_FEATURE_FLAGS_TYPE_D: FeatureFlagsTypeD = {
    laundry_deduction: true,
    sudden_leave_penalty: false,
    allow_on_call: false,
    enable_employee_tasks: false,
    tua_wallet: true,
    bonus_wallet: true,
    savings_wallet: false,
    maintenance_fee: true,
    internal_fund_enabled: true,
    withdraw_morning_only: true
};

export const TYPE_D_DISCIPLINE_PENALTIES = {
    ABSENT_NO_NOTICE: 10,
    ABSENT_EARLY_NOTICE: 5,
    LATE_NO_UPDATE: 5,
    ORDER_REJECT_MULTIPLIER: 3
} as const;

export const TYPE_D_RATING_DEDUCTION = {
    4: 0,
    3: 0.25,
    2: 0.50,
    1: 0.75,
    0: 0
} as const;

export const TYPE_D_BONUS = {
    BASE_POINTS: 20
} as const;

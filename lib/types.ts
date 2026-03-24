export type ModuleId =
  | 'dashboard'
  | 'dispatch_board'
  | 'order_management'
  | 'customer_management'
  | 'revenue_reports'
  | 'payroll_commissions'
  | 'cashbook_supplies'
  | 'web_booking'
  | 'service_menu'
  | 'role_management'
  | 'employee_management'
  | 'ktv_hub'
  | 'ktv_dashboard'
  | 'ktv_attendance'
  | 'ktv_leave'
  | 'ktv_performance'
  | 'ktv_history'
  | 'turn_tracking'
  | 'service_handbook'
  | 'ai_features'
  | 'staff_notifications'
  | 'device_management'
  | 'settings';

export interface ModuleDefinition {
  id: ModuleId;
  name: string;
  group: string;
}

export type SkillLevel = 'none' | 'basic' | 'expert' | 'training';

export interface EmployeeSkills {
  hairCut: SkillLevel;
  shampoo: SkillLevel;
  hairExtensionShampoo: SkillLevel;
  earCleaning: SkillLevel;
  machineShave: SkillLevel;
  razorShave: SkillLevel;
  facial: SkillLevel;
  thaiBody: SkillLevel;
  shiatsuBody: SkillLevel;
  oilBody: SkillLevel;
  hotStoneBody: SkillLevel;
  scrubBody: SkillLevel;
  oilFoot: SkillLevel;
  hotStoneFoot: SkillLevel;
  acupressureFoot: SkillLevel;
  heelScrub: SkillLevel;
  maniPedi: SkillLevel;
}

export interface Employee {
  id: string;
  code: string;
  name: string;
  status: 'active' | 'inactive';
  username?: string;
  password?: string;
  dob: string;
  gender: 'Nam' | 'Nữ' | 'Khác' | string;
  idCard: string;
  phone: string;
  email: string;
  bankAccount: string;
  bankName: string;
  photoUrl: string;
  position: string;
  experience: string;
  joinDate: string;
  height: number;
  weight: number;
  skills: EmployeeSkills;
  baseSalary: number;
  commissionRate: number;
  rating: number;
}

export interface Role {
  id: string;
  name: string;
  permissions: ModuleId[];
}

export interface User {
  id: string;
  name: string;
  roleId: string;
  avatarUrl?: string;
  password?: string;
}

export interface Customer {
  id: string;
  fullName: string;
  phone: string;
  email?: string;
  gender?: string;
  birthday?: string;
  notes?: string;
  lastVisited?: string;
  createdAt?: string;
  updatedAt?: string;
  // Aggregated fields
  totalSpent?: number;
  visitCount?: number;
}

export interface Room {
  id: string;
  name: string;
  type: string;
  floor: number;
  status: 'available' | 'occupied' | 'cleaning' | 'maintenance';
}

export interface Bed {
  id: string;
  roomId: string;
  name: string;
  status: 'available' | 'occupied';
}

export interface Service {
  id: string;
  name: string;
  nameVN?: string;
  category: string;
  duration: number;
  price: number;
  priceVND?: number;
  description?: string;
  imageUrl?: string;
  image_url?: string;
  isActive?: boolean;
  isBestSeller?: boolean;
  isBestChoice?: boolean;
}

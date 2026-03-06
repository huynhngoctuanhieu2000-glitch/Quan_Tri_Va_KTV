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
  | 'settings';

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

export type SkillLevel = 'none' | 'basic' | 'expert' | 'training';

export interface Employee {
  id: string;
  code: string;
  name: string;
  status: 'active' | 'inactive';
  username?: string;
  password?: string;
  dob: string;
  gender: 'Nam' | 'Nữ' | 'Khác';
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
  skills: {
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
  };
  baseSalary: number;
  commissionRate: number;
  rating: number;
}

export const MOCK_ROLES: Role[] = [
  {
    id: 'admin',
    name: 'Admin Tối Cao',
    permissions: [
      'dashboard',
      'dispatch_board',
      'order_management',
      'customer_management',
      'revenue_reports',
      'payroll_commissions',
      'cashbook_supplies',
      'web_booking',
      'service_menu',
      'role_management',
      'employee_management',
      'ktv_hub',
      'ktv_dashboard',
      'ktv_attendance',
      'ktv_leave',
      'ktv_performance',
      'ktv_history',
      'turn_tracking',
      'service_handbook',
      'ai_features',
      'settings',
    ],
  },
  {
    id: 'reception',
    name: 'Lễ Tân',
    permissions: ['dashboard', 'dispatch_board', 'order_management', 'customer_management', 'ktv_hub', 'turn_tracking', 'service_handbook', 'settings'],
  },
  {
    id: 'accountant',
    name: 'Kế Toán',
    permissions: ['revenue_reports', 'payroll_commissions', 'cashbook_supplies', 'settings'],
  },
  {
    id: 'ktv',
    name: 'Kỹ Thuật Viên',
    permissions: ['ktv_dashboard', 'ktv_attendance', 'ktv_leave', 'ktv_performance', 'ktv_history', 'service_handbook', 'settings'],
  },
  {
    id: 'branch_manager',
    name: 'Quản Lý Chi Nhánh',
    permissions: [
      'dashboard',
      'dispatch_board',
      'order_management',
      'customer_management',
      'revenue_reports',
      'payroll_commissions',
      'cashbook_supplies',
      'turn_tracking',
      'service_handbook',
      'employee_management',
      'settings',
    ],
  },
  {
    id: 'web_manager',
    name: 'Quản Lý Web',
    permissions: ['dashboard', 'web_booking', 'service_menu', 'ai_features', 'service_handbook', 'settings'],
  },
];

export const MOCK_USERS: User[] = [
  { id: 'u1', name: 'Nguyễn Văn Admin', roleId: 'admin', avatarUrl: 'https://picsum.photos/seed/u1/200/200', password: '123' },
  { id: 'u2', name: 'Trần Thị Lễ Tân', roleId: 'reception', avatarUrl: 'https://picsum.photos/seed/u2/200/200', password: '123' },
  { id: 'u3', name: 'Lê Văn Kế Toán', roleId: 'accountant', avatarUrl: 'https://picsum.photos/seed/u3/200/200', password: '123' },
  { id: 'u4', name: 'Phạm KTV 1', roleId: 'ktv', avatarUrl: 'https://picsum.photos/seed/u4/200/200', password: '123' },
  { id: 'u5', name: 'Hoàng Quản Lý CN', roleId: 'branch_manager', avatarUrl: 'https://picsum.photos/seed/u5/200/200', password: '123' },
  { id: 'u6', name: 'Mai Quản Lý Web', roleId: 'web_manager', avatarUrl: 'https://picsum.photos/seed/u6/200/200', password: '123' },
];

export const MODULES = [
  { id: 'dashboard', name: 'Bảng Điều Khiển Chính', group: 'Hệ Thống' },
  { id: 'dispatch_board', name: 'Bảng Điều Phối Trung Tâm', group: 'Vận Hành' },
  { id: 'order_management', name: 'Quản Lý Đơn (Kanban)', group: 'Vận Hành' },
  { id: 'customer_management', name: 'Quản Lý Khách Hàng', group: 'Vận Hành' },
  { id: 'revenue_reports', name: 'Doanh Thu & Báo Cáo', group: 'Tài Chính & Kế Toán' },
  { id: 'payroll_commissions', name: 'Tính Lương & Hoa Hồng', group: 'Tài Chính & Kế Toán' },
  { id: 'cashbook_supplies', name: 'Sổ Quỹ & Vật Tư', group: 'Tài Chính & Kế Toán' },
  { id: 'web_booking', name: 'Quản Lý Web Booking', group: 'Thiết Lập Nội Dung' },
  { id: 'service_menu', name: 'Quản Lý Menu Dịch Vụ', group: 'Thiết Lập Nội Dung' },
  { id: 'role_management', name: 'Quản Lý Phân Quyền', group: 'Hệ Thống' },
  { id: 'employee_management', name: 'Quản Lý KTV', group: 'Hệ Thống' },
  { id: 'ktv_dashboard', name: 'Đơn Hàng Hiện Tại', group: 'Kỹ Thuật Viên' },
  { id: 'ktv_attendance', name: 'Chấm Công', group: 'Kỹ Thuật Viên' },
  { id: 'ktv_leave', name: 'Đăng Ký OFF', group: 'Kỹ Thuật Viên' },
  { id: 'ktv_performance', name: 'Hiệu Suất & Thu Nhập', group: 'Kỹ Thuật Viên' },
  { id: 'ktv_history', name: 'Lịch Sử Đơn Hàng', group: 'Kỹ Thuật Viên' },
  { id: 'ktv_hub', name: 'Sổ Tua KTV', group: 'Vận Hành' },
  { id: 'turn_tracking', name: 'Theo Dõi Thứ Tự Tua', group: 'Vận Hành' },
  { id: 'service_handbook', name: 'Cẩm Nang Dịch Vụ', group: 'Kỹ Thuật Viên' },
  { id: 'ai_features', name: 'AI Studio (Ảnh & Video)', group: 'Hệ Thống' },
  { id: 'settings', name: 'Cài Đặt', group: 'Hệ Thống' },
];

export const MOCK_CONFIG = {
  internal_qr_url: 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=https://nganhaspa.vn/internal',
  spa_name: 'Ngân Hà Spa',
  spa_address: '123 Đường Ngân Hà, Quận 1, TP. HCM',
};

export interface TurnRecord {
  ktvId: string;
  ktvName: string;
  ktvCode: string;
  position: number;
  status: 'ready' | 'working' | 'off';
  lastTurnTime?: string;
}

export const MOCK_TURNS: TurnRecord[] = [
  { ktvId: 'e1', ktvName: 'Nguyễn Thị Hoa', ktvCode: 'KTV001', position: 1, status: 'ready', lastTurnTime: '2026-03-02 18:30' },
  { ktvId: 'e2', ktvName: 'Trần Anh Tuấn', ktvCode: 'KTV002', position: 2, status: 'working', lastTurnTime: '2026-03-02 20:15' },
  { ktvId: 'e3', ktvName: 'Lê Thu Thảo', ktvCode: 'KTV003', position: 3, status: 'ready', lastTurnTime: '2026-03-02 19:00' },
  { ktvId: 'e4', ktvName: 'Phạm Minh Hoàng', ktvCode: 'KTV004', position: 4, status: 'off' },
];

export interface HandbookItem {
  id: string;
  title: string;
  category: string;
  steps: string[];
  duration: string;
  notes: string;
}

export const MOCK_HANDBOOK: HandbookItem[] = [
  {
    id: 'hb1',
    title: 'Quy trình Gội Đầu Dưỡng Sinh',
    category: 'Gội Đầu',
    duration: '45 - 60 phút',
    steps: [
      'Chào đón khách và mời khách thay đồ.',
      'Khai thông huyệt đạo vùng đầu.',
      'Gội đầu lần 1 bằng dầu gội thảo dược.',
      'Massage cổ vai gáy và tay.',
      'Gội đầu lần 2 và xả tóc.',
      'Sấy tóc và mời khách dùng trà.'
    ],
    notes: 'Luôn kiểm tra nhiệt độ nước trước khi gội cho khách.'
  },
  {
    id: 'hb2',
    title: 'Quy trình Massage Body Đá Nóng',
    category: 'Massage',
    duration: '90 phút',
    steps: [
      'Khởi động cơ thể bằng kỹ thuật ấn huyệt.',
      'Thoa tinh dầu và massage nhẹ nhàng toàn thân.',
      'Sử dụng đá nóng để massage các vùng cơ căng thẳng.',
      'Đặt đá nóng dọc sống lưng và lòng bàn chân.',
      'Kết thúc bằng massage đầu và lau sạch dầu thừa.'
    ],
    notes: 'Đá nóng cần được làm nóng ở nhiệt độ 50-60 độ C.'
  }
];

export interface Bed {
  id: string;
  roomId: string;
  roomName: string;
  type: string;
  status: 'available' | 'occupied' | 'cleaning';
  ktv?: string;
  timeRemaining?: number;
  capabilities: string[];
}

export const MOCK_BEDS: Bed[] = [
  // V1 - 2 beds
  { id: 'V1-1', roomId: 'V1', roomName: 'V1', type: 'Giường', status: 'available', capabilities: ['Body', 'Foot', 'Facial', 'Heel Skin Shave', 'Manicure & Pedicure', 'Ear Clean', 'Barber'] },
  { id: 'V1-2', roomId: 'V1', roomName: 'V1', type: 'Giường', status: 'occupied', ktv: 'Nguyễn KTV', timeRemaining: 15, capabilities: ['Body', 'Foot', 'Facial', 'Heel Skin Shave', 'Manicure & Pedicure', 'Ear Clean', 'Barber'] },

  // V2 - 2 beds
  { id: 'V2-1', roomId: 'V2', roomName: 'V2', type: 'Giường', status: 'available', capabilities: ['Body', 'Foot', 'Facial', 'Heel Skin Shave', 'Manicure & Pedicure', 'Ear Clean', 'Barber'] },
  { id: 'V2-2', roomId: 'V2', roomName: 'V2', type: 'Giường', status: 'available', capabilities: ['Body', 'Foot', 'Facial', 'Heel Skin Shave', 'Manicure & Pedicure', 'Ear Clean', 'Barber'] },

  // V3 - 2 beds
  { id: 'V3-1', roomId: 'V3', roomName: 'V3', type: 'Giường', status: 'occupied', ktv: 'Trần KTV', timeRemaining: 45, capabilities: ['Body', 'Foot', 'Hair Wash', 'Facial', 'Heel Skin Shave', 'Manicure & Pedicure', 'Ear Clean', 'Barber'] },
  { id: 'V3-2', roomId: 'V3', roomName: 'V3', type: 'Giường', status: 'available', capabilities: ['Body', 'Foot', 'Hair Wash', 'Facial', 'Heel Skin Shave', 'Manicure & Pedicure', 'Ear Clean', 'Barber'] },

  // V4 - 1 bed
  { id: 'V4-1', roomId: 'V4', roomName: 'V4', type: 'Giường Gội', status: 'cleaning', timeRemaining: 5, capabilities: ['Body', 'Foot', 'Hair Wash', 'Facial', 'Heel Skin Shave', 'Manicure & Pedicure', 'Ear Clean', 'Barber'] },

  // PG - 2 beds
  { id: 'PG-1', roomId: 'PG', roomName: 'PG', type: 'Giường Gội', status: 'available', capabilities: ['Body', 'Foot', 'Hair Wash', 'Facial', 'Heel Skin Shave', 'Manicure & Pedicure', 'Ear Clean', 'Barber'] },
  { id: 'PG-2', roomId: 'PG', roomName: 'PG', type: 'Giường Gội', status: 'available', capabilities: ['Body', 'Foot', 'Hair Wash', 'Facial', 'Heel Skin Shave', 'Manicure & Pedicure', 'Ear Clean', 'Barber'] },

  // YUMI - 5 beds
  { id: 'YUMI-1', roomId: 'YUMI', roomName: 'YUMI', type: 'Ghế Đa Năng', status: 'available', capabilities: ['Body', 'Foot', 'Facial', 'Heel Skin Shave', 'Manicure & Pedicure', 'Ear Clean', 'Barber'] },
  { id: 'YUMI-2', roomId: 'YUMI', roomName: 'YUMI', type: 'Ghế Đa Năng', status: 'available', capabilities: ['Body', 'Foot', 'Facial', 'Heel Skin Shave', 'Manicure & Pedicure', 'Ear Clean', 'Barber'] },
  { id: 'YUMI-3', roomId: 'YUMI', roomName: 'YUMI', type: 'Ghế Đa Năng', status: 'available', capabilities: ['Body', 'Foot', 'Facial', 'Heel Skin Shave', 'Manicure & Pedicure', 'Ear Clean', 'Barber'] },
  { id: 'YUMI-4', roomId: 'YUMI', roomName: 'YUMI', type: 'Ghế Đa Năng', status: 'available', capabilities: ['Body', 'Foot', 'Facial', 'Heel Skin Shave', 'Manicure & Pedicure', 'Ear Clean', 'Barber'] },
  { id: 'YUMI-5', roomId: 'YUMI', roomName: 'YUMI', type: 'Ghế Đa Năng', status: 'available', capabilities: ['Body', 'Foot', 'Facial', 'Heel Skin Shave', 'Manicure & Pedicure', 'Ear Clean', 'Barber'] },

  // T - 12 beds (10 Foot + 2 Barber)
  ...Array.from({ length: 10 }, (_, i) => ({
    id: `T-${i + 1}`,
    roomId: 'T',
    roomName: 'T',
    type: 'Ghế Foot',
    status: 'available' as const,
    capabilities: ['Foot', 'Heel Skin Shave', 'Manicure & Pedicure', 'Ear Clean', 'Barber']
  })),
  { id: 'T-11', roomId: 'T', roomName: 'T', type: 'Ghế Barber', status: 'available', capabilities: ['Foot', 'Heel Skin Shave', 'Manicure & Pedicure', 'Ear Clean', 'Barber'] },
  { id: 'T-12', roomId: 'T', roomName: 'T', type: 'Ghế Barber', status: 'available', capabilities: ['Foot', 'Heel Skin Shave', 'Manicure & Pedicure', 'Ear Clean', 'Barber'] },
];

export const MOCK_ROOMS_LIST = [
  { id: 'V1', name: 'V1', capacity: 2, type: 'Giường' },
  { id: 'V2', name: 'V2', capacity: 2, type: 'Giường' },
  { id: 'V3', name: 'V3', capacity: 2, type: 'Giường' },
  { id: 'V4', name: 'V4', capacity: 1, type: 'Giường Gội' },
  { id: 'PG', name: 'PG', capacity: 2, type: 'Giường Gội' },
  { id: 'YUMI', name: 'YUMI', capacity: 5, type: 'Ghế Đa Năng' },
  { id: 'T', name: 'T', capacity: 12, type: 'Hỗn hợp' },
];

export const MOCK_EMPLOYEES: Employee[] = [
  {
    id: 'e1',
    code: 'KTV001',
    name: 'Nguyễn Thị Hoa',
    status: 'active',
    dob: '1995-05-15',
    gender: 'Nữ',
    idCard: '012345678901',
    phone: '0901234567',
    email: 'hoa.nt@nganhaspa.vn',
    bankAccount: '123456789',
    bankName: 'Vietcombank',
    photoUrl: 'https://picsum.photos/seed/e1/200/200',
    position: 'Kỹ Thuật Viên Cấp Cao',
    experience: '5 năm',
    joinDate: '2022-01-10',
    height: 160,
    weight: 48,
    skills: {
      hairCut: 'none',
      shampoo: 'expert',
      hairExtensionShampoo: 'basic',
      earCleaning: 'expert',
      machineShave: 'none',
      razorShave: 'none',
      facial: 'expert',
      thaiBody: 'expert',
      shiatsuBody: 'basic',
      oilBody: 'expert',
      hotStoneBody: 'expert',
      scrubBody: 'training',
      oilFoot: 'expert',
      hotStoneFoot: 'expert',
      acupressureFoot: 'expert',
      heelScrub: 'expert',
      maniPedi: 'basic',
    },
    baseSalary: 8000000,
    commissionRate: 15,
    rating: 4.8,
  },
  {
    id: 'e2',
    code: 'KTV002',
    name: 'Trần Anh Tuấn',
    status: 'active',
    dob: '1992-08-20',
    gender: 'Nam',
    idCard: '012345678902',
    phone: '0987654321',
    email: 'tuan.ta@nganhaspa.vn',
    bankAccount: '987654321',
    bankName: 'Techcombank',
    photoUrl: 'https://picsum.photos/seed/e2/200/200',
    position: 'Kỹ Thuật Viên',
    experience: '3 năm',
    joinDate: '2023-03-15',
    height: 175,
    weight: 70,
    skills: {
      hairCut: 'expert',
      shampoo: 'expert',
      hairExtensionShampoo: 'none',
      earCleaning: 'expert',
      machineShave: 'expert',
      razorShave: 'expert',
      facial: 'none',
      thaiBody: 'basic',
      shiatsuBody: 'none',
      oilBody: 'expert',
      hotStoneBody: 'expert',
      scrubBody: 'none',
      oilFoot: 'expert',
      hotStoneFoot: 'expert',
      acupressureFoot: 'expert',
      heelScrub: 'none',
      maniPedi: 'none',
    },
    baseSalary: 7000000,
    commissionRate: 12,
    rating: 4.5,
  }
];

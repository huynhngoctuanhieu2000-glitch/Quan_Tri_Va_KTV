import { ModuleId, ModuleDefinition } from './types';

export const MODULES: ModuleDefinition[] = [
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

export const SYSTEM_CONFIG = {
  spa_name: 'Ngân Hà Spa',
  spa_address: '123 Đường Ngân Hà, Quận 1, TP. HCM',
  internal_qr_url: 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=https://nganhaspa.vn/internal',
};

export interface StaffAssignment {
  id: string; // Internal mapping ID
  ktvId: string;
  ktvName: string;
  startTime: string;
  duration: number;
  endTime: string;
  noteForKtv: string;
}

export interface ServiceBlock {
  id: string; // BookingItem ID
  serviceName: string;
  serviceDescription?: string;
  duration: number;
  selectedRoomId: string | null;
  bedId: string | null;
  staffList: StaffAssignment[];
  adminNote: string;
  genderReq: string;
  strength: string;
  focus: string;
  avoid: string;
  customerNote: string;
}

export type DispatchStatus = 'pending' | 'dispatched' | 'in_progress' | 'cleaning' | 'waiting_rating' | 'done';

export interface PendingOrder {
  id: string; // Booking ID
  billCode: string;
  customerName: string;
  phone: string;
  time: string;
  services: ServiceBlock[];
  dispatchStatus: DispatchStatus;
  createdAt: string;
  totalAmount?: number;
  paymentMethod?: string;
  rawStatus?: string;
  hasAssignedKtv?: boolean;
}

export type StaffData = {
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

export type TurnQueueData = {
  id?: string;
  employee_id: string;
  date: string;
  queue_position: number;
  check_in_order: number;
  status: 'waiting' | 'working' | 'done_turn';
  turns_completed: number;
  current_order_id?: string | null;
  estimated_end_time?: string | null;
};

export interface StaffNotification {
  id: string;
  bookingId: string;
  type: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

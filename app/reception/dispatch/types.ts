export interface WorkSegment {
  id: string;
  roomId: string | null;
  bedId: string | null;
  startTime: string;
  duration: number;
  endTime: string;
}

export interface StaffAssignment {
  id: string; // Internal mapping ID
  ktvId: string;
  ktvName: string;
  segments: WorkSegment[];
  noteForKtv: string;
}

export interface ServiceBlock {
  id: string; // BookingItem ID
  serviceId?: string;
  serviceName: string;
  serviceDescription?: string;
  duration: number;
  price?: number;
  quantity?: number;
  selectedRoomId: string | null;
  bedId: string | null;
  staffList: StaffAssignment[];
  adminNote: string;
  genderReq: string;
  strength: string;
  focus: string;
  avoid: string;
  customerNote: string;
  options?: any;
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
  timeStart?: string | null;
  timeEnd?: string | null;
  customerLang?: string;
  accessToken?: string | null;
}

export type StaffData = {
  id: string;
  full_name: string;
  status: string;
  gender: string;
  skills: Record<string, boolean>;
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
  status: 'waiting' | 'working' | 'done_turn' | 'off';
  turns_completed: number;
  current_order_id?: string | null;
  booking_item_id?: string | null;
  room_id?: string | null;
  bed_id?: string | null;
  estimated_end_time?: string | null;
  start_time?: string | null;
  last_served_at?: string | null;
};

export interface StaffNotification {
  id: string;
  bookingId: string;
  type: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

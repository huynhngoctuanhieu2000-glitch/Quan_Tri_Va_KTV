'use server';

// ═══════════════════════════════════════════════════════
// Web Booking Server Actions
// Handle incoming bookings from the web booking platform
// ═══════════════════════════════════════════════════════

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { sendPushNotification } from '@/lib/push-helper';

// ─── TYPES ────────────────────────────────────────────────────────────────────

export type WebBookingStatus = 'NEW' | 'PENDING' | 'PREPARING' | 'IN_PROGRESS' | 'COMPLETED' | 'DONE' | 'FEEDBACK' | 'CANCELLED';

export interface WebBookingItem {
  id: string;
  serviceId: string;
  serviceName: string;
  duration: number;
  price: number;
  quantity: number;
  options?: Record<string, any>;
}

export interface WebBooking {
  id: string;
  billCode: string;
  branchName: string | null;
  bookingDate: string;
  timeBooking: string | null;
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  customerLang: string | null;
  notes: string | null;
  totalAmount: number;
  status: WebBookingStatus;
  createdAt: string;
  updatedAt: string;
  accessToken: string | null;
  items: WebBookingItem[];
}

// ─── SERVER ACTIONS ───────────────────────────────────────────────────────────

/**
 * Fetch web bookings for a date range.
 * Includes BookingItems with service name resolution.
 */
export async function getWebBookings(startDate: string, endDate: string) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) throw new Error('Supabase admin not initialized');

    const startOfRange = `${startDate} 00:00:00`;
    const endOfRange = `${endDate} 23:59:59`;

    // Fetch bookings with billCode starting with 'WB' (web bookings only), excluding cancelled
    const { data: bookings, error: bError } = await supabase
      .from('Bookings')
      .select('*')
      .gte('bookingDate', startOfRange)
      .lte('bookingDate', endOfRange)
      .neq('status', 'CANCELLED')
      .like('billCode', 'WB%') // Only web bookings
      .order('createdAt', { ascending: false });

    if (bError) throw bError;
    if (!bookings || bookings.length === 0) return { success: true, data: [] as WebBooking[] };

    // Fetch all services for name resolution
    const { data: allServices } = await supabase
      .from('Services')
      .select('id, code, nameVN, nameEN, duration, priceVND')
      .limit(1000);

    const servicesMap: Record<string, { name: string; duration: number; price: number }> = {};
    if (allServices) {
      allServices.forEach((s: any) => {
        const name =
          typeof s.nameVN === 'object' && s.nameVN !== null
            ? s.nameVN.vn || s.nameVN.en || ''
            : s.nameVN || s.nameEN || '';
        const info = { name, duration: s.duration ?? 60, price: s.priceVND ?? 0 };
        if (s.id) servicesMap[String(s.id).toLowerCase()] = info;
        if (s.code) servicesMap[String(s.code).toLowerCase()] = info;
      });
    }

    // Fetch BookingItems for all bookings
    const bookingIds = bookings.map((b: any) => b.id);
    const { data: items } = await supabase
      .from('BookingItems')
      .select('*')
      .in('bookingId', bookingIds);

    // Map to WebBooking type
    const result: WebBooking[] = bookings.map((b: any) => {
      const bookingItems: WebBookingItem[] = (items || [])
        .filter((i: any) => i.bookingId === b.id)
        .map((i: any) => {
          const svcKey = String(i.serviceId || '').toLowerCase();
          const svcInfo = servicesMap[svcKey];
          return {
            id: i.id,
            serviceId: i.serviceId || '',
            serviceName: svcInfo?.name || `Dịch vụ ${i.serviceId}`,
            duration: svcInfo?.duration ?? i.duration ?? 60,
            price: i.price ?? svcInfo?.price ?? 0,
            quantity: i.quantity ?? 1,
            options: i.options ?? {},
          };
        });

      return {
        id: b.id,
        billCode: b.billCode || b.id,
        branchName: b.branchName || null,
        bookingDate: b.bookingDate || '',
        timeBooking: b.timeBooking || null,
        customerName: b.customerName || 'Khách',
        customerPhone: b.customerPhone || null,
        customerEmail: b.customerEmail || null,
        customerLang: b.customerLang || 'vi',
        notes: b.notes || null,
        totalAmount: Number(b.totalAmount) || 0,
        status: (b.status as WebBookingStatus) || 'NEW',
        createdAt: b.createdAt || '',
        updatedAt: b.updatedAt || '',
        accessToken: b.accessToken || null,
        items: bookingItems,
      };
    });

    return { success: true, data: result };
  } catch (error: any) {
    console.error('❌ [WebBooking] getWebBookings error:', error);
    return { success: false, error: error.message, data: [] as WebBooking[] };
  }
}

/**
 * Confirm a web booking: NEW → PENDING
 * The booking will now appear in the Dispatch Board.
 */
export async function confirmWebBooking(bookingId: string) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) throw new Error('Supabase admin not initialized');

    const { error } = await supabase
      .from('Bookings')
      .update({
        status: 'PENDING',
        updatedAt: new Date().toISOString(),
      })
      .eq('id', bookingId)
      .eq('status', 'NEW'); // Safety: only update if still NEW

    if (error) throw error;

    // Notify reception/admin about confirmed booking ready for dispatch
    sendPushNotification({
      title: '✅ Đơn web đã xác nhận!',
      message: `Đơn ${bookingId} đã được xác nhận. Vui lòng vào Điều Phối để phân công KTV.`,
      targetRoles: ['ADMIN', 'RECEPTIONIST'],
      url: '/reception/dispatch',
    }).catch((err) => console.error('Push error:', err));

    return { success: true };
  } catch (error: any) {
    console.error('❌ [WebBooking] confirmWebBooking error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Reject a web booking: NEW → CANCELLED
 */
export async function rejectWebBooking(bookingId: string, reason?: string) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) throw new Error('Supabase admin not initialized');

    const { error } = await supabase
      .from('Bookings')
      .update({
        status: 'CANCELLED',
        notes: reason ? `[Từ chối]: ${reason}` : '[Từ chối bởi lễ tân]',
        updatedAt: new Date().toISOString(),
      })
      .eq('id', bookingId)
      .eq('status', 'NEW'); // Safety: only update if still NEW

    if (error) throw error;

    return { success: true };
  } catch (error: any) {
    console.error('❌ [WebBooking] rejectWebBooking error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get count of NEW bookings (for sidebar badge).
 */
export async function getNewWebBookingCount(): Promise<number> {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) return 0;

    const { count } = await supabase
      .from('Bookings')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'NEW');

    return count ?? 0;
  } catch {
    return 0;
  }
}

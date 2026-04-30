'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, parseISO, differenceInMinutes } from 'date-fns';

const supabase = createClient();

// 🔧 SHIFT CONFIGURATION
const SHIFT_START_TIMES: Record<string, string> = {
  'CA1': '09:00',
  'CA2': '11:00',
  'CA3': '17:00',
  'FULL': '09:00',
};

export interface AttendanceRecord {
  date: string;
  employeeId: string;
  employeeName: string;
  shiftType: string;
  checkIn: string | null;
  checkOut: string | null;
  lateMins: number;
  status: 'present' | 'late' | 'off' | 'suddenOff' | 'absent';
}

export const usePayrollLogic = () => {
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [leaves, setLeaves] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const monthStr = format(selectedMonth, 'yyyy-MM');
  const startDate = startOfMonth(selectedMonth);
  const endDate = endOfMonth(selectedMonth);

  const fetchData = async () => {
    setLoading(true);
    try {
      const startDateISO = format(startDate, 'yyyy-MM-dd');
      const endDateISO = format(endDate, 'yyyy-MM-dd');

      const [staffRes, attRes, shiftRes, leaveRes] = await Promise.all([
        supabase.from('Staff').select('id, full_name').eq('status', 'ĐANG LÀM'),
        supabase.from('DailyAttendance')
          .select('*')
          .gte('date', startDateISO)
          .lte('date', endDateISO),
        supabase.from('KTVShifts')
          .select('*')
          .eq('status', 'ACTIVE'),
        supabase.from('KTVLeaveRequests')
          .select('*')
          .gte('date', startDateISO)
          .lte('date', endDateISO)
          .eq('status', 'APPROVED'),
      ]);

      if (staffRes.data) setStaffList(staffRes.data);
      if (attRes.data) setAttendance(attRes.data);
      if (shiftRes.data) setShifts(shiftRes.data);
      if (leaveRes.data) setLeaves(leaveRes.data);
    } catch (error) {
      console.error('Error fetching payroll data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedMonth]);

  const processedData = useMemo(() => {
    const days = eachDayOfInterval({ start: startDate, end: endDate });
    const records: AttendanceRecord[] = [];

    staffList.forEach(staff => {
      // Find the active shift for this staff
      const staffShift = shifts.find(s => s.employeeId === staff.id);
      const shiftType = staffShift?.shiftType || 'SHIFT_1'; // Default to SHIFT_1 instead of OFF to avoid "Nghi phep" spam

      days.forEach(day => {
        const dateStr = format(day, 'yyyy-MM-dd');
        
        // Find leave
        const dayLeave = leaves.find(l => l.employeeId === staff.id && l.date === dateStr);
        
        // Find attendance
        const dayAtt = attendance.find(a => a.employee_id === staff.id && a.date === dateStr);

        let status: AttendanceRecord['status'] = 'absent';
        let lateMins = 0;

        if (dayLeave) {
          status = dayLeave.is_sudden_off ? 'suddenOff' : 'off';
        } else if (dayAtt) {
          if (dayAtt.status === 'on_duty' || dayAtt.status === 'off_duty') {
            status = 'present';
            // Calculate late mins based on check_in_time
            if (dayAtt.check_in_time) {
              const shiftStartTime = SHIFT_START_TIMES[shiftType];
              if (shiftStartTime) {
                const [sh, sm] = shiftStartTime.split(':').map(Number);
                const [ah, am] = dayAtt.check_in_time.split(':').map(Number);
                
                const scheduledTotal = sh * 60 + sm;
                const actualTotal = ah * 60 + am;

                if (actualTotal > scheduledTotal) {
                  lateMins = actualTotal - scheduledTotal;
                  if (lateMins > 0) status = 'late';
                }
              }
            }
          } else if (dayAtt.status === 'off_leave') {
            status = 'off';
          } else if (dayAtt.status === 'absent') {
            status = 'absent';
          }
        } else if (day > new Date()) {
          status = 'off'; // Future dates
        } else {
            // No attendance found for a past date
            status = 'absent';
        }

        records.push({
          date: dateStr,
          employeeId: staff.id,
          employeeName: staff.full_name,
          shiftType: status === 'off' ? 'OFF' : shiftType,
          checkIn: dayAtt?.check_in_time || null,
          checkOut: dayAtt?.check_out_time || null,
          lateMins,
          status
        });
      });
    });

    return records.filter(r => !selectedDate || r.date === selectedDate);
  }, [staffList, attendance, shifts, leaves, startDate, endDate, selectedDate]);

  const summary = useMemo(() => {
    return {
      totalDays: processedData.filter(r => r.status === 'present' || r.status === 'late').length,
      totalLate: processedData.filter(r => r.status === 'late').length,
      totalSuddenOff: processedData.filter(r => r.status === 'suddenOff').length,
      totalLeave: processedData.filter(r => r.status === 'off').length,
    };
  }, [processedData]);

  return {
    selectedMonth,
    setSelectedMonth,
    selectedDate,
    setSelectedDate,
    processedData,
    summary,
    loading,
    refresh: fetchData
  };
};

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const envContent = fs.readFileSync('.env.local', 'utf8');
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) process.env[match[1].trim()] = match[2].trim();
});

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const { data: booking } = await supabase.from('Bookings').select('*').eq('billCode', '004-13052026').single();
  if (!booking) { console.log('NOT FOUND'); return; }
  
  // Check segments in detail (actualStartTime vs planned startTime)
  const { data: items } = await supabase.from('BookingItems').select('id, serviceId, technicianCodes, segments, status, timeStart').eq('bookingId', booking.id).order('id');
  console.log('=== SEGMENT DETAIL (planned vs actual) ===');
  (items || []).forEach((item, i) => {
    let segs = [];
    try { segs = typeof item.segments === 'string' ? JSON.parse(item.segments) : (item.segments || []); } catch {}
    console.log('');
    console.log('Item ' + (i+1) + ': ' + item.serviceId + ' | KTV: ' + JSON.stringify(item.technicianCodes));
    segs.forEach((s, si) => {
      console.log('  Planned:  start=' + s.startTime + ' end=' + s.endTime + ' dur=' + s.duration);
      console.log('  Actual:   actualStart=' + (s.actualStartTime || 'N/A') + ' actualEnd=' + (s.actualEndTime || 'N/A'));
    });
  });

  // Check notifications sent for this booking
  console.log('');
  console.log('=== NOTIFICATIONS ===');
  const { data: notifs } = await supabase.from('StaffNotifications')
    .select('employeeId, message, createdAt')
    .eq('bookingId', booking.id)
    .eq('type', 'NEW_ORDER')
    .order('createdAt');
  (notifs || []).forEach(n => {
    console.log('  ' + n.employeeId + ': ' + n.message);
  });

  // Check TurnQueue history for this booking
  console.log('');
  console.log('=== TURN QUEUE (current) ===');
  const ktvIds = [...new Set((items || []).flatMap(i => i.technicianCodes || []))];
  const { data: turns } = await supabase.from('TurnQueue').select('employee_id, status, start_time, estimated_end_time, current_order_id').eq('date', '2026-05-13').in('employee_id', ktvIds);
  (turns || []).forEach(t => {
    console.log('  ' + t.employee_id + ': status=' + t.status + ' start=' + t.start_time + ' end=' + t.estimated_end_time + ' order=' + t.current_order_id);
  });
})();

// Check NH018 shift history to diagnose "date drift" issue
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
    console.log('=== NH018 SHIFT HISTORY (KTVShifts) ===');
    const { data: shifts, error: sErr } = await supabase
        .from('KTVShifts')
        .select('id, employeeId, employeeName, shiftType, effectiveFrom, previousShift, reason, status, createdAt')
        .eq('employeeId', 'NH018')
        .order('createdAt', { ascending: false })
        .limit(15);
    
    if (sErr) console.error('Error:', sErr);
    else {
        shifts.forEach(s => {
            console.log(`  [${s.status}] ${s.shiftType} | from: ${s.effectiveFrom} | prev: ${s.previousShift} | reason: ${s.reason} | created: ${s.createdAt?.slice(0,19)}`);
        });
    }

    console.log('\n=== NH018 ATTENDANCE HISTORY (Last 10) ===');
    const { data: att, error: aErr } = await supabase
        .from('KTVAttendance')
        .select('id, employeeId, employeeName, checkType, status, checkedAt, reason')
        .or(`employeeId.eq.NH018,employeeName.eq.NH018`)
        .order('checkedAt', { ascending: false })
        .limit(10);
    
    if (aErr) console.error('Error:', aErr);
    else {
        att.forEach(a => {
            console.log(`  [${a.checkType}] ${a.status} | ${a.checkedAt?.slice(0,19)} | reason: ${a.reason || '-'}`);
        });
    }

    // Check current ACTIVE shift
    console.log('\n=== NH018 CURRENT ACTIVE SHIFT ===');
    const { data: active } = await supabase
        .from('KTVShifts')
        .select('*')
        .eq('employeeId', 'NH018')
        .eq('status', 'ACTIVE')
        .maybeSingle();
    
    if (active) {
        console.log(`  ShiftType: ${active.shiftType}`);
        console.log(`  EffectiveFrom: ${active.effectiveFrom}`);
        console.log(`  PreviousShift: ${active.previousShift}`);
        console.log(`  Reason: ${active.reason}`);
    } else {
        console.log('  No ACTIVE shift found!');
    }

    // Check Users table for NH018 auth info (to find the UUID)
    console.log('\n=== NH018 USER INFO ===');
    const { data: user } = await supabase
        .from('Users')
        .select('id, code, fullName, isOnShift')
        .eq('code', 'NH018')
        .maybeSingle();
    
    if (user) {
        console.log(`  UUID: ${user.id}`);
        console.log(`  Name: ${user.fullName}`);
        console.log(`  IsOnShift: ${user.isOnShift}`);
        
        // Now check attendance with the UUID
        console.log('\n=== NH018 ATTENDANCE (by UUID) Last 10 ===');
        const { data: att2 } = await supabase
            .from('KTVAttendance')
            .select('id, checkType, status, checkedAt, reason')
            .eq('employeeId', user.id)
            .order('checkedAt', { ascending: false })
            .limit(10);
        
        (att2 || []).forEach(a => {
            console.log(`  [${a.checkType}] ${a.status} | ${a.checkedAt?.slice(0,19)} | reason: ${a.reason || '-'}`);
        });
    } else {
        console.log('  User not found with code NH018');
    }

    // Check KTVLeaveRequests for NH018
    console.log('\n=== NH018 LEAVE REQUESTS (Last 5) ===');
    const { data: leaves } = await supabase
        .from('KTVLeaveRequests')
        .select('id, employeeId, date, reason, status, is_sudden_off')
        .eq('employeeId', user?.id || 'NH018')
        .order('date', { ascending: false })
        .limit(5);
    
    (leaves || []).forEach(l => {
        console.log(`  ${l.date} | ${l.status} | sudden: ${l.is_sudden_off} | reason: ${l.reason}`);
    });
}

check().catch(console.error);

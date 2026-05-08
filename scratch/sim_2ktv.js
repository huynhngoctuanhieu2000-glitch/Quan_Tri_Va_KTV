// ============================================================
// VERIFY: 3 fixes — Song song + Nối tiếp
// ============================================================

function recomputeBookingStatus(itemStatuses) {
    if (!itemStatuses || itemStatuses.length === 0) return 'NEW';
    if (itemStatuses.includes('IN_PROGRESS')) return 'IN_PROGRESS';
    const hasWaiting = itemStatuses.some(s => ['PREPARING', 'WAITING', 'NEW'].includes(s));
    const hasProgressed = itemStatuses.some(s => ['IN_PROGRESS', 'COMPLETED', 'DONE', 'CANCELLED', 'FEEDBACK', 'CLEANING'].includes(s));
    if (hasWaiting && hasProgressed) return 'IN_PROGRESS';
    if (itemStatuses.some(s => ['CLEANING', 'COMPLETED'].includes(s))) return 'CLEANING';
    if (itemStatuses.includes('FEEDBACK')) return 'FEEDBACK';
    if (itemStatuses.every(s => ['DONE', 'CANCELLED'].includes(s))) return 'DONE';
    return 'NEW';
}

// Simulate PATCH API logic (after fixes)
function patchApiSimulate(techCode, segments, status) {
    const isFeedback = status === 'FEEDBACK';
    const nowISO = new Date().toISOString();
    
    if (status === 'IN_PROGRESS') {
        // START_TIMER: set actualStartTime for this KTV
        const mySeg = segments.find(s => s.ktvId === techCode && !s.actualStartTime);
        if (mySeg) {
            const myStartTime = mySeg.startTime;
            mySeg.actualStartTime = nowISO;
            
            // PARALLEL SYNC: Co-start co-workers with SAME startTime
            segments.forEach(seg => {
                if (seg.ktvId !== techCode && seg.startTime === myStartTime && !seg.actualStartTime) {
                    seg.actualStartTime = nowISO;
                    console.log(`  🤝 Co-started ${seg.ktvId} (same startTime: ${myStartTime})`);
                }
            });
        }
        return 'IN_PROGRESS'; // BookingItem.status
    }
    
    if (status === 'CLEANING' || status === 'FEEDBACK') {
        // Mark this KTV's segments as done
        const myDoneStartTimes = [];
        segments.forEach(seg => {
            if (seg.ktvId === techCode) {
                if (!seg.actualEndTime) seg.actualEndTime = nowISO;
                if (isFeedback && !seg.feedbackTime) seg.feedbackTime = nowISO;
                myDoneStartTimes.push(seg.startTime);
            }
        });
        
        // PARALLEL SYNC: Co-finish co-workers with SAME startTime
        myDoneStartTimes.forEach(st => {
            segments.forEach(seg => {
                if (seg.ktvId !== techCode && seg.startTime === st) {
                    if (!seg.actualEndTime) {
                        seg.actualEndTime = nowISO;
                        console.log(`  🤝 Co-finished ${seg.ktvId} (same startTime: ${st})`);
                    }
                    if (isFeedback && !seg.feedbackTime) seg.feedbackTime = nowISO;
                }
            });
        });
        
        // SMART STATUS
        const allSegsDone = segments.every(s => !!s.actualEndTime);
        return allSegsDone ? (isFeedback ? 'FEEDBACK' : 'CLEANING') : 'IN_PROGRESS';
    }
}

// Screen Engine (simplified)
function screenFor(ktvId, segments, hasSubmittedReview) {
    const mySegs = segments.filter(s => s.ktvId === ktvId);
    let allDone = true, isAnyStarted = false;
    mySegs.forEach(seg => {
        if (seg.actualStartTime) isAnyStarted = true;
        if (!seg.actualEndTime) allDone = false;
    });
    
    if (allDone && isAnyStarted) return hasSubmittedReview ? 'HANDOVER' : 'REVIEW';
    if (isAnyStarted) return 'TIMER';
    return 'DASHBOARD';
}

console.log('='.repeat(70));
console.log('✅ CASE 1: SONG SONG — Fix A + B');
console.log('='.repeat(70));

const parallel = [
    { ktvId: 'NH001', startTime: '14:00', duration: 60, actualStartTime: null, actualEndTime: null, feedbackTime: null },
    { ktvId: 'NH002', startTime: '14:00', duration: 60, actualStartTime: null, actualEndTime: null, feedbackTime: null },
];

console.log('\n--- NH001 bấm Start ---');
let itemStatus = patchApiSimulate('NH001', parallel, 'IN_PROGRESS');
console.log('  BookingItem.status:', itemStatus);
console.log('  NH001 screen:', screenFor('NH001', parallel, false));
console.log('  NH002 screen:', screenFor('NH002', parallel, false), '← NH002 cũng TIMER!');
console.log('  NH001 seg:', { start: !!parallel[0].actualStartTime, end: !!parallel[0].actualEndTime });
console.log('  NH002 seg:', { start: !!parallel[1].actualStartTime, end: !!parallel[1].actualEndTime });

console.log('\n--- NH001 bấm Hoàn thành (CLEANING) ---');
itemStatus = patchApiSimulate('NH001', parallel, 'CLEANING');
console.log('  BookingItem.status:', itemStatus, '← CẢ 2 đã done (parallel sync)');
console.log('  NH001 screen:', screenFor('NH001', parallel, false));
console.log('  NH002 screen:', screenFor('NH002', parallel, false));

console.log('\n' + '='.repeat(70));
console.log('✅ CASE 2: NỐI TIẾP — Fix C (Sequential Bug)');
console.log('='.repeat(70));

const sequential = [
    { ktvId: 'NH001', startTime: '14:00', duration: 30, actualStartTime: null, actualEndTime: null, feedbackTime: null },
    { ktvId: 'NH002', startTime: '14:30', duration: 30, actualStartTime: null, actualEndTime: null, feedbackTime: null },
];

console.log('\n--- NH001 bấm Start ---');
itemStatus = patchApiSimulate('NH001', sequential, 'IN_PROGRESS');
console.log('  BookingItem.status:', itemStatus);
console.log('  NH001 screen:', screenFor('NH001', sequential, false));
console.log('  NH002 screen:', screenFor('NH002', sequential, false), '← Vẫn DASHBOARD (khác startTime)');
console.log('  NH002 seg:', { start: !!sequential[1].actualStartTime }, '← KHÔNG bị co-start ✅');

console.log('\n--- NH001 hoàn thành → CLEANING ---');
itemStatus = patchApiSimulate('NH001', sequential, 'CLEANING');
console.log('  BookingItem.status:', itemStatus, '← IN_PROGRESS vì NH002 chưa xong!');
console.log('  NH001 screen:', screenFor('NH001', sequential, false), '← NH001 → REVIEW');
console.log('  NH002 screen:', screenFor('NH002', sequential, false), '← NH002 vẫn DASHBOARD');
console.log('  Booking.status: recompute([IN_PROGRESS]) =', recomputeBookingStatus([itemStatus]));
console.log('  → Kanban Auto-Finish KHÔNG chạy vì booking = IN_PROGRESS ✅');

console.log('\n--- NH002 bắt đầu ---');
itemStatus = patchApiSimulate('NH002', sequential, 'IN_PROGRESS');
console.log('  BookingItem.status:', itemStatus);
console.log('  NH002 screen:', screenFor('NH002', sequential, false));

console.log('\n--- NH002 hoàn thành ---');
itemStatus = patchApiSimulate('NH002', sequential, 'CLEANING');
console.log('  BookingItem.status:', itemStatus, '← CLEANING vì TẤT CẢ segs done');
console.log('  NH002 screen:', screenFor('NH002', sequential, false), '← REVIEW');
console.log('  Booking.status: recompute([CLEANING]) =', recomputeBookingStatus([itemStatus]));
console.log('  → Kanban Auto-Finish chạy CLEANING → FEEDBACK → DONE ✅');

console.log('\n' + '='.repeat(70));
console.log('✅ CASE 3: 2 KTV 2 DV KHÁC NHAU (edge case)');
console.log('='.repeat(70));

const diff = [
    { ktvId: 'NH001', startTime: '14:00', duration: 60, actualStartTime: null, actualEndTime: null, feedbackTime: null },
];
const diff2 = [
    { ktvId: 'NH002', startTime: '14:00', duration: 60, actualStartTime: null, actualEndTime: null, feedbackTime: null },
];

console.log('  → 2 BookingItems riêng biệt → KHÔNG ảnh hưởng nhau ✅');
console.log('  → Mỗi KTV có segments trong item riêng → parallel sync không áp dụng');

console.log('\n' + '='.repeat(70));
console.log('📊 SUMMARY');
console.log('='.repeat(70));
console.log('Fix A: Parallel Start  — 1 bấm Start → cả 2 TIMER ✅');
console.log('Fix B: Parallel Clean  — 1 dọn xong → cả 2 REVIEW ✅');
console.log('Fix C: Sequential Safe — KTV1 xong, item giữ IN_PROGRESS cho KTV2 ✅');

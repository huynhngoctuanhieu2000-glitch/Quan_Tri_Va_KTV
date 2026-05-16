// === MÔ PHỎNG BUG: 2 KTV 1 DV - Ng 2 bấm BẮT ĐẦU bị kết thúc luôn ===

console.log('=============================================');
console.log('LỖI: 2 KTV 1 DV - Ng 2 bấm BẮT ĐẦU bị kết thúc luôn');
console.log('=============================================');

// Giả lập: KTV A đã XONG, KTV B chưa bắt đầu
const segments = [
    { ktvId: 'KTV_A', startTime: '10:00', duration: 60, actualStartTime: '2026-05-15T10:00:00Z', actualEndTime: '2026-05-15T11:00:00Z' },
    { ktvId: 'KTV_B', startTime: '10:00', duration: 60 }
];

const ktvId = 'KTV_B';
const mySegs = segments.filter(seg => seg.ktvId === ktvId);

console.log('\nKTV B segments:', mySegs);

let allDone = true;
let allFeedback = true;
let isAnyStarted = false;

mySegs.forEach(seg => {
    if (seg.actualStartTime) isAnyStarted = true;
    if (!seg.actualEndTime) allDone = false;
    if (!seg.feedbackTime) allFeedback = false;
});

console.log('\n--- Kết quả phân tích segment của KTV B ---');
console.log('allDone:', allDone, '(KTV B chưa xong)');
console.log('isAnyStarted:', isAnyStarted, '(KTV B chưa bắt đầu)');
console.log('allFeedback:', allFeedback, '(KTV B chưa feedback)');

// ===== CASE 1: item.status = IN_PROGRESS (Smart Status đúng) =====
console.log('\n===== CASE 1: Smart Status ĐÚNG → item.status = IN_PROGRESS =====');
let currentStatus = 'IN_PROGRESS';

if (allFeedback) currentStatus = 'FEEDBACK';
else if (allDone && currentStatus !== 'DONE' && currentStatus !== 'CLEANING') currentStatus = 'CLEANING';
else if (isAnyStarted && !['DONE', 'CLEANING', 'FEEDBACK', 'IN_PROGRESS'].includes(currentStatus)) currentStatus = 'IN_PROGRESS';

console.log('currentStatus sau override:', currentStatus);
if (['COMPLETED', 'FEEDBACK', 'CLEANING', 'DONE'].includes(currentStatus)) {
    console.log('=> Screen Engine đẩy sang REVIEW → BUG!');
} else {
    console.log('=> OK, KTV B ở màn TIMER, được phép bấm BẮT ĐẦU');
}

// ===== CASE 2: item.status = CLEANING (Smart Status BỊ LỖI hoặc Race Condition) =====
console.log('\n===== CASE 2: Nếu DB bị sai → item.status = CLEANING =====');
currentStatus = 'CLEANING';  // Giả sử DB bị set sai

// Dòng 417: allDone && currentStatus !== 'CLEANING' 
// allDone = false VÀ currentStatus = CLEANING → SKIP cả 2 điều kiện
// → currentStatus GIỮ NGUYÊN = 'CLEANING'
if (allFeedback) currentStatus = 'FEEDBACK';
else if (allDone && currentStatus !== 'DONE' && currentStatus !== 'CLEANING') currentStatus = 'CLEANING';
else if (isAnyStarted && !['DONE', 'CLEANING', 'FEEDBACK', 'IN_PROGRESS'].includes(currentStatus)) currentStatus = 'IN_PROGRESS';

console.log('currentStatus sau override:', currentStatus);
if (['COMPLETED', 'FEEDBACK', 'CLEANING', 'DONE'].includes(currentStatus)) {
    console.log('=> 🔴 BUG! Screen Engine đẩy KTV B sang REVIEW ngay lập tức!');
    console.log('   Nguyên nhân: Dòng 417 có điều kiện "currentStatus !== CLEANING"');
    console.log('   → allDone=false NHƯNG currentStatus=CLEANING → SKIP override');
    console.log('   → KTV B bị ép vào màn REVIEW dù chưa hề bắt đầu!');
} else {
    console.log('=> OK');
}

// ===== CASE 3: Thêm fix - override CLEANING về IN_PROGRESS khi chưa bắt đầu =====
console.log('\n===== ĐỀ XUẤT FIX: Thêm override cho trường hợp chưa bắt đầu =====');
currentStatus = 'CLEANING';

if (allFeedback) currentStatus = 'FEEDBACK';
else if (allDone && currentStatus !== 'DONE' && currentStatus !== 'CLEANING') currentStatus = 'CLEANING';
else if (isAnyStarted && !['DONE', 'CLEANING', 'FEEDBACK', 'IN_PROGRESS'].includes(currentStatus)) currentStatus = 'IN_PROGRESS';

// 🔥 FIX: Nếu KTV chưa bắt đầu (chưa start) nhưng item bị CLEANING → ép IN_PROGRESS
if (!isAnyStarted && !allDone && ['CLEANING', 'FEEDBACK', 'DONE'].includes(currentStatus)) {
    console.log('🔧 FIX: KTV chưa bắt đầu nhưng item đã CLEANING → ép về IN_PROGRESS');
    currentStatus = 'IN_PROGRESS';
}

console.log('currentStatus sau FIX:', currentStatus);
if (['COMPLETED', 'FEEDBACK', 'CLEANING', 'DONE'].includes(currentStatus)) {
    console.log('=> Vẫn BUG!');
} else {
    console.log('=> ✅ OK! KTV B ở TIMER, được phép bấm BẮT ĐẦU!');
}

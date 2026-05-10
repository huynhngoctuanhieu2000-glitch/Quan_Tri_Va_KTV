/**
 * 🧪 MÔ PHỎNG CHÍNH XÁC: 1 KTV gán 3 DV cùng phòng, mỗi DV 30p
 * 
 * Trường hợp thực tế:
 * - 1 Booking, 3 BookingItems (3 DV khác nhau)
 * - Cùng 1 KTV: NH018
 * - Cùng 1 Phòng + Giường
 * - Mỗi DV 30 phút
 * 
 * BUG 1: Bị tách thành 3 đơn riêng biệt (3 segments riêng)
 * BUG 2: Khi DV 1 hết giờ → kết thúc luôn cả 3 DV
 */

// ==========================================
// 📦 MOCK DATA — ĐÚNG THỰC TẾ
// ==========================================

const booking = {
  id: 'booking-001',
  billCode: '001-10052026',
  status: 'IN_PROGRESS',
};

const bookingItems = [
  {
    id: 'item-1',
    bookingId: 'booking-001',
    serviceId: 'nhs0001',
    service_name: 'Tinh dầu',
    duration: 30,
    technicianCodes: ['NH018'],
    status: 'IN_PROGRESS',
    segments: JSON.stringify([
      { ktvId: 'NH018', startTime: '14:00', duration: 30, roomId: 'P1', bedId: 'P1-1' }
    ])
  },
  {
    id: 'item-2',
    bookingId: 'booking-001',
    serviceId: 'nhs0002',
    service_name: 'Dầu dừa',
    duration: 30,
    technicianCodes: ['NH018'],
    status: 'IN_PROGRESS',
    segments: JSON.stringify([
      { ktvId: 'NH018', startTime: '14:30', duration: 30, roomId: 'P1', bedId: 'P1-1' }
    ])
  },
  {
    id: 'item-3',
    bookingId: 'booking-001',
    serviceId: 'nhs0003',
    service_name: 'Kết hợp 4 liệu trình',
    duration: 30,
    technicianCodes: ['NH018'],
    status: 'IN_PROGRESS',
    segments: JSON.stringify([
      { ktvId: 'NH018', startTime: '15:00', duration: 30, roomId: 'P1', bedId: 'P1-1' }
    ])
  },
];

const ktvId = 'NH018';

// ==========================================
// 🔬 PHÂN TÍCH: KTV Dashboard nhìn thấy gì?
// ==========================================

console.log('='.repeat(70));
console.log('🔬 PHÂN TÍCH LUỒNG THỰC TẾ');
console.log('   1 Booking | 3 DV | 1 KTV (NH018) | Cùng P1-G1 | Mỗi DV 30p');
console.log('='.repeat(70));

// Step 1: API trả về gì?
// assignedItemIds = tất cả items có technicianCodes chứa NH018
const assignedItemIds = bookingItems
  .filter(i => i.technicianCodes.includes(ktvId))
  .map(i => i.id);

console.log('\n📡 API /api/ktv/booking trả về:');
console.log(`   assignedItemIds = ${JSON.stringify(assignedItemIds)}`);
console.log(`   (${assignedItemIds.length} items gán cho KTV ${ktvId})`);

// Step 2: Gộp segments
const allMySegments = bookingItems.flatMap(item => {
  const segs = JSON.parse(item.segments);
  return segs
    .filter(s => s.ktvId.toUpperCase() === ktvId.toUpperCase())
    .map(s => ({ ...s, itemId: item.id, serviceName: item.service_name }));
}).sort((a, b) => a.startTime.localeCompare(b.startTime));

console.log(`\n📊 Segments (chặng) của KTV ${ktvId}:`);
allMySegments.forEach((seg, idx) => {
  const [h, m] = seg.startTime.split(':').map(Number);
  const endM = m + seg.duration;
  const endTime = `${String(h + Math.floor(endM / 60)).padStart(2, '0')}:${String(endM % 60).padStart(2, '0')}`;
  console.log(`   Chặng ${idx}: [${seg.serviceName}] ${seg.startTime} → ${endTime} (${seg.duration}p) | ${seg.roomId} | item: ${seg.itemId}`);
});

// Step 3: Timer logic
console.log('\n' + '─'.repeat(70));
console.log('⏱️  PHÂN TÍCH TIMER (page.tsx - ScreenTimer)');
console.log('─'.repeat(70));

console.log(`
   page.tsx dùng biến:
   - activeSegmentIndex = 0 (bắt đầu từ chặng đầu tiên)
   - currentSeg = allMySegments[0] → "Tinh dầu" 30p
   - displayDuration = currentSeg.duration = 30 (phút)
   
   ✅ ĐÚNG: Timer CHỈ đếm 30 phút cho chặng hiện tại
`);

// Step 4: Khi timer đạt 0 (auto-finish)
console.log('─'.repeat(70));
console.log('🐛 BUG 2: KHI TIMER ĐẠT 0 → CHUYỆN GÌ XẢY RA?');
console.log('─'.repeat(70));

console.log(`
   1. Timer đạt 0 → useEffect [AutoFinish] trigger
   2. Gọi handleFinishTimerRef.current() → handleFinishTimer()
   3. handleFinishTimer() gửi PATCH:
      {
        bookingId: "booking-001",
        status: "CLEANING",        ← ĐÂY LÀ VẤN ĐỀ!!!
        techCode: "NH018"
      }
`);

console.log('   🔍 Trong PATCH API (route.ts), đoạn status === "CLEANING":');
console.log('');
console.log('     allItemIdsForThisKTV = ["item-1", "item-2", "item-3"]');
console.log('');
console.log('     ❌ BUG: Code lặp qua TẤT CẢ 3 items và đánh dấu DONE HẾT:');
console.log('     for (const item of items) {');
console.log('       segs.forEach(seg => {');
console.log('         if (seg.ktvId === "NH018") {');
console.log('           if (!seg.actualEndTime) seg.actualEndTime = now; // ← ĐÁNH DẤU HẾT!!!');
console.log('         }');
console.log('       });');
console.log('       await update({ status: "CLEANING" }); // ← CẢ 3 ITEMS ĐỀU CLEANING');
console.log('     }');
console.log('');
console.log('   ⚠️ KẾT QUẢ: Cả 3 DV đều bị kết thúc cùng lúc!');
console.log('   ⚠️ KTV thấy chuyển sang màn hình REVIEW ngay lập tức');
console.log('   ⚠️ "Dầu dừa" và "Kết hợp 4 liệu trình" CHƯA ĐƯỢC LÀM');

// Step 5: Root cause analysis
console.log('\n' + '='.repeat(70));
console.log('🔍 NGUYÊN NHÂN GỐC RỄ');
console.log('='.repeat(70));

console.log(`
   ┌────────────────────────────────────────────────────────────────────┐
   │ BUG 2: handleFinishTimer() KHÔNG kiểm tra còn chặng tiếp theo    │
   │                                                                    │
   │ Khi timer chặng 0 (Tinh dầu) hết giờ:                            │
   │                                                                    │
   │ ❌ Hiện tại: Gọi PATCH status="CLEANING" → TẤT CẢ items bị DONE │
   │                                                                    │
   │ ✅ Đúng ra:                                                        │
   │    1. Chỉ đánh dấu actualEndTime cho chặng 0 (Tinh dầu)          │
   │    2. Kiểm tra: còn chặng 1, 2 chưa bắt đầu?                    │
   │    3. NẾU CÒN → advance activeSegmentIndex lên 1                 │
   │       → bắt đầu actualStartTime cho chặng 1 (Dầu dừa)           │
   │       → reset timer = 30p                                         │
   │    4. CHỈ KHI TẤT CẢ chặng đều done → gọi CLEANING              │
   └────────────────────────────────────────────────────────────────────┘
`);

// Step 6: Solution flow
console.log('='.repeat(70));
console.log('💡 LUỒNG ĐÚNG (SAU KHI FIX)');
console.log('='.repeat(70));

console.log(`
   ⏰ 14:00 → KTV bấm BẮT ĐẦU
      - activeSegmentIndex = 0
      - Timer: 30:00 (Tinh dầu)
      - Segment 0: actualStartTime = "14:00"
   
   ⏰ 14:30 → Timer đạt 0
      - Segment 0: actualEndTime = "14:30" ✅ 
      - Kiểm tra: còn segment 1 chưa done? → CÓ
      - AUTO ADVANCE: activeSegmentIndex = 1
      - Gọi PATCH action="NEXT_SEGMENT", activeSegmentIndex=1
      - Segment 1: actualStartTime = "14:30"
      - Timer RESET: 30:00 (Dầu dừa)
   
   ⏰ 15:00 → Timer đạt 0 lần 2
      - Segment 1: actualEndTime = "15:00" ✅
      - Kiểm tra: còn segment 2? → CÓ
      - AUTO ADVANCE: activeSegmentIndex = 2
      - Segment 2: actualStartTime = "15:00"  
      - Timer RESET: 30:00 (Kết hợp 4 liệu trình)
   
   ⏰ 15:30 → Timer đạt 0 lần 3
      - Segment 2: actualEndTime = "15:30" ✅
      - Kiểm tra: còn segment nào? → KHÔNG
      - GỌI CLEANING → chuyển sang REVIEW
      - Tổng thời gian: 90 phút (3 x 30p) ✅
`);

console.log('='.repeat(70));
console.log('📋 CẦN SỬA');
console.log('='.repeat(70));
console.log(`
   File: KTVDashboard.logic.ts
   
   1. handleFinishTimer():
      - Trước khi gọi PATCH "CLEANING":
        → Đếm tổng segments, so với activeSegmentIndex
        → Nếu còn segment tiếp → gọi NEXT_SEGMENT thay vì CLEANING
        → Chỉ gọi CLEANING khi segment cuối cùng done
   
   2. AutoFinish useEffect (line 1042-1048):
      - Khi timer = 0:
        → Nếu còn chặng → advance, không finish
        → Nếu hết chặng → gọi handleFinishTimer (CLEANING)
   
   File: /api/ktv/booking (PATCH)
   
   3. CLEANING handler:
      - Hiện tại: đánh dấu actualEndTime cho TẤT CẢ segments
      - Fix: Chỉ đánh dấu segment đang active (activeSegmentIndex)
      - Hoặc: logic client kiểm tra trước, server chỉ xử lý segment đúng
`);

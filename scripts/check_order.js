// ============================================================
// 🧪 MÔ PHỎNG LUỒNG ĐIỀU PHỐI: Đang làm → Dọn phòng → Đánh giá → Hoàn tất
// ============================================================

// --- GIẢ LẬP DỮ LIỆU ---
const ROOM_TRANSITION_TIME = 10; // phút

function getEstimatedEndTime(order) {
  let maxTime = 0;
  if (order.timeEnd) maxTime = Math.max(maxTime, new Date(order.timeEnd).getTime());
  if (order.services && order.services.length > 0) {
    const sTimes = order.services.map(s => {
      if (s.timeEnd) return new Date(s.timeEnd).getTime();
      if (s.timeStart) return new Date(s.timeStart).getTime() + (s.duration || 0) * 60000;
      return 0;
    }).filter(t => t > 0);
    if (sTimes.length > 0) maxTime = Math.max(maxTime, ...sTimes);
  }
  return maxTime;
}

function getDispatchColumn(status, rating) {
  if (status === 'NEW') return 'CHỜ PHÂN CÔNG';
  if (status === 'PREPARING') return 'ĐÃ PHÂN CÔNG';
  if (status === 'IN_PROGRESS') return 'ĐANG LÀM';
  if (status === 'CLEANING') return 'DỌN PHÒNG';
  if (status === 'FEEDBACK' || status === 'COMPLETED') return 'CHỜ ĐÁNH GIÁ';
  if (status === 'DONE' && !rating) return 'CHỜ ĐÁNH GIÁ';
  if (status === 'DONE') return 'HOÀN TẤT';
  return status;
}

function getTags(status, rating) {
  const cleanDone = ['FEEDBACK', 'COMPLETED', 'DONE'].includes(status);
  const ratingDone = rating !== null;
  return {
    cleaning: cleanDone ? '✅ Đã dọn' : '⏳ Đang dọn',
    rating: ratingDone ? `✅ ${rating >= 5 ? 'Xuất sắc' : rating >= 4 ? 'Tốt' : rating >= 3 ? 'Khá' : 'TB'} (${rating}/5)` : '⏳ Chờ khách'
  };
}

// --- KỊCH BẢN ---
function simulateAutoWorker(order, nowMs) {
  const result = { action: null, newStatus: null };

  // 1. IN_PROGRESS → CLEANING
  if (order.status === 'IN_PROGRESS') {
    const estEnd = getEstimatedEndTime(order);
    if (estEnd > 0 && nowMs >= estEnd + 5000) {
      result.action = 'Hết giờ → CLEANING';
      result.newStatus = 'CLEANING';
    }
  }

  // 2. CLEANING → FEEDBACK hoặc DONE
  if (order.status === 'CLEANING' && order.updatedAt) {
    const updatedAt = new Date(order.updatedAt).getTime();
    const diffMins = (nowMs - updatedAt) / 60000;
    if (diffMins >= ROOM_TRANSITION_TIME) {
      if (order.rating) {
        result.action = 'Dọn xong + Đã rating → DONE';
        result.newStatus = 'DONE';
      } else {
        result.action = 'Dọn xong, chưa rating → FEEDBACK';
        result.newStatus = 'FEEDBACK';
      }
    }
  }

  return result;
}

function simulateCustomerRating(currentStatus, rating) {
  if (currentStatus === 'FEEDBACK' || currentStatus === 'COMPLETED') {
    return { newStatus: 'DONE', note: 'Đã dọn + Đã rating → DONE' };
  }
  if (currentStatus === 'CLEANING') {
    return { newStatus: 'CLEANING', note: 'Chỉ lưu rating, chờ dọn xong' };
  }
  return { newStatus: currentStatus, note: 'Không thay đổi' };
}

// ============================================================
console.log('=' .repeat(80));
console.log('🧪 CASE 1: Luồng chuẩn — Dọn xong TRƯỚC, Đánh giá SAU');
console.log('=' .repeat(80));

let order1 = {
  id: 'ORDER-001', status: 'IN_PROGRESS', rating: null,
  timeEnd: new Date(Date.now() - 10000).toISOString(), // Hết giờ 10s trước
  updatedAt: new Date().toISOString(),
  services: [{ timeEnd: new Date(Date.now() - 10000).toISOString() }]
};

console.log(`\n📋 Bước 0: ${order1.status} → Cột: ${getDispatchColumn(order1.status, order1.rating)}`);

// Step 1: Auto-worker detects end time
let result = simulateAutoWorker(order1, Date.now());
console.log(`\n⏰ Bước 1 (Auto-Worker): ${result.action}`);
order1.status = result.newStatus;
order1.updatedAt = new Date().toISOString();
let tags = getTags(order1.status, order1.rating);
console.log(`   Status: ${order1.status} → Cột: ${getDispatchColumn(order1.status, order1.rating)}`);
console.log(`   Tag Dọn: ${tags.cleaning} | Tag Đánh giá: ${tags.rating}`);

// Step 2: 10 phút sau, dọn xong
console.log(`\n🧹 Bước 2 (Sau ${ROOM_TRANSITION_TIME}p): Dọn phòng xong`);
order1.updatedAt = new Date(Date.now() - ROOM_TRANSITION_TIME * 60000).toISOString();
result = simulateAutoWorker(order1, Date.now());
console.log(`   Auto-Worker: ${result.action}`);
order1.status = result.newStatus;
tags = getTags(order1.status, order1.rating);
console.log(`   Status: ${order1.status} → Cột: ${getDispatchColumn(order1.status, order1.rating)}`);
console.log(`   Tag Dọn: ${tags.cleaning} | Tag Đánh giá: ${tags.rating}`);

// Step 3: Khách đánh giá
console.log(`\n⭐ Bước 3: Khách đánh giá 5 sao`);
const rateResult1 = simulateCustomerRating(order1.status, 5);
order1.status = rateResult1.newStatus;
order1.rating = 5;
tags = getTags(order1.status, order1.rating);
console.log(`   ${rateResult1.note}`);
console.log(`   Status: ${order1.status} → Cột: ${getDispatchColumn(order1.status, order1.rating)}`);
console.log(`   Tag Dọn: ${tags.cleaning} | Tag Đánh giá: ${tags.rating}`);

// ============================================================
console.log('\n' + '=' .repeat(80));
console.log('🧪 CASE 2: Đánh giá TRƯỚC, Dọn xong SAU');
console.log('=' .repeat(80));

let order2 = {
  id: 'ORDER-002', status: 'IN_PROGRESS', rating: null,
  timeEnd: new Date(Date.now() - 10000).toISOString(),
  updatedAt: new Date().toISOString(),
  services: [{ timeEnd: new Date(Date.now() - 10000).toISOString() }]
};

console.log(`\n📋 Bước 0: ${order2.status} → Cột: ${getDispatchColumn(order2.status, order2.rating)}`);

// Step 1: Hết giờ → CLEANING
result = simulateAutoWorker(order2, Date.now());
console.log(`\n⏰ Bước 1 (Hết giờ): ${result.action}`);
order2.status = result.newStatus;
order2.updatedAt = new Date().toISOString();
tags = getTags(order2.status, order2.rating);
console.log(`   Status: ${order2.status} → Cột: ${getDispatchColumn(order2.status, order2.rating)}`);
console.log(`   Tag Dọn: ${tags.cleaning} | Tag Đánh giá: ${tags.rating}`);

// Step 2: Khách đánh giá TRƯỚC khi dọn xong
console.log(`\n⭐ Bước 2: Khách đánh giá 4 sao (đang dọn)`);
const rateResult2 = simulateCustomerRating(order2.status, 4);
order2.status = rateResult2.newStatus;
order2.rating = 4;
tags = getTags(order2.status, order2.rating);
console.log(`   ${rateResult2.note}`);
console.log(`   Status: ${order2.status} → Cột: ${getDispatchColumn(order2.status, order2.rating)}`);
console.log(`   Tag Dọn: ${tags.cleaning} | Tag Đánh giá: ${tags.rating}`);

// Step 3: 10 phút sau, dọn xong → có rating → DONE
console.log(`\n🧹 Bước 3 (Sau ${ROOM_TRANSITION_TIME}p): Dọn xong`);
order2.updatedAt = new Date(Date.now() - ROOM_TRANSITION_TIME * 60000).toISOString();
result = simulateAutoWorker(order2, Date.now());
console.log(`   Auto-Worker: ${result.action}`);
order2.status = result.newStatus;
tags = getTags(order2.status, order2.rating);
console.log(`   Status: ${order2.status} → Cột: ${getDispatchColumn(order2.status, order2.rating)}`);
console.log(`   Tag Dọn: ${tags.cleaning} | Tag Đánh giá: ${tags.rating}`);

// ============================================================
console.log('\n' + '=' .repeat(80));
console.log('🧪 CASE 3: Khách KHÔNG đánh giá — đơn kẹt ở Chờ đánh giá');
console.log('=' .repeat(80));

let order3 = {
  id: 'ORDER-003', status: 'IN_PROGRESS', rating: null,
  timeEnd: new Date(Date.now() - 10000).toISOString(),
  updatedAt: new Date().toISOString(),
  services: [{ timeEnd: new Date(Date.now() - 10000).toISOString() }]
};

// Hết giờ → CLEANING
result = simulateAutoWorker(order3, Date.now());
order3.status = result.newStatus;
order3.updatedAt = new Date().toISOString();
console.log(`\n⏰ Bước 1 (Hết giờ): ${result.action} → ${order3.status}`);

// Dọn xong → FEEDBACK (chưa rating)
order3.updatedAt = new Date(Date.now() - ROOM_TRANSITION_TIME * 60000).toISOString();
result = simulateAutoWorker(order3, Date.now());
order3.status = result.newStatus;
console.log(`🧹 Bước 2 (Dọn xong): ${result.action} → ${order3.status}`);

tags = getTags(order3.status, order3.rating);
console.log(`\n   ⚠️ Đơn nằm ở cột: ${getDispatchColumn(order3.status, order3.rating)}`);
console.log(`   Tag Dọn: ${tags.cleaning} | Tag Đánh giá: ${tags.rating}`);
console.log(`   → Đơn sẽ NẰM MÃI ở đây cho đến khi khách đánh giá hoặc Lễ tân bấm thủ công`);

// ============================================================
console.log('\n' + '=' .repeat(80));
console.log('🧪 CASE 4: KTV bấm kết thúc thủ công (không chờ auto)');
console.log('=' .repeat(80));

let order4 = { id: 'ORDER-004', status: 'IN_PROGRESS', rating: null };
console.log(`\n📋 Bước 0: ${order4.status}`);

// KTV bấm kết thúc → API trả về CLEANING
order4.status = 'CLEANING';
order4.updatedAt = new Date().toISOString();
tags = getTags(order4.status, order4.rating);
console.log(`🔧 Bước 1 (KTV bấm Kết thúc): → ${order4.status} → Cột: ${getDispatchColumn(order4.status, order4.rating)}`);
console.log(`   Tag Dọn: ${tags.cleaning} | Tag Đánh giá: ${tags.rating}`);

// Khách đánh giá ngay
console.log(`⭐ Bước 2 (Khách đánh giá 3 sao):`);
const rateResult4 = simulateCustomerRating(order4.status, 3);
order4.rating = 3;
order4.status = rateResult4.newStatus; // Vẫn CLEANING
tags = getTags(order4.status, order4.rating);
console.log(`   ${rateResult4.note}`);
console.log(`   Status: ${order4.status} → Cột: ${getDispatchColumn(order4.status, order4.rating)}`);
console.log(`   Tag Dọn: ${tags.cleaning} | Tag Đánh giá: ${tags.rating}`);

// Dọn xong
order4.updatedAt = new Date(Date.now() - ROOM_TRANSITION_TIME * 60000).toISOString();
result = simulateAutoWorker(order4, Date.now());
order4.status = result.newStatus;
tags = getTags(order4.status, order4.rating);
console.log(`🧹 Bước 3 (Dọn xong): ${result.action}`);
console.log(`   Status: ${order4.status} → Cột: ${getDispatchColumn(order4.status, order4.rating)}`);
console.log(`   Tag Dọn: ${tags.cleaning} | Tag Đánh giá: ${tags.rating}`);

// ============================================================
console.log('\n' + '=' .repeat(80));
console.log('📊 TỔNG KẾT');
console.log('=' .repeat(80));
console.log(`\n  Case 1 (Dọn trước, Rating sau):    ${order1.status} → ${getDispatchColumn(order1.status, order1.rating)} ✅`);
console.log(`  Case 2 (Rating trước, Dọn sau):    ${order2.status} → ${getDispatchColumn(order2.status, order2.rating)} ✅`);
console.log(`  Case 3 (Không rating):             ${order3.status} → ${getDispatchColumn(order3.status, order3.rating)} ⏳`);
console.log(`  Case 4 (KTV bấm tay + Rating):     ${order4.status} → ${getDispatchColumn(order4.status, order4.rating)} ✅`);

const allCorrect = order1.status === 'DONE' && order2.status === 'DONE' && order3.status === 'FEEDBACK' && order4.status === 'DONE';
console.log(`\n  🎯 KẾT QUẢ: ${allCorrect ? '✅ TẤT CẢ CASES ĐỀU ĐÚNG!' : '❌ CÓ LỖI!'}`);

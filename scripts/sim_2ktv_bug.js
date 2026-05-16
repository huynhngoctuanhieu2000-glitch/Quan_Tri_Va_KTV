// === MÔ PHỎNG: Dispatch lẻ DV3 có ảnh hưởng DV1, DV2 đang IN_PROGRESS? ===

console.log('==============================================');
console.log('SCENARIO: Đơn có 3 DV, DV1(KTV1) + DV2(KTV2) đang làm');
console.log('Admin dispatch lẻ DV3 cho KTV3');
console.log('==============================================\n');

// Giả lập trạng thái hiện tại trong DB
const existingAssignments = [
    { employee_id: 'KTV1', booking_id: 'B001', status: 'ACTIVE', booking_item_id: 'DV1' },
    { employee_id: 'KTV2', booking_id: 'B001', status: 'ACTIVE', booking_item_id: 'DV2' },
];

// Frontend gửi dispatch lẻ DV3 cho KTV3
const p_staff_assignments = [
    { ktvId: 'KTV3', bookingItemId: 'DV3', roomId: 'R1', bedId: 'B1', startTime: '11:00', endTime: '12:00' }
];

// === RPC Step 0.5: Cleanup ===
const v_kept_ktv_ids = p_staff_assignments.map(a => a.ktvId);
console.log('Step 0.5: v_kept_ktv_ids (KTV được giữ lại):', v_kept_ktv_ids);

// Tìm KTV đang ACTIVE nhưng KHÔNG nằm trong danh sách mới
const removedKtvs = existingAssignments
    .filter(a => a.booking_id === 'B001' && ['ACTIVE', 'QUEUED', 'READY'].includes(a.status))
    .filter(a => !v_kept_ktv_ids.includes(a.employee_id));

console.log('\nKTV bị XÓA bởi cleanup:');
removedKtvs.forEach(k => {
    console.log(`  🔴 ${k.employee_id} (đang ${k.status} cho ${k.booking_item_id}) → BỊ SET COMPLETED!`);
    console.log(`     → TurnQueue bị clear: current_order_id = NULL, room/bed = NULL`);
    console.log(`     → promote_next_assignment() được gọi → KTV nhận đơn khác!`);
});

if (removedKtvs.length > 0) {
    console.log('\n🔴🔴🔴 KẾT QUẢ: CÓ! Dispatch lẻ DV3 SẼ GIẾT CHẾT DV1 và DV2!');
    console.log('   - KTV1 đang massage cho khách → bị hệ thống ĐÁ RA, nhận đơn mới');
    console.log('   - KTV2 đang cắt tóc → bị hệ thống ĐÁ RA, nhận đơn mới');
    console.log('   - Timer của KTV1 và KTV2 trên app sẽ BỊ MẤT');
} else {
    console.log('\n✅ Không ảnh hưởng.');
}

console.log('\n=== FIX: Gửi kèm staff hiện có ===');
// Thêm staff từ các DV khác vào danh sách giữ lại
const allServicesStaff = [
    ...p_staff_assignments,
    // Thêm keepalive cho KTV đang làm
    { ktvId: 'KTV1', bookingItemId: 'DV1' },
    { ktvId: 'KTV2', bookingItemId: 'DV2' },
];
const v_kept_fixed = allServicesStaff.map(a => a.ktvId);
console.log('v_kept_ktv_ids (sau fix):', v_kept_fixed);

const removedAfterFix = existingAssignments
    .filter(a => a.booking_id === 'B001' && ['ACTIVE', 'QUEUED', 'READY'].includes(a.status))
    .filter(a => !v_kept_fixed.includes(a.employee_id));

console.log('KTV bị xóa sau fix:', removedAfterFix.length === 0 ? 'KHÔNG CÓ ✅' : removedAfterFix);

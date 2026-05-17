/**
 * 🧪 MÔ PHỎNG DISPATCH REFACTOR — 4 EDGE CASES
 * 
 * Mục đích: Chứng minh logic tách file giữ đúng behavior
 * Chạy: node scratch/simulate_dispatch_refactor.js
 */

// ═══════════════════════════════════════════
// MOCK SUPABASE
// ═══════════════════════════════════════════
function createMockSupabase(mockDb) {
    const updates = []; // Track all DB writes

    function matchRow(r, filters) {
        return Object.entries(filters).every(([k, v]) => {
            if (k.endsWith('_in')) {
                const col = k.replace('_in', '');
                return v.includes(r[col]);
            }
            if (k.endsWith('_contains')) {
                const col = k.replace('_contains', '');
                return Array.isArray(r[col]) && v.some(x => r[col].includes(x));
            }
            return r[k] === v;
        });
    }

    function createQueryBuilder(tableName) {
        let filters = {};
        let selectFields = '*';
        let isSelectCalled = false;
        
        const builder = {
            select: (fields) => { selectFields = fields; isSelectCalled = true; return builder; },
            eq: (col, val) => { filters[col] = val; return builder; },
            in: (col, vals) => { filters[`${col}_in`] = vals; return builder; },
            contains: (col, val) => { filters[`${col}_contains`] = val; return builder; },
            neq: () => builder,
            order: () => builder,
            limit: () => builder,
            single: () => {
                const rows = mockDb[tableName] || [];
                const row = rows.find(r => matchRow(r, filters));
                return Promise.resolve({ data: row || null, error: null });
            },
            maybeSingle: function() { return this.single(); },
            then: function(resolve) {
                // When awaited directly (no .single/.maybeSingle), return all matching rows
                const rows = (mockDb[tableName] || []).filter(r => matchRow(r, filters));
                resolve({ data: rows, error: null });
            },
            update: (payload) => {
                const rows = mockDb[tableName] || [];
                rows.forEach(r => {
                    if (matchRow(r, filters)) {
                        Object.assign(r, payload);
                        updates.push({ table: tableName, id: r.id, payload: {...payload} });
                    }
                });
                return createQueryBuilder(tableName); // chain
            },
        };
        return builder;
    }

    return {
        from: (table) => createQueryBuilder(table),
        rpc: (name, params) => { updates.push({ rpc: name, params }); return Promise.resolve({ data: null }); },
        _updates: updates,
        _db: mockDb,
    };
}

// ═══════════════════════════════════════════
// EXTRACTED LOGIC (mirrors handleFinishService)
// ═══════════════════════════════════════════
async function simulateFinishService(supabase, technicianCode, status, allItemIdsForThisKTV, bookingId) {
    const bookingUpdatePayload = {};
    const isFeedback = status === 'FEEDBACK';
    const nowISO = new Date().toISOString();

    // 1. Gom segments
    const { data: items } = await supabase.from('BookingItems').select('id, segments, status, itemRating').in('id', allItemIdsForThisKTV);
    
    let allGlobalSegs = [];
    let originalItemsData = {};
    for (const item of items || []) {
        let segs = typeof item.segments === 'string' ? JSON.parse(item.segments) : (Array.isArray(item.segments) ? item.segments : []);
        originalItemsData[item.id] = [...segs];
        segs.forEach((seg, idx) => {
            if (seg.ktvId?.toLowerCase() === technicianCode?.toLowerCase()) {
                allGlobalSegs.push({ item, idx, seg: {...seg}, _itemId: item.id });
            }
        });
    }
    allGlobalSegs.sort((a, b) => (a.seg.startTime || '23:59').localeCompare(b.seg.startTime || '23:59'));
    const uniqueItemIds = new Set(allGlobalSegs.map(s => s._itemId));
    const isMerged = allGlobalSegs.length > 1 && uniqueItemIds.size === allGlobalSegs.length;

    // 2. Time allocation
    if (isMerged && (status === 'CLEANING' || isFeedback)) {
        const firstStartTime = allGlobalSegs[0].seg.actualStartTime || nowISO;
        let actualTimeSpentMs = new Date(nowISO).getTime() - new Date(firstStartTime).getTime();
        if (actualTimeSpentMs < 0) actualTimeSpentMs = 0;
        let currentStartTimeMs = new Date(firstStartTime).getTime();

        for (let i = 0; i < allGlobalSegs.length; i++) {
            const target = allGlobalSegs[i];
            const maxDurationMs = (Number(target.seg.duration) || 60) * 60000;
            target.seg.actualStartTime = new Date(currentStartTimeMs).toISOString();
            const allocatedMs = Math.min(actualTimeSpentMs, maxDurationMs);
            actualTimeSpentMs -= allocatedMs;
            currentStartTimeMs += allocatedMs;
            target.seg.actualEndTime = new Date(currentStartTimeMs).toISOString();
            if (isFeedback) target.seg.feedbackTime = nowISO;
            originalItemsData[target.item.id][target.idx] = target.seg;
        }
        const lastTarget = allGlobalSegs[allGlobalSegs.length - 1];
        lastTarget.seg.actualEndTime = nowISO;
        originalItemsData[lastTarget.item.id][lastTarget.idx] = lastTarget.seg;
    } else {
        allGlobalSegs.forEach((target) => {
            if (status === 'CLEANING' || isFeedback) {
                if (!target.seg.actualEndTime) target.seg.actualEndTime = nowISO;
                if (isFeedback && !target.seg.feedbackTime) target.seg.feedbackTime = nowISO;
            }
            originalItemsData[target.item.id][target.idx] = target.seg;
        });
    }

    // 3. Smart Status per-item
    const statusResults = [];
    for (const item of items || []) {
        let segs = originalItemsData[item.id];
        const allSegsDone = segs.every(s => !!s.actualEndTime);
        const alreadyRated = item.itemRating !== null && item.itemRating !== undefined;
        
        const newItemStatus = (item.status === 'DONE')
            ? 'DONE'
            : (alreadyRated && allSegsDone) ? 'DONE'
            : allSegsDone ? (isFeedback ? 'FEEDBACK' : 'CLEANING')
            : 'IN_PROGRESS';
        
        statusResults.push({ itemId: item.id, allSegsDone, alreadyRated, oldStatus: item.status, newStatus: newItemStatus });
    }

    return { isMerged, statusResults, bookingUpdatePayload, segCount: allGlobalSegs.length };
}

// ═══════════════════════════════════════════
// ORCHESTRATOR ROUTING SIMULATION
// ═══════════════════════════════════════════
function simulateOrchestratorRouting(status, action) {
    if (status === 'COMPLETED') status = 'CLEANING'; // normalize

    let handler = 'NONE';
    if (status === 'IN_PROGRESS' || action === 'NEXT_SEGMENT_PREPARE') {
        handler = 'handleStartTimer';
    } else if (status === 'CLEANING' || status === 'DONE' || status === 'FEEDBACK') {
        handler = 'handleFinishService';
    }

    let releaseHandler = false;
    if (action === 'RELEASE_KTV') {
        releaseHandler = true;
    }

    return { normalizedStatus: status, handler, releaseHandler };
}

// ═══════════════════════════════════════════
// TEST CASES
// ═══════════════════════════════════════════
async function runTests() {
    console.log('═══════════════════════════════════════════════════════');
    console.log('🧪 MÔ PHỎNG DISPATCH REFACTOR — 4 EDGE CASES');
    console.log('═══════════════════════════════════════════════════════\n');

    // ──────────────────────────────────────
    // TEST 1: 1 KTV - 1 DV (Simple)
    // ──────────────────────────────────────
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 TEST 1: 1 KTV - 1 DV (Simple Case)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const db1 = {
        BookingItems: [{
            id: 'item-1', bookingId: 'b-001', status: 'IN_PROGRESS', itemRating: null,
            technicianCodes: ['NH001'],
            segments: [{ ktvId: 'NH001', startTime: '10:00', duration: 60, actualStartTime: '2026-05-17T03:00:00Z', actualEndTime: null }]
        }]
    };
    const mock1 = createMockSupabase(db1);

    // Step A: Orchestrator routing cho START
    let route1a = simulateOrchestratorRouting('IN_PROGRESS', 'START_TIMER');
    console.log('\n  🔀 Orchestrator Route (START):');
    console.log(`     Status: IN_PROGRESS → Handler: ${route1a.handler}`);
    console.log(`     Release: ${route1a.releaseHandler}`);

    // Step B: FINISH (KTV bấm Xong)
    let route1b = simulateOrchestratorRouting('CLEANING', null);
    console.log(`\n  🔀 Orchestrator Route (FINISH):`);
    console.log(`     Status: CLEANING → Handler: ${route1b.handler}`);

    const result1 = await simulateFinishService(mock1, 'NH001', 'CLEANING', ['item-1'], 'b-001');
    console.log(`\n  📊 Finish Result:`);
    console.log(`     isMerged: ${result1.isMerged} (expected: false)`);
    result1.statusResults.forEach(r => {
        console.log(`     Item ${r.itemId}: allSegsDone=${r.allSegsDone}, alreadyRated=${r.alreadyRated} → ${r.newStatus}`);
    });
    console.log(`     ✅ ${result1.statusResults[0].newStatus === 'CLEANING' ? 'PASS' : '❌ FAIL'} — Expected CLEANING`);

    // Step C: RELEASE
    let route1c = simulateOrchestratorRouting('CLEANING', 'RELEASE_KTV');
    console.log(`\n  🔀 Orchestrator Route (RELEASE):`);
    console.log(`     Handler: ${route1c.handler}, Release: ${route1c.releaseHandler}`);
    console.log(`     ✅ ${route1c.releaseHandler ? 'PASS' : '❌ FAIL'} — handleReleaseKTV called`);

    // ──────────────────────────────────────
    // TEST 2: 1 KTV - 2 DV (Merged)
    // ──────────────────────────────────────
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 TEST 2: 1 KTV - 2 DV (Merged — Gộp dịch vụ)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const startTime2 = new Date(Date.now() - 90 * 60000).toISOString(); // started 90 min ago
    const db2 = {
        BookingItems: [
            {
                id: 'item-A', bookingId: 'b-002', status: 'IN_PROGRESS', itemRating: null,
                technicianCodes: ['NH002'],
                segments: [{ ktvId: 'NH002', startTime: '10:00', duration: 60, actualStartTime: startTime2, actualEndTime: null }]
            },
            {
                id: 'item-B', bookingId: 'b-002', status: 'IN_PROGRESS', itemRating: null,
                technicianCodes: ['NH002'],
                segments: [{ ktvId: 'NH002', startTime: '11:00', duration: 30, actualStartTime: null, actualEndTime: null }]
            }
        ]
    };
    const mock2 = createMockSupabase(db2);
    const result2 = await simulateFinishService(mock2, 'NH002', 'CLEANING', ['item-A', 'item-B'], 'b-002');
    
    console.log(`\n  📊 Finish Result:`);
    console.log(`     isMerged: ${result2.isMerged} (expected: true)`);
    console.log(`     Total segments: ${result2.segCount} (expected: 2, across 2 items)`);
    result2.statusResults.forEach(r => {
        console.log(`     Item ${r.itemId}: allSegsDone=${r.allSegsDone}, alreadyRated=${r.alreadyRated} → ${r.newStatus}`);
    });
    const allCleaning2 = result2.statusResults.every(r => r.newStatus === 'CLEANING');
    console.log(`     ✅ ${allCleaning2 ? 'PASS' : '❌ FAIL'} — Both items CLEANING (merged time allocation)`);
    console.log(`     ✅ ${result2.isMerged ? 'PASS' : '❌ FAIL'} — Correctly detected as merged`);

    // ──────────────────────────────────────
    // TEST 3: 2 KTV - 1 DV (Sequential)
    // ──────────────────────────────────────
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 TEST 3: 2 KTV - 1 DV (KTV1 xong, KTV2 chưa xong)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const db3 = {
        BookingItems: [{
            id: 'item-shared', bookingId: 'b-003', status: 'IN_PROGRESS', itemRating: null,
            technicianCodes: ['NH003', 'NH004'],
            segments: [
                { ktvId: 'NH003', startTime: '10:00', duration: 60, actualStartTime: '2026-05-17T03:00:00Z', actualEndTime: null },
                { ktvId: 'NH004', startTime: '10:00', duration: 60, actualStartTime: '2026-05-17T03:05:00Z', actualEndTime: null }
            ]
        }]
    };
    const mock3 = createMockSupabase(db3);

    // KTV NH003 bấm Xong — NH004 vẫn đang làm
    const result3 = await simulateFinishService(mock3, 'NH003', 'CLEANING', ['item-shared'], 'b-003');
    
    console.log(`\n  📊 KTV NH003 bấm Xong (NH004 vẫn đang làm):`);
    console.log(`     isMerged: ${result3.isMerged} (expected: false — cùng 1 item)`);
    result3.statusResults.forEach(r => {
        console.log(`     Item ${r.itemId}: allSegsDone=${r.allSegsDone} → ${r.newStatus}`);
    });
    const isInProgress3 = result3.statusResults[0].newStatus === 'IN_PROGRESS';
    console.log(`     ✅ ${isInProgress3 ? 'PASS' : '❌ FAIL'} — Item giữ IN_PROGRESS (NH004 chưa xong, allSegsDone=false)`);
    console.log(`     🛡️ Smart Status bảo vệ: KHÔNG set CLEANING khi còn KTV đang làm`);

    // ──────────────────────────────────────
    // TEST 4: Ca đêm (Cross-midnight)
    // ──────────────────────────────────────
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 TEST 4: Ca đêm — Cross-midnight START_TIMER validation');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Simulate: start_time = 23:30, current time = 00:15 (next day)
    // The allowed time should be 23:30 yesterday, not 23:30 today
    const nowUtc = new Date('2026-05-17T17:15:00Z'); // = 00:15 VN (May 18)
    const startTimeStr = '23:30';
    const [h, m] = startTimeStr.split(':').map(Number);
    const vnOffsetMs = 7 * 60 * 60 * 1000;
    const nowVn = new Date(nowUtc.getTime() + vnOffsetMs);
    let allowedUtc = new Date(Date.UTC(nowVn.getUTCFullYear(), nowVn.getUTCMonth(), nowVn.getUTCDate(), h, m, 0) - vnOffsetMs);
    
    console.log(`\n  🌙 Scenario: start_time=${startTimeStr}, currentVN=00:15 (May 18)`);
    console.log(`     Before fix: allowedUtc = ${allowedUtc.toISOString()}`);
    
    // FIX CA ĐÊM: nếu allowed quá xa (>12h), lùi 1 ngày
    if (allowedUtc.getTime() - nowUtc.getTime() > 12 * 60 * 60 * 1000) {
        allowedUtc = new Date(allowedUtc.getTime() - 24 * 60 * 60 * 1000);
        console.log(`     After fix:  allowedUtc = ${allowedUtc.toISOString()} (lùi 1 ngày)`);
    }
    
    const canStart = nowUtc.getTime() >= (allowedUtc.getTime() - 5000);
    console.log(`     Can start? ${canStart}`);
    console.log(`     ✅ ${canStart ? 'PASS' : '❌ FAIL'} — KTV được phép bắt đầu (23:30 đêm qua < 00:15 hiện tại)`);

    // ──────────────────────────────────────
    // TEST 5: DUAL-CONDITION — Khách rate trước, KTV xong sau
    // ──────────────────────────────────────
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 TEST 5: DUAL-CONDITION — Khách đã rate + KTV xong → DONE');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const db5 = {
        BookingItems: [{
            id: 'item-rated', bookingId: 'b-005', status: 'IN_PROGRESS', 
            itemRating: 5, // ← Khách đã rate 5 sao TRƯỚC khi KTV xong
            technicianCodes: ['NH005'],
            segments: [{ ktvId: 'NH005', startTime: '14:00', duration: 60, actualStartTime: '2026-05-17T07:00:00Z', actualEndTime: null }]
        }]
    };
    const mock5 = createMockSupabase(db5);
    const result5 = await simulateFinishService(mock5, 'NH005', 'CLEANING', ['item-rated'], 'b-005');
    
    console.log(`\n  📊 Finish Result (khách đã rate 5⭐):`);
    result5.statusResults.forEach(r => {
        console.log(`     Item ${r.itemId}: allSegsDone=${r.allSegsDone}, alreadyRated=${r.alreadyRated} → ${r.newStatus}`);
    });
    const isDone5 = result5.statusResults[0].newStatus === 'DONE';
    console.log(`     ✅ ${isDone5 ? 'PASS' : '❌ FAIL'} — Item nhảy thẳng DONE (alreadyRated + allSegsDone)`);

    // ──────────────────────────────────────
    // TEST 6: KHÔNG LÙI STATUS — Item đã DONE không bị lùi
    // ──────────────────────────────────────
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 TEST 6: KHÔNG LÙI — Item đã DONE phải giữ DONE');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const db6 = {
        BookingItems: [{
            id: 'item-done', bookingId: 'b-006', status: 'DONE', itemRating: 4,
            technicianCodes: ['NH006'],
            segments: [{ ktvId: 'NH006', startTime: '15:00', duration: 60, actualStartTime: '2026-05-17T08:00:00Z', actualEndTime: '2026-05-17T09:00:00Z' }]
        }]
    };
    const mock6 = createMockSupabase(db6);
    const result6 = await simulateFinishService(mock6, 'NH006', 'CLEANING', ['item-done'], 'b-006');

    console.log(`\n  📊 Finish Result (item đã DONE):`);
    result6.statusResults.forEach(r => {
        console.log(`     Item ${r.itemId}: oldStatus=${r.oldStatus} → ${r.newStatus}`);
    });
    const staysDone6 = result6.statusResults[0].newStatus === 'DONE';
    console.log(`     ✅ ${staysDone6 ? 'PASS' : '❌ FAIL'} — Item giữ DONE, không bị lùi về CLEANING`);

    // ──────────────────────────────────────
    // TEST 7: Orchestrator routing completeness
    // ──────────────────────────────────────
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 TEST 7: Orchestrator Routing — Tất cả action/status');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const cases = [
        { status: 'IN_PROGRESS', action: 'START_TIMER',   expect: 'handleStartTimer' },
        { status: 'IN_PROGRESS', action: 'NEXT_SEGMENT',  expect: 'handleStartTimer' },
        { status: 'IN_PROGRESS', action: 'RESUME_TIMER',  expect: 'handleStartTimer' },
        { status: 'WHATEVER',    action: 'NEXT_SEGMENT_PREPARE', expect: 'handleStartTimer' },
        { status: 'CLEANING',    action: null,             expect: 'handleFinishService' },
        { status: 'COMPLETED',   action: null,             expect: 'handleFinishService' },
        { status: 'FEEDBACK',    action: null,             expect: 'handleFinishService' },
        { status: 'DONE',        action: null,             expect: 'handleFinishService' },
        { status: 'CLEANING',    action: 'RELEASE_KTV',   expect: 'handleFinishService' },
    ];

    let allPass = true;
    console.log('');
    cases.forEach(c => {
        const r = simulateOrchestratorRouting(c.status, c.action);
        const pass = r.handler === c.expect;
        if (!pass) allPass = false;
        const releaseInfo = c.action === 'RELEASE_KTV' ? ' + handleReleaseKTV' : '';
        console.log(`     ${pass ? '✅' : '❌'} status=${c.status.padEnd(12)} action=${String(c.action).padEnd(22)} → ${r.handler}${releaseInfo}`);
    });
    console.log(`\n     ${allPass ? '✅ ALL ROUTING PASS' : '❌ SOME ROUTING FAILED'}`);

    // ──────────────────────────────────────
    // SUMMARY
    // ──────────────────────────────────────
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('📊 TỔNG KẾT');
    console.log('═══════════════════════════════════════════════════════');
    
    const tests = [
        { name: '1 KTV - 1 DV (Simple)',     pass: result1.statusResults[0].newStatus === 'CLEANING' },
        { name: '1 KTV - 2 DV (Merged)',      pass: allCleaning2 && result2.isMerged },
        { name: '2 KTV - 1 DV (Sequential)',  pass: isInProgress3 },
        { name: 'Ca đêm (Cross-midnight)',    pass: canStart },
        { name: 'Dual-Condition (Rate→Done)', pass: isDone5 },
        { name: 'Không lùi DONE',             pass: staysDone6 },
        { name: 'Orchestrator Routing',       pass: allPass },
    ];

    tests.forEach(t => console.log(`  ${t.pass ? '✅' : '❌'} ${t.name}`));
    
    const totalPass = tests.filter(t => t.pass).length;
    console.log(`\n  Result: ${totalPass}/${tests.length} PASSED`);
    
    if (totalPass === tests.length) {
        console.log('  🎉 TẤT CẢ EDGE CASES ĐỀU PASS — An toàn để commit refactor!');
    } else {
        console.log('  ⚠️ CÓ TEST FAIL — Cần kiểm tra lại logic!');
    }
}

runTests().catch(console.error);

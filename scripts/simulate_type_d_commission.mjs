import assert from 'assert';

class KtvTypeDCommissionService {
    static calculateGuestCommission(
        bookingItems,
        techCode,
        guestRating,
        ratePer60m,
        ratingDeductions
    ) {
        const safeRating = guestRating ?? 0;
        const deductionStr = safeRating.toString();
        const d = ratingDeductions[deductionStr] ?? 0;

        let totalPay = 0;
        for (const item of bookingItems) {
            let segsArray = [];
            if (typeof item.segments === 'string') {
                try {
                    segsArray = JSON.parse(item.segments);
                } catch (e) {
                    console.error('Failed to parse', e);
                    segsArray = [];
                }
            } else {
                segsArray = item.segments || [];
            }
            
            const mySegs = segsArray.filter((s) => 
                s.ktvId && s.ktvId.toLowerCase() === techCode.toLowerCase()
            );

            for (const seg of mySegs) {
                if (seg.customCommissionDuration !== undefined && seg.customCommissionDuration !== null) {
                    const customPhut = Number(seg.customCommissionDuration);
                    totalPay += customPhut * (ratePer60m / 60);
                    continue;
                }

                const gan = Number(seg.duration) || 0;
                let phut = 0;

                if (seg.actualStartTime && seg.actualEndTime) {
                    const t1 = new Date(seg.actualStartTime).getTime();
                    const t2 = new Date(seg.actualEndTime).getTime();
                    const thuc = Math.max(0, (t2 - t1) / 60000);
                    phut = Math.min(thuc, gan);
                } else {
                    phut = gan; // Fallback to full duration
                }

                const basePay = phut * (ratePer60m / 60);
                totalPay += basePay;
            }
        }

        const finalPay = totalPay * (1 - d);
        return Math.round(finalPay);
    }
}

function runTest() {
    const ratePer60 = 100000;
    const techCode = 'T001';
    const deductions = { "4": 0, "3": 0.25, "2": 0.5, "1": 0.75, "0": 0 };

    console.log("Running assertions...");

    // Case 1: Gán 60p, xong 50p -> 50p, rating 4
    const items1 = [{
        segments: [{
            ktvId: 'T001',
            duration: 60,
            actualStartTime: '2026-09-01T10:00:00Z',
            actualEndTime: '2026-09-01T10:50:00Z'
        }]
    }];
    const pay1 = KtvTypeDCommissionService.calculateGuestCommission(items1, techCode, 4, ratePer60, deductions);
    console.log(`Case 1: ${pay1}`);
    assert.strictEqual(pay1, 83333);

    // Case 2: Gán 60p, xong 65p -> 60p, rating 4
    const items2 = [{
        segments: [{
            ktvId: 'T001',
            duration: 60,
            actualStartTime: '2026-09-01T10:00:00Z',
            actualEndTime: '2026-09-01T11:05:00Z'
        }]
    }];
    const pay2 = KtvTypeDCommissionService.calculateGuestCommission(items2, techCode, 4, ratePer60, deductions);
    console.log(`Case 2: ${pay2}`);
    assert.strictEqual(pay2, 100000);

    // Case 3: Missing timestamps -> Fallback to gan (60)
    const items3 = [{
        segments: [{
            ktvId: 'T001',
            duration: 60
            // No timestamps
        }]
    }];
    const pay3 = KtvTypeDCommissionService.calculateGuestCommission(items3, techCode, 4, ratePer60, deductions);
    console.log(`Case 3 (Missing timestamps): ${pay3}`);
    assert.strictEqual(pay3, 100000);

    // Case 4: customCommissionDuration overrides
    const items4 = [{
        segments: [{
            ktvId: 'T001',
            duration: 60,
            customCommissionDuration: 30, // should take 30
            actualStartTime: '2026-09-01T10:00:00Z',
            actualEndTime: '2026-09-01T11:05:00Z'
        }]
    }];
    const pay4 = KtvTypeDCommissionService.calculateGuestCommission(items4, techCode, 4, ratePer60, deductions);
    console.log(`Case 4 (Custom duration 30): ${pay4}`);
    assert.strictEqual(pay4, 50000);

    // Case 5: string segment + lowercase ktvId
    const items5 = [{
        segments: "[{\"ktvId\":\"t001\",\"duration\":90,\"actualStartTime\":\"2026-09-01T05:00:00Z\",\"actualEndTime\":\"2026-09-01T06:30:00Z\"}]"
    }];
    const pay5 = KtvTypeDCommissionService.calculateGuestCommission(items5, techCode, 4, ratePer60, deductions);
    console.log(`Case 5 (String JSON & Lowercase ID): ${pay5}`);
    assert.strictEqual(pay5, 150000); // 90 mins * 100000/60 = 150000

    console.log("All commission assertions passed.");
}

runTest();

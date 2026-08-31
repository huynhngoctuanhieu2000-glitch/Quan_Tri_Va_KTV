const assert = require('assert');

class KtvTypeDBonusService {
    static calculateBonusForTypeD(
        ktvWorkTypes,
        guestRating,
        basePoints,
        pointRate
    ) {
        const hasOtherType = ktvWorkTypes.some(t => t !== 'TYPE_D');
        if (hasOtherType) return 0;
        const safeRating = guestRating ?? 0;
        if (safeRating < 4) return 0;
        const dCount = ktvWorkTypes.filter(t => t === 'TYPE_D').length;
        if (dCount === 0) return 0;
        return (basePoints * pointRate) / dCount;
    }
}

function runTest() {
    const base = 20;
    const rate = 1000;
    
    console.log("Running bonus assertions...");

    const pay1 = KtvTypeDBonusService.calculateBonusForTypeD(['TYPE_D'], 4, base, rate);
    assert.strictEqual(pay1, 20000);

    const pay2 = KtvTypeDBonusService.calculateBonusForTypeD(['TYPE_D', 'TYPE_D'], 4, base, rate);
    assert.strictEqual(pay2, 10000);

    const pay3 = KtvTypeDBonusService.calculateBonusForTypeD(['TYPE_D', 'TYPE_A'], 4, base, rate);
    assert.strictEqual(pay3, 0);

    const pay4 = KtvTypeDBonusService.calculateBonusForTypeD(['TYPE_D'], 3, base, rate);
    assert.strictEqual(pay4, 0);
    
    const pay5 = KtvTypeDBonusService.calculateBonusForTypeD(['TYPE_D'], 5, base, rate);
    assert.strictEqual(pay5, 20000);

    console.log("All bonus assertions passed.");
}

runTest();

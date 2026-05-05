
/**
 * SIMULATION: KTV Wallet Balance Logic
 * Goal: Prove that the balance calculation is safe and handles pending requests.
 */

const TURN_RATE = 50000; // 50k per turn
const MIN_DEPOSIT = 500000; // 500k deposit

// Mock Data
const mockTurnLedger = [
    { employee_id: 'NH016', date: '2026-05-01' },
    { employee_id: 'NH016', date: '2026-05-01' },
    { employee_id: 'NH016', date: '2026-05-02' },
]; // 3 turns * 50k = 150k

const mockBookingItems = [
    { technicianCodes: ['NH016'], tip: 100000 },
    { technicianCodes: ['NH016', 'NH001'], tip: 200000 }, // Shared tip? Need to know policy. Assume 100k each if shared?
]; // Total tip = 100k + 100k = 200k

const mockWithdrawals = [
    { staff_id: 'NH016', amount: 100000, status: 'APPROVED' },
    { staff_id: 'NH016', amount: 50000, status: 'PENDING' },
];

function calculateBalance(staffId) {
    const totalTurns = mockTurnLedger.filter(t => t.employee_id === staffId).length;
    const turnIncome = totalTurns * TURN_RATE;

    const tipIncome = mockBookingItems.reduce((acc, item) => {
        if (item.technicianCodes.includes(staffId)) {
            // Policy check: split tip or full tip? 
            // In many spas, tip is per KTV. If 2 KTVs, the record might already be split or each gets the full amount if recorded separately.
            // Assuming tip in BookingItems is the TOTAL for that item, we divide by number of KTVs.
            return acc + (item.tip / item.technicianCodes.length);
        }
        return acc;
    }, 0);

    const totalWithdrawn = mockWithdrawals
        .filter(w => w.staff_id === staffId && w.status === 'APPROVED')
        .reduce((acc, w) => acc + w.amount, 0);

    const totalPending = mockWithdrawals
        .filter(w => w.staff_id === staffId && w.status === 'PENDING')
        .reduce((acc, w) => acc + w.amount, 0);

    const grossIncome = turnIncome + tipIncome;
    const availableBalance = grossIncome - totalWithdrawn;
    const effectiveBalance = availableBalance - totalPending; // Amount they can actually request more of

    return {
        grossIncome,
        totalWithdrawn,
        totalPending,
        availableBalance,
        effectiveBalance
    };
}

function canWithdraw(staffId, amount) {
    const { effectiveBalance } = calculateBalance(staffId);
    const remainingAfterWithdraw = effectiveBalance - amount;
    
    if (remainingAfterWithdraw < MIN_DEPOSIT) {
        return { 
            allowed: false, 
            reason: `Số dư còn lại (${remainingAfterWithdraw.toLocaleString()}đ) sau khi rút sẽ thấp hơn mức cọc tối thiểu (${MIN_DEPOSIT.toLocaleString()}đ).` 
        };
    }
    
    return { allowed: true };
}

// Test Case 1: NH016
const balance = calculateBalance('NH016');
console.log('Balance Report for NH016:', balance);
// turnIncome: 150k, tipIncome: 100k + 100k = 200k -> total 350k.
// withdrawn 100k -> available 250k.
// pending 50k -> effective 200k.

const withdrawalRequest = 50000;
console.log(`Requesting ${withdrawalRequest}:`, canWithdraw('NH016', withdrawalRequest));

// Test Case 2: High income KTV
mockTurnLedger.push(...Array(20).fill({ employee_id: 'NH016', date: '2026-05-03' })); // +1M
const balance2 = calculateBalance('NH016');
console.log('New Balance Report:', balance2);
console.log(`Requesting 500k:`, canWithdraw('NH016', 500000));

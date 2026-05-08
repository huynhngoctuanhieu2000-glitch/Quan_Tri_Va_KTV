const dates = [];
const today = new Date();
// Generate dates for the last 7 days and today
for(let i=7; i>=0; i--) {
  const d = new Date(today);
  d.setDate(d.getDate() - i);
  dates.push(d.toISOString().split('T')[0]);
}

async function run() {
  console.log('Bắt đầu đồng bộ Sổ Cái (Daily Ledger) cho các ngày:', dates.join(', '));
  for (const dateStr of dates) {
    console.log(`\nĐang đồng bộ ngày ${dateStr}...`);
    try {
        const res = await fetch('http://localhost:3000/api/cron/sync-daily-ledger', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetDate: dateStr })
        });
        const data = await res.json();
        console.log(`[Kết quả ${dateStr}]:`, data);
    } catch(err) {
        console.error(`[Lỗi ${dateStr}]:`, err.message);
    }
  }
  console.log('\nHoàn tất đồng bộ!');
}

run();

const fs = require('fs');
const file = 'app/ktv/dashboard/KTVDashboard.logic.ts';
let content = fs.readFileSync(file, 'utf8');
if(!content.includes('getMinsFromTimes')) {
    content = content.replace('const MAX_RETRIES = 3;', `const getMinsFromTimes = (start: string, end: string) => {
    if (!start || !end) return 0;
    const [h1, m1] = start.split(':').map(Number);
    const [h2, m2] = end.split(':').map(Number);
    if (isNaN(h1) || isNaN(m1) || isNaN(h2) || isNaN(m2)) return 0;
    let mins1 = h1 * 60 + m1;
    let mins2 = h2 * 60 + m2;
    if (mins2 < mins1) mins2 += 24 * 60;
    return mins2 - mins1;
};

const MAX_RETRIES = 3;`);
    fs.writeFileSync(file, content);
    console.log('Fixed helper');
}

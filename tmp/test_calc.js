const calcEndTime = (start, duration) => {
    if (!start || !duration) return '';
    const [h, m] = start.split(':').map(Number);
    const end = new Date();
    // Use a fixed date to avoid issues with current time crossing midnight during test
    end.setFullYear(2026, 2, 15); 
    end.setHours(h, m + duration, 0, 0);
    return `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;
};

console.log('16:00 + 60 =', calcEndTime('16:00', 60));
console.log('16:00 + 90 =', calcEndTime('16:00', 90));
console.log('16:15 + 45 =', calcEndTime('16:15', 45));
console.log('23:30 + 60 =', calcEndTime('23:30', 60));
console.log('23:30 + 120 =', calcEndTime('23:30', 120));
console.log('00:00 + 60 =', calcEndTime('00:00', 60));
console.log('16:00 + 0 =', calcEndTime('16:00', 0));
console.log('16:00 + null =', calcEndTime('16:00', null));

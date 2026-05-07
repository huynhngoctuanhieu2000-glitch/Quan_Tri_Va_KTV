import { PendingOrder, ServiceBlock } from '../types';
import { formatToHourMinute } from '@/lib/utils';

export const getDynamicEndTime = (startStr?: string | null, durationMins: number = 60) => {
    if (!startStr) return '--:--';
    const formatted = formatToHourMinute(startStr);
    if (formatted === '--:--') return '--:--';
    
    const [h, m] = formatted.split(':').map(Number);
    const d = new Date();
    d.setHours(h, m + durationMins, 0, 0);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export interface SubOrder {
    id: string; // bookingId_subId (unique for kanban cards)
    bookingId: string;
    originalOrder: PendingOrder;
    services: ServiceBlock[];
    dispatchStatus: string;
    ktvSignature: string; // Kept for backward compatibility
    ktvIds: string[]; // Explicit array of KTV IDs for this suborder
    calculatedStart: string; // The dynamically calculated start time
    rating?: number | null;
}

export function buildOrderTimeline(orders: PendingOrder[]): SubOrder[] {
    const result: SubOrder[] = [];
    
    orders.forEach(order => {
        // Nếu là order pending chưa phân KTV
        if (order.dispatchStatus === 'pending') {
            const pendingServices = order.services.filter(svc => 
                !svc.serviceName?.toLowerCase().includes('phòng riêng') && 
                !svc.serviceName?.toLowerCase().includes('phong rieng')
            );
            
            if (pendingServices.length > 0) {
                // Tự suy diễn status của pending order (thường là NEW hoặc PREPARING)
                const statuses = pendingServices.map(s => s.status || 'NEW');
                let dispatchStatus = 'PREPARING';
                if (statuses.includes('NEW')) dispatchStatus = 'PREPARING'; // Để chung cột chuẩn bị
                
                result.push({
                    id: `${order.id}_pending_order`,
                    bookingId: order.id,
                    originalOrder: order,
                    services: pendingServices.map(svc => ({ ...svc, status: svc.status || 'NEW' })),
                    dispatchStatus,
                    ktvSignature: 'pending_order',
                    ktvIds: [],
                    calculatedStart: order.timeStart || order.time || ''
                });
            }
            return;
        }

        // TÍNH TOÁN GIỜ NỐI TIẾP (DYNAMIC TIMELINE) CHO TOÀN BỘ ORDER
        const dynamicStartTimes = new Map<string, string>();
        
        // Quét toàn bộ KTV của tất cả các dịch vụ (bỏ qua phòng riêng)
        // Để liên kết xuyên dịch vụ (cross-service), ta gộp tất cả staffList vào 1 mảng lớn, 
        // nhưng hiện tại logic QuickBooking tạo 2 dòng dịch vụ độc lập có startTime khác nhau.
        // Thay vì gộp, ta tính toán theo từng dịch vụ như cũ, NHƯNG nếu muốn nối tiếp XUYÊN DỊCH VỤ, 
        // ta phải sort tất cả staff theo startTime gốc!

        const allStaffs: Array<{ st: any, svcId: string, svcDuration: number, svcTimeStart: string, origStart: string }> = [];
        
        order.services.forEach(svc => {
            if (svc.serviceName?.toLowerCase().includes('phòng riêng') || svc.serviceName?.toLowerCase().includes('phong rieng')) return;
            if (!svc.staffList) return;
            
            svc.staffList.forEach(st => {
                const seg = st.segments?.[0];
                const origStart = seg?.startTime || '';
                allStaffs.push({
                    st,
                    svcId: svc.id,
                    svcDuration: Number(svc.duration) || 60,
                    svcTimeStart: svc.timeStart || '',
                    origStart
                });
            });
        });

        // Sắp xếp toàn bộ KTV theo giờ xuất phát gốc
        allStaffs.sort((a, b) => a.origStart.localeCompare(b.origStart));

        let currentMaxEndStr = '';
        let lastGroupStartTime = '';
        let lastGroupCalculatedStart = '';

        allStaffs.forEach((item, idx) => {
            const { st, svcId, svcDuration, svcTimeStart, origStart } = item;
            const seg = st.segments?.[0];
            
            // Ưu tiên runtime anchor: actualStartTime -> item.timeStart -> segment.startTime
            // Tuy nhiên, thời gian gốc để TÍNH TOÁN mốc nối tiếp nên dựa vào origStart
            let calculatedStart = origStart || svcTimeStart || '';

            if (idx > 0) {
                if (origStart === lastGroupStartTime) {
                    // Fourhand: xài chung giờ nhóm
                    calculatedStart = lastGroupCalculatedStart;
                } else if (currentMaxEndStr) {
                    // Nối tiếp xuyên dịch vụ!
                    calculatedStart = currentMaxEndStr;
                }
            }

            dynamicStartTimes.set(`${svcId}_${st.ktvId}`, calculatedStart);

            // Tính End Time động
            const runtimeAnchor = seg?.actualStartTime || calculatedStart;
            const duration = Number(seg?.duration) || svcDuration;
            const ktvEnd = seg?.actualEndTime || getDynamicEndTime(runtimeAnchor, duration);

            if (origStart !== lastGroupStartTime) {
                currentMaxEndStr = ktvEnd;
            } else {
                if (ktvEnd > currentMaxEndStr) currentMaxEndStr = ktvEnd;
            }

            lastGroupStartTime = origStart;
            lastGroupCalculatedStart = calculatedStart;
        });

        // XÂY DỰNG SUB-ORDERS
        const ktvGroups = new Map<string, ServiceBlock[]>();
        const groupKtvIds = new Map<string, string[]>();
        const groupCalculatedStarts = new Map<string, string>();

        order.services.forEach(svc => {
            if (svc.serviceName?.toLowerCase().includes('phòng riêng') || svc.serviceName?.toLowerCase().includes('phong rieng')) return;
            
            if (svc.staffList && svc.staffList.length > 0) {
                const timeGroups = new Map<string, typeof svc.staffList>();
                
                svc.staffList.forEach(st => {
                    const calculatedStart = dynamicStartTimes.get(`${svc.id}_${st.ktvId}`) || st.segments?.[0]?.startTime || 'unknown';
                    const stClone = { ...st, _calculatedStartTime: calculatedStart };
                    if (!timeGroups.has(calculatedStart)) timeGroups.set(calculatedStart, []);
                    timeGroups.get(calculatedStart)!.push(stClone);
                });

                timeGroups.forEach((staffsAtTime, calculatedStart) => {
                    // Unique ID cho subOrder: kết hợp svc.id và calculatedStart
                    const ktvSignature = `${svc.id}_${calculatedStart.replace(/:/g, '')}`; 
                    
                    if (!ktvGroups.has(ktvSignature)) {
                        ktvGroups.set(ktvSignature, []);
                        groupKtvIds.set(ktvSignature, staffsAtTime.map(s => s.ktvId));
                        groupCalculatedStarts.set(ktvSignature, calculatedStart);
                    }
                    
                    let isAllCompleted = true;
                    let isAnyStarted = false;
                    let isAllFeedback = true;
                    
                    staffsAtTime.forEach(st => {
                        if (!st.segments || st.segments.length === 0) {
                            isAllCompleted = false;
                            isAllFeedback = false;
                        }
                        st.segments?.forEach((seg: any) => {
                            if (seg.actualStartTime) isAnyStarted = true;
                            if (!seg.actualEndTime) isAllCompleted = false;
                            if (!seg.feedbackTime) isAllFeedback = false;
                        });
                    });
                    
                    let derivedStatus = svc.status || 'NEW';
                    if (derivedStatus !== 'CANCELLED' && derivedStatus !== 'DONE') {
                        if (isAllFeedback && isAllCompleted) derivedStatus = 'FEEDBACK';
                        else if (isAllCompleted) derivedStatus = 'CLEANING';
                        else if (isAnyStarted) derivedStatus = 'IN_PROGRESS';
                        else derivedStatus = 'PREPARING';
                    }

                    const svcClone = {
                        ...svc,
                        staffList: staffsAtTime,
                        status: derivedStatus
                    };
                    ktvGroups.get(ktvSignature)!.push(svcClone);
                });
            } else {
                const ktvSignature = `${svc.id}_unassigned`;
                if (!ktvGroups.has(ktvSignature)) {
                    ktvGroups.set(ktvSignature, []);
                    groupKtvIds.set(ktvSignature, []);
                    groupCalculatedStarts.set(ktvSignature, svc.timeStart || '');
                }
                ktvGroups.get(ktvSignature)!.push(svc);
            }
        });

        ktvGroups.forEach((services, ktvSignature) => {
            const statuses = services.map(s => s.status || 'NEW');
            let dispatchStatus = 'PREPARING';
            if (statuses.includes('IN_PROGRESS')) dispatchStatus = 'IN_PROGRESS';
            else if (statuses.includes('CLEANING')) dispatchStatus = 'CLEANING';
            else if (statuses.includes('FEEDBACK')) dispatchStatus = 'FEEDBACK';
            else if (statuses.includes('DONE') || statuses.includes('CANCELLED')) dispatchStatus = 'DONE';
            else if (statuses.includes('PREPARING')) dispatchStatus = 'PREPARING';

            result.push({
                id: `${order.id}_${ktvSignature}`,
                bookingId: order.id,
                originalOrder: order,
                services,
                dispatchStatus,
                ktvSignature, // Legacy
                ktvIds: groupKtvIds.get(ktvSignature) || [],
                calculatedStart: groupCalculatedStarts.get(ktvSignature) || ''
            });
        });
    });

    return result;
}

const fs = require('fs');
const file = 'app/reception/dispatch/page.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Add SubOrder interface
content = content.replace(
  /} from '\.\/types';/,
  "} from './types';\n\ninterface SubOrder {\n    id: string;\n    bookingId: string;\n    originalOrder: PendingOrder;\n    services: ServiceBlock[];\n    dispatchStatus: DispatchStatus;\n    ktvSignature: string;\n}"
);

// 2. Add time helpers
content = content.replace(
  /const getCurrentTime = \(\) => {[\s\S]*?\n};/,
  `const getCurrentTime = () => {
  const d = new Date();
  return \`\${String(d.getHours()).padStart(2, '0')}:\${String(d.getMinutes()).padStart(2, '0')}\`;
};

const formatToHourMinute = (isoString?: string | null) => {
    if (!isoString) return '--:--';
    if (/^\\d{1,2}:\\d{2}$/.test(isoString)) return isoString;
    let parseString = isoString;
    if (!isoString.endsWith('Z') && !isoString.includes('+')) {
        parseString = isoString.replace(' ', 'T') + 'Z';
    }
    const d = new Date(parseString);
    if (isNaN(d.getTime())) return isoString;
    return \`\${String(d.getHours()).padStart(2, '0')}:\${String(d.getMinutes()).padStart(2, '0')}\`;
};

const getDynamicEndTime = (startStr?: string | null, durationMins: number = 60) => {
    if (!startStr) return '--:--';
    const formatted = formatToHourMinute(startStr);
    if (formatted === '--:--') return '--:--';
    
    const [h, m] = formatted.split(':').map(Number);
    const d = new Date();
    d.setHours(h, m + durationMins, 0, 0);
    return \`\${String(d.getHours()).padStart(2, '0')}:\${String(d.getMinutes()).padStart(2, '0')}\`;
};`
);

// 3. Add selectedSubOrderId state
content = content.replace(
  /const \[selectedOrderId, setSelectedOrderId\] = useState<string \| null>\(null\);/,
  "const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);\n  const [selectedSubOrderId, setSelectedSubOrderId] = useState<string | null>(null);"
);

// 4. Update getEstimatedEndTime and add subOrders calculation
const getEstEndRegex = /const getEstimatedEndTime = \(order: PendingOrder\) => \{[\s\S]*?\n  };/g;
const newGetEstEnd = `const getEstimatedEndTime = (order: PendingOrder, servicesToCheck: ServiceBlock[] = order.services) => {
    let maxTime = 0;

    if (!servicesToCheck || servicesToCheck.length === 0) return null;

    const parseHHMM = (timeStr: string) => {
        const [h, m] = timeStr.split(':').map(Number);
        const d = new Date();
        d.setHours(h, m, 0, 0);

        if (d.getTime() < Date.now() - 12 * 60 * 60 * 1000) {
             d.setDate(d.getDate() + 1);
        } else if (d.getTime() > Date.now() + 12 * 60 * 60 * 1000) {
             d.setDate(d.getDate() - 1);
        }
        
        return d;
    };

    for (const svc of servicesToCheck) {
        let hasValidSegmentTime = false;
        if (svc.staffList) {
            for (const staff of svc.staffList) {
                if (!staff.segments) continue;
                for (const seg of staff.segments) {
                    const start = seg.actualStartTime || svc.timeStart || seg.startTime;
                    const duration = Number(seg.duration) || Number(svc.duration) || 60;
                    const finalEnd = seg.actualEndTime ? seg.actualEndTime : (seg.actualStartTime || svc.timeStart ? getDynamicEndTime(start, duration) : (svc.timeEnd || seg.endTime));
                    
                    if (finalEnd && finalEnd !== '--:--') {
                        const formattedEnd = formatToHourMinute(finalEnd);
                        if (formattedEnd !== '--:--') {
                            const d = parseHHMM(formattedEnd);
                            if (d.getTime() > maxTime) maxTime = d.getTime();
                            hasValidSegmentTime = true;
                        }
                    }
                }
            }
        }
        
        if (!hasValidSegmentTime && svc.timeEnd) {
            let tEnd = svc.timeEnd;
            if (!tEnd.endsWith('Z') && !tEnd.includes('+')) {
                tEnd = tEnd.replace(' ', 'T') + 'Z';
            }
            const d = new Date(tEnd);
            if (!isNaN(d.getTime())) {
                if (d.getTime() > maxTime) maxTime = d.getTime();
            }
        }
    }

    if (maxTime > 0) {
        const mDate = new Date(maxTime);
        return \`\${String(mDate.getHours()).padStart(2, '0')}:\${String(mDate.getMinutes()).padStart(2, '0')}\`;
    }

    if (order.timeEnd && servicesToCheck === order.services) {
        return formatToHourMinute(order.timeEnd);
    }

    return order.time; 
  };

  const subOrders = React.useMemo(() => {
    const result: SubOrder[] = [];
    orders.forEach(order => {
        const ktvGroups = new Map<string, ServiceBlock[]>();
        
        order.services.forEach(svc => {
            if (svc.serviceName?.toLowerCase().includes('phòng riêng') || svc.serviceName?.toLowerCase().includes('phong rieng')) {
                return;
            }
            
            if (svc.staffList && svc.staffList.length > 0) {
                const staffsAtTime = svc.staffList;
                const ktvSignatureBase = staffsAtTime.map(r => r.ktvId).filter(Boolean).sort().join(',') || 'unassigned';
                const ktvSignature = ktvSignatureBase;
                
                if (!ktvGroups.has(ktvSignature)) {
                    ktvGroups.set(ktvSignature, []);
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
            } else {
                const ktvSignature = 'unassigned_unknown_time';
                if (!ktvGroups.has(ktvSignature)) {
                    ktvGroups.set(ktvSignature, []);
                }
                ktvGroups.get(ktvSignature)!.push(svc);
            }
        });

        ktvGroups.forEach((services, ktvSignature) => {
            const statuses = services.map(s => s.status || 'NEW');
            let dispatchStatus: DispatchStatus = 'PREPARING';
            
            if (order.dispatchStatus === 'pending') {
                dispatchStatus = 'pending';
            } else {
                if (statuses.includes('IN_PROGRESS')) dispatchStatus = 'IN_PROGRESS';
                else if (statuses.includes('CLEANING')) dispatchStatus = 'CLEANING';
                else if (statuses.includes('FEEDBACK')) dispatchStatus = 'FEEDBACK';
                else if (statuses.includes('DONE') || statuses.includes('CANCELLED')) dispatchStatus = 'DONE';
                else if (statuses.includes('PREPARING')) dispatchStatus = 'PREPARING';
                
                if (dispatchStatus === 'PREPARING') {
                    if (!statuses.includes('NEW')) {
                        dispatchStatus = order.dispatchStatus === 'FEEDBACK' ? 'FEEDBACK' :
                                        order.dispatchStatus === 'CLEANING' ? 'CLEANING' :
                                        order.dispatchStatus === 'IN_PROGRESS' ? 'IN_PROGRESS' :
                                        order.dispatchStatus === 'DONE' ? 'DONE' : 'PREPARING';
                    }
                }
            }

            result.push({
                id: \`\${order.id}_\${ktvSignature}\`,
                bookingId: order.id,
                originalOrder: order,
                services,
                dispatchStatus,
                ktvSignature
            });
        });
    });
    return result;
  }, [orders]);`;

content = content.replace(getEstEndRegex, newGetEstEnd);

// 5. Update selected order logic
content = content.replace(
  /const pendingOrders = orders\.filter.*?\n.*?const selectedOrder = orders\.find.*?null;/s,
  `const pendingOrders = orders.filter(o => o.dispatchStatus === 'pending');
  const selectedOrder = orders.find(o => o.id === selectedOrderId) ?? null;
  const selectedSubOrder = subOrders.find(so => so.id === selectedSubOrderId) 
      || (selectedOrder ? { id: selectedOrder.id, bookingId: selectedOrder.id, originalOrder: selectedOrder, services: selectedOrder.services, dispatchStatus: selectedOrder.dispatchStatus, ktvSignature: '' } : null);`
);

// 6. Update displayedOrders
content = content.replace(
  /const displayedOrders = orders\.filter\(o => o\.dispatchStatus === leftPanelTab\);/,
  "const displayedOrders = subOrders.filter(o => o.dispatchStatus === leftPanelTab);"
);

// 7. Update rendering loop for displayedOrders
content = content.replace(
  /displayedOrders\.map\(order => \([\s\S]*?<div className="flex justify-between items-center mb-2">[\s\S]*?<span className="text-\[10px\] font-black text-indigo-600 bg-indigo-50 px-2\.5 py-1 rounded-lg tracking-wider">#\{order\.billCode\}<\/span>[\s\S]*?<span className="text-\[10px\] font-bold text-gray-400 flex items-center gap-1\.5"><Clock size=\{12\} className="text-gray-300" \/> \{order\.time\}<\/span>[\s\S]*?<p className="font-black text-gray-900 group-hover:text-indigo-600 transition-colors uppercase tracking-tight truncate">\{order\.customerName\}<\/p>[\s\S]*?<span>\{\(order\.totalAmount \|\| 0\)\.toLocaleString\('vi-VN'\)\}đ<\/span>[\s\S]*?<p className="text-\[10px\] text-gray-500 font-medium truncate flex-1 leading-tight">[\s\S]*?\{order\.services\.length > 0[\s\S]*?\? \`\$\{order\.services\.map\(s => s\.serviceName \|\| 'Dịch vụ'\)\.join\(', '\)\} · \$\{order\.services\.reduce\(\(acc, s\) => acc \+ \(s\.duration \|\| 0\), 0\)\}p\`[\s\S]*?: 'Chưa có dịch vụ'[\s\S]*?<\/p>[\s\S]*?\{selectedOrderId === order\.id && <span className="shrink-0 text-\[10px\] font-black text-indigo-600 uppercase tracking-tighter">Đang chọn →<\/span>\}[\s\S]*?<\/motion\.div>[\s\S]*?\)\)/,
  `displayedOrders.map(subOrder => {
                  const order = subOrder.originalOrder;
                  return (
                  <motion.div
                    layout
                    key={subOrder.id}
                    onClick={() => {
                        setSelectedOrderId(order.id);
                        setSelectedSubOrderId(subOrder.id);
                    }}
                    onContextMenu={(e: React.MouseEvent) => {
                      e.preventDefault();
                      setContextMenu({ x: e.clientX, y: e.clientY, orderId: order.id });
                    }}
                    onTouchStart={(e) => {
                      const touch = e.touches[0];
                      longPressTimer.current = setTimeout(() => {
                        if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
                            window.navigator.vibrate(50);
                        }
                        setContextMenu({ x: touch.clientX, y: touch.clientY, orderId: order.id });
                      }, 500);
                    }}
                    onTouchMove={() => {
                      if (longPressTimer.current) clearTimeout(longPressTimer.current);
                    }}
                    onTouchEnd={() => {
                      if (longPressTimer.current) clearTimeout(longPressTimer.current);
                    }}
                    style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
                    className={\`bg-white p-5 rounded-3xl border-2 cursor-pointer transition-all active:scale-[0.98] relative \${selectedSubOrderId === subOrder.id ? 'border-indigo-600 shadow-2xl shadow-indigo-100 ring-4 ring-indigo-50/50' : 'border-transparent shadow-sm hover:border-indigo-100 hover:shadow-lg'}\`}
                  >
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg tracking-wider">
                        #{order.billCode} {subOrder.services.length < order.services.length && '(Tách)'}
                      </span>
                      <span className="text-[10px] font-bold text-gray-400 flex items-center gap-1.5"><Clock size={12} className="text-gray-300" /> {getEstimatedEndTime(order, subOrder.services) || order.time}</span>
                    </div>
                    <div className="flex justify-between items-baseline gap-2">
                      <p className="font-black text-gray-900 group-hover:text-indigo-600 transition-colors uppercase tracking-tight truncate">{order.customerName}</p>
                        <div className="shrink-0 text-[11px] font-black text-emerald-600 bg-emerald-50 px-3 py-1 rounded-xl flex items-center gap-1 border border-emerald-100/50">
                          <span>{(subOrder.services.reduce((acc, svc) => acc + ((svc.price || 0) * (svc.quantity || 1)), 0)).toLocaleString('vi-VN')}đ</span>
                          <span className="opacity-30">·</span>
                          <span>{order.paymentMethod === 'Cash' || order.paymentMethod === 'cash_vnd' ? 'cash' : (order.paymentMethod === 'Transfer' ? 'ck' : order.paymentMethod)}</span>
                        </div>
                    </div>
                    <div className="mt-2.5 flex items-center justify-between gap-4">
                      <p className="text-[10px] text-gray-500 font-medium truncate flex-1 leading-tight">
                        {subOrder.services.length > 0 
                          ? \`\${subOrder.services.map(s => s.serviceName || 'Dịch vụ').join(', ')} · \${subOrder.services.reduce((acc, s) => acc + (s.duration || 0), 0)}p\`
                          : 'Chưa có dịch vụ'
                        }
                      </p>
                      {selectedSubOrderId === subOrder.id && <span className="shrink-0 text-[10px] font-black text-indigo-600 uppercase tracking-tighter">Đang chọn →</span>}
                    </div>
                  </motion.div>
                )})`
);

// 8. Update selectedOrder checks
content = content.replace(
  /onClick=\{\(\) => setSelectedOrderId\(null\)\}/,
  "onClick={() => { setSelectedOrderId(null); setSelectedSubOrderId(null); }}"
);
content = content.replace(
  /\{selectedOrder \?\s*\(\s*<div className="flex-1 min-w-0">/s,
  "{selectedSubOrder ? (\n                <div className=\"flex-1 min-w-0\">"
);
content = content.replace(
  /<h2 className="font-black text-gray-900 text-base truncate">Đơn \{selectedOrder\.id\} — \{selectedOrder\.customerName\}<\/h2>/,
  "<h2 className=\"font-black text-gray-900 text-base truncate\">Đơn {selectedSubOrder.originalOrder.billCode} — {selectedSubOrder.originalOrder.customerName}</h2>"
);
content = content.replace(
  /\{selectedOrder\.services\.some\(s => s\.options\?\.isAddon && !s\.options\?\.isPaid\) && \(/,
  "{selectedSubOrder.services.some(s => s.options?.isAddon && !s.options?.isPaid) && ("
);
content = content.replace(
  /\{selectedOrder \?\s*\(\s*<div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-6 bg-slate-50\/30">/s,
  "{selectedSubOrder ? (\n              <div className=\"flex-1 overflow-y-auto p-4 lg:p-6 space-y-6 bg-slate-50/30\">"
);

// 9. Update QuickDispatchTable and Reorder.Group props
content = content.replace(
  /services=\{selectedOrder\.services\}\s*orderId=\{selectedOrder\.id\}\s*rooms=\{rooms\}\s*beds=\{beds\}\s*availableTurns=\{turns\}\s*busyBedIds=\{orders\s*\.filter\(o => o\.id !== selectedOrder\.id && \(o\.dispatchStatus === 'IN_PROGRESS' \|\| o\.dispatchStatus === 'PREPARING'\)\)\s*\.flatMap\(o => o\.services\.flatMap\(s => s\.staffList\.flatMap\(r => r\.segments\.map\(seg => seg\.bedId\)\)\)\)\s*\.filter\(Boolean\) as string\[\]\s*\}/s,
  `services={selectedSubOrder.services}
                    orderId={selectedSubOrder.bookingId}
                    rooms={rooms}
                    beds={beds}
                    availableTurns={turns}
                    busyBedIds={orders
                      .filter(o => o.id !== selectedSubOrder.bookingId && (o.dispatchStatus === 'IN_PROGRESS' || o.dispatchStatus === 'PREPARING'))
                      .flatMap(o => o.services.flatMap(s => s.staffList.flatMap(r => r.segments.map(seg => seg.bedId))))
                      .filter(Boolean) as string[]
                    }`
);
content = content.replace(
  /updateOrder\(selectedOrder\.id, o => \(\{ \.\.\.o, services: updatedServices \}\)\);/,
  `updateOrder(selectedSubOrder.bookingId, o => {
                          const mergedServices = o.services.map(origSvc => {
                              const found = updatedServices.find(u => u.id === origSvc.id);
                              return found ? found : origSvc;
                          });
                          return { ...o, services: mergedServices };
                      });`
);
content = content.replace(
  /customerReqs=\{selectedOrder\.services\[0\] \? \{\s*genderReq: selectedOrder\.services\[0\]\.genderReq,\s*strength: selectedOrder\.services\[0\]\.strength,\s*focus: selectedOrder\.services\[0\]\.focus,\s*avoid: selectedOrder\.services\[0\]\.avoid,\s*customerNote: selectedOrder\.services\[0\]\.customerNote,\s*\} : undefined\}/s,
  `customerReqs={selectedSubOrder.services[0] ? {
                      genderReq: selectedSubOrder.services[0].genderReq,
                      strength: selectedSubOrder.services[0].strength,
                      focus: selectedSubOrder.services[0].focus,
                      avoid: selectedSubOrder.services[0].avoid,
                      customerNote: selectedSubOrder.services[0].customerNote,
                    } : undefined}`
);
content = content.replace(
  /billCode=\{selectedOrder\.billCode\}\s*customerName=\{selectedOrder\.customerName\}/,
  `billCode={selectedSubOrder.originalOrder.billCode}
                    customerName={selectedSubOrder.originalOrder.customerName}`
);

// 10. Update Reorder.Group
content = content.replace(
  /values=\{selectedOrder\.services\}\s*onReorder=\{\(newServices\) => \{\s*const recalculated = recalculateAllTimes\(\{ \.\.\.selectedOrder, services: newServices \}, roomTransitionTime\);\s*updateOrder\(selectedOrder\.id, o => \(\{ \.\.\.o, services: recalculated\.services \}\)\);\s*\}\}/s,
  `values={selectedSubOrder.services}
                    onReorder={(newServices) => {
                      const recalculated = recalculateAllTimes({ ...selectedSubOrder.originalOrder, services: newServices }, roomTransitionTime);
                      updateOrder(selectedSubOrder.bookingId, o => {
                          const nonSubOrderServices = o.services.filter(s => !newServices.some(ns => ns.id === s.id));
                          return { ...o, services: [...nonSubOrderServices, ...recalculated.services.filter(s => newServices.some(ns => ns.id === s.id))] };
                      });
                    }}`
);
content = content.replace(
  /selectedOrder\.services\.map\(\(svc, idx\) => \{/g,
  "selectedSubOrder.services.map((svc, idx) => {"
);
content = content.replace(
  /selectedOrder\.id &&/g,
  "selectedSubOrder.bookingId &&"
);
content = content.replace(
  /selectedOrder\.services\s*\.filter/g,
  "selectedSubOrder.originalOrder.services.filter"
);
content = content.replace(
  /orderId=\{selectedOrder\.id\}/g,
  "orderId={selectedSubOrder.bookingId}"
);
content = content.replace(
  /selectedOrder\?\.dispatchStatus/g,
  "selectedSubOrder?.dispatchStatus"
);

// 11. Update KanbanBoard props
content = content.replace(
  /onOpenDetail=\{\(id\) => \{\s*setSelectedOrderId\(id\);\s*setActiveMode\('DISPATCH'\);\s*\}\}/s,
  `onOpenDetail={(orderId, subOrderId, status) => {
                setLeftPanelTab((status || 'pending') as DispatchStatus);
                setSelectedOrderId(orderId);
                setSelectedSubOrderId(subOrderId);
                setActiveMode('DISPATCH');
              }}`
);

fs.writeFileSync(file, content, 'utf8');
console.log('Update success');

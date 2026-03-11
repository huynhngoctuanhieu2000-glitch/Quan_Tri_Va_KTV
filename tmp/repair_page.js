
const fs = require('fs');
const path = 'app/reception/dispatch/page.tsx';
let content = fs.readFileSync(path, 'utf8');

// Section 1: Fix fetchData and useEffect mess
const startRegex = /const fetchData = async \(\) => \{[\s\S]*?\} catch \(e\) \{/;
const endRegex = /if \(!mounted\) return null;/;

const middleCode = `
    } catch (e) {
      console.error("❌ [Dispatch] Unexpected error in fetchData:", e);
    } finally {
      setLoading(false);
      setLoadingStaff(false);
    }
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    const handleCloseContext = () => setContextMenu(null);
    if (dropdownOpen) document.addEventListener('mousedown', handleClickOutside);
    if (contextMenu) document.addEventListener('mousedown', handleCloseContext);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('mousedown', handleCloseContext);
    };
  }, [dropdownOpen, contextMenu]);

  if (!mounted) return null;
`;

// Section 2: Robust renderStaffNotifications
const notifCode = `
  const renderStaffNotifications = () => {
    const unread = staffNotifications.filter(n => !n.isRead);
    return (
      <div className="fixed top-20 right-6 z-[99999] flex flex-col gap-3 pointer-events-none">
         <AnimatePresence>
            {unread.map((n) => {
               const normalizedType = n.type?.trim().toUpperCase();
               const isEarlyExit = normalizedType === 'EARLY_EXIT';
               const isEmergency = normalizedType === 'EMERGENCY';
               const isComplaint = normalizedType === 'COMPLAINT';

               return (
                 <motion.div
                    key={n.id}
                    initial={{ opacity: 0, y: -20, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    drag="x"
                    dragConstraints={{ left: 0, right: 0 }}
                    dragElastic={0.7}
                    onDragEnd={async (_, info) => {
                       if (Math.abs(info.offset.x) > 100) {
                          setStaffNotifications(prev => prev.map(item => item.id === n.id ? { ...item, isRead: true } : item));
                          await supabase.from('StaffNotifications').update({ isRead: true }).eq('id', n.id);
                       }
                    }}
                    className={\`pointer-events-auto p-4 rounded-2xl shadow-2xl border min-w-[320px] max-w-sm flex gap-4 items-start cursor-grab active:cursor-grabbing
                      \${isEmergency 
                        ? 'bg-rose-600 border-rose-500 text-white' 
                        : isEarlyExit 
                          ? 'bg-amber-50/95 backdrop-blur-md border-amber-200 shadow-amber-100/50' 
                          : 'bg-white/95 backdrop-blur-md border-emerald-100'}\`}
                 >
                    <div className={\`mt-1 p-2 rounded-xl flex-shrink-0 
                       \${isEmergency 
                          ? 'bg-white/20' 
                          : isEarlyExit 
                             ? 'bg-amber-100 text-amber-600' 
                             : 'bg-emerald-50 text-emerald-600'}\`}>
                       {isEmergency ? <ShieldAlert size={24} className="animate-pulse" /> : <Bell size={20} />}
                    </div>
                    <div className="flex-1">
                       <p className={\`text-[10px] font-black uppercase tracking-widest mb-0.5
                          \${isEmergency || isComplaint 
                             ? (isEmergency ? 'text-rose-100' : 'text-rose-600') 
                             : isEarlyExit 
                               ? 'text-amber-600 font-bold' 
                               : 'text-emerald-600'}\`}>
                          {isComplaint ? '🚨 Đánh giá tệ (Cần xử lý)' : 
                           isEmergency ? '🆘 Báo động khẩn cấp' : 
                           isEarlyExit ? '🏃 Khách về sớm (Chờ xác nhận)' : 
                           'KTV Yêu cầu hỗ trợ'}
                       </p>
                       <p className={\`text-sm font-bold leading-tight \${isEmergency ? 'text-white' : 'text-slate-800'}\`}>
                          {n.message}
                       </p>
                       <p className={\`text-[10px] mt-2 font-medium opacity-60 \${isEmergency ? 'text-rose-100' : 'text-slate-400'}\`}>
                          {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                       </p>
                    </div>
                    <button 
                       onClick={async () => {
                          setStaffNotifications(prev => prev.map(item => item.id === n.id ? { ...item, isRead: true } : item));
                          await supabase.from('StaffNotifications').update({ isRead: true }).eq('id', n.id);
                       }}
                       className="p-1 hover:bg-black/5 rounded-lg transition-colors"
                    >
                       <X size={16} className={isEmergency ? 'text-white' : 'text-slate-400'} />
                    </button>
                 </motion.div>
               );
            })}
         </AnimatePresence>
      </div>
    );
  };
`;

// Identify the mess
const messStart = content.indexOf('} catch (e) {');
const messEnd = content.lastIndexOf('if (!hasPermission(\'dispatch_board\')');

if (messStart !== -1 && messEnd !== -1) {
  const before = content.substring(0, messStart);
  const after = content.substring(messEnd);
  
  const newContent = before + middleCode + notifCode + after;
  fs.writeFileSync(path, newContent);
  console.log('Successfully repaired file!');
} else {
  console.log('Failed to identify mess markers', { messStart, messEnd });
}

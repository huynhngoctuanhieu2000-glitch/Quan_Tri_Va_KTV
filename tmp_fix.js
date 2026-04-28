const fs = require('fs');
const path = 'app/reception/leave-management/page.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(/const STATUS_CONFIG[\s\S]*?\} as const;/g, '');
content = content.replace(/const STAT_CARDS[\s\S]*?\];/g, '');
content = content.replace(/const VIEW_MODE_OPTIONS[\s\S]*?\];/g, '');
content = content.replace(/const ADMIN_TAB_CONFIG[\s\S]*?\];/g, '');

// Also remove ADMIN_TAB_CONFIG from render
content = content.replace(/\{\/\* ── ADMIN TAB SWITCHER ── \*\/\}[\s\S]*?\{\/\* ── TAB CONTENT ── \*\/\}/g, `
{/* ── ADMIN TAB SWITCHER ── */}
<div className="flex bg-gray-100 rounded-2xl p-1 gap-1">
    <button
        onClick={() => setAdminTab('off')}
        className={\`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all \${
            adminTab === 'off'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
        }\`}
    >
        <CalendarOff size={16} /> Lịch OFF
    </button>
    <button
        onClick={() => setAdminTab('shift')}
        className={\`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all \${
            adminTab === 'shift'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
        }\`}
    >
        <Briefcase size={16} /> Đổi Ca
        {shiftLogic.pendingShifts.length > 0 && (
            <span className="bg-amber-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                {shiftLogic.pendingShifts.length}
            </span>
        )}
    </button>
</div>

{/* ── TAB CONTENT ── */}
`);

content = content.replace(/import \{[\s\S]*?\} from 'lucide-react';/g, "import { ShieldAlert, Trash2, ChevronLeft, ChevronRight, Briefcase, ArrowRightLeft, UserPlus, Users, Loader2, Check, X, CalendarDays, CheckCircle2, CalendarOff } from 'lucide-react';");

fs.writeFileSync(path, content);
console.log('Fixed linting errors');

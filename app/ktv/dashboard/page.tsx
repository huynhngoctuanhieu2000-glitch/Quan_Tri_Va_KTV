'use client';

import React, { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import {
  Clock, ShieldAlert, Calendar, AlertTriangle,
  CheckCircle, Play, StopCircle,
  Smile, Frown, Meh, Star, Gift, ArrowRight, X,
  ClipboardList, Coffee, LogOut, Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useKTVDashboard, ScreenState } from './KTVDashboard.logic';

// 🌿 UI CONFIGURATION - SPA THEME (RESORED)
const THEME = {
  bgBase: 'bg-[#FDFBF7]',
  bgCard: 'bg-white',
  textBase: 'text-slate-800',
  textMuted: 'text-slate-500',
  primary: 'bg-emerald-600',
  primaryHover: 'hover:bg-emerald-700',
  primaryMuted: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  gold: 'text-[#D4AF37]',
  goldBg: 'bg-gradient-to-r from-[#D4AF37] to-[#F3E5AB]',
  goldBorder: 'border-[#D4AF37]/30',
  border: 'border-slate-100',
  radius: 'rounded-2xl',
  shadow: 'shadow-sm shadow-slate-200/50'
};

const ANIMATION = {
  duration: 0.4,
  initial: { opacity: 0, y: 15 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, scale: 0.95 }
};

export default function KTVDashboardPage() {
  const logic = useKTVDashboard();
  const { 
    user, 
    screen, 
    booking, 
    isLoading, 
    bonusMessage, 
    setBonusMessage,
    showProcedure,
    setShowProcedure,
    handleInteraction,
    handleEarlyExit
  } = logic;

  if (isLoading && !booking && screen === 'DASHBOARD') {
    return (
      <AppLayout>
        <div className={`min-h-[80vh] flex flex-col items-center justify-center ${THEME.bgBase}`}>
          <div className="w-8 h-8 rounded-full border-4 border-emerald-200 border-t-emerald-600 animate-spin"></div>
          <p className="mt-4 text-emerald-700 font-medium">Đang tải dữ liệu ca làm việc...</p>
        </div>
      </AppLayout>
    );
  }

  if (!user) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <ShieldAlert size={48} className="text-red-500 mb-4" />
          <h2 className="text-xl font-bold text-gray-900">Không có quyền truy cập</h2>
        </div>
      </AppLayout>
    );
  }

  // 🔔 HEADER NOTIFICATION (Bonus Points)
  const renderBonusNotification = () => (
    <AnimatePresence>
      {bonusMessage && (
        <motion.div
           initial={{ y: -100, opacity: 0 }}
           animate={{ y: 0, opacity: 1 }}
           exit={{ y: -100, opacity: 0 }}
           className="fixed top-0 left-0 right-0 z-[200] p-4 flex justify-center"
        >
          <div className="bg-white/95 backdrop-blur-xl border border-emerald-100 shadow-2xl rounded-2xl px-6 py-4 flex items-center gap-4 max-w-lg w-full">
            <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-emerald-200">
              <Star className="text-white fill-white" size={20} />
            </div>
            <div className="flex-1">
              <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-0.5">Thưởng Nóng +25Đ</p>
              <p className="text-sm font-bold text-gray-800 leading-tight">
                {bonusMessage}
              </p>
            </div>
            <button 
              onClick={() => setBonusMessage(null)}
              className="p-1 hover:bg-gray-100 rounded-full transition-colors"
            >
              <X size={18} className="text-gray-400" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  const renderScreen = () => {
    switch (screen) {
      case 'DASHBOARD': return <ScreenDashboard logic={logic} />;
      case 'TIMER': return <ScreenTimer logic={logic} />;
      case 'REVIEW': return <ScreenReview logic={logic} />;
      case 'HANDOVER': return <ScreenHandover logic={logic} />;
      case 'REWARD': return <ScreenReward logic={logic} />;
      default: return <ScreenDashboard logic={logic} />;
    }
  };

  return (
    <AppLayout>
      <div className={`max-w-md mx-auto min-h-screen pb-24 ${THEME.bgBase} relative`}>
        {renderBonusNotification()}
        <AnimatePresence mode="wait">
          <motion.div
            key={screen}
            initial={ANIMATION.initial}
            animate={ANIMATION.animate}
            exit={ANIMATION.exit}
            transition={{ duration: ANIMATION.duration }}
            className="h-full"
          >
            {renderScreen()}
          </motion.div>
        </AnimatePresence>

        {/* Floating Quick Support Actions */}
        {['TIMER', 'REVIEW', 'HANDOVER'].includes(screen) && (
            <div className="fixed bottom-24 right-4 flex flex-col gap-3 z-50">
               <button 
                  onClick={() => handleInteraction('WATER')}
                  className="w-12 h-12 bg-white shadow-lg border border-slate-100 rounded-full flex items-center justify-center text-amber-500 active:scale-95 transition-transform"
               >
                  <Coffee size={20} />
               </button>
               <button 
                  onClick={() => handleInteraction('SUPPORT')}
                  className="w-12 h-12 bg-white shadow-lg border border-slate-100 rounded-full flex items-center justify-center text-rose-500 active:scale-95 transition-transform"
               >
                  <AlertCircle size={20} />
               </button>
            </div>
        )}
      </div>

      {/* Procedure Modal */}
      <ProcedureModal 
        isOpen={showProcedure} 
        onClose={() => setShowProcedure(false)} 
        procedure={booking?.BookingItems?.[0]?.procedure}
        serviceName={booking?.BookingItems?.[0]?.service_name}
      />
    </AppLayout>
  );
}

// ----------------------------------------------------
// SCREENS
// ----------------------------------------------------

function ScreenDashboard({ logic }: { logic: any }) {
  const { booking, checklist, toggleChecklist, isChecklistComplete, handleConfirmSetup, setShowProcedure } = logic;

  return (
    <div className="p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className={`text-xl font-bold ${THEME.textBase}`}>Xin chào,</h1>
          <p className={`text-sm ${THEME.textMuted}`}>{(logic.user as any)?.email?.split('@')[0] || 'Kỹ thuật viên'}</p>
        </div>
        <div className={`w-10 h-10 ${THEME.primaryMuted} rounded-full flex items-center justify-center font-bold`}>
           <User size={20} />
        </div>
      </div>

      {!booking ? (
        <div className={`${THEME.bgCard} ${THEME.border} ${THEME.radius} p-8 text-center border shadow-sm`}>
          <div className={`w-16 h-16 ${THEME.primaryMuted} rounded-full flex items-center justify-center mx-auto mb-4`}>
            <Clock size={24} className="text-emerald-600" />
          </div>
          <h3 className={`text-lg font-bold ${THEME.textBase} mb-2`}>Chưa có đơn hàng</h3>
          <p className={`text-sm ${THEME.textMuted}`}>Hệ thống sẽ thông báo ngay khi có khách hàng được xếp phòng.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Active Booking Card */}
          <div className={`${THEME.bgCard} ${THEME.border} ${THEME.radius} overflow-hidden border shadow-sm`}>
            <div className="p-4 bg-emerald-50/50 border-b border-emerald-100 flex justify-between items-center">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-800 text-xs font-bold uppercase tracking-wider">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Đơn Mới
              </span>
              <span className={`text-sm font-semibold ${THEME.textMuted}`}>#{booking.billCode}</span>
            </div>

            <div className="p-5">
              <div className="flex justify-between items-start mb-4">
                 <h3 className={`font-bold text-2xl ${THEME.textBase}`}>
                  Phòng {booking.roomName}
                </h3>
                <button 
                  onClick={() => setShowProcedure(true)}
                  className="text-emerald-600 text-xs font-bold flex items-center gap-1 underline"
                >
                   <ClipboardList size={14} /> Quy trình
                </button>
              </div>

              <div className="space-y-2 mb-4">
                {booking.BookingItems?.map((item: any) => (
                   <div key={item.id} className="flex justify-between items-center text-sm">
                      <span className="font-bold text-slate-700">{item.service_name}</span>
                      <span className="text-slate-500">{item.duration} phút</span>
                   </div>
                ))}
              </div>

              {booking.dispatcherNote && (
                <div className="bg-orange-50/50 border-l-2 border-orange-400 p-3 rounded-r-lg mb-4">
                  <span className="text-xs font-bold text-orange-600 mb-1 block">YÊU CẦU ĐẶC BIỆT</span>
                  <p className="text-sm text-orange-900 italic">{booking.dispatcherNote}</p>
                </div>
              )}
            </div>
          </div>

          {/* Setup Checklist */}
          <div>
            <h3 className={`font-bold ${THEME.textBase} mb-3 flex items-center gap-2 uppercase text-[11px] tracking-widest`}>
              <CheckCircle size={18} className={THEME.gold} />
              Quy trình chuẩn bị
            </h3>

            <div className="space-y-2">
              <ChecklistItem label="Vệ sinh máy lạnh & quạt" checked={checklist.ac} onChange={() => toggleChecklist('ac')} />
              <ChecklistItem label="Chuẩn bị tinh dầu & dụng cụ" checked={checklist.oil} onChange={() => toggleChecklist('oil')} />
              <ChecklistItem label="Setup giường (Khăn, gối)" checked={checklist.bed} onChange={() => toggleChecklist('bed')} />
              <ChecklistItem label="Chuẩn bị khăn nóng" checked={checklist.towel} onChange={() => toggleChecklist('towel')} />
              <ChecklistItem label="Kiểm tra vệ sinh phòng" checked={checklist.toilet} onChange={() => toggleChecklist('toilet')} />
            </div>
          </div>

          <button
            disabled={!isChecklistComplete || logic.isLoading}
            onClick={handleConfirmSetup}
            className={`w-full py-4 ${THEME.radius} font-bold text-white transition-all 
              ${isChecklistComplete ? THEME.primary + ' shadow-lg shadow-emerald-200' : 'bg-slate-300'}`}
          >
            {logic.isLoading ? 'Đang xử lý...' : 'Xác nhận chuẩn bị xong'}
          </button>
        </div>
      )}
    </div>
  );
}

function ScreenTimer({ logic }: { logic: any }) {
  const { booking, timeRemaining, isTimerRunning, handleStartTimer, handleFinishTimer, handleEarlyExit } = logic;

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const totalDuration = (booking?.BookingItems?.[0]?.duration || 60) * 60;
  const progress = ((totalDuration - timeRemaining) / totalDuration) * 100;

  return (
    <div className="p-4 h-full flex flex-col">
      <div className="flex justify-between items-start mb-8 mt-4">
        <div>
          <h2 className={`text-xl font-bold ${THEME.textBase}`}>Phòng {booking?.roomName}</h2>
          <p className={THEME.textMuted}>{booking?.BookingItems?.[0]?.service_name}</p>
        </div>
        <button 
           onClick={handleEarlyExit}
           className="text-slate-400 hover:text-rose-500 transition-colors"
        >
           <LogOut size={20} />
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center">
        {/* Circle Timer */}
        <div className="relative w-64 h-64 flex items-center justify-center mb-8">
          <svg className="absolute inset-0 w-full h-full transform -rotate-90">
            <circle cx="128" cy="128" r="120" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-slate-100" />
            <circle
              cx="128" cy="128" r="120" stroke="currentColor" strokeWidth="8" fill="transparent"
              className="text-emerald-500 transition-all duration-1000 ease-linear"
              strokeDasharray={2 * Math.PI * 120}
              strokeDashoffset={2 * Math.PI * 120 * (1 - progress / 100)}
              strokeLinecap="round"
            />
          </svg>
          <div className="text-center z-10">
            <div className="text-5xl font-mono font-bold text-slate-800 tracking-wider">
              {formatTime(timeRemaining)}
            </div>
            <div className="text-xs font-bold text-emerald-600 uppercase tracking-widest mt-2 bg-emerald-50 px-3 py-1 rounded-full inline-block">
              {isTimerRunning ? 'ĐANG THỰC HIỆN' : 'ĐỢI BẮT ĐẦU'}
            </div>
          </div>
        </div>

        {!isTimerRunning ? (
          <button
            onClick={handleStartTimer}
            disabled={logic.isLoading}
            className={`w-48 h-16 ${THEME.radius} ${THEME.primary} text-white font-bold text-lg shadow-lg shadow-emerald-200 flex items-center justify-center gap-2 hover:scale-105 transition-transform`}
          >
            <Play fill="currentColor" size={20} />
            BẮT ĐẦU
          </button>
        ) : (
          <button
            onClick={handleFinishTimer}
            disabled={logic.isLoading}
            className={`w-full py-4 ${THEME.radius} bg-indigo-600 text-white font-bold text-lg shadow-lg shadow-indigo-200 flex items-center justify-center gap-2 hover:bg-indigo-700 transition-colors mt-8`}
          >
            <StopCircle size={20} />
            HOÀN THÀNH
          </button>
        )}
      </div>
    </div>
  );
}

function ScreenReview({ logic }: { logic: any }) {
  const [rating, setRating] = useState(0);

  return (
    <div className="p-5 flex flex-col h-full bg-[#fdfbf7]">
      <div className="text-center mb-8 mt-4">
        <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle size={32} />
        </div>
        <h2 className="text-2xl font-bold text-slate-800">Dịch vụ hoàn tất!</h2>
        <p className="text-slate-500 mt-2">Đánh giá hồ sơ khách hàng</p>
      </div>

      <div className="space-y-4 mb-8">
        <RatingCard
          icon={<Smile size={24} />}
          title="Khách Dễ Thương"
          desc="Thân thiện, vui vẻ"
          isSelected={rating === 1}
          onClick={() => setRating(1)}
        />
        <RatingCard
          icon={<Meh size={24} />}
          title="Khách Hướng Nội"
          desc="Thích yên tĩnh"
          isSelected={rating === 2}
          onClick={() => setRating(2)}
        />
        <RatingCard
          icon={<Frown size={24} />}
          title="Khách Kỹ Tính"
          desc="Yêu cầu cao"
          isSelected={rating === 3}
          onClick={() => setRating(3)}
        />
      </div>

      <button
        onClick={() => logic.handleSubmitReview({ personality: rating })}
        className={`w-full py-4 mt-auto font-bold text-white ${THEME.radius} transition-colors ${rating !== 0 ? THEME.primary : 'bg-slate-300'}`}
      >
        Lưu hồ sơ
      </button>
    </div>
  );
}

function ScreenHandover({ logic }: { logic: any }) {
  const { handoverChecklist, toggleHandoverChecklist, isHandoverComplete, handleFinishHandover } = logic;

  return (
    <div className="p-5 flex flex-col h-full space-y-6 bg-[#fdfbf7]">
      <div className="text-center mt-4">
        <h2 className="text-xl font-bold text-slate-800">Dọn dẹp phòng</h2>
        <p className="text-sm text-slate-500 mt-1">Xác nhận trước khi kết thúc ca</p>
      </div>

      <div className={`${THEME.bgCard} ${THEME.border} ${THEME.radius} border p-4 shadow-sm`}>
        <div className="space-y-1">
          <ChecklistItem label="Thu dọn khăn bẩn" checked={handoverChecklist.towel} onChange={() => toggleHandoverChecklist('towel')} />
          <ChecklistItem label="Thay ga giường & gối" checked={handoverChecklist.bed} onChange={() => toggleHandoverChecklist('bed')} />
          <ChecklistItem label="Đổ rác & vệ sinh sàn" checked={handoverChecklist.trash} onChange={() => toggleHandoverChecklist('trash')} />
          <ChecklistItem label="Tắt máy lạnh & quạt" checked={handoverChecklist.ac} onChange={() => toggleHandoverChecklist('ac')} />
          <ChecklistItem label="Tắt đèn" checked={handoverChecklist.light} onChange={() => toggleHandoverChecklist('light')} />
        </div>
      </div>

      <button
        disabled={!isHandoverComplete}
        onClick={handleFinishHandover}
        className={`w-full py-4 mt-auto font-bold text-slate-900 ${THEME.radius} transition-all 
          ${isHandoverComplete ? THEME.goldBg + ' shadow-lg shadow-yellow-200' : 'bg-slate-300 text-white'}`}
      >
        Hoàn tất dọn phòng
      </button>
    </div>
  );
}

function ScreenReward({ logic }: { logic: any }) {
  const { booking, commission, goToDashboard } = logic;
  const isExcellent = booking?.rating >= 4;

  return (
    <div className="p-5 flex flex-col items-center justify-center h-[80vh] text-center bg-[#fdfbf7]">
      <div className="w-24 h-24 bg-yellow-50 text-yellow-500 rounded-full flex items-center justify-center mb-6 shadow-xl shadow-yellow-100">
        <Gift size={48} />
      </div>

      <h2 className="text-2xl font-bold text-slate-800 mb-2">Xin cảm ơn!</h2>
      <p className="text-slate-500 mb-8">Bạn đã hoàn thành ca làm việc.</p>

      <div className={`${THEME.bgCard} ${THEME.border} ${THEME.radius} border p-6 w-full shadow-sm mb-8`}>
        <div className="text-sm text-slate-500 uppercase tracking-widest font-bold mb-2">Tiền tua của bạn</div>
        <div className="text-4xl font-black text-emerald-600">
          {(commission || 0).toLocaleString()} đ
        </div>
      </div>

      {isExcellent && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-4 mb-8 w-full">
            <Star className="text-amber-500 fill-amber-500" size={24} />
            <div className="text-left">
              <p className="text-xs font-black text-amber-700 uppercase">Đánh giá xuất sắc</p>
              <p className="text-sm font-bold text-amber-900">+25 Điểm Thưởng</p>
            </div>
          </div>
      )}

      <button
        onClick={goToDashboard}
        className={`w-full py-4 font-bold text-white ${THEME.primary} ${THEME.radius} flex items-center justify-center gap-2`}
      >
        Trở về trang chủ <ArrowRight size={20} />
      </button>
    </div>
  );
}

// ----------------------------------------------------
// SHARED UI COMPONENTS
// ----------------------------------------------------

function ChecklistItem({ label, checked, onChange }: { label: string, checked: boolean, onChange: () => void }) {
  return (
    <div 
      onClick={onChange}
      className={`flex items-center gap-4 p-3 ${THEME.radius} cursor-pointer transition-colors ${checked ? 'bg-emerald-50' : THEME.bgCard}`}
    >
      <div className={`w-6 h-6 rounded flex items-center justify-center border-2 transition-colors ${checked ? 'border-emerald-500 bg-emerald-500' : 'border-slate-300'}`}>
        {checked && <CheckCircle size={14} className="text-white" />}
      </div>
      <span className={`font-medium ${checked ? 'text-emerald-800' : THEME.textBase}`}>{label}</span>
    </div>
  );
}

function RatingCard({ icon, title, desc, isSelected, onClick }: { icon: React.ReactNode, title: string, desc: string, isSelected: boolean, onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-4 ${THEME.radius} border-2 transition-all flex items-start gap-4
      ${isSelected ? 'border-emerald-500 bg-emerald-50' : 'border-slate-100 bg-white hover:border-emerald-200'}`}
    >
      <div className={`mt-1 ${isSelected ? 'text-emerald-600' : 'text-slate-400'}`}>
        {icon}
      </div>
      <div>
        <h4 className={`font-bold ${isSelected ? 'text-emerald-800' : 'text-slate-800'}`}>{title}</h4>
        <p className={`text-sm ${isSelected ? 'text-emerald-600/80' : 'text-slate-500'}`}>{desc}</p>
      </div>
    </button>
  );
}

function ProcedureModal({ isOpen, onClose, procedure, serviceName }: { isOpen: boolean, onClose: () => void, procedure: any, serviceName: string }) {
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-[150] bg-black/40 backdrop-blur-sm flex items-center justify-center p-6">
       <motion.div 
         initial={{ opacity: 0, scale: 0.9, y: 30 }}
         animate={{ opacity: 1, scale: 1, y: 0 }}
         className="bg-white w-full max-w-lg max-h-[80vh] rounded-[40px] shadow-2xl overflow-hidden flex flex-col"
       >
          <div className="bg-emerald-600 p-8 text-white flex items-center justify-between">
             <div>
                <h3 className="text-xl font-black uppercase tracking-tight">{serviceName}</h3>
                <p className="text-[10px] font-bold text-emerald-100 uppercase tracking-widest mt-1">Quy trình thực hiện chuẩn</p>
             </div>
             <button onClick={onClose} className="bg-white/20 p-2 rounded-full hover:bg-white/30 transition-colors">
                <X size={24} />
             </button>
          </div>
          <div className="flex-1 overflow-y-auto p-8 font-bold text-slate-600 leading-relaxed text-sm">
             {procedure ? (
                <div className="space-y-4">
                   {Array.isArray(procedure) ? (
                      procedure.map((step, idx) => (
                         <div key={idx} className="flex gap-4">
                            <span className="text-emerald-500 font-black">{(idx + 1).toString().padStart(2, '0')}.</span>
                            <p>{step}</p>
                         </div>
                      ))
                   ) : (
                      <p className="whitespace-pre-line">{procedure}</p>
                   )}
                </div>
             ) : (
                <p className="italic text-slate-400 text-center py-10">Quy trình đang được cập nhật...</p>
             )}
          </div>
          <div className="p-8 border-t border-slate-100">
             <button onClick={onClose} className="w-full bg-slate-900 text-white py-5 rounded-[24px] font-black text-xs uppercase tracking-widest uppercase">Đã hiểu quy trình</button>
          </div>
       </motion.div>
    </div>
  );
}

function User({ size }: { size: number }) {
  return (
    <svg 
      width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    >
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function AlertCircle({ size }: { size: number }) {
  return (
    <svg 
      width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

'use client';

import React, { useState, Suspense } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import {
  Clock, ShieldAlert, Calendar, AlertTriangle,
  CheckCircle, Play, StopCircle, Lock,
  Smile, Frown, Meh, Star, Gift, ArrowRight, X,
  ClipboardList, Coffee, LogOut, Sparkles, User, Users,
  PlusSquare, HelpCircle, Zap, Target, Ban, AlertCircle,
  Dumbbell, Quote, BookOpen, BellRing, QrCode,
  ChevronDown, ChevronUp, Heart, MicOff
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Image from 'next/image';
import { useKTVDashboard, ScreenState } from './KTVDashboard.logic';
import { useSearchParams } from 'next/navigation';

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

function DashboardContent() {
  const searchParams = useSearchParams();
  const action = searchParams.get('action');
  const bookingId = searchParams.get('bookingId');
  
  const logic = useKTVDashboard({ 
    initialAction: action, 
    targetBookingId: bookingId 
  });
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
      <div className={`min-h-[80vh] flex flex-col items-center justify-center ${THEME.bgBase}`}>
        <div className="w-8 h-8 rounded-full border-4 border-emerald-200 border-t-emerald-600 animate-spin"></div>
        <p className="mt-4 text-emerald-700 font-medium">Đang tải dữ liệu ca làm việc...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <ShieldAlert size={48} className="text-red-500 mb-4" />
        <h2 className="text-xl font-bold text-gray-900">Không có quyền truy cập</h2>
      </div>
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
           drag="x"
           dragConstraints={{ left: 0, right: 0 }}
           dragElastic={0.7}
           onDragEnd={(_, info) => {
             if (Math.abs(info.offset.x) > 100) {
               setBonusMessage(null);
             }
           }}
           className="fixed top-0 left-0 right-0 z-[200] p-4 flex justify-center cursor-grab active:cursor-grabbing"
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
    <>
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
      </div>

      {/* Procedure Modal */}
      <ProcedureModal 
        isOpen={showProcedure} 
        onClose={() => setShowProcedure(false)} 
        procedure={booking?.BookingItems?.[0]?.procedure}
        serviceName={booking?.BookingItems?.[0]?.service_name}
      />
    </>
  );
}

export default function KTVDashboardPage() {
  return (
    <AppLayout>
      <Suspense fallback={
        <div className={`min-h-[80vh] flex flex-col items-center justify-center bg-[#FDFBF7]`}>
          <div className="w-8 h-8 rounded-full border-4 border-emerald-200 border-t-emerald-600 animate-spin"></div>
          <p className="mt-4 text-emerald-700 font-medium">Đang chuẩn bị dữ liệu...</p>
        </div>
      }>
        <DashboardContent />
      </Suspense>
    </AppLayout>
  );
}

// ─── WORKING TIMELINE ────────────────────────────────────────────────────────

function WorkingTimeline({ segments, activeIndex, actualStartTime }: { segments: any[], activeIndex?: number, actualStartTime?: string | null }) {
  if (!segments || segments.length === 0) return null;

  // Helper để tính giờ tịnh tiến
  const getShiftedTime = (offsetMins: number) => {
    if (!actualStartTime) return null;
    let tStart = actualStartTime;
    if (typeof tStart === 'string' && !tStart.includes('Z') && !tStart.includes('+')) {
        tStart = tStart.replace(' ', 'T') + 'Z';
    }
    const date = new Date(new Date(tStart).getTime() + (offsetMins * 60 * 1000));
    return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  };

  let cumulativeMins = 0;

  return (
    <div className="space-y-3">
      <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1 flex justify-between">
        <span>Lộ trình thực hiện</span>
        {activeIndex !== undefined && <span className="text-emerald-600">Chặng {activeIndex + 1}</span>}
      </h3>
      <div className="space-y-2">
        {segments.map((seg, idx) => {
          const isActive = idx === activeIndex;
          const isPast = activeIndex !== undefined && idx < activeIndex;
          
          const displayStartTime = actualStartTime ? getShiftedTime(cumulativeMins) : seg.startTime;
          cumulativeMins += seg.duration;
          const displayEndTime = actualStartTime ? getShiftedTime(cumulativeMins) : seg.endTime;

          return (
            <motion.div 
              key={seg.id} 
              animate={{ 
                scale: isActive ? 1.02 : 1,
                opacity: isPast ? 0.6 : 1
              }}
              className={`relative flex items-center gap-4 p-3 rounded-2xl border transition-all ${
                isActive 
                  ? 'bg-emerald-50 border-emerald-200 shadow-md shadow-emerald-100/50' 
                  : 'bg-slate-50/50 border-slate-100/50'
              }`}
            >
              <div className="flex flex-col items-center w-10">
                <span className={`text-[10px] font-black ${isActive ? 'text-emerald-600' : 'text-slate-400'}`}>{displayStartTime}</span>
                <div className={`w-0.5 h-4 my-0.5 ${isActive ? 'bg-emerald-200' : 'bg-slate-200'}`} />
                <span className={`text-[10px] font-black ${isActive ? 'text-emerald-700' : 'text-slate-400'}`}>{displayEndTime}</span>
              </div>
              <div className="flex-1">
                <p className={`text-xs font-black ${isActive ? 'text-emerald-900' : 'text-slate-800'}`}>
                  Phòng {seg.roomId}
                  {isActive && <span className="ml-2 text-[9px] bg-emerald-500 text-white px-1.5 py-0.5 rounded-md animate-pulse">ĐANG LÀM</span>}
                </p>
                <p className={`text-[10px] font-bold uppercase tracking-tighter ${isActive ? 'text-emerald-600/70' : 'text-slate-400'}`}>
                  Giường {seg.bedId?.split('-').pop()} • {seg.duration} phút
                </p>
              </div>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-xs transition-colors ${
                isActive 
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-200' 
                  : isPast ? 'bg-slate-200 text-slate-400' : 'bg-white text-slate-300 border border-slate-100'
              }`}>
                {isPast ? <CheckCircle size={14} /> : idx + 1}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ----------------------------------------------------
// SCREENS
// ----------------------------------------------------

function ScreenDashboard({ logic }: { logic: any }) {
  const { booking, checklist, toggleChecklist, isChecklistComplete, handleConfirmSetup, setShowProcedure, activeSegmentIndex } = logic;

  // Lấy đúng dịch vụ mà KTV này được gán
  const item = booking?.assignedItemId 
    ? booking.BookingItems?.find((i: any) => i.id === booking.assignedItemId)
    : (booking?.BookingItems?.[0] || {});
    
  const ktvSegments = item?.segments?.filter((s: any) => s.ktvId === logic.user?.id) || [];
  
  // Xác định vị trí chặng hiện tại
  const currentSeg = ktvSegments.length > 0 ? ktvSegments[activeSegmentIndex || 0] : null;

  return (
    <div className="p-4 space-y-6">
      {/* Header - Only show when NO active booking */}
      {!booking && (
        <div className="flex items-center justify-between">
          <div>
            <h1 className={`text-xl font-bold ${THEME.textBase}`}>
              Xin chào, <span className="text-emerald-600 ml-1">{logic.user?.id || 'Kỹ thuật viên'}</span>
            </h1>
          </div>
          <div className={`w-10 h-10 ${THEME.primaryMuted} rounded-full flex items-center justify-center font-bold`}>
             <User size={20} />
          </div>
        </div>
      )}

      {!booking ? (
        <div className="space-y-6">
          <div className={`${THEME.bgCard} ${THEME.border} ${THEME.radius} p-8 text-center border shadow-sm`}>
            {/* QR Code Section - Internal Access / Identity (MOVED TO TOP) */}
            <div className="flex flex-col items-center mb-8">
               <div className="relative group mb-4">
                  <div className="absolute -inset-2 bg-emerald-50 rounded-[2rem] blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <div className="relative p-3 bg-white rounded-[2rem] shadow-xl border border-emerald-100/50 transition-transform active:scale-95 duration-300">
                     <Image 
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=https://nganhaspa.vn/ktv/${(logic.user as any)?.id || 'profile'}`}
                        alt="QR Code"
                        width={160}
                        height={160}
                        className="rounded-2xl"
                        referrerPolicy="no-referrer"
                     />
                  </div>
               </div>
               <div className="space-y-1">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center justify-center gap-2">
                    <QrCode size={12} className="text-emerald-500" />
                    QR TRUY CẬP NHANH
                  </p>
                  <p className="text-[9px] text-slate-300 font-medium">Quản lý định danh cá nhân</p>
               </div>
            </div>

            <div className={`w-12 h-12 ${THEME.primaryMuted} rounded-full flex items-center justify-center mx-auto mb-4 opacity-50`}>
              <Clock size={20} className="text-emerald-600" />
            </div>
            <h3 className={`text-lg font-bold ${THEME.textBase} mb-2`}>Chưa có đơn hàng</h3>
            <p className={`text-sm ${THEME.textMuted}`}>Hệ thống sẽ thông báo ngay khi có khách hàng được xếp phòng.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Active Booking Card */}
          <div className={`${THEME.bgCard} ${THEME.border} ${THEME.radius} overflow-hidden border shadow-sm p-6 pb-0`}>
              <div className="mb-4">
                {booking.BookingItems?.map((bi: any) => (
                   <div key={bi.id} className="flex flex-col">
                      <h3 className="font-black text-3xl text-emerald-700 leading-tight tracking-tight">
                        {bi.service_name}
                      </h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-sm font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-lg">{bi.duration} phút</span>
                        <span className="text-sm font-black text-slate-800">#{booking.billCode}</span>
                      </div>
                   </div>
                ))}
              </div>

              <div className="flex justify-between items-end mb-6">
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 px-1">
                    {ktvSegments.length > 1 ? `Vị trí chặng ${activeSegmentIndex + 1}` : 'Vị trí'}
                  </span>
                  <div className="flex items-center gap-2">
                    <div className="bg-emerald-600 text-white px-4 py-2 rounded-2xl font-black text-lg shadow-lg shadow-emerald-100">
                      Phòng {currentSeg?.roomId || booking.assignedRoomId || booking.roomName}
                    </div>
                    {(currentSeg?.bedId || booking.assignedBedId || booking.bedId) && (
                      <div className="bg-white border-2 border-emerald-100 text-emerald-700 px-4 py-2 rounded-2xl font-black text-lg">
                        Giường {(currentSeg?.bedId || booking.assignedBedId || booking.bedId).split('-').pop()}
                      </div>
                    )}
                  </div>
                </div>
                <button 
                  onClick={() => setShowProcedure(true)}
                  className="text-emerald-600 text-xs font-bold flex items-center gap-1 underline mb-2"
                >
                   <ClipboardList size={14} /> Quy trình
                </button>
              </div>

              {/* Timeline Section */}
              {ktvSegments.length > 0 && (
                <div className="mb-6">
                  <WorkingTimeline 
                    segments={ktvSegments} 
                    activeIndex={booking.status === 'IN_PROGRESS' ? activeSegmentIndex : undefined}
                    actualStartTime={item.timeStart || booking.timeStart}
                  />
                </div>
              )}

              {/* Special Requirements (Same as Timer Screen) */}
              <CollapsibleRequirements booking={booking} />
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
  const { 
    booking, 
    timeRemaining, 
    prepTimeRemaining, 
    isPrepping, 
    isTimerRunning, 
    handleStartTimer, 
    handleFinishTimer, 
    handleEarlyExit,
    handleInteraction,
    activeSegmentIndex
  } = logic;

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const currentSecs = isPrepping ? prepTimeRemaining : timeRemaining;
  
  // Lấy đúng dịch vụ mà KTV này được gán
  const item = booking?.assignedItemId 
    ? booking.BookingItems?.find((i: any) => i.id === booking.assignedItemId)
    : (booking?.BookingItems?.[0] || {});

  const totalDuration = isPrepping 
    ? (logic.settings?.ktv_setup_duration_minutes || 10) * 60 
    : (item.duration || 60) * 60;
  
  // 🔄 Reverse progress: Start full (100) and move to 0 as time runs out
  const progress = (currentSecs / totalDuration) * 100;

  const ktvSegments = item?.segments?.filter((s: any) => s.ktvId === logic.user?.id) || [];
  const currentSeg = ktvSegments.length > 0 ? ktvSegments[activeSegmentIndex || 0] : null;
  const nextSeg = ktvSegments.length > (activeSegmentIndex + 1) ? ktvSegments[activeSegmentIndex + 1] : null;

  // 🔔 Stage Transition Alert Logic: Show if current segment ends in < 3 mins
  const [showTransitionAlert, setShowTransitionAlert] = useState(false);
  
  React.useEffect(() => {
    if (!isTimerRunning || !nextSeg || !item.timeStart) {
        setShowTransitionAlert(false);
        return;
    }
    
    const checkTransition = () => {
        let tStart = item.timeStart || booking.timeStart;
        if (typeof tStart === 'string' && !tStart.includes('Z') && !tStart.includes('+')) {
            tStart = tStart.replace(' ', 'T') + 'Z';
        }
        const actualStartMs = new Date(tStart).getTime();
        const nowMs = new Date().getTime();
        
        let cumulativeMins = 0;
        for (let i = 0; i <= activeSegmentIndex; i++) {
            cumulativeMins += ktvSegments[i].duration;
        }
        
        const currentSegEndMs = actualStartMs + (cumulativeMins * 60 * 1000);
        const diffMins = (currentSegEndMs - nowMs) / (60 * 1000);
        
        // Hiện cảnh báo nếu còn dưới 3 phút
        setShowTransitionAlert(diffMins > 0 && diffMins <= 3);
    };
    
    checkTransition();
    const interval = setInterval(checkTransition, 10000);
    return () => clearInterval(interval);
  }, [isTimerRunning, nextSeg, activeSegmentIndex, ktvSegments, item.timeStart]);

  return (
    <div className="p-4 h-full flex flex-col pt-8">
      {/* Header Info */}
      <div className="flex justify-between items-start mb-6 px-2">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-black text-emerald-700 leading-tight tracking-tight">
            {item.service_name}
          </h1>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-slate-800 font-black">
              <span className="text-[10px] text-slate-400 uppercase tracking-widest">
                {ktvSegments.length > 1 ? `Chặng ${activeSegmentIndex + 1}` : 'Phòng'}
              </span>
              <span className="text-lg">
                {currentSeg?.roomId || booking?.assignedRoomId || item.roomName || booking?.roomName}
                {(currentSeg?.bedId || booking?.assignedBedId) && ` (G: ${(currentSeg?.bedId || booking.assignedBedId).split('-').pop()})`}
              </span>
            </div>
            <div className="w-px h-3 bg-slate-200" />
            <div className="flex items-center gap-1.5 text-slate-400 font-bold text-xs">
              <Clock size={14} />
              <span>{item.duration} phút</span>
            </div>
          </div>
        </div>
        {!isTimerRunning && (
          <button 
            onClick={() => logic.setShowProcedure(true)}
            className="flex flex-col items-center gap-1 text-emerald-600 active:scale-90 transition-all"
          >
            <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center border border-emerald-100 shadow-sm">
              <BookOpen size={22} />
            </div>
            <span className="text-[10px] font-black uppercase tracking-tighter">Quy trình</span>
          </button>
        )}
      </div>

      {/* Main Timer Display */}
      <div className="flex flex-col items-center justify-center pb-8">
        <div className="relative w-64 h-64 flex items-center justify-center">
          {/* Subtle Background Ring (always there) */}
          <div className="absolute inset-0 rounded-full border-[12px] border-slate-50 opacity-50"></div>
          
          <svg className="absolute inset-0 w-full h-full transform -rotate-90 drop-shadow-sm">
            <circle
              cx="128" cy="128" r="115" stroke="currentColor" strokeWidth="12" fill="transparent"
              className={`${isPrepping ? 'text-blue-400' : 'text-emerald-500'} transition-all duration-1000 ease-linear shadow-inner`}
              strokeDasharray={2 * Math.PI * 115}
              strokeDashoffset={2 * Math.PI * 115 * (1 - progress / 100)}
              strokeLinecap="round"
            />
          </svg>
          
          <div className="text-center z-10">
            <div className={`text-6xl font-black ${isPrepping ? 'text-blue-600' : 'text-slate-800'} tracking-tighter tabular-nums`}>
              {formatTime(currentSecs)}
            </div>
            <div className={`mt-3 px-4 py-1.5 rounded-full border font-black text-[10px] tracking-widest uppercase flex items-center justify-center gap-1.5
              ${isPrepping ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>
              {isPrepping && <Clock size={12} className="animate-pulse" />}
              {isPrepping ? 'THỜI GIAN CHUẨN BỊ' : (isTimerRunning ? 'ĐANG THỰC HIỆN' : 'ĐỢI BẮT ĐẦU')}
            </div>
          </div>
        </div>
      </div>

      {/* Timeline for multi-stage */}
      {ktvSegments.length > 0 && (
        <div className="px-2 mb-8">
          <WorkingTimeline 
            segments={ktvSegments} 
            activeIndex={activeSegmentIndex} 
            actualStartTime={item.timeStart || booking.timeStart}
          />
        </div>
      )}

      {/* Stage Transition Alert */}
      {showTransitionAlert && nextSeg && (
        <AnimatePresence>
            <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mx-2 mb-6 bg-indigo-600 text-white p-4 rounded-2xl flex items-center gap-3 shadow-lg shadow-indigo-200"
            >
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
                    <ArrowRight size={20} className="animate-pulse" />
                </div>
                <div>
                    <p className="text-[10px] font-black uppercase tracking-widest opacity-80 leading-none mb-1">Sắp chuyển chặng</p>
                    <p className="text-xs font-bold leading-tight">Chuẩn bị chuyển sang Phòng {nextSeg.roomId}</p>
                </div>
            </motion.div>
        </AnimatePresence>
      )}

      {/* Primary Action Button */}
      <div className="px-6 mb-10">
        {!isTimerRunning || isPrepping ? (
          <div className="space-y-3">
            <button
              onClick={handleStartTimer}
              disabled={logic.isLoading || (isPrepping && prepTimeRemaining > 0) || !logic.canStart}
              className={`w-full h-16 ${THEME.radius} bg-emerald-600 text-white font-black text-lg shadow-xl shadow-emerald-200/50 flex items-center justify-center gap-3 active:scale-[0.98] transition-all disabled:opacity-40 disabled:grayscale-[0.5] disabled:active:scale-100`}
            >
              {logic.canStart ? <Play fill="white" size={24} /> : <Lock size={24} className="text-white/70" />}
              {logic.canStart ? 'BẮT ĐẦU' : 'CHƯA ĐẾN GIỜ'}
            </button>
            {!logic.canStart && logic.allowedStartTime && (
              <motion.p 
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center text-rose-600 font-black text-[11px] bg-rose-50 py-2 rounded-xl border border-rose-100 flex items-center justify-center gap-1.5"
              >
                <Clock size={12} strokeWidth={3} />
                Bạn có thể bắt đầu lúc {logic.allowedStartTime.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
              </motion.p>
            )}
          </div>
        ) : (
          <button
            onClick={handleFinishTimer}
            disabled={logic.isLoading}
            className={`w-full h-16 ${THEME.radius} bg-slate-900 text-white font-black text-lg shadow-xl shadow-slate-200 flex items-center justify-center gap-3 active:scale-[0.98] transition-all`}
          >
            <CheckCircle size={24} />
            HOÀN THÀNH
          </button>
        )}
      </div>

      {/* Special Requirements Section */}
      <CollapsibleRequirements booking={booking} />

      {/* 2x2 Action Grid + Emergency Wide - ONLY SHOW WHEN RUNNING */}
      {isTimerRunning && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="flex flex-col gap-3 mb-12"
        >
            <div className="grid grid-cols-2 gap-3">
                <ActionGridButton 
                  onClick={handleEarlyExit} 
                  icon={<LogOut size={20} />} 
                  label="KHÁCH VỀ SỚM" 
                  color="text-slate-400 border-slate-100" 
                />
                <ActionGridButton 
                  onClick={() => handleInteraction('WATER')} 
                  icon={<Coffee size={20} />} 
                  label="KHÁCH KHÁT NƯỚC" 
                  color="text-emerald-500 border-emerald-50" 
                />
                <ActionGridButton 
                  onClick={() => handleInteraction('BUY_MORE')} 
                  icon={<PlusSquare size={20} />} 
                  label="MUA THÊM DV" 
                  color="text-emerald-600 border-emerald-50" 
                />
                <ActionGridButton 
                  onClick={() => handleInteraction('SUPPORT')} 
                  icon={<HelpCircle size={20} />} 
                  label="CẦN HỖ TRỢ" 
                  color="text-indigo-500 border-indigo-50" 
                />
            </div>
            
            {/* Emergency Wide Button */}
            <button 
              onClick={() => handleInteraction('EMERGENCY')}
              className="w-full h-16 bg-rose-50 border border-rose-100 rounded-2xl flex items-center justify-center gap-3 active:scale-95 transition-all text-rose-600"
            >
               <BellRing size={24} className="animate-bounce" />
               <span className="text-sm font-black uppercase tracking-[0.1em]">KHẨN CẤP</span>
            </button>
        </motion.div>
      )}
    </div>
  );
}

function ActionGridButton({ onClick, icon, label, color }: { onClick: () => void, icon: React.ReactNode, label: string, color: string }) {
  return (
    <button 
      onClick={onClick}
      className={`bg-white border p-4 rounded-2xl shadow-sm flex flex-col items-center justify-center gap-2 active:scale-95 transition-all ${color}`}
    >
      <div className="opacity-80">{icon}</div>
      <span className="text-[10px] font-black uppercase tracking-wider">{label}</span>
    </button>
  );
}

function ScreenReview({ logic }: { logic: any }) {
  const [selectedPersonalities, setSelectedPersonalities] = useState<string[]>([]);

  const assessmentItems = [
    { id: 'DE_XOM', icon: <ShieldAlert size={24} />, title: "Khách Dê Xồm", desc: "Thiếu tôn trọng KTV" },
    { id: 'KHO_CHIU', icon: <Frown size={24} />, title: "Khách Kỹ Tính + Khó Chịu", desc: "Yêu cầu sự tinh tế" },
    { id: 'DE_THUONG', icon: <Heart size={24} />, title: "Khách Dễ Thương", desc: "Thân thiện, cởi mở" },
    { id: 'HUONG_NOI', icon: <MicOff size={24} />, title: "Khách Hướng Nội", desc: "Thích yên tĩnh, ít nói" },
    { id: 'HUONG_NGOAI', icon: <Users size={24} />, title: "Khách Hướng Ngoại", desc: "Thích giao lưu, kết nối" },
  ];

  const togglePersonality = (id: string) => {
    setSelectedPersonalities(prev => 
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  return (
    <div className="p-5 flex flex-col h-full bg-[#fdfbf7]">
      <div className="text-center mb-6 mt-4">
        <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle size={32} />
        </div>
        <h2 className="text-2xl font-bold text-slate-800">Dịch vụ hoàn tất!</h2>
        <p className="text-slate-500 mt-2">Đánh giá hồ sơ khách hàng</p>
      </div>

      {/* 🚨 NHẮC KHÁCH TÀI SẢN */}
      <div className="mb-6 p-4 bg-rose-50 border-2 border-rose-200 rounded-2xl flex items-center gap-4 animate-pulse">
        <div className="w-12 h-12 bg-rose-500 rounded-full flex items-center justify-center shrink-0 shadow-lg shadow-rose-200">
          <AlertTriangle size={24} className="text-white" />
        </div>
        <p className="text-[11px] font-black text-rose-700 leading-tight uppercase tracking-wider">
          NHẮC KHÁCH KIỂM TRA LẠI ĐIỆN THOẠI, VÍ TIỀN VÀ NỮ TRANG TRƯỚC KHI RỜI PHÒNG
        </p>
      </div>

      <div className="space-y-3 mb-8">
        {assessmentItems.map((item) => (
          <RatingCard
            key={item.id}
            icon={item.icon}
            title={item.title}
            desc={item.desc}
            isSelected={selectedPersonalities.includes(item.id)}
            onClick={() => togglePersonality(item.id)}
          />
        ))}
      </div>

      <button
        onClick={() => {
          const personalityNames = selectedPersonalities.map(id => 
            assessmentItems.find(i => i.id === id)?.title
          ).filter(Boolean);
          logic.handleSubmitReview({ personality: personalityNames });
        }}
        className={`w-full py-4 mt-auto font-bold text-white ${THEME.radius} transition-colors 
          ${selectedPersonalities.length > 0 ? THEME.primary + ' shadow-lg shadow-emerald-100' : 'bg-slate-300 pointer-events-none'}`}
      >
        Lưu hồ sơ {selectedPersonalities.length > 0 ? `(${selectedPersonalities.length})` : ''}
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
  const isExcellent = Number(booking?.rating || 0) >= 4;

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
              <p className="text-sm font-bold text-amber-900">Đơn hàng này bạn đã được cộng 25đ nhé</p>
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

function CollapsibleRequirements({ booking }: { booking: any }) {
  const [isOpen, setIsOpen] = useState(false);
  const item = booking?.BookingItems?.[0];
  if (!item) return null;

  const hasContent = item.strength || item.focus || item.avoid || item.customerNote || booking.dispatcherNote || item.noteForKtv;
  if (!hasContent) return null;

  return (
    <div className="bg-amber-50/40 border border-amber-100 rounded-[28px] overflow-hidden mb-6 transition-all duration-300">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-5 text-amber-800"
      >
        <div className="flex items-center gap-2">
          <AlertTriangle size={16} className="text-amber-600" />
          <span className="text-[11px] font-black uppercase tracking-wider">YÊU CẦU DỊCH VỤ</span>
        </div>
        <div className={`transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}>
          <ChevronDown size={18} />
        </div>
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
          >
            <div className="px-5 pb-6 space-y-5">
              {/* 1. Yêu cầu của khách hàng */}
              <div className="space-y-3">
                <span className="text-[9px] font-black text-amber-600/60 uppercase tracking-widest px-1">Yêu cầu của khách hàng</span>
                <div className="flex flex-wrap gap-2">
                  {/* Strength Tag */}
                  <div className="px-3 py-1.5 rounded-xl bg-orange-50 text-orange-700 border border-orange-100 flex items-center gap-1.5 text-xs font-bold shadow-sm">
                    <Dumbbell size={14} /> {item.strength || 'Vừa'}
                  </div>
                  {/* Focus Tag */}
                  {item.focus && (
                    <div className="px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center gap-1.5 text-xs font-bold shadow-sm">
                      <Target size={14} className="text-rose-400" /> {item.focus}
                    </div>
                  )}
                  {/* Avoid Tag */}
                  {item.avoid && (
                    <div className="px-3 py-1.5 rounded-xl bg-rose-50 text-rose-700 border border-rose-100 flex items-center gap-1.5 text-xs font-bold shadow-sm">
                      <Ban size={14} /> {item.avoid}
                    </div>
                  )}
                </div>

                {item.customerNote && (
                  <div className="bg-white/80 p-4 rounded-2xl border border-amber-100 text-sm text-amber-900 font-medium italic leading-relaxed shadow-sm">
                    "{item.customerNote}"
                  </div>
                )}
              </div>

              {/* 2. Ghi chú của quầy */}
              {booking.dispatcherNote && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Ghi chú của quầy</span>
                  <div className="bg-slate-50 p-3.5 rounded-2xl text-xs text-slate-600 font-medium whitespace-pre-wrap border border-slate-100 shadow-sm leading-relaxed">
                    {booking.dispatcherNote}
                  </div>
                </div>
              )}

              {/* 3. Ghi chú cho KTV */}
              {item.noteForKtv && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-[9px] font-black text-rose-400 uppercase tracking-widest px-1">Ghi chú cho kỹ thuật viên</span>
                  <div className="bg-rose-50/50 p-3.5 rounded-2xl text-xs text-rose-700 font-bold border border-rose-100 whitespace-pre-wrap shadow-sm leading-relaxed">
                    {item.noteForKtv}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
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


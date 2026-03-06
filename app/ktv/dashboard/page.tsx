'use client';

import React from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import {
  Clock, ShieldAlert, Calendar, AlertTriangle,
  Camera, CheckCircle, Play, StopCircle,
  Smile, Frown, Meh, Star, Gift, ArrowRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useKTVDashboard, ScreenState } from './KTVDashboard.logic';
import Image from 'next/image';

// 🔧 UI CONFIGURATION - SPA THEME
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
  const { user, screen, booking, isLoading } = logic;

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
      <div className={`max-w-md mx-auto min-h-screen pb-24 ${THEME.bgBase}`}>
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
    </AppLayout>
  );
}

// ----------------------------------------------------
// SCREENS
// ----------------------------------------------------

function ScreenDashboard({ logic }: { logic: ReturnType<typeof useKTVDashboard> }) {
  const { booking, checklist, toggleChecklist, isChecklistComplete, handleConfirmSetup } = logic;

  return (
    <div className="p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className={`text-xl font-bold ${THEME.textBase}`}>Xin chào, {logic.user?.name}</h1>
          <p className={`text-sm ${THEME.textMuted}`}>Ca làm việc hôm nay của bạn</p>
        </div>
        <div className={`w-10 h-10 ${THEME.primaryMuted} rounded-full flex items-center justify-center font-bold`}>
          NV
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
              <span className={`text-sm font-semibold ${THEME.textMuted}`}>{booking.billCode}</span>
            </div>

            <div className="p-5">
              <h3 className={`font-bold text-xl ${THEME.textBase} mb-1`}>
                {booking.BookingItems?.[0]?.service_name || 'Dịch Vụ Spa'}
              </h3>
              <p className={`text-sm ${THEME.textMuted} mb-4`}>
                Thời gian: {booking.BookingItems?.[0]?.duration || 60} phút
              </p>

              <div className="bg-orange-50/50 border-l-2 border-orange-400 p-3 rounded-r-lg mb-4">
                <span className="text-xs font-bold text-orange-600 mb-1 block">YÊU CẦU ĐẶC BIỆT</span>
                <p className="text-sm text-orange-900 italic">"Ghi chú từ khách hàng sẽ hiển thị tại đây"</p>
              </div>
            </div>
          </div>

          {/* Setup Checklist */}
          <div>
            <h3 className={`font-bold ${THEME.textBase} mb-3 flex items-center gap-2`}>
              <CheckCircle size={18} className={THEME.gold} />
              Quy trình mở phòng
            </h3>

            <div className="space-y-2">
              <ChecklistItem
                label="Mở máy lạnh, quạt thông gió"
                checked={checklist.ac}
                onChange={() => toggleChecklist('ac')}
              />
              <ChecklistItem
                label="Bật đèn xông tinh dầu"
                checked={checklist.oil}
                onChange={() => toggleChecklist('oil')}
              />
              <ChecklistItem
                label="Setup giường (Khăn, gối)"
                checked={checklist.bed}
                onChange={() => toggleChecklist('bed')}
              />
              <ChecklistItem
                label="Chuẩn bị khăn nóng"
                checked={checklist.towel}
                onChange={() => toggleChecklist('towel')}
              />
              <ChecklistItem
                label="Kiểm tra vệ sinh phòng"
                checked={checklist.toilet}
                onChange={() => toggleChecklist('toilet')}
              />
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

function ScreenTimer({ logic }: { logic: ReturnType<typeof useKTVDashboard> }) {
  const { booking, timeRemaining, isTimerRunning, handleStartTimer, handleFinishTimer } = logic;

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
          <h2 className={`text-xl font-bold ${THEME.textBase}`}>Phòng {booking?.roomName || 'V1'}</h2>
          <p className={THEME.textMuted}>{booking?.BookingItems?.[0]?.service_name || 'Đang thực hiện'}</p>
        </div>
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

      {isTimerRunning && (
        <div className="grid grid-cols-2 gap-3 mt-auto">
          <QuickActionButton icon={<AlertTriangle />} label="Khẩn cấp" color="text-rose-600 bg-rose-50" />
          <QuickActionButton icon={<Clock />} label="Thêm giờ" color="text-indigo-600 bg-indigo-50" />
        </div>
      )}
    </div>
  );
}

function ScreenReview({ logic }: { logic: ReturnType<typeof useKTVDashboard> }) {
  const [rating, setRating] = React.useState(0);

  return (
    <div className="p-5 flex flex-col h-full">
      <div className="text-center mb-8 mt-4">
        <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle size={32} />
        </div>
        <h2 className="text-2xl font-bold text-slate-800">Hoàn thành dịch vụ!</h2>
        <p className="text-slate-500 mt-2">Đánh giá nhanh hồ sơ khách hàng</p>
      </div>

      <div className="space-y-4 mb-8">
        <RatingCard
          icon={<Smile size={24} />}
          title="Khách Dễ Thương"
          desc="Thân thiện, trò chuyện cởi mở"
          isSelected={rating === 1}
          onClick={() => setRating(1)}
        />
        <RatingCard
          icon={<Meh size={24} />}
          title="Khách Hướng Nội"
          desc="Thích không gian tĩnh lặng để nghỉ"
          isSelected={rating === 2}
          onClick={() => setRating(2)}
        />
        <RatingCard
          icon={<Frown size={24} />}
          title="Khách Kỹ Tính"
          desc="Yêu cầu cao về chuyên môn"
          isSelected={rating === 3}
          onClick={() => setRating(3)}
        />
      </div>

      <button
        onClick={() => logic.handleSubmitReview({ personality: rating })}
        disabled={rating === 0}
        className={`w-full py-4 mt-auto font-bold text-white ${THEME.radius} transition-colors ${rating !== 0 ? THEME.primary : 'bg-slate-300'}`}
      >
        Lưu hồ sơ khách hàng
      </button>
    </div>
  );
}

function ScreenHandover({ logic }: { logic: ReturnType<typeof useKTVDashboard> }) {
  const { handoverChecklist, toggleHandoverChecklist, isHandoverComplete, handleFinishHandover } = logic;

  return (
    <div className="p-5 flex flex-col h-full space-y-6">
      <div className="text-center mt-4">
        <h2 className="text-xl font-bold text-slate-800">Bàn Giao Phòng</h2>
        <p className="text-sm text-slate-500 mt-1">Vui lòng dọn dẹp trước khi kết thúc ca</p>
      </div>

      <div className={`${THEME.bgCard} ${THEME.border} ${THEME.radius} border p-4 shadow-sm`}>
        <div className="space-y-1">
          <ChecklistItem label="Thu dọn khăn bẩn" checked={handoverChecklist.towel} onChange={() => toggleHandoverChecklist('towel')} />
          <ChecklistItem label="Chỉnh lại ga giường" checked={handoverChecklist.bed} onChange={() => toggleHandoverChecklist('bed')} />
          <ChecklistItem label="Đổ rác" checked={handoverChecklist.trash} onChange={() => toggleHandoverChecklist('trash')} />
          <ChecklistItem label="Tắt máy lạnh" checked={handoverChecklist.ac} onChange={() => toggleHandoverChecklist('ac')} />
          <ChecklistItem label="Tắt quạt" checked={handoverChecklist.fan} onChange={() => toggleHandoverChecklist('fan')} />
          <ChecklistItem label="Tắt đèn" checked={handoverChecklist.light} onChange={() => toggleHandoverChecklist('light')} />
        </div>
      </div>

      <button
        disabled={!isHandoverComplete}
        onClick={handleFinishHandover}
        className={`w-full py-4 mt-auto font-bold text-slate-900 ${THEME.radius} transition-all 
          ${isHandoverComplete ? THEME.goldBg + ' shadow-lg shadow-yellow-200' : 'bg-slate-300 text-white'}`}
      >
        Hoàn tất bàn giao
      </button>
    </div>
  );
}

function ScreenReward({ logic }: { logic: ReturnType<typeof useKTVDashboard> }) {
  return (
    <div className="p-5 flex flex-col items-center justify-center h-[80vh] text-center">
      <div className="w-24 h-24 bg-yellow-50 text-yellow-500 rounded-full flex items-center justify-center mb-6 shadow-xl shadow-yellow-100">
        <Gift size={48} />
      </div>

      <h2 className="text-2xl font-bold text-slate-800 mb-2">Thật Tuyệt Vời!</h2>
      <p className="text-slate-500 mb-8">Bạn đã hoàn thành xuất sắc ca làm việc.</p>

      <div className={`${THEME.bgCard} ${THEME.border} ${THEME.radius} border p-6 w-full shadow-sm mb-8`}>
        <div className="text-sm text-slate-500 uppercase tracking-widest font-bold mb-2">ĐIỂM THƯỞNG</div>
        <div className="text-4xl font-black text-emerald-600 flex items-center justify-center gap-2">
          +25 <Star fill="currentColor" className="text-yellow-400" />
        </div>
      </div>

      <button
        onClick={logic.goToDashboard}
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
    <label 
      onClick={onChange}
      className={`flex items-center gap-4 p-3 ${THEME.radius} cursor-pointer transition-colors ${checked ? 'bg-emerald-50' : THEME.bgCard}`}
    >
      <div className={`w-6 h-6 rounded flex items-center justify-center border-2 transition-colors ${checked ? 'border-emerald-500 bg-emerald-500' : 'border-slate-300'}`}>
        {checked && <CheckCircle size={14} className="text-white" />}
      </div>
      <span className={`font-medium ${checked ? 'text-emerald-800' : THEME.textBase}`}>{label}</span>
    </label>
  );
}

function QuickActionButton({ icon, label, color }: { icon: React.ReactNode, label: string, color: string }) {
  return (
    <button className={`p-4 ${THEME.radius} flex flex-col items-center justify-center gap-2 ${color} font-medium active:scale-95 transition-transform`}>
      {icon}
      <span className="text-sm">{label}</span>
    </button>
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

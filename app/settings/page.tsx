'use client';

import React, { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/lib/auth-context';
import { 
  User, 
  Lock, 
  Camera, 
  Save, 
  Eye, 
  EyeOff, 
  ChevronRight,
  ShieldCheck,
  Bell,
  Palette
} from 'lucide-react';
import { motion } from 'motion/react';
import Image from 'next/image';

export default function SettingsPage() {
  const { user, changePassword, updateProfile } = useAuth();
  const [mounted, setMounted] = useState(false);

  // Profile state
  const [name, setName] = useState(user?.name || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || '');
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);

  // Password state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const handleUpdateProfile = (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdatingProfile(true);
    setTimeout(() => {
      updateProfile(name, avatarUrl);
      setIsUpdatingProfile(false);
      alert('Đã cập nhật thông tin cá nhân thành công!');
    }, 800);
  };

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      alert('Mật khẩu xác nhận không khớp!');
      return;
    }
    setIsChangingPassword(true);
    setTimeout(() => {
      changePassword(newPassword);
      setIsChangingPassword(false);
      setNewPassword('');
      setConfirmPassword('');
      alert('Đã đổi mật khẩu thành công!');
    }, 800);
  };

  const handleRandomAvatar = () => {
    const randomSeed = Math.random().toString(36).substring(7);
    setAvatarUrl(`https://picsum.photos/seed/${randomSeed}/200/200`);
  };

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Cài đặt tài khoản</h1>
          <p className="text-gray-500 mt-1">Quản lý thông tin cá nhân và bảo mật tài khoản của bạn.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Sidebar Navigation (Internal to page) */}
          <div className="space-y-1">
            <button className="w-full flex items-center justify-between px-4 py-3 bg-indigo-50 text-indigo-700 rounded-xl font-medium text-sm border border-indigo-100/50">
              <div className="flex items-center gap-3">
                <User size={18} />
                Hồ sơ cá nhân
              </div>
              <ChevronRight size={16} />
            </button>
            <button className="w-full flex items-center justify-between px-4 py-3 text-gray-600 hover:bg-gray-100 rounded-xl text-sm transition-colors">
              <div className="flex items-center gap-3">
                <ShieldCheck size={18} />
                Bảo mật & Đăng nhập
              </div>
              <ChevronRight size={16} />
            </button>
            <button className="w-full flex items-center justify-between px-4 py-3 text-gray-600 hover:bg-gray-100 rounded-xl text-sm transition-colors">
              <div className="flex items-center gap-3">
                <Bell size={18} />
                Thông báo
              </div>
              <ChevronRight size={16} />
            </button>
            <button className="w-full flex items-center justify-between px-4 py-3 text-gray-600 hover:bg-gray-100 rounded-xl text-sm transition-colors">
              <div className="flex items-center gap-3">
                <Palette size={18} />
                Giao diện
              </div>
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Main Content */}
          <div className="md:col-span-2 space-y-8">
            {/* Profile Section */}
            <motion.section 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden"
            >
              <div className="p-6 border-b border-gray-50 bg-gray-50/30">
                <h2 className="font-bold text-gray-900 flex items-center gap-2">
                  <User size={20} className="text-indigo-600" />
                  Hồ sơ cá nhân
                </h2>
              </div>
              <form onSubmit={handleUpdateProfile} className="p-8 space-y-6">
                <div className="flex flex-col sm:flex-row items-center gap-6">
                  <div className="relative group">
                    <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-white shadow-md bg-gray-100 relative">
                      <Image 
                        src={avatarUrl || 'https://picsum.photos/seed/default/200/200'} 
                        alt="Avatar" 
                        fill 
                        className="object-cover"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    <button 
                      type="button"
                      onClick={handleRandomAvatar}
                      className="absolute bottom-0 right-0 p-2 bg-indigo-600 text-white rounded-full shadow-lg hover:bg-indigo-700 transition-colors"
                    >
                      <Camera size={16} />
                    </button>
                  </div>
                  <div className="flex-1 space-y-1 text-center sm:text-left">
                    <h3 className="font-bold text-gray-900">Ảnh đại diện</h3>
                    <p className="text-xs text-gray-400">Bấm vào icon camera để đổi ảnh ngẫu nhiên hoặc dán link ảnh bên dưới.</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Họ và tên</label>
                    <input 
                      type="text" 
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm transition-all"
                      placeholder="Nhập họ tên của bạn"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Link ảnh đại diện</label>
                    <input 
                      type="text" 
                      value={avatarUrl}
                      onChange={(e) => setAvatarUrl(e.target.value)}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm transition-all"
                      placeholder="https://example.com/avatar.jpg"
                    />
                  </div>
                </div>

                <div className="pt-4">
                  <button 
                    type="submit"
                    disabled={isUpdatingProfile}
                    className="flex items-center justify-center gap-2 w-full sm:w-auto px-8 py-3 bg-indigo-600 text-white rounded-2xl font-bold text-sm hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-70"
                  >
                    <Save size={18} />
                    {isUpdatingProfile ? 'Đang lưu...' : 'Lưu thay đổi'}
                  </button>
                </div>
              </form>
            </motion.section>

            {/* Password Section */}
            <motion.section 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden"
            >
              <div className="p-6 border-b border-gray-50 bg-gray-50/30">
                <h2 className="font-bold text-gray-900 flex items-center gap-2">
                  <Lock size={20} className="text-indigo-600" />
                  Đổi mật khẩu
                </h2>
              </div>
              <form onSubmit={handleChangePassword} className="p-8 space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Mật khẩu mới</label>
                    <div className="relative">
                      <input 
                        type={showPassword ? 'text' : 'password'} 
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full pl-4 pr-12 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm transition-all"
                        placeholder="••••••••"
                      />
                      <button 
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Xác nhận mật khẩu</label>
                    <input 
                      type={showPassword ? 'text' : 'password'} 
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm transition-all"
                      placeholder="••••••••"
                    />
                  </div>
                </div>

                <div className="pt-4">
                  <button 
                    type="submit"
                    disabled={isChangingPassword || !newPassword}
                    className="flex items-center justify-center gap-2 w-full sm:w-auto px-8 py-3 bg-white border border-gray-200 text-gray-900 rounded-2xl font-bold text-sm hover:bg-gray-50 transition-all shadow-sm disabled:opacity-50"
                  >
                    <Lock size={18} />
                    {isChangingPassword ? 'Đang cập nhật...' : 'Cập nhật mật khẩu'}
                  </button>
                </div>
              </form>
            </motion.section>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

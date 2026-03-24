'use client';

// 🔧 UI CONFIGURATION
const ANIMATION_DURATION = 0.25;

import React, { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/lib/auth-context';
import { createClient } from '@/lib/supabase';
import {
  ShieldAlert, Tablet, Trash2, Power, PowerOff,
  RefreshCw, AlertCircle, CheckCircle2, Plus
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Types from Supabase
interface RegisteredDevice {
  id: string;
  device_id: string;
  device_name: string;
  device_type: string;
  is_active: boolean;
  registered_at: string;
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

const DeviceManagementPage = () => {
  const { hasPermission } = useAuth();
  const [devices, setDevices] = useState<RegisteredDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // Fetch devices from Supabase
  const fetchDevices = async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('RegisteredDevices')
        .select('*')
        .order('registered_at', { ascending: false });

      if (error) throw error;
      setDevices(data || []);
    } catch (err) {
      console.error('Error fetching devices:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (mounted) fetchDevices();
  }, [mounted]);

  // Toggle device active status
  const toggleDevice = async (deviceId: string, currentStatus: boolean) => {
    try {
      const supabase = createClient();
      await supabase
        .from('RegisteredDevices')
        .update({ is_active: !currentStatus })
        .eq('id', deviceId);
      fetchDevices();
    } catch (err) {
      console.error('Error toggling device:', err);
    }
  };

  // Delete device
  const deleteDevice = async (deviceId: string) => {
    if (!confirm('Xóa thiết bị này? Tablet sẽ cần đăng ký lại.')) return;
    try {
      const supabase = createClient();
      await supabase
        .from('RegisteredDevices')
        .delete()
        .eq('id', deviceId);
      fetchDevices();
    } catch (err) {
      console.error('Error deleting device:', err);
    }
  };

  if (!mounted) return null;

  if (!hasPermission('device_management')) {
    return (
      <AppLayout title="Thiết Bị">
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <ShieldAlert size={48} className="text-red-500 mb-4" />
          <h2 className="text-xl font-bold text-gray-900">Không có quyền truy cập</h2>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Quản Lý Thiết Bị">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
              <Tablet size={24} className="text-indigo-600" />
              Quản Lý Thiết Bị Sảnh
            </h1>
            <p className="text-xs text-gray-500 mt-1">
              <span className="text-indigo-600 font-semibold">{devices.filter(d => d.is_active).length} thiết bị đang hoạt động</span>
              {' · '}
              <span className="text-gray-400">{devices.length} tổng</span>
            </p>
          </div>
          <button
            onClick={fetchDevices}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-bold text-gray-700 transition-colors"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Làm mới
          </button>
        </div>

        {/* Info Banner */}
        <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 mb-6">
          <p className="text-sm text-indigo-700 font-medium">
            📱 Để đăng ký Tablet mới, mở <code className="bg-indigo-100 px-1.5 py-0.5 rounded text-xs font-bold">nganha.vercel.app/register-device</code> trên thiết bị cần đăng ký.
          </p>
          <p className="text-xs text-indigo-500 mt-1">Mã PIN: <strong>8899</strong></p>
        </div>

        {/* Devices Table */}
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <RefreshCw size={24} className="animate-spin text-indigo-400" />
          </div>
        ) : devices.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
            <Tablet size={32} className="text-gray-300 mb-3" />
            <p className="text-sm font-bold text-gray-400">Chưa có thiết bị nào được đăng ký</p>
            <p className="text-xs text-gray-400 mt-1">Mở link đăng ký trên Tablet để bắt đầu</p>
          </div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence>
              {devices.map((device) => (
                <motion.div
                  key={device.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className={`bg-white rounded-2xl border-2 p-4 transition-all ${
                    device.is_active
                      ? 'border-white hover:border-indigo-100 shadow-sm hover:shadow-md'
                      : 'border-gray-100 bg-gray-50 opacity-60'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    {/* Device Info */}
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                        device.is_active
                          ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-200'
                          : 'bg-gray-200 text-gray-400'
                      }`}>
                        <Tablet size={22} />
                      </div>
                      <div>
                        <p className="font-bold text-gray-900">{device.device_name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            device.is_active
                              ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                              : 'bg-gray-100 text-gray-400'
                          }`}>
                            {device.is_active ? '● Hoạt động' : '○ Tắt'}
                          </span>
                          <span className="text-[10px] text-gray-400">{device.device_type}</span>
                        </div>
                      </div>
                    </div>

                    {/* Meta + Actions */}
                    <div className="flex items-center gap-3">
                      <div className="text-right hidden sm:block">
                        <p className="text-[10px] text-gray-400 font-mono">{device.device_id.substring(0, 8)}...</p>
                        <p className="text-[10px] text-gray-400">
                          {new Date(device.registered_at).toLocaleDateString('vi-VN')}
                        </p>
                      </div>

                      {/* Toggle Active */}
                      <button
                        onClick={() => toggleDevice(device.id, device.is_active)}
                        className={`p-2 rounded-xl transition-colors ${
                          device.is_active
                            ? 'text-emerald-600 hover:bg-emerald-50'
                            : 'text-gray-400 hover:bg-gray-100'
                        }`}
                        title={device.is_active ? 'Tắt thiết bị' : 'Bật thiết bị'}
                      >
                        {device.is_active ? <Power size={18} /> : <PowerOff size={18} />}
                      </button>

                      {/* Delete */}
                      <button
                        onClick={() => deleteDevice(device.id)}
                        className="p-2 rounded-xl text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                        title="Xóa thiết bị"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default DeviceManagementPage;

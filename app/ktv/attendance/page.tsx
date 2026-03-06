'use client';

import React, { useState, useRef } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/lib/auth-context';
import Image from 'next/image';
import { ShieldAlert, Camera, MapPin, Clock, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';

export default function KTVAttendancePage() {
  const { hasPermission, user } = useAuth();
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [location, setLocation] = useState<string | null>(null);
  const [timestamp, setTimestamp] = useState<Date | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  if (!hasPermission('ktv_attendance')) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <ShieldAlert size={48} className="text-red-500 mb-4" />
          <h2 className="text-xl font-bold text-gray-900">Không có quyền truy cập</h2>
        </div>
      </AppLayout>
    );
  }

  const openCamera = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert("Trình duyệt của bạn không hỗ trợ truy cập camera hoặc đang chạy trong môi trường không an toàn (không phải HTTPS).");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsCameraOpen(true);
      }
      
      // Get location
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            setLocation(`${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)}`);
          },
          (error) => {
            console.error("Error getting location", error);
            setLocation("Không thể lấy vị trí");
          }
        );
      }
    } catch (err: any) {
      console.error("Error accessing camera", err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        alert("Quyền truy cập camera bị từ chối. Vui lòng kiểm tra cài đặt trình duyệt và cho phép ứng dụng truy cập camera, sau đó tải lại trang.");
      } else {
        alert("Không thể truy cập camera: " + err.message);
      }
    }
  };

  const takePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Add timestamp and location watermark
        const now = new Date();
        setTimestamp(now);
        const timeString = format(now, 'dd/MM/yyyy HH:mm:ss');
        const locString = location || "Vị trí: Ngân Hà Spa";
        
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, canvas.height - 60, canvas.width, 60);
        
        ctx.font = '16px Arial';
        ctx.fillStyle = 'white';
        ctx.fillText(timeString, 10, canvas.height - 35);
        ctx.fillText(locString, 10, canvas.height - 15);

        const dataUrl = canvas.toDataURL('image/jpeg');
        setPhoto(dataUrl);
        
        // Stop camera
        const stream = video.srcObject as MediaStream;
        if (stream) {
          stream.getTracks().forEach(track => track.stop());
        }
        setIsCameraOpen(false);
      }
    }
  };

  const submitAttendance = () => {
    setIsCheckingIn(true);
    setTimeout(() => {
      setIsCheckingIn(false);
      alert('Chấm công thành công!');
      // Reset
      setPhoto(null);
      setTimestamp(null);
    }, 1000);
  };

  return (
    <AppLayout>
      <div className="max-w-md mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Chấm Công</h1>
          <p className="text-sm text-gray-500 mt-1">Chụp ảnh xác thực để bắt đầu ca làm việc.</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden p-6">
          {!photo && !isCameraOpen ? (
            <div className="text-center py-8">
              <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <Camera size={32} className="text-indigo-600" />
              </div>
              <h3 className="text-gray-900 font-medium mb-2">Yêu cầu chụp ảnh</h3>
              <p className="text-sm text-gray-500 mb-6 px-4">Hệ thống sẽ ghi nhận hình ảnh, thời gian và vị trí hiện tại của bạn.</p>
              <button 
                onClick={openCamera}
                className="w-full py-3 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-700 transition-colors"
              >
                Mở Camera
              </button>
            </div>
          ) : isCameraOpen ? (
            <div className="space-y-4">
              <div className="relative rounded-xl overflow-hidden bg-black aspect-[3/4]">
                <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent text-white">
                  <div className="flex items-center gap-2 text-sm mb-1">
                    <Clock size={14} />
                    {format(new Date(), 'dd/MM/yyyy HH:mm:ss')}
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin size={14} />
                    {location || "Đang lấy vị trí..."}
                  </div>
                </div>
              </div>
              <button 
                onClick={takePhoto}
                className="w-full py-4 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
              >
                <Camera size={20} />
                Chụp Ảnh
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="rounded-xl overflow-hidden border border-gray-200 relative min-h-[300px]">
                <Image 
                  src={photo!} 
                  alt="Attendance" 
                  width={600} 
                  height={800} 
                  className="w-full h-auto" 
                  referrerPolicy="no-referrer"
                />
              </div>
              
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
                <div className="flex items-center gap-2 text-emerald-700 font-medium mb-2">
                  <CheckCircle2 size={18} />
                  Ảnh hợp lệ
                </div>
                <div className="text-sm text-emerald-600 space-y-1">
                  <p>Thời gian: {timestamp ? format(timestamp, 'dd/MM/yyyy HH:mm:ss') : ''}</p>
                  <p>Vị trí: {location}</p>
                </div>
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={() => { setPhoto(null); openCamera(); }}
                  className="flex-1 py-3 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200 transition-colors"
                >
                  Chụp Lại
                </button>
                <button 
                  onClick={submitAttendance}
                  disabled={isCheckingIn}
                  className="flex-1 py-3 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-70"
                >
                  {isCheckingIn ? 'Đang gửi...' : 'Xác Nhận'}
                </button>
              </div>
            </div>
          )}
          
          <canvas ref={canvasRef} className="hidden" />
        </div>
      </div>
    </AppLayout>
  );
}

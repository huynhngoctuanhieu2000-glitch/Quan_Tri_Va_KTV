'use client';

import React, { useState, useRef } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/lib/auth-context';
import Image from 'next/image';
import { ShieldAlert, Camera, MapPin, Clock, CheckCircle2, ExternalLink, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

// 🔧 UI CONFIGURATION
const PHOTO_QUALITY = 0.85;
const CAMERA_FACING_MODE = 'user';

export default function KTVAttendancePage() {
  const { hasPermission, user } = useAuth();

  const [photo, setPhoto] = useState<string | null>(null);
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [locationText, setLocationText] = useState<string | null>(null);
  const [timestamp, setTimestamp] = useState<Date | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

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
    setSubmitSuccess(false);
    setSubmitError(null);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert('Trình duyệt không hỗ trợ camera hoặc không dùng HTTPS.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: CAMERA_FACING_MODE, width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsCameraOpen(true);
      }

      // Lấy GPS song song với mở camera
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            setLatitude(lat);
            setLongitude(lng);
            setLocationText(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
          },
          (err) => {
            console.warn('GPS error:', err);
            setLocationText('Không lấy được vị trí');
          },
          { timeout: 10000, enableHighAccuracy: true }
        );
      }
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        alert('Quyền camera bị từ chối. Kiểm tra cài đặt trình duyệt và thử lại.');
      } else {
        alert('Không thể mở camera: ' + err.message);
      }
    }
  };

  const takePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Watermark: timestamp + location
    const now = new Date();
    setTimestamp(now);
    const timeStr = format(now, 'dd/MM/yyyy HH:mm:ss');
    const locStr = locationText || 'Đang lấy vị trí...';

    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(0, canvas.height - 64, canvas.width, 64);
    ctx.font = 'bold 15px Arial';
    ctx.fillStyle = 'white';
    ctx.fillText(timeStr, 12, canvas.height - 38);
    ctx.font = '13px Arial';
    ctx.fillText(locStr, 12, canvas.height - 16);

    const dataUrl = canvas.toDataURL('image/jpeg', PHOTO_QUALITY);
    setPhoto(dataUrl);

    // Stop camera stream
    const stream = video.srcObject as MediaStream;
    stream?.getTracks().forEach(t => t.stop());
    setIsCameraOpen(false);
  };

  const submitAttendance = async () => {
    if (!photo) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch('/api/ktv/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: user?.id,
          employeeName: user?.id || 'KTV',
          photoBase64: photo,
          latitude,
          longitude,
          locationText,
        }),
      });

      const result = await res.json();

      if (!result.success) {
        throw new Error(result.error || 'Lỗi không xác định');
      }

      setSubmitSuccess(true);
      setPhoto(null);
      setTimestamp(null);
    } catch (err: any) {
      setSubmitError(err.message || 'Gửi thất bại. Vui lòng thử lại.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const mapsUrl = latitude && longitude
    ? `https://maps.google.com/?q=${latitude},${longitude}`
    : null;

  return (
    <AppLayout>
      <div className="max-w-md mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Chấm Công</h1>
          <p className="text-sm text-gray-500 mt-1">Chụp ảnh xác thực để bắt đầu ca làm việc.</p>
        </div>

        {/* Success state */}
        {submitSuccess && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex flex-col items-center text-center gap-3">
            <CheckCircle2 size={40} className="text-emerald-500" />
            <div>
              <p className="font-bold text-emerald-800 text-lg">Điểm danh thành công!</p>
              <p className="text-sm text-emerald-600 mt-1">Bạn đã được thêm vào Sổ Tua hôm nay.</p>
            </div>
            {mapsUrl && (
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm text-emerald-700 underline underline-offset-2 hover:text-emerald-900"
              >
                <MapPin size={14} />
                Xem vị trí của bạn trên Maps
                <ExternalLink size={12} />
              </a>
            )}
            <button
              onClick={() => { setSubmitSuccess(false); setLatitude(null); setLongitude(null); setLocationText(null); }}
              className="mt-1 text-xs text-emerald-500 hover:text-emerald-700"
            >
              Chấm công lần nữa
            </button>
          </div>
        )}

        {!submitSuccess && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden p-6">
            {/* Step 1: Idle */}
            {!photo && !isCameraOpen && (
              <div className="text-center py-8">
                <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Camera size={32} className="text-indigo-600" />
                </div>
                <h3 className="text-gray-900 font-medium mb-2">Yêu cầu chụp ảnh</h3>
                <p className="text-sm text-gray-500 mb-6 px-4">
                  Hệ thống ghi nhận ảnh, thời gian và vị trí GPS của bạn.
                </p>
                <button
                  onClick={openCamera}
                  className="w-full py-3 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-700 transition-colors"
                >
                  Mở Camera
                </button>
              </div>
            )}

            {/* Step 2: Camera live */}
            {isCameraOpen && (
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
                      {locationText || 'Đang lấy vị trí GPS...'}
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
            )}

            {/* Step 3: Preview & confirm */}
            {photo && !isCameraOpen && (
              <div className="space-y-6">
                <div className="rounded-xl overflow-hidden border border-gray-200 relative min-h-[300px]">
                  <Image
                    src={photo}
                    alt="Attendance"
                    width={600}
                    height={800}
                    className="w-full h-auto"
                    referrerPolicy="no-referrer"
                  />
                </div>

                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 space-y-1.5">
                  <div className="flex items-center gap-2 text-emerald-700 font-medium">
                    <CheckCircle2 size={18} />
                    Ảnh hợp lệ
                  </div>
                  <p className="text-sm text-emerald-600">
                    ⏰ {timestamp ? format(timestamp, 'dd/MM/yyyy HH:mm:ss') : ''}
                  </p>
                  {locationText && (
                    <div className="flex items-center gap-1.5 text-sm text-emerald-600">
                      <MapPin size={13} />
                      {locationText}
                      {mapsUrl && (
                        <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="ml-1">
                          <ExternalLink size={12} className="inline text-emerald-400 hover:text-emerald-700" />
                        </a>
                      )}
                    </div>
                  )}
                </div>

                {submitError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
                    ❌ {submitError}
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => { setPhoto(null); openCamera(); }}
                    disabled={isSubmitting}
                    className="flex-1 py-3 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-50"
                  >
                    Chụp Lại
                  </button>
                  <button
                    onClick={submitAttendance}
                    disabled={isSubmitting}
                    className="flex-1 py-3 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-70 flex items-center justify-center gap-2"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Đang gửi...
                      </>
                    ) : 'Xác Nhận'}
                  </button>
                </div>
              </div>
            )}

            <canvas ref={canvasRef} className="hidden" />
          </div>
        )}
      </div>
    </AppLayout>
  );
}

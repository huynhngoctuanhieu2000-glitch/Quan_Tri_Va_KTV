'use client';

import React, { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/lib/auth-context';
import Image from 'next/image';
import { ShieldAlert, Image as ImageIcon, Video, Wand2, Loader2, Upload } from 'lucide-react';
import * as Tabs from '@radix-ui/react-tabs';
import * as Select from '@radix-ui/react-select';
import { GoogleGenAI } from '@google/genai';

export default function AIFeaturesPage() {
  const { hasPermission } = useAuth();
  const [prompt, setPrompt] = useState('');
  const [imageSize, setImageSize] = useState('1K');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [isGenerating, setIsGenerating] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  if (!hasPermission('ai_features')) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <ShieldAlert size={48} className="text-red-500 mb-4" />
          <h2 className="text-xl font-bold text-gray-900">Không có quyền truy cập</h2>
        </div>
      </AppLayout>
    );
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSourceImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGenerateImage = async () => {
    if (!prompt) return;
    setIsGenerating(true);
    setResultUrl(null);
    
    try {
      const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
      if (!apiKey) {
        alert('Chưa cấu hình Gemini API Key. Vui lòng thiết lập biến môi trường NEXT_PUBLIC_GEMINI_API_KEY.');
        return;
      }
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: [{ parts: [{ text: prompt }] }],
        config: {
          imageConfig: {
            aspectRatio: aspectRatio as any,
          },
        },
      });

      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          const base64Data = part.inlineData.data;
          setResultUrl(`data:image/png;base64,${base64Data}`);
          break;
        }
      }
    } catch (error) {
      console.error('Error generating image:', error);
      alert('Đã xảy ra lỗi khi gọi Gemini API. Vui lòng kiểm tra lại cấu hình.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateVideo = async () => {
    if (!sourceImage) {
      alert('Vui lòng tải lên một ảnh để tạo video.');
      return;
    }
    setIsGenerating(true);
    setResultUrl(null);
    
    try {
      // Simulate API call delay for Veo
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Mock result (using a placeholder video or gif)
      // Since we can't easily mock a video URL that works reliably, we'll just show a success message
      // and a placeholder image that looks like a video player.
      setResultUrl('video_mock');
    } catch (error) {
      console.error('Error generating video:', error);
      alert('Đã xảy ra lỗi khi tạo video.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6 max-w-4xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <Wand2 className="text-indigo-600" />
            AI Studio (Ảnh & Video)
          </h1>
          <p className="text-sm text-gray-500 mt-1">Tạo nội dung marketing chuyên nghiệp cho Spa bằng AI.</p>
        </div>

        <Tabs.Root defaultValue="image" className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
          <Tabs.List className="flex border-b border-gray-100 bg-gray-50/50">
            <Tabs.Trigger value="image" className="flex-1 py-4 px-6 font-medium text-sm text-gray-600 hover:text-indigo-600 data-[state=active]:text-indigo-700 data-[state=active]:bg-white data-[state=active]:border-b-2 data-[state=active]:border-indigo-600 flex items-center justify-center gap-2 transition-all">
              <ImageIcon size={18} />
              Tạo Ảnh (Nano Banana Pro)
            </Tabs.Trigger>
            <Tabs.Trigger value="video" className="flex-1 py-4 px-6 font-medium text-sm text-gray-600 hover:text-indigo-600 data-[state=active]:text-indigo-700 data-[state=active]:bg-white data-[state=active]:border-b-2 data-[state=active]:border-indigo-600 flex items-center justify-center gap-2 transition-all">
              <Video size={18} />
              Tạo Video từ Ảnh (Veo)
            </Tabs.Trigger>
          </Tabs.List>

          <div className="p-6">
            <Tabs.Content value="image" className="space-y-6 animate-in fade-in duration-300">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả ảnh cần tạo</label>
                  <textarea 
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Ví dụ: Một không gian spa sang trọng với ánh sáng ấm áp, có giường massage và tinh dầu..."
                    className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none h-24 text-sm"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Kích thước ảnh</label>
                  <div className="flex gap-3">
                    {['1K', '2K', '4K'].map(size => (
                      <button
                        key={size}
                        onClick={() => setImageSize(size)}
                        className={`flex-1 py-2 px-4 rounded-lg border text-sm font-medium transition-colors ${
                          imageSize === size 
                            ? 'bg-indigo-50 border-indigo-200 text-indigo-700' 
                            : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </div>

                <button 
                  onClick={handleGenerateImage}
                  disabled={!prompt || isGenerating}
                  className="w-full py-3 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-70 flex items-center justify-center gap-2"
                >
                  {isGenerating ? (
                    <><Loader2 size={18} className="animate-spin" /> Đang tạo ảnh...</>
                  ) : (
                    <><Wand2 size={18} /> Tạo Ảnh Ngay</>
                  )}
                </button>
              </div>
            </Tabs.Content>

            <Tabs.Content value="video" className="space-y-6 animate-in fade-in duration-300">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tải ảnh lên</label>
                  <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:bg-gray-50 transition-colors relative">
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={handleImageUpload}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    {sourceImage ? (
                      <div className="flex flex-col items-center">
                        <Image 
                          src={sourceImage} 
                          alt="Source" 
                          width={200} 
                          height={128} 
                          className="h-32 w-auto object-contain rounded-lg mb-3 shadow-sm" 
                          referrerPolicy="no-referrer"
                        />
                        <span className="text-sm text-indigo-600 font-medium">Nhấn để thay đổi ảnh</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center text-gray-500">
                        <Upload size={32} className="mb-2 text-gray-400" />
                        <p className="text-sm font-medium text-gray-700">Kéo thả hoặc nhấn để tải ảnh lên</p>
                        <p className="text-xs mt-1">Hỗ trợ JPG, PNG</p>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tỷ lệ Video</label>
                  <div className="flex gap-3">
                    {[
                      { id: '16:9', label: '16:9 (Ngang - Youtube)' },
                      { id: '9:16', label: '9:16 (Dọc - Tiktok/Reels)' }
                    ].map(ratio => (
                      <button
                        key={ratio.id}
                        onClick={() => setAspectRatio(ratio.id)}
                        className={`flex-1 py-2 px-4 rounded-lg border text-sm font-medium transition-colors ${
                          aspectRatio === ratio.id 
                            ? 'bg-indigo-50 border-indigo-200 text-indigo-700' 
                            : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        {ratio.label}
                      </button>
                    ))}
                  </div>
                </div>

                <button 
                  onClick={handleGenerateVideo}
                  disabled={!sourceImage || isGenerating}
                  className="w-full py-3 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-70 flex items-center justify-center gap-2"
                >
                  {isGenerating ? (
                    <><Loader2 size={18} className="animate-spin" /> Đang tạo video (có thể mất vài phút)...</>
                  ) : (
                    <><Video size={18} /> Tạo Video</>
                  )}
                </button>
              </div>
            </Tabs.Content>
          </div>
          
          {/* Result Area */}
          {resultUrl && (
            <div className="p-6 border-t border-gray-100 bg-gray-50">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Kết quả:</h3>
              <div className="bg-white p-2 rounded-xl border border-gray-200 shadow-sm flex items-center justify-center min-h-[300px]">
                {resultUrl === 'video_mock' ? (
                  <div className="text-center">
                    <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-3">
                      <Video size={32} />
                    </div>
                    <p className="font-medium text-gray-900">Video đã tạo thành công!</p>
                    <p className="text-sm text-gray-500 mt-1">Đây là bản demo, video thực tế sẽ hiển thị ở đây.</p>
                  </div>
                ) : (
                  <Image 
                    src={resultUrl} 
                    alt="Generated AI" 
                    width={800} 
                    height={500} 
                    className="max-w-full max-h-[500px] w-auto h-auto rounded-lg object-contain" 
                    referrerPolicy="no-referrer"
                  />
                )}
              </div>
            </div>
          )}
        </Tabs.Root>
      </div>
    </AppLayout>
  );
}

'use client';

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, User, Phone, Sparkles, Loader2, Plus, Search, Clock, Tag, Image as ImageIcon } from 'lucide-react';

interface ServiceOption {
  id: string;
  nameVN: string;
  nameEN?: string;
  name?: string;
  price: number;
  duration: number;
  category?: string;
  image_url?: string;
  imageUrl?: string;
}

interface AddOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  services: ServiceOption[];
  onConfirm: (data: { customerName: string; customerPhone: string; serviceId: string }) => Promise<void>;
  selectedDate: string;
}

// 🔧 UI CONFIGURATION
const ANIMATION_DURATION = 0.3;

export const AddOrderModal = ({ isOpen, onClose, services, onConfirm, selectedDate }: AddOrderModalProps) => {
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState('Tất cả');

  const categories = useMemo(() => {
    const cats = ['Tất cả', ...Array.from(new Set(services.map(s => s.category).filter(Boolean)))];
    return cats as string[];
  }, [services]);

  const filteredServices = useMemo(() => {
    return services.filter(s => {
      const searchStr = searchTerm.toLowerCase();
      const matchesSearch = 
        (s.nameVN || '').toLowerCase().includes(searchStr) ||
        (s.nameEN || '').toLowerCase().includes(searchStr) ||
        (s.name || '').toLowerCase().includes(searchStr);
      
      const matchesCategory = activeCategory === 'Tất cả' || s.category === activeCategory;
      return matchesSearch && matchesCategory;
    });
  }, [services, searchTerm, activeCategory]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName || !serviceId) {
      alert('Vui lòng nhập tên khách và chọn dịch vụ!');
      return;
    }

    setLoading(true);
    try {
      await onConfirm({ customerName, customerPhone, serviceId });
      // Reset form but not name/phone if you want but usually reset all
      setCustomerName('');
      setCustomerPhone('');
      setServiceId('');
      setSearchTerm('');
      onClose();
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const selectedService = services.find(s => s.id === serviceId);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm overflow-hidden">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: ANIMATION_DURATION, ease: 'easeOut' }}
            className="bg-white w-full max-w-2xl max-h-[90vh] rounded-[32px] shadow-2xl overflow-hidden border border-gray-100 flex flex-col"
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-rose-500 to-rose-600 px-8 py-6 flex items-center justify-between text-white shrink-0">
              <div className="flex items-center gap-4">
                <div className="bg-white/20 p-3 rounded-2xl backdrop-blur-md shadow-inner">
                  <Sparkles size={24} className="text-white" />
                </div>
                <div>
                  <h3 className="font-black text-xl leading-tight uppercase tracking-tight">Tạo Đơn Nhanh</h3>
                  <p className="text-white/70 text-[10px] font-bold uppercase tracking-widest mt-0.5">{selectedDate}</p>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="p-2.5 hover:bg-white/10 rounded-full transition-colors text-white/80 hover:text-white"
              >
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 overflow-hidden flex flex-col p-8 gap-6">
              {/* Customer Info Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 shrink-0">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-black text-gray-400 uppercase tracking-wider ml-1">Tên khách hàng *</label>
                  <div className="relative">
                    <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      autoFocus
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Nhập tên khách..."
                      className="w-full pl-11 pr-4 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all outline-none font-bold text-gray-700 placeholder:text-gray-300"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-black text-gray-400 uppercase tracking-wider ml-1">Số điện thoại</label>
                  <div className="relative">
                    <Phone size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="tel"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="09xxx..."
                      className="w-full pl-11 pr-4 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all outline-none font-bold text-gray-700 placeholder:text-gray-300"
                    />
                  </div>
                </div>
              </div>

              {/* Service Selection Board */}
              <div className="flex-1 min-h-0 flex flex-col border border-gray-100 rounded-[24px] bg-gray-50/30 overflow-hidden">
                <div className="p-4 bg-white border-b border-gray-100 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-black text-gray-400 uppercase tracking-wider ml-1 flex items-center gap-2">
                       <Tag size={12} className="text-rose-500" /> Chọn Dịch Vụ {serviceId && <span className="text-emerald-500 lowercase">(đã chọn: {selectedService?.nameVN})</span>}
                    </label>
                  </div>
                  
                  {/* Search & Filter */}
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                      <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input 
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Tìm kiếm dịch vụ..."
                        className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100 transition-all"
                      />
                    </div>
                    <div className="flex gap-1 overflow-x-auto no-scrollbar pb-1 sm:pb-0">
                      {categories.map(cat => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setActiveCategory(cat)}
                          className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase whitespace-nowrap transition-all border ${
                            activeCategory === cat 
                              ? 'bg-rose-500 text-white border-rose-500 shadow-lg shadow-rose-100' 
                              : 'bg-white text-gray-400 border-gray-100 hover:border-gray-300'
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Service List */}
                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {filteredServices.length > 0 ? (
                      filteredServices.map(svc => (
                        <button
                          key={svc.id}
                          type="button"
                          onClick={() => setServiceId(svc.id)}
                          className={`flex items-center gap-3 p-3 rounded-[20px] text-left transition-all border-2 group relative overflow-hidden ${
                            serviceId === svc.id 
                              ? 'bg-rose-50 border-rose-500' 
                              : 'bg-white border-transparent hover:border-gray-100'
                          }`}
                        >
                          {/* Image Placeholder or Image */}
                          <div className={`w-14 h-14 rounded-2xl shrink-0 flex items-center justify-center overflow-hidden border ${serviceId === svc.id ? 'border-rose-200' : 'border-gray-100'}`}>
                            {(svc.image_url || svc.imageUrl) ? (
                              <img src={svc.image_url || svc.imageUrl} alt={svc.nameVN} className="w-full h-full object-cover" />
                            ) : (
                              <div className={`w-full h-full flex items-center justify-center ${serviceId === svc.id ? 'bg-rose-100 text-rose-500' : 'bg-gray-50 text-gray-300'}`}>
                                <ImageIcon size={20} />
                              </div>
                            )}
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <h4 className={`text-sm font-black truncate ${serviceId === svc.id ? 'text-rose-700' : 'text-gray-900 group-hover:text-rose-500 transition-colors'}`}>
                              {svc.nameVN || svc.nameEN || svc.name}
                            </h4>
                            <div className="flex items-center gap-3 mt-1 text-[11px] font-black uppercase tracking-tight">
                              <span className="text-rose-500">{(svc.price || 0).toLocaleString()}đ</span>
                              <span className="text-gray-300 flex items-center gap-1">
                                <Clock size={10} /> {svc.duration}p
                              </span>
                            </div>
                          </div>

                          {serviceId === svc.id && (
                            <div className="absolute top-1 right-1">
                              <Plus size={14} className="text-rose-500 rotate-45" />
                            </div>
                          )}
                        </button>
                      ))
                    ) : (
                      <div className="col-span-full py-12 text-center">
                        <p className="text-sm font-bold text-gray-400">Không tìm thấy dịch vụ phù hợp</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Submit Button */}
              <div className="shrink-0">
                <button
                  disabled={loading || !serviceId || !customerName}
                  type="submit"
                  className="w-full bg-gray-900 hover:bg-black text-white py-4.5 rounded-[24px] font-black text-sm uppercase tracking-[0.2em] shadow-2xl shadow-gray-200 active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-30 disabled:grayscale"
                >
                  {loading ? (
                    <Loader2 size={24} className="animate-spin" />
                  ) : (
                    <>
                      <Sparkles size={20} className="text-rose-400" />
                      Tạo Đơn Ngay
                    </>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

'use client';

import React, { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, User, Phone, Mail, CreditCard, Calendar, Ruler, Weight, Award, CheckCircle2, Briefcase, Edit2, Save, GraduationCap, Zap, BookOpen, Key, Shield } from 'lucide-react';
import { Employee, SkillLevel } from '@/lib/types';
import { updateEmployeeRole } from '@/app/admin/employees/actions';

interface EmployeeDetailModalProps {
  employee: Employee | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate?: (updatedEmployee: Employee) => void;
}

export function EmployeeDetailModal({ employee, isOpen, onClose, onUpdate }: EmployeeDetailModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedEmployee, setEditedEmployee] = useState<Employee | null>(employee);
  const [selectedRole, setSelectedRole] = useState(employee?.userRole || 'TECHNICIAN');
  const [isSavingRole, setIsSavingRole] = useState(false);

  const ROLE_OPTIONS = [
    { value: 'ADMIN', label: 'Admin', color: 'bg-purple-100 text-purple-700 border-purple-200' },
    { value: 'RECEPTIONIST', label: 'Lễ Tân', color: 'bg-blue-100 text-blue-700 border-blue-200' },
    { value: 'TECHNICIAN', label: 'Kỹ Thuật Viên', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  ];

  React.useEffect(() => {
    setEditedEmployee(employee);
    setSelectedRole((employee as any)?.userRole || 'TECHNICIAN');
  }, [employee]);

  if (!employee || !editedEmployee) return null;

  const toggleSkill = (skillKey: keyof Employee['skills']) => {
    if (!isEditing) return;
    const levels: SkillLevel[] = ['none', 'basic', 'expert', 'training'];

    setEditedEmployee(prev => {
      if (!prev) return null;
      const currentLevel = prev.skills[skillKey];
      const currentIndex = levels.indexOf(currentLevel);
      const nextIndex = (currentIndex + 1) % levels.length;
      const nextLevel = levels[nextIndex];

      return {
        ...prev,
        skills: {
          ...prev.skills,
          [skillKey]: nextLevel
        }
      };
    });
  };

  const handleSave = () => {
    if (onUpdate && editedEmployee) {
      onUpdate(editedEmployee);
    }
    setIsEditing(false);
    alert('Đã cập nhật thông tin nhân viên thành công!');
  };

  const updateField = (field: keyof Employee, value: any) => {
    setEditedEmployee(prev => {
      if (!prev) return null;
      return { ...prev, [field]: value };
    });
  };

  const skillLabels: Record<keyof Employee['skills'], string> = {
    hairCut: 'Cắt Tóc',
    shampoo: 'Gội đầu',
    hairExtensionShampoo: 'Gội Tóc Nối',
    earCleaning: 'Ráy Tai',
    machineShave: 'Cạo Máy',
    razorShave: 'Cạo Dao',
    facial: 'Facial',
    thaiBody: 'Body Thái',
    shiatsuBody: 'Shiatsu',
    oilBody: 'Body Dầu',
    hotStoneBody: 'Body Đá Nóng',
    scrubBody: 'Scrub Body',
    oilFoot: 'Foot Dầu',
    hotStoneFoot: 'Foot Đá Nóng',
    acupressureFoot: 'Foot ấn huyệt',
    heelScrub: 'Bào Gót',
    maniPedi: 'Manicure + Pedicure',
  };

  const levelInfo: Record<SkillLevel, { label: string, color: string, icon: React.ReactNode }> = {
    none: { label: 'Chưa có', color: 'text-gray-400 bg-gray-50 border-gray-100 opacity-50', icon: <X size={12} /> },
    basic: { label: 'Cơ bản', color: 'text-blue-700 bg-blue-50 border-blue-100', icon: <BookOpen size={12} /> },
    expert: { label: 'Chuyên', color: 'text-emerald-700 bg-emerald-50 border-emerald-100', icon: <Zap size={12} /> },
    training: { label: 'Đào tạo', color: 'text-amber-700 bg-amber-50 border-amber-100', icon: <GraduationCap size={12} /> },
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={onClose}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] animate-in fade-in duration-200" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl max-h-[90vh] bg-white rounded-2xl shadow-2xl z-[70] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
          <div className="relative h-32 bg-indigo-600">
            <div className="absolute top-4 right-4 flex gap-2 z-10">
              {isEditing ? (
                <button
                  onClick={handleSave}
                  className="p-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-full transition-colors shadow-lg flex items-center gap-2 px-4"
                >
                  <Save size={18} />
                  <span className="text-sm font-bold">Lưu</span>
                </button>
              ) : (
                <button
                  onClick={() => setIsEditing(true)}
                  className="p-2 bg-white/20 hover:bg-white/30 text-white rounded-full transition-colors flex items-center gap-2 px-4"
                >
                  <Edit2 size={18} />
                  <span className="text-sm font-bold">Sửa tay nghề</span>
                </button>
              )}
              <button
                onClick={onClose}
                className="p-2 bg-white/20 hover:bg-white/30 text-white rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="absolute -bottom-12 left-8">
              <div className="relative w-24 h-24 rounded-2xl overflow-hidden border-4 border-white shadow-lg bg-gray-100">
                <img
                  src={employee.photoUrl}
                  alt={employee.name}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
            </div>
          </div>

          <div className="pt-16 px-8 pb-8 overflow-y-auto">
            <Dialog.Title className="text-2xl font-bold text-gray-900">{editedEmployee.name}</Dialog.Title>
            <Dialog.Description className="sr-only">
              Chi tiết hồ sơ nhân viên {editedEmployee.name}
            </Dialog.Description>

            <div className="flex justify-between items-start mb-6 mt-2">
              <div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-indigo-600 font-bold text-sm tracking-wider">{editedEmployee.code}</span>
                  <span className="text-gray-300">•</span>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${editedEmployee.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-700'
                    }`}>
                    {editedEmployee.status === 'active' ? 'Đang hoạt động' : 'Đã nghỉ'}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-medium text-gray-900">{editedEmployee.position}</div>
                <div className="text-xs text-gray-500 mt-1">{editedEmployee.experience} kinh nghiệm</div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                  <User size={14} /> Thông tin cá nhân
                </h3>
                <div className="space-y-3">
                  <InfoItem label="Ngày sinh" value={editedEmployee.dob} icon={<Calendar size={14} />} isEditing={isEditing} onChange={(val) => updateField('dob', val)} />
                  <InfoItem label="Giới tính" value={editedEmployee.gender} isEditing={isEditing} onChange={(val) => updateField('gender', val)} />
                  <InfoItem label="Số CCCD" value={editedEmployee.idCard} isEditing={isEditing} onChange={(val) => updateField('idCard', val)} />
                  <InfoItem label="Chiều cao" value={editedEmployee.height} icon={<Ruler size={14} />} isEditing={isEditing} onChange={(val) => updateField('height', val)} />
                  <InfoItem label="Cân nặng" value={editedEmployee.weight} icon={<Weight size={14} />} isEditing={isEditing} onChange={(val) => updateField('weight', val)} />
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                  <Phone size={14} /> Liên lạc & Tài chính
                </h3>
                <div className="space-y-3">
                  <InfoItem label="Số điện thoại" value={editedEmployee.phone} icon={<Phone size={14} />} isEditing={isEditing} onChange={(val) => updateField('phone', val)} />
                  <InfoItem label="Email" value={editedEmployee.email} icon={<Mail size={14} />} isEditing={isEditing} onChange={(val) => updateField('email', val)} />
                  <InfoItem label="STK Ngân hàng" value={editedEmployee.bankAccount} icon={<CreditCard size={14} />} isEditing={isEditing} onChange={(val) => updateField('bankAccount', val)} />
                  <InfoItem label="Ngân hàng" value={editedEmployee.bankName} isEditing={isEditing} onChange={(val) => updateField('bankName', val)} />
                  <InfoItem label="Ngày vào làm" value={editedEmployee.joinDate} icon={<Briefcase size={14} />} isEditing={isEditing} onChange={(val) => updateField('joinDate', val)} />
                </div>
              </div>
            </div>

            <div className="mt-8">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2 mb-4">
                <Key size={14} /> Thông tin cấp quyền (Hệ thống)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 p-4 rounded-xl border border-gray-100">
                <InfoItem label="Tên đăng nhập (ID)" value={editedEmployee.username || editedEmployee.code} isEditing={false} />
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <div className="text-[10px] text-gray-400 font-medium uppercase">Mật khẩu hiện tại</div>
                    <div className="text-sm text-gray-900 font-medium font-mono">
                      {editedEmployee.password || '---'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Role Selection */}
              <div className="mt-4 p-4 bg-indigo-50/50 rounded-xl border border-indigo-100">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Shield size={14} className="text-indigo-600" />
                    <span className="text-xs font-bold text-indigo-900 uppercase tracking-widest">Vai trò hệ thống</span>
                  </div>
                  {isSavingRole && (
                    <div className="w-4 h-4 rounded-full border-2 border-indigo-300 border-t-indigo-600 animate-spin" />
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {ROLE_OPTIONS.map(opt => {
                    const isSelected = selectedRole === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={async () => {
                          if (isSelected || !editedEmployee) return;
                          setSelectedRole(opt.value);
                          setIsSavingRole(true);
                          const res = await updateEmployeeRole(editedEmployee.id, opt.value);
                          if (res.success) {
                            // Update local state
                            setEditedEmployee(prev => prev ? { ...prev, userRole: opt.value } as any : null);
                          } else {
                            alert('Lỗi khi đổi role: ' + res.error);
                            setSelectedRole((editedEmployee as any)?.userRole || 'TECHNICIAN');
                          }
                          setIsSavingRole(false);
                        }}
                        className={`px-4 py-2 rounded-lg text-sm font-bold border-2 transition-all ${
                          isSelected
                            ? `${opt.color} border-current shadow-sm scale-105`
                            : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-gray-500 mt-2">Vai trò quyết định giao diện khi đăng nhập. Quyền chi tiết được tùy chỉnh ở trang Phân Quyền.</p>
              </div>
            </div>

            <div className="mt-8">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                  <Award size={14} /> Kỹ năng chuyên môn
                </h3>
                {isEditing && (
                  <span className="text-[10px] text-indigo-600 font-bold animate-pulse">
                    ĐANG CHỈNH SỬA - Bấm vào kỹ năng để chuyển đổi cấp độ
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {(Object.entries(editedEmployee.skills) as [keyof Employee['skills'], SkillLevel][]).map(([key, level]) => {
                  const info = levelInfo[level];
                  return (
                    <button
                      key={key}
                      onClick={() => toggleSkill(key)}
                      disabled={!isEditing}
                      className={`flex flex-col gap-1 p-2 rounded-lg border text-left transition-all ${info.color} ${isEditing ? 'hover:border-indigo-400 hover:shadow-sm cursor-pointer' : 'cursor-default'}`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="text-xs font-bold truncate">{skillLabels[key]}</span>
                        {info.icon}
                      </div>
                      <span className="text-[10px] font-medium uppercase tracking-wider opacity-80">{info.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function InfoItem({
  label,
  value,
  icon,
  isEditing,
  onChange
}: {
  label: string,
  value: string | number,
  icon?: React.ReactNode,
  isEditing?: boolean,
  onChange?: (val: string) => void
}) {
  return (
    <div className="flex items-start gap-3">
      {icon && <div className="mt-0.5 text-gray-400">{icon}</div>}
      <div className="flex-1">
        <div className="text-[10px] text-gray-400 font-medium uppercase">{label}</div>
        {isEditing && onChange ? (
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full text-sm font-medium text-gray-900 border-b border-indigo-300 focus:border-indigo-600 outline-none bg-transparent py-0.5"
          />
        ) : (
          <div className="text-sm text-gray-900 font-medium">{value}</div>
        )}
      </div>
    </div>
  );
}

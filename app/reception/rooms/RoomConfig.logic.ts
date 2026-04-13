import { useState, useEffect, useCallback } from 'react';

// 🔧 MASTER PROCEDURE STEPS (Admin picks from these)
export const MASTER_PREP_STEPS = [
    'Vệ sinh máy lạnh & quạt',
    'Chuẩn bị tinh dầu & dụng cụ',
    'Setup giường (Khăn, gối)',
    'Chuẩn bị khăn nóng',
    'Kiểm tra vệ sinh phòng',
    'Bật đèn & chỉnh ánh sáng',
    'Mở nhạc thư giãn',
    'Kiểm tra nước nóng',
    'Chuẩn bị áo choàng khách',
    'Xịt tinh dầu khuếch tán',
];

export const MASTER_CLEAN_STEPS = [
    'Thu gom khăn bẩn & rác',
    'Vệ sinh bồn bệ & dụng cụ',
    'Sắp xếp lại gối, nệm',
    'Xịt tinh dầu khử mùi',
    'Lau sàn phòng',
    'Thay ga trải giường',
    'Vệ sinh toilet',
    'Kiểm tra thiết bị điện',
    'Bổ sung nước uống',
    'Kiểm tra quên đồ khách',
];

export interface RoomData {
    id: string;
    name: string;
    capacity: number;
    type: string;
    prep_procedure: string[] | null;
    clean_procedure: string[] | null;
    allowed_services: string[] | null;
}

export interface ServiceData {
    id: string;
    code: string;
    nameVN: string;
    nameEN: string;
    category: string;
    duration: number;
}

export const useRoomConfig = () => {
    const [rooms, setRooms] = useState<RoomData[]>([]);
    const [services, setServices] = useState<ServiceData[]>([]);
    const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [activeTab, setActiveTab] = useState<'services' | 'prep' | 'clean'>('services');

    const selectedRoom = rooms.find(r => r.id === selectedRoomId) || null;

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await fetch('/api/rooms');
            const json = await res.json();
            if (json.success) {
                setRooms(json.data.rooms || []);
                setServices(json.data.services || []);
                // Auto-select first room
                if (!selectedRoomId && json.data.rooms?.length > 0) {
                    setSelectedRoomId(json.data.rooms[0].id);
                }
            }
        } catch (err) {
            console.error('Error fetching rooms:', err);
        } finally {
            setIsLoading(false);
        }
    }, [selectedRoomId]);

    useEffect(() => {
        fetchData();
    }, []);

    const updateRoom = async (roomId: string, updates: Partial<Pick<RoomData, 'prep_procedure' | 'clean_procedure' | 'allowed_services'>>) => {
        setIsSaving(true);
        try {
            const res = await fetch('/api/rooms', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ roomId, ...updates })
            });
            const json = await res.json();
            if (json.success) {
                // Update local state
                setRooms(prev => prev.map(r => r.id === roomId ? { ...r, ...updates } : r));
                return true;
            } else {
                alert('Lỗi lưu: ' + (json.error || 'Unknown'));
                return false;
            }
        } catch (err) {
            console.error('Error updating room:', err);
            alert('Lỗi kết nối!');
            return false;
        } finally {
            setIsSaving(false);
        }
    };

    // Toggle a service for the selected room
    const toggleService = async (serviceId: string) => {
        if (!selectedRoom) return;
        const current = selectedRoom.allowed_services || [];
        const updated = current.includes(serviceId)
            ? current.filter(id => id !== serviceId)
            : [...current, serviceId];
        await updateRoom(selectedRoom.id, { allowed_services: updated });
    };

    // Toggle a prep step for the selected room
    const togglePrepStep = async (step: string) => {
        if (!selectedRoom) return;
        const current = selectedRoom.prep_procedure || [];
        const updated = current.includes(step)
            ? current.filter(s => s !== step)
            : [...current, step];
        await updateRoom(selectedRoom.id, { prep_procedure: updated });
    };

    // Toggle a clean step for the selected room
    const toggleCleanStep = async (step: string) => {
        if (!selectedRoom) return;
        const current = selectedRoom.clean_procedure || [];
        const updated = current.includes(step)
            ? current.filter(s => s !== step)
            : [...current, step];
        await updateRoom(selectedRoom.id, { clean_procedure: updated });
    };

    // Select/Deselect all
    const selectAllPrepSteps = async () => {
        if (!selectedRoom) return;
        await updateRoom(selectedRoom.id, { prep_procedure: [...MASTER_PREP_STEPS] });
    };

    const selectAllCleanSteps = async () => {
        if (!selectedRoom) return;
        await updateRoom(selectedRoom.id, { clean_procedure: [...MASTER_CLEAN_STEPS] });
    };

    const clearAllPrepSteps = async () => {
        if (!selectedRoom) return;
        await updateRoom(selectedRoom.id, { prep_procedure: [] });
    };

    const clearAllCleanSteps = async () => {
        if (!selectedRoom) return;
        await updateRoom(selectedRoom.id, { clean_procedure: [] });
    };

    // Toggle entire category of services (add all / remove all)
    const toggleCategoryServices = async (serviceIds: string[], action: 'add' | 'remove') => {
        if (!selectedRoom) return;
        const current = selectedRoom.allowed_services || [];
        let updated: string[];
        if (action === 'add') {
            const toAdd = serviceIds.filter(id => !current.includes(id));
            updated = [...current, ...toAdd];
        } else {
            updated = current.filter(id => !serviceIds.includes(id));
        }
        await updateRoom(selectedRoom.id, { allowed_services: updated });
    };

    // Add custom step to a procedure
    const addCustomPrepStep = async (step: string) => {
        if (!selectedRoom) return;
        const current = selectedRoom.prep_procedure || [];
        await updateRoom(selectedRoom.id, { prep_procedure: [...current, step] });
    };

    const addCustomCleanStep = async (step: string) => {
        if (!selectedRoom) return;
        const current = selectedRoom.clean_procedure || [];
        await updateRoom(selectedRoom.id, { clean_procedure: [...current, step] });
    };

    // Remove a step from a procedure (works for both master & custom steps)
    const removeCustomPrepStep = async (step: string) => {
        if (!selectedRoom) return;
        const current = selectedRoom.prep_procedure || [];
        await updateRoom(selectedRoom.id, { prep_procedure: current.filter(s => s !== step) });
    };

    const removeCustomCleanStep = async (step: string) => {
        if (!selectedRoom) return;
        const current = selectedRoom.clean_procedure || [];
        await updateRoom(selectedRoom.id, { clean_procedure: current.filter(s => s !== step) });
    };

    // Edit (rename) a step in a procedure
    const editPrepStep = async (oldStep: string, newStep: string) => {
        if (!selectedRoom) return;
        const current = selectedRoom.prep_procedure || [];
        await updateRoom(selectedRoom.id, { prep_procedure: current.map(s => s === oldStep ? newStep : s) });
    };

    const editCleanStep = async (oldStep: string, newStep: string) => {
        if (!selectedRoom) return;
        const current = selectedRoom.clean_procedure || [];
        await updateRoom(selectedRoom.id, { clean_procedure: current.map(s => s === oldStep ? newStep : s) });
    };

    // Group services by category
    const servicesByCategory = services.reduce((acc, svc) => {
        const cat = svc.category || 'Khác';
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(svc);
        return acc;
    }, {} as Record<string, ServiceData[]>);

    return {
        rooms,
        services,
        servicesByCategory,
        selectedRoom,
        selectedRoomId,
        setSelectedRoomId,
        isLoading,
        isSaving,
        activeTab,
        setActiveTab,
        toggleService,
        toggleCategoryServices,
        togglePrepStep,
        toggleCleanStep,
        selectAllPrepSteps,
        selectAllCleanSteps,
        clearAllPrepSteps,
        clearAllCleanSteps,
        addCustomPrepStep,
        addCustomCleanStep,
        removeCustomPrepStep,
        removeCustomCleanStep,
        editPrepStep,
        editCleanStep,
    };
};

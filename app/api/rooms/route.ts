import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * API Quản lý Phòng
 * GET /api/rooms — Lấy danh sách phòng + config + dịch vụ
 * PATCH /api/rooms — Cập nhật config cho 1 phòng
 */

export async function GET() {
    try {
        const supabase = getSupabaseAdmin();
        if (!supabase) {
            return NextResponse.json({ success: false, error: 'Supabase not initialized' }, { status: 500 });
        }

        // Fetch all rooms with procedures & allowed services
        const { data: rooms, error } = await supabase
            .from('Rooms')
            .select('id, name, capacity, type, prep_procedure, clean_procedure, allowed_services, created_at')
            .order('name', { ascending: true });

        if (error) throw error;

        // Fetch all active services for the service picker
        const { data: services, error: svcError } = await supabase
            .from('Services')
            .select('id, code, nameVN, nameEN, category, duration, isActive')
            .eq('isActive', true)
            .order('category', { ascending: true });

        if (svcError) console.error('Error fetching services:', svcError);

        return NextResponse.json({
            success: true,
            data: {
                rooms: rooms || [],
                services: services || []
            }
        });
    } catch (error: any) {
        console.error('API Error (GET /api/rooms):', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export async function PATCH(request: Request) {
    try {
        const body = await request.json();
        const { roomId, prep_procedure, clean_procedure, allowed_services } = body;

        if (!roomId) {
            return NextResponse.json({ success: false, error: 'roomId is required' }, { status: 400 });
        }

        const supabase = getSupabaseAdmin();
        if (!supabase) throw new Error('Supabase admin not initialized');

        // Build update object (only include fields that are provided)
        const updateData: Record<string, any> = { updated_at: new Date().toISOString() };
        if (prep_procedure !== undefined) updateData.prep_procedure = prep_procedure;
        if (clean_procedure !== undefined) updateData.clean_procedure = clean_procedure;
        if (allowed_services !== undefined) updateData.allowed_services = allowed_services;

        const { data, error } = await supabase
            .from('Rooms')
            .update(updateData)
            .eq('id', roomId)
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json({ success: true, data });
    } catch (error: any) {
        console.error('API Error (PATCH /api/rooms):', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

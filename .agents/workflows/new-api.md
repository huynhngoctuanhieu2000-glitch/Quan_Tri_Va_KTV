---
description: Tạo API route mới trong Next.js App Router với Supabase
---

# 🔌 Tạo API Route Mới

> **Trigger**: Khi cần endpoint mới để CRUD data từ Supabase.

## Bước 1: Xác nhận thông tin

- **Resource name**: VD `bookings`, `customers`, `services`
- **Methods cần**: GET / POST / PUT / PATCH / DELETE
- **Cần authentication?** (hầu hết là CÓ)
- **Query params / Body schema**: Liệt kê fields

## Bước 2: Naming convention

```
app/api/[resource-name]/route.ts          # Collection: GET (list), POST (create)
app/api/[resource-name]/[id]/route.ts     # Item: GET (detail), PUT/PATCH (update), DELETE
```

Ví dụ:
```
app/api/bookings/route.ts           → GET /api/bookings, POST /api/bookings
app/api/bookings/[id]/route.ts      → GET /api/bookings/123, PATCH /api/bookings/123
```

## Bước 3: Template — Collection route

```typescript
// app/api/[resource]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';

// GET — List all
export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();
    const { searchParams } = new URL(request.url);
    
    // Pagination
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;

    const { data, error, count } = await supabase
      .from('[table_name]')
      .select('*', { count: 'exact' })
      .range(offset, offset + limit - 1)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ data, total: count, page, limit });
  } catch (error) {
    console.error('[GET /api/[resource]]:', error);
    return NextResponse.json(
      { error: 'Failed to fetch data' },
      { status: 500 }
    );
  }
}

// POST — Create new
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const body = await request.json();

    // Validate required fields
    // ...

    const { data, error } = await supabase
      .from('[table_name]')
      .insert(body)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/[resource]]:', error);
    return NextResponse.json(
      { error: 'Failed to create' },
      { status: 500 }
    );
  }
}
```

## Bước 4: Template — Item route

```typescript
// app/api/[resource]/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';

type Params = { params: Promise<{ id: string }> };

// GET — Detail
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const supabase = createClient();

    const { data, error } = await supabase
      .from('[table_name]')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    if (!data) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('[GET /api/[resource]/[id]]:', error);
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }
}

// PATCH — Update
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const supabase = createClient();
    const body = await request.json();

    const { data, error } = await supabase
      .from('[table_name]')
      .update(body)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (error) {
    console.error('[PATCH /api/[resource]/[id]]:', error);
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}
```

## Bước 5: Checklist cuối cùng

- [ ] Error handling: try/catch + proper HTTP status codes
- [ ] Validation: Check required fields trước khi query
- [ ] Logging: `console.error` với route info để dễ debug
- [ ] Types: Định nghĩa request/response types trong `lib/types.ts`
- [ ] KHÔNG hardcode Supabase URL/Key — dùng `createClient()`

## Bước 6: Thông báo user

> *"API route `/api/[resource]` đã tạo xong. Hãy kiểm tra và commit:*
> *`feat: thêm API [resource]`"*

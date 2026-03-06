'use client';

import React from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/lib/auth-context';
import { ShieldAlert, Construction } from 'lucide-react';

export default function PlaceholderPage({ title }: { title: string }) {
  const { hasPermission } = useAuth();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <AppLayout>
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mb-6">
          <Construction size={40} className="text-indigo-500" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight mb-2">{title}</h1>
        <p className="text-gray-500 max-w-md">
          Module này đang trong quá trình phát triển. Vui lòng quay lại sau!
        </p>
      </div>
    </AppLayout>
  );
}

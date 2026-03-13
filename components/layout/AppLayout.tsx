'use client';

import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { AIAssistant } from '@/components/AIAssistant';
import { useNotifications } from '@/components/NotificationProvider';

export function AppLayout({ children, hideAI = false }: { children: React.ReactNode, hideAI?: boolean }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // Mobile sidebar state
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(true); // Desktop sidebar state
  const [mounted, setMounted] = useState(false);
  const { user } = useAuth();
  const { unlockAudio } = useNotifications();

  const router = useRouter();

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (mounted && !user) {
      router.push('/login');
    }
  }, [mounted, user, router]);

  if (!mounted || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-indigo-600 font-medium">Đang tải...</div>
      </div>
    );
  }

  return (
    <div 
      className="min-h-screen bg-gray-50 flex overflow-hidden font-sans text-gray-900"
      onClick={unlockAudio}
    >
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        isExpanded={isSidebarExpanded}
        onToggleExpand={() => setIsSidebarExpanded(!isSidebarExpanded)}
      />

      <main className="flex-1 overflow-y-auto p-4 lg:p-8">
        {/* Mobile hamburger */}
        <button
          onClick={() => setIsSidebarOpen(true)}
          className="lg:hidden mb-4 p-2 text-gray-600 hover:bg-gray-100 rounded-md"
        >
          <span className="sr-only">Mở Menu</span>
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
        </button>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="max-w-7xl mx-auto"
        >
          {children}
        </motion.div>
      </main>
      {!hideAI && <AIAssistant />}
    </div>
  );
}

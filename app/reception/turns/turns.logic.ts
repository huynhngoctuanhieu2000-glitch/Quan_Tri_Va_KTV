import { useState, useEffect, useCallback } from 'react';

export interface TurnRecord {
  id: string;
  employee_id: string;
  date: string;
  queue_position: number;
  status: 'ready' | 'working' | 'off';
  turns_completed: number;
  lastTurnTime?: string;
  ktvName?: string;
  ktvCode?: string;
}

export const useTurnsLogic = (selectedDate: string) => {
  const [turns, setTurns] = useState<TurnRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchTurns = useCallback(async () => {
    setIsLoading(true);
    try {
      const [turnsRes, staffRes] = await Promise.all([
        fetch(`/api/turns?date=${selectedDate}`).then(r => r.json()),
        fetch('/api/employees').then(r => r.json())
      ]);

      if (turnsRes.success && staffRes.success) {
        const staffMap = new Map((staffRes.data as any[]).map(s => [s.id, s]));
        const mappedTurns = (turnsRes.data as any[]).map(t => {
          const staff = staffMap.get(t.employee_id);
          return {
            ...t,
            ktvName: staff?.full_name || 'Không rõ',
            ktvCode: staff?.id || '---',
            // Map statuses to UI expected ones if needed
            status: t.status === 'waiting' ? 'ready' : (t.status === 'working' ? 'working' : 'off'),
            lastTurnTime: t.estimated_end_time || ''
          };
        });
        setTurns(mappedTurns);
      }
    } catch (error) {
      console.error('Error fetching turns:', error);
    } finally {
      setIsLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    fetchTurns();
  }, [fetchTurns]);

  return {
    turns,
    isLoading,
    refresh: fetchTurns
  };
};

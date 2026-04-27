'use client';
import { useEffect, useState } from 'react';

export function useTripData() {
  const [days, setDays] = useState([]);
  const [ideas, setIdeas] = useState([]);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/trip', { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = await res.json();
        if (!active) return;
        setDays(Array.isArray(body.days) ? body.days : []);
        setIdeas(Array.isArray(body.ideas) ? body.ideas : []);
        setStatus('ok');
      } catch (err) {
        if (!active) return;
        // Fall back to localStorage cache
        try {
          const cached = JSON.parse(window.localStorage.getItem('vp:trip') || 'null');
          if (cached && Array.isArray(cached.days)) {
            setDays(cached.days);
            setIdeas(cached.ideas || []);
            setStatus('cached');
            return;
          }
        } catch {}
        setStatus('error');
      }
    })();
    return () => { active = false; };
  }, []);

  return { days, ideas, status };
}

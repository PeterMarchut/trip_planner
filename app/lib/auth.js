'use client';
import { useEffect, useState } from 'react';

const TOKEN_KEY = 'vp:owner-token';

export function getOwnerToken() {
  if (typeof window === 'undefined') return null;
  try { return window.localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export function setOwnerToken(token) {
  if (typeof window === 'undefined') return;
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

// Hook that exposes the current token and a setter. The token is read on mount
// so SSR doesn't mismatch.
export function useOwnerToken() {
  const [token, setTokenState] = useState(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setTokenState(getOwnerToken());
    setHydrated(true);
  }, []);

  const set = (next) => {
    setOwnerToken(next || null);
    setTokenState(next || null);
  };

  return { token, isOwner: !!token, hydrated, setToken: set };
}

// fetch wrapper that adds the Authorization header when a token is set.
export function authFetch(url, opts = {}) {
  const token = getOwnerToken();
  const headers = { ...(opts.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(url, { ...opts, headers });
}

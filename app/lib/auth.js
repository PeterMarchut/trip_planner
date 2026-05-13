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

// Hook that exposes the current token + whether the server requires auth.
// On a sandbox deployment (no OWNER_TOKEN set on the server), auth-check
// reports configured: false and we treat every visitor as owner so the edit
// UI is fully usable. On a personal/production deployment, owner mode
// requires a matching local token.
export function useOwnerToken() {
  const [token, setTokenState] = useState(null);
  const [hydrated, setHydrated] = useState(false);
  const [serverRequiresAuth, setServerRequiresAuth] = useState(true);

  useEffect(() => {
    setTokenState(getOwnerToken());
    fetch('/api/auth/check')
      .then(r => r.json())
      .then(data => setServerRequiresAuth(data?.configured !== false))
      .catch(() => {});
    setHydrated(true);
  }, []);

  const set = (next) => {
    setOwnerToken(next || null);
    setTokenState(next || null);
  };

  // Anyone on a sandbox (server says no auth required) is an owner.
  // Otherwise, owner-mode requires a local token.
  const isOwner = !serverRequiresAuth || !!token;

  return { token, isOwner, hydrated, setToken: set, serverRequiresAuth };
}

// fetch wrapper that adds the Authorization header when a token is set.
export function authFetch(url, opts = {}) {
  const token = getOwnerToken();
  const headers = { ...(opts.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(url, { ...opts, headers });
}

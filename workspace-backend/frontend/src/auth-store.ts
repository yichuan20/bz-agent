/**
 * Minimal JWT auth store backed by localStorage.
 * Dispatches 'bz-auth-changed' so React hooks re-render within the same tab.
 */
import { useSyncExternalStore } from 'react';

const TOKEN_KEY = 'bz_access_token';

// ── Storage helpers ───────────────────────────────────────────────────────────

export function getAccessToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAccessToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  window.dispatchEvent(new Event('bz-auth-changed'));
}

export function clearAccessToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  window.dispatchEvent(new Event('bz-auth-changed'));
}

export function isLoggedIn(): boolean {
  return !!getAccessToken();
}

// ── React hook ────────────────────────────────────────────────────────────────

function subscribe(callback: () => void) {
  window.addEventListener('bz-auth-changed', callback);
  window.addEventListener('storage', callback); // cross-tab sync
  return () => {
    window.removeEventListener('bz-auth-changed', callback);
    window.removeEventListener('storage', callback);
  };
}

export function useIsLoggedIn(): boolean {
  return useSyncExternalStore(subscribe, isLoggedIn);
}

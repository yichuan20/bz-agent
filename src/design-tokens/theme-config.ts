export type ThemeMode = 'light' | 'dark';

export function applyTheme(mode: ThemeMode): void {
  if (mode === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  localStorage.setItem('bz-theme-mode', mode);
}

export function getCurrentMode(): ThemeMode {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

export function getSystemMode(): ThemeMode {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function initializeTheme(): void {
  const saved = localStorage.getItem('bz-theme-mode') as ThemeMode | null;
  applyTheme(saved ?? getSystemMode());
}

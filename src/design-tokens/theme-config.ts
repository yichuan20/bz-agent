export type ThemeMode = 'light' | 'dark';

export function applyTheme(mode: ThemeMode): void {
  const el = document.documentElement;
  el.classList.add('theme-switching');
  // Force a reflow so the browser registers the transition before the theme flip.
  // Without this, the class addition and attribute change batch into one recalc
  // and elements that had no prior transition skip the animation entirely.
  void el.offsetHeight;
  if (mode === 'dark') {
    el.setAttribute('data-theme', 'dark');
  } else {
    el.removeAttribute('data-theme');
  }
  localStorage.setItem('bz-theme-mode', mode);
  setTimeout(() => el.classList.remove('theme-switching'), 100);
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

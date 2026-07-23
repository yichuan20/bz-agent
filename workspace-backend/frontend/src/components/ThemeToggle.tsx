import { MoonIcon, SunIcon } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { applyTheme, getCurrentMode, type ThemeMode } from '#/design-tokens';

export default function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>(getCurrentMode);

  useEffect(() => {
    const handleChange = () => setMode(getCurrentMode());
    window.addEventListener('themechange', handleChange);
    return () => window.removeEventListener('themechange', handleChange);
  }, []);

  function toggleMode() {
    const next: ThemeMode = mode === 'light' ? 'dark' : 'light';
    applyTheme(next);
    setMode(next);
    window.dispatchEvent(new Event('themechange'));
  }

  const Icon = mode === 'dark' ? MoonIcon : SunIcon;
  const label = `Switch to ${mode === 'dark' ? 'light' : 'dark'} mode`;

  return (
    <button
      type="button"
      onClick={toggleMode}
      aria-label={label}
      title={label}
      className="theme-toggle"
    >
      <Icon size={16} />
    </button>
  );
}

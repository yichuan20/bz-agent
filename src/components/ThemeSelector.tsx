import { useEffect, useState } from 'react';
import { applyTheme, getCurrentMode, type ThemeMode } from '#/design-tokens';

interface ThemeSelectorProps {
  onModeChange?: (mode: ThemeMode) => void;
}

export default function ThemeSelector({ onModeChange }: ThemeSelectorProps) {
  const [mode, setMode] = useState<ThemeMode>(getCurrentMode);

  useEffect(() => {
    const handleChange = () => setMode(getCurrentMode());
    window.addEventListener('themechange', handleChange);
    return () => window.removeEventListener('themechange', handleChange);
  }, []);

  function handleModeChange(next: ThemeMode) {
    applyTheme(next);
    setMode(next);
    onModeChange?.(next);
    window.dispatchEvent(new Event('themechange'));
  }

  const modes: ThemeMode[] = ['light', 'dark'];

  return (
    <div>
      <p
        style={{
          marginBottom: '8px',
          fontSize: '13px',
          color: 'var(--text-secondary)',
          fontWeight: 600,
        }}
      >
        Appearance
      </p>
      <div className="flex-row">
        {modes.map(m => (
          <button
            key={m}
            type="button"
            onClick={() => handleModeChange(m)}
            className={m === mode ? 'btn-primary btn-small' : 'btn-secondary btn-small'}
          >
            {m.charAt(0).toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>
    </div>
  );
}

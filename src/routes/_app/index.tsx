import { ArrowUpIcon } from '@phosphor-icons/react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useRef, useState } from 'react';
import { MODE_COLORS, ModeIconSvg } from '#/components/ModeIconSvg';
import type { AgentMode } from '#/lib/agentModes';

export const Route = createFileRoute('/_app/')({
  component: Home,
});

const MODE_PILLS: { mode: AgentMode; label: string; icon: string }[] = [
  { mode: 'general', label: 'General', icon: 'chat' },
  { mode: 'widget', label: 'Widget', icon: 'canvas' },
  { mode: 'worker', label: 'Worker', icon: 'document' },
  { mode: 'coder', label: 'Coder', icon: 'code' },
];

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function Home() {
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const [selectedMode, setSelectedMode] = useState<AgentMode>('general');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 180) + 'px';
  }

  function startSession() {
    if (input.trim()) sessionStorage.setItem('agent:pendingMessage', input.trim());
    void navigate({ to: '/agent', search: { mode: selectedMode, isNew: true } as never });
  }

  return (
    <div className="agent-home-page">
      <div className="agent-home-center">
        <h1 className="agent-home-greeting">{getGreeting()}</h1>

        <div className="agent-home-input-card">
          <textarea
            ref={textareaRef}
            className="agent-home-input"
            placeholder="Ask the agent…"
            value={input}
            rows={1}
            onChange={handleInput}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                startSession();
              }
            }}
          />
          <div className="agent-home-input-bar">
            <div className="agent-home-mode-pills">
              {MODE_PILLS.map(({ mode, label, icon }) => (
                <button
                  key={mode}
                  type="button"
                  className={`agent-home-mode-pill${selectedMode === mode ? ' agent-home-mode-pill--active' : ''}`}
                  style={{ color: MODE_COLORS[icon] }}
                  onClick={() => setSelectedMode(mode)}
                >
                  <ModeIconSvg iconKey={icon} size={13} />
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className={`agent-home-send${input.trim() ? ' agent-home-send--active' : ''}`}
              disabled={!input.trim()}
              onClick={startSession}
            >
              <ArrowUpIcon size={14} weight="bold" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

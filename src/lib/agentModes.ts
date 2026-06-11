export type AgentMode = 'general' | 'widget' | 'worker' | 'coder';

export const AGENT_MODES: AgentMode[] = ['general', 'widget', 'worker', 'coder'];

export type ModeConfig = {
  label:       string;
  icon:        string;
  description: string;
  identity:    string;
};

/** Emoji for each icon key defined in agent_modes.json */
export const MODE_ICONS: Record<string, string> = {
  chat:     '💬',
  canvas:   '🎨',
  document: '📄',
  code:     '💻',
};

/** Fallback used before /agent-modes responds */
export const MODE_FALLBACK: Record<AgentMode, ModeConfig> = {
  general: { label: 'General', icon: 'chat',     description: 'Generic Q&A with file access and internet search', identity: '' },
  widget:  { label: 'Widget',  icon: 'canvas',   description: 'Widget and mini-app development',                  identity: '' },
  worker:  { label: 'Worker',  icon: 'document', description: 'Document review and knowledge work',               identity: '' },
  coder:   { label: 'Coder',   icon: 'code',     description: 'Code projects and deployment',                     identity: '' },
};

/** localStorage key for persisting mode per session */
export function modeLSKey(sessionId: string): string {
  return `bz-agent-mode:${sessionId}`;
}

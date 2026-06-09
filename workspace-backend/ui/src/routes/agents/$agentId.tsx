import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';

// ── Types ────────────────────────────────────────────────────────────────────

type AssistantBlock = { type: 'text' | 'thinking'; text: string };

type DisplayMessage =
  | { id: string; kind: 'user'; text: string }
  | { id: string; kind: 'assistant'; blocks: AssistantBlock[] }
  | {
      id: string;
      kind: 'tool';
      toolUseId: string;
      name: string;
      status: 'running' | 'done' | 'error';
      input: unknown;
      output?: string;
      isError?: boolean;
    };

type PermissionPrompt = {
  requestId: string;
  tool: string;
  input: unknown;
};

type SessionMode = 'default' | 'plan' | 'yolo';

type StreamingBlocks = Map<number, { type: string; content: string }>;
type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

const MODE_META: Record<SessionMode, { label: string; color: string }> = {
  default: { label: 'Default', color: 'var(--color-primary)' },
  plan: { label: 'Plan', color: '#e67e22' },
  yolo: { label: 'YOLO', color: '#e74c3c' },
};

export const Route = createFileRoute('/agents/$agentId')({
  component: AgentChatPage,
});

let msgCounter = 0;
function uid() {
  return `msg-${++msgCounter}-${Math.random().toString(36).slice(2, 8)}`;
}

function streamingToBlocks(map: StreamingBlocks): AssistantBlock[] {
  const result: AssistantBlock[] = [];
  for (const [, b] of [...map.entries()].sort(([a], [c]) => a - c)) {
    if ((b.type === 'text' || b.type === 'thinking') && b.content) {
      result.push({ type: b.type as 'text' | 'thinking', text: b.content });
    }
  }
  return result;
}

function bzBlocksToAssistantBlocks(content: unknown[]): AssistantBlock[] {
  const result: AssistantBlock[] = [];
  for (const b of content as Array<{ type: string; text?: string; thinking?: string }>) {
    if (b.type === 'text' && b.text) result.push({ type: 'text', text: b.text });
    else if (b.type === 'thinking' && b.thinking)
      result.push({ type: 'thinking', text: b.thinking });
  }
  return result;
}

// ── Sub-components ───────────────────────────────────────────────────────────

function CollapsibleOutput({ text, isError }: { text: string; isError?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const lines = text.split('\n');
  const PREVIEW = 4;
  const shown = expanded ? lines : lines.slice(0, PREVIEW);
  const hidden = lines.length - PREVIEW;

  return (
    <div>
      <pre
        style={{
          margin: 0,
          padding: '6px 8px',
          fontSize: '11px',
          fontFamily: 'var(--font-mono)',
          lineHeight: '1.5',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          color: isError ? 'var(--color-error)' : 'var(--color-text-muted)',
          background: 'var(--color-bg)',
          borderRadius: '4px',
        }}
      >
        {shown.join('\n')}
        {!expanded && hidden > 0 && <span style={{ opacity: 0.5 }}> ...</span>}
      </pre>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(e => !e)}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--color-primary)',
            fontSize: '11px',
            cursor: 'pointer',
            padding: '2px 0',
          }}
        >
          {expanded ? '▲ Show less' : `▼ Show ${hidden} more line${hidden === 1 ? '' : 's'}`}
        </button>
      )}
    </div>
  );
}

function ToolCard({ item }: { item: Extract<DisplayMessage, { kind: 'tool' }> }) {
  const [open, setOpen] = useState(true);

  const inputStr =
    item.input == null
      ? ''
      : typeof item.input === 'object'
        ? Object.entries(item.input as Record<string, string>)
            .map(([k, v]) => `${k}: ${v}`)
            .join('\n')
        : String(item.input);

  const statusIcon =
    item.status === 'running'
      ? '⟳'
      : item.status === 'done' && item.isError
        ? '✗'
        : item.status === 'done'
          ? '✓'
          : '⚠';

  const statusColor =
    item.status === 'running'
      ? 'var(--color-text-muted)'
      : item.status === 'done' && !item.isError
        ? 'var(--color-success)'
        : 'var(--color-error)';

  return (
    <div
      style={{
        borderRadius: '8px',
        border: '1px solid var(--color-border)',
        background: 'var(--color-tool-bg)',
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          width: '100%',
          padding: '8px 12px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          color: 'var(--color-text)',
          fontSize: '12px',
          fontFamily: 'var(--font-mono)',
        }}
      >
        <span style={{ color: statusColor, fontSize: '13px', width: '16px', textAlign: 'center' }}>
          {statusIcon}
        </span>
        <span style={{ flex: 1, fontWeight: 500 }}>{item.name}</span>
        <span
          style={{
            fontSize: '10px',
            color: 'var(--color-text-muted)',
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 150ms',
          }}
        >
          ▾
        </span>
      </button>

      {open && (
        <div
          style={{ padding: '0 12px 10px', display: 'flex', flexDirection: 'column', gap: '6px' }}
        >
          <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
            <span
              style={{
                fontSize: '9px',
                fontWeight: 700,
                padding: '1px 4px',
                borderRadius: '3px',
                background: 'rgba(108, 138, 255, 0.15)',
                color: 'var(--color-primary)',
                flexShrink: 0,
                marginTop: '2px',
              }}
            >
              IN
            </span>
            <pre
              style={{
                margin: 0,
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                lineHeight: '1.4',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                color: 'var(--color-text-muted)',
                flex: 1,
              }}
            >
              {inputStr || '(no input)'}
            </pre>
          </div>

          {(item.output !== undefined || item.status === 'running') && (
            <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
              <span
                style={{
                  fontSize: '9px',
                  fontWeight: 700,
                  padding: '1px 4px',
                  borderRadius: '3px',
                  background: 'rgba(52, 211, 153, 0.15)',
                  color: 'var(--color-success)',
                  flexShrink: 0,
                  marginTop: '2px',
                }}
              >
                OUT
              </span>
              {item.status === 'running' ? (
                <span
                  style={{
                    fontSize: '11px',
                    color: 'var(--color-text-muted)',
                    fontStyle: 'italic',
                  }}
                >
                  running...
                </span>
              ) : (
                <div style={{ flex: 1 }}>
                  <CollapsibleOutput text={item.output ?? ''} isError={item.isError} />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PermissionCard({
  prompt,
  mode,
  onRespond,
}: {
  prompt: PermissionPrompt;
  mode: SessionMode;
  onRespond: (requestId: string, behavior: 'allow' | 'deny' | 'always') => void;
}) {
  const inputStr =
    prompt.input == null
      ? ''
      : typeof prompt.input === 'object'
        ? Object.values(prompt.input as Record<string, string>).join(' ')
        : String(prompt.input);

  return (
    <div
      style={{
        padding: '12px 16px',
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: '8px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
        <span>Allow</span>
        <strong>{prompt.tool}</strong>
        <span>to run?</span>
      </div>
      {inputStr && (
        <pre
          style={{
            margin: 0,
            padding: '8px',
            fontSize: '11px',
            fontFamily: 'var(--font-mono)',
            background: 'var(--color-bg)',
            borderRadius: '4px',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            color: 'var(--color-text-muted)',
            maxHeight: '120px',
            overflowY: 'auto',
          }}
        >
          {inputStr}
        </pre>
      )}
      <div style={{ display: 'flex', gap: '6px' }}>
        <button
          type="button"
          onClick={() => onRespond(prompt.requestId, 'allow')}
          style={{
            padding: '5px 12px',
            fontSize: '12px',
            fontWeight: 500,
            color: '#fff',
            background: MODE_META[mode].color,
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
          }}
        >
          Allow once
        </button>
        <button
          type="button"
          onClick={() => onRespond(prompt.requestId, 'always')}
          style={{
            padding: '5px 12px',
            fontSize: '12px',
            fontWeight: 500,
            color: 'var(--color-text)',
            background: 'transparent',
            border: '1px solid var(--color-border)',
            borderRadius: '5px',
            cursor: 'pointer',
          }}
        >
          Always allow
        </button>
        <button
          type="button"
          onClick={() => onRespond(prompt.requestId, 'deny')}
          style={{
            padding: '5px 12px',
            fontSize: '12px',
            fontWeight: 500,
            color: 'var(--color-error)',
            background: 'transparent',
            border: '1px solid var(--color-border)',
            borderRadius: '5px',
            cursor: 'pointer',
          }}
        >
          Deny
        </button>
      </div>
    </div>
  );
}

function StreamingIndicator() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 0',
        color: 'var(--color-text-muted)',
        fontSize: '13px',
      }}
    >
      <span
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          background: 'var(--color-primary)',
          animation: 'pulse 1.2s ease-in-out infinite',
        }}
      />
      <span>Responding...</span>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

function AgentChatPage() {
  const { agentId } = Route.useParams();
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [streamingBlocks, setStreamingBlocks] = useState<AssistantBlock[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [input, setInput] = useState('');
  const [connStatus, setConnStatus] = useState<ConnectionStatus>('connecting');
  const [mode, setMode] = useState<SessionMode>('default');
  const [availableModes, setAvailableModes] = useState<SessionMode[]>(['default', 'plan', 'yolo']);
  const [pendingPermission, setPendingPermission] = useState<PermissionPrompt | null>(null);
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const streamingBlocksRef = useRef<StreamingBlocks>(new Map());
  const streamingRafRef = useRef<number | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  });

  function sendRaw(msg: object) {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/agents/${encodeURIComponent(agentId)}/chat`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => setConnStatus('connected');
    ws.onclose = () => setConnStatus('disconnected');
    ws.onerror = () => setConnStatus('error');

    ws.onmessage = event => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(event.data as string) as Record<string, unknown>;
      } catch {
        return;
      }

      const type = msg.type as string;

      if (type === 'session') {
        if (Array.isArray(msg.modes)) setAvailableModes(msg.modes as SessionMode[]);
      } else if (type === 'status') {
        const s = msg.status as string;
        if (s === 'running') {
          setIsStreaming(true);
          streamingBlocksRef.current.clear();
          setStreamingBlocks([]);
        } else if (s === 'idle') {
          setIsStreaming(false);
          streamingBlocksRef.current.clear();
          setStreamingBlocks([]);
          if (msg.mode) setMode(msg.mode as SessionMode);
        }
      } else if (type === 'delta') {
        if (msg.field === 'signature' || msg.blockType === 'toolUse') return;
        const idx = msg.blockIndex as number;
        const existing = streamingBlocksRef.current.get(idx) ?? {
          type: msg.blockType as string,
          content: '',
        };
        existing.content += msg.content as string;
        streamingBlocksRef.current.set(idx, existing);

        if (streamingRafRef.current === null) {
          streamingRafRef.current = requestAnimationFrame(() => {
            streamingRafRef.current = null;
            setStreamingBlocks(streamingToBlocks(streamingBlocksRef.current));
          });
        }
      } else if (type === 'assistant') {
        const blocks = bzBlocksToAssistantBlocks(msg.content as unknown[]);
        streamingBlocksRef.current.clear();
        setStreamingBlocks([]);
        if (blocks.length) {
          setMessages(prev => {
            const last = prev[prev.length - 1];
            if (last?.kind === 'assistant') {
              return [...prev.slice(0, -1), { id: uid(), kind: 'assistant', blocks }];
            }
            return [...prev, { id: uid(), kind: 'assistant', blocks }];
          });
        }
      } else if (type === 'tool') {
        const toolUseId = msg.toolUseId as string;
        const status = msg.status as 'running' | 'done' | 'error';
        setMessages(prev => {
          const idx = prev.findIndex(
            i =>
              i.kind === 'tool' &&
              (i as Extract<DisplayMessage, { kind: 'tool' }>).toolUseId === toolUseId,
          );
          if (idx >= 0) {
            const updated = { ...prev[idx] } as Extract<DisplayMessage, { kind: 'tool' }>;
            updated.status = status;
            if (status === 'done') {
              updated.output = msg.content as string;
              updated.isError = msg.isError as boolean;
            } else if (status === 'error') {
              updated.output = msg.message as string;
              updated.isError = true;
            }
            return [...prev.slice(0, idx), updated, ...prev.slice(idx + 1)];
          }
          return [
            ...prev,
            {
              id: uid(),
              kind: 'tool',
              toolUseId,
              name: msg.name as string,
              status,
              input: msg.input,
            },
          ];
        });
      } else if (type === 'prompt') {
        const subtype = msg.subtype as string;
        if (subtype === 'permission') {
          setPendingPermission({
            requestId: msg.requestId as string,
            tool: msg.tool as string,
            input: msg.input,
          });
        }
      } else if (type === 'result') {
        const output = msg.output as string | undefined;
        const error = msg.error as string | undefined;
        if (msg.status === 'success' && output) {
          setMessages(prev => [
            ...prev,
            { id: uid(), kind: 'assistant', blocks: [{ type: 'text', text: output }] },
          ]);
        } else if (msg.status === 'error' && error) {
          setMessages(prev => [
            ...prev,
            { id: uid(), kind: 'assistant', blocks: [{ type: 'text', text: `Error: ${error}` }] },
          ]);
        }
      }
    };

    return () => ws.close();
  }, [agentId]);

  function handlePermission(requestId: string, behavior: 'allow' | 'deny' | 'always') {
    sendRaw({ type: 'user', subtype: 'permission', requestId, behavior });
    setPendingPermission(null);
  }

  function handleModeChange(m: SessionMode) {
    setMode(m);
    setModeMenuOpen(false);
    sendRaw({ type: 'setMode', mode: m });
  }

  function handleSend() {
    const text = input.trim();
    if (!text || connStatus !== 'connected') return;

    setMessages(prev => [...prev, { id: uid(), kind: 'user', text }]);
    sendRaw({ type: 'user', content: text });
    setInput('');
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const statusColor: Record<ConnectionStatus, string> = {
    connecting: 'var(--color-text-muted)',
    connected: 'var(--color-success)',
    disconnected: 'var(--color-text-muted)',
    error: 'var(--color-error)',
  };

  const allItems: (DisplayMessage | { id: string; kind: 'streaming'; blocks: AssistantBlock[] })[] =
    isStreaming && streamingBlocks.length > 0
      ? [...messages, { id: '__streaming__', kind: 'streaming' as const, blocks: streamingBlocks }]
      : [...messages];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div
        style={{
          padding: '8px 16px',
          borderBottom: '1px solid var(--color-border)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          flexShrink: 0,
        }}
      >
        <Link
          to="/agents"
          style={{ color: 'var(--color-text-muted)', textDecoration: 'none', fontSize: '13px' }}
        >
          &larr; Agents
        </Link>
        <span
          style={{
            fontSize: '13px',
            fontFamily: 'var(--font-mono)',
            color: 'var(--color-text-muted)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
          }}
        >
          {agentId}
        </span>

        {/* Mode switcher */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setModeMenuOpen(o => !o)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '3px 10px',
              fontSize: '11px',
              fontWeight: 500,
              color: MODE_META[mode].color,
              background: 'transparent',
              border: `1px solid ${MODE_META[mode].color}`,
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: MODE_META[mode].color,
              }}
            />
            {MODE_META[mode].label}
          </button>
          {modeMenuOpen && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: '4px',
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: '6px',
                overflow: 'hidden',
                zIndex: 10,
                minWidth: '120px',
              }}
            >
              {availableModes.map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => handleModeChange(m)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    width: '100%',
                    padding: '8px 12px',
                    fontSize: '12px',
                    color: m === mode ? MODE_META[m].color : 'var(--color-text)',
                    background: m === mode ? 'rgba(255,255,255,0.05)' : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: MODE_META[m].color,
                    }}
                  />
                  {MODE_META[m].label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: statusColor[connStatus],
            }}
          />
          <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{connStatus}</span>
        </div>
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        {allItems.length === 0 && connStatus === 'connected' && !isStreaming && (
          <div
            style={{
              color: 'var(--color-text-muted)',
              fontSize: '13px',
              textAlign: 'center',
              marginTop: '40px',
            }}
          >
            Connected. Send a message to start chatting with the agent.
          </div>
        )}

        {allItems.map(item => {
          if (item.kind === 'user') {
            return (
              <div key={item.id} style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <div
                  style={{
                    maxWidth: '75%',
                    padding: '10px 14px',
                    borderRadius: '12px 12px 2px 12px',
                    background: 'var(--color-primary)',
                    color: '#fff',
                    fontSize: '13px',
                    lineHeight: '1.5',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {item.text}
                </div>
              </div>
            );
          }

          if (item.kind === 'assistant' || item.kind === 'streaming') {
            const isLive = item.kind === 'streaming';
            return (
              <div key={item.id} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {item.blocks.map((block, j) => {
                  const blockKey = `${item.id}-${j}`;
                  if (block.type === 'text') {
                    return (
                      <div
                        key={blockKey}
                        style={{
                          maxWidth: '85%',
                          padding: '10px 14px',
                          borderRadius: '12px 12px 12px 2px',
                          background: 'var(--color-surface)',
                          border: '1px solid var(--color-border)',
                          fontSize: '13px',
                          lineHeight: '1.5',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                        }}
                      >
                        {block.text}
                        {isLive && j === item.blocks.length - 1 && (
                          <span
                            style={{
                              display: 'inline-block',
                              width: '6px',
                              height: '14px',
                              background: 'var(--color-primary)',
                              marginLeft: '2px',
                              verticalAlign: 'text-bottom',
                              animation: 'blink 1s step-end infinite',
                            }}
                          />
                        )}
                      </div>
                    );
                  }
                  if (block.type === 'thinking') {
                    return (
                      <details
                        key={blockKey}
                        style={{
                          maxWidth: '85%',
                          borderRadius: '8px',
                          background: 'var(--color-thinking-bg)',
                          border: '1px solid var(--color-border)',
                          overflow: 'hidden',
                        }}
                      >
                        <summary
                          style={{
                            padding: '8px 12px',
                            fontSize: '12px',
                            color: 'var(--color-text-muted)',
                            cursor: 'pointer',
                            userSelect: 'none',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                          }}
                        >
                          <span style={{ fontSize: '10px' }}>&#9650;</span>
                          <span>Thinking...</span>
                        </summary>
                        <div
                          style={{
                            padding: '8px 12px',
                            fontSize: '12px',
                            lineHeight: '1.5',
                            color: 'var(--color-text-muted)',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            borderTop: '1px solid var(--color-border)',
                          }}
                        >
                          {block.text}
                        </div>
                      </details>
                    );
                  }
                  return null;
                })}
              </div>
            );
          }

          if (item.kind === 'tool') {
            return <ToolCard key={item.id} item={item} />;
          }

          return null;
        })}

        {isStreaming && streamingBlocks.length === 0 && messages.length > 0 && (
          <StreamingIndicator />
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Permission prompt */}
      {pendingPermission && (
        <div style={{ padding: '0 16px 8px' }}>
          <PermissionCard prompt={pendingPermission} mode={mode} onRespond={handlePermission} />
        </div>
      )}

      {/* Input */}
      <div
        style={{
          padding: '12px 16px',
          borderTop: '1px solid var(--color-border)',
          display: 'flex',
          gap: '8px',
          flexShrink: 0,
        }}
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            isStreaming
              ? 'Agent is responding...'
              : connStatus === 'connected'
                ? 'Message the agent...'
                : 'Disconnected'
          }
          disabled={connStatus !== 'connected' || isStreaming}
          rows={1}
          style={{
            flex: 1,
            padding: '10px 14px',
            fontSize: '13px',
            fontFamily: 'var(--font-sans)',
            background: 'var(--color-surface)',
            color: 'var(--color-text)',
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
            outline: 'none',
            resize: 'none',
            lineHeight: '1.5',
          }}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!input.trim() || connStatus !== 'connected' || isStreaming}
          style={{
            padding: '10px 20px',
            fontSize: '13px',
            fontWeight: 500,
            color: '#fff',
            background:
              !input.trim() || connStatus !== 'connected' || isStreaming
                ? 'var(--color-text-muted)'
                : 'var(--color-primary)',
            border: 'none',
            borderRadius: '8px',
            cursor:
              !input.trim() || connStatus !== 'connected' || isStreaming ? 'default' : 'pointer',
            alignSelf: 'flex-end',
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}

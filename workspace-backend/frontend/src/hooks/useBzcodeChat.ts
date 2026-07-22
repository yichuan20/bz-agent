import type { ContentBlock, Message, UseChatReturn } from '@boltzbit/chat';
import { useCallback, useEffect, useRef, useState } from 'react';

// ── bzcode protocol types ────────────────────────────────────────────────────

type BzcodeContentBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string; signature?: string }
  | { type: 'toolUse'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'toolResult'; toolUseId: string; content: string; isError?: boolean };

type BzcodeServerMessage =
  | {
      type: 'session';
      sessionId: string;
      messages?: Array<{ role: 'user' | 'assistant'; content: string | BzcodeContentBlock[] }>;
    }
  | { type: 'status'; status: 'idle' | 'running' }
  | { type: 'delta'; blockIndex: number; blockType: string; field: string; content: string }
  | { type: 'assistant'; content: BzcodeContentBlock[] }
  | {
      type: 'tool';
      toolUseId: string;
      name: string;
      status: 'running' | 'done' | 'error';
      input?: unknown;
      content?: string;
      isError?: boolean;
      message?: string;
    }
  | {
      type: 'prompt';
      requestId: string;
      subtype: 'permission' | 'input';
      tool?: string;
      input?: unknown;
      message?: string;
      questions?: Array<{
        question: string;
        header: string;
        options: Array<{ label: string; description: string }>;
        multi_select?: boolean;
      }>;
    }
  | { type: 'result'; status: 'success' | 'error' | 'aborted'; output?: string; error?: string };

// ── helpers ──────────────────────────────────────────────────────────────────

function bzcodeBlocksToContentBlocks(blocks: BzcodeContentBlock[]): ContentBlock[] {
  const result: ContentBlock[] = [];
  for (const block of blocks) {
    if (block.type === 'text') {
      result.push({ type: 'text', text: block.text });
    } else if (block.type === 'thinking') {
      // Skip signature-only thinking fragments
      if (block.thinking) result.push({ type: 'thinking', text: block.thinking });
    }
    // toolUse / toolResult blocks are skipped — tool events shown via 'tool' messages
  }
  return result;
}

function streamingBlocksToContentBlocks(
  blocks: Map<number, { type: string; content: string }>,
): ContentBlock[] {
  const result: ContentBlock[] = [];
  const sorted = [...blocks.entries()].sort(([a], [b]) => a - b);
  for (const [, block] of sorted) {
    if (block.type === 'text' && block.content) {
      result.push({ type: 'text', text: block.content });
    } else if (block.type === 'thinking' && block.content) {
      result.push({ type: 'thinking', text: block.content });
    }
  }
  return result;
}

// ── hook ─────────────────────────────────────────────────────────────────────

import { HTTP_BASE_WS } from '#/lib/api';
const DEFAULT_WS = HTTP_BASE_WS + '/ws';

export function useBzcodeChat(wsUrl = DEFAULT_WS): UseChatReturn {
  const [finalMessages, setFinalMessages] = useState<Message[]>([]);
  const [streamingMsg, setStreamingMsg] = useState<Message | null>(null);
  const [status, setStatus] = useState<'ready' | 'submitted' | 'streaming'>('ready');

  const wsRef = useRef<WebSocket | null>(null);
  // Accumulated delta blocks for the current streaming turn
  const streamingBlocksRef = useRef<Map<number, { type: string; content: string }>>(new Map());
  // Pending input prompt waiting for a user response
  const pendingInputRef = useRef<{
    requestId: string;
    questions: Array<{ question: string }>;
  } | null>(null);

  const send = useCallback((msg: object) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  useEffect(() => {
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event: MessageEvent<string>) => {
      let msg: BzcodeServerMessage;
      try {
        msg = JSON.parse(event.data) as BzcodeServerMessage;
      } catch {
        return;
      }

      switch (msg.type) {
        case 'session': {
          if (msg.messages && msg.messages.length > 0) {
            const restored: Message[] = msg.messages
              .map(m => {
                if (m.role === 'user') {
                  const text = typeof m.content === 'string' ? m.content : '';
                  return { role: 'user' as const, content: [{ type: 'text' as const, text }] };
                }
                const blocks = Array.isArray(m.content)
                  ? bzcodeBlocksToContentBlocks(m.content as BzcodeContentBlock[])
                  : [{ type: 'text' as const, text: String(m.content) }];
                return { role: 'assistant' as const, content: blocks };
              })
              .filter(m => m.content.length > 0);
            setFinalMessages(restored);
          }
          break;
        }

        case 'status': {
          if (msg.status === 'running') {
            setStatus('streaming');
          } else {
            setStatus('ready');
            setStreamingMsg(null);
            streamingBlocksRef.current.clear();
          }
          break;
        }

        case 'delta': {
          // Ignore thinking signatures and tool input streams
          if (msg.field === 'signature') break;
          if (msg.blockType === 'toolUse') break;

          const existing = streamingBlocksRef.current.get(msg.blockIndex) ?? {
            type: msg.blockType,
            content: '',
          };
          existing.content += msg.content;
          streamingBlocksRef.current.set(msg.blockIndex, existing);

          const blocks = streamingBlocksToContentBlocks(streamingBlocksRef.current);
          if (blocks.length > 0) {
            setStreamingMsg({ role: 'assistant', content: blocks });
          }
          break;
        }

        case 'assistant': {
          const blocks = bzcodeBlocksToContentBlocks(msg.content);
          streamingBlocksRef.current.clear();
          setStreamingMsg(null);
          if (blocks.length > 0) {
            setFinalMessages(prev => {
              // Replace streaming placeholder if present, else append
              const last = prev[prev.length - 1];
              if (
                last?.role === 'assistant' &&
                (last.content as ContentBlock[]).some(
                  b => b.type === 'text' || b.type === 'thinking',
                )
              ) {
                return [...prev.slice(0, -1), { role: 'assistant', content: blocks }];
              }
              return [...prev, { role: 'assistant', content: blocks }];
            });
          }
          break;
        }

        case 'prompt': {
          if (msg.subtype === 'permission') {
            // Auto-allow tool permissions
            send({
              type: 'user',
              subtype: 'permission',
              requestId: msg.requestId,
              behavior: 'allow',
            });
          } else if (msg.subtype === 'input') {
            const questions = msg.questions ?? [];
            pendingInputRef.current = { requestId: msg.requestId, questions };
            // Show the prompt as an assistant message so the user can reply
            const text =
              msg.message ?? questions.map(q => q.question).join('\n') ?? 'Please provide input.';
            setFinalMessages(prev => [
              ...prev,
              { role: 'assistant', content: [{ type: 'text', text }] },
            ]);
          }
          break;
        }

        case 'result': {
          if (msg.status === 'success' && msg.output) {
            // Slash command output — add as assistant message
            setFinalMessages(prev => [
              ...prev,
              { role: 'assistant', content: [{ type: 'text', text: msg.output ?? '' }] },
            ]);
          }
          break;
        }

        default:
          break;
      }
    };

    ws.onerror = () => {
      setStatus('ready');
    };

    ws.onclose = () => {
      setStatus('ready');
    };

    return () => {
      ws.close();
    };
  }, [wsUrl, send]);

  const sendMessage = useCallback(
    (text: string) => {
      const userMsg: Message = { role: 'user', content: [{ type: 'text', text }] };

      const pendingInput = pendingInputRef.current;
      if (pendingInput) {
        // Respond to an AskUserQuestion prompt
        pendingInputRef.current = null;
        const answers: Record<string, string> = {};
        for (const q of pendingInput.questions) answers[q.question] = text;
        setFinalMessages(prev => [...prev, userMsg]);
        send({ type: 'user', subtype: 'input', requestId: pendingInput.requestId, answers });
      } else {
        setFinalMessages(prev => [...prev, userMsg]);
        setStatus('submitted');
        send({ type: 'user', content: text });
      }
    },
    [send],
  );

  const messages = streamingMsg ? [...finalMessages, streamingMsg] : finalMessages;

  return {
    messages,
    apiMessages: [],
    sendMessage,
    activeToolCalls: [],
    status,
  } as UseChatReturn;
}

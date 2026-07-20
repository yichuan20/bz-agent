import type { UseChatReturn } from '@boltzbit/chat';
import { parseMarkdownToHTML } from '@boltzbit/md-utils';
import { ChatCircleDotsIcon, PaperPlaneTiltIcon } from '@phosphor-icons/react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

const defaultSuggestions = [
  { text: 'Summarize a document' },
  { text: 'Explain this codebase' },
  { text: 'Draft an email' },
];

type ChatProps = {
  className?: string;
  chat: UseChatReturn;
  suggestions?: { text: string }[];
};

export default function Chat({ className, chat, suggestions = defaultSuggestions }: ChatProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState('');
  const { messages, sendMessage, status } = chat;

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = '1px';
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight);
    const maxHeight = lineHeight * 9;
    const next = Math.max(Math.min(el.scrollHeight, maxHeight), lineHeight);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight >= maxHeight ? 'auto' : 'hidden';
  }, []);

  useLayoutEffect(() => {
    adjustHeight();
  }, [adjustHeight]);

  function handleSubmit() {
    const text = value.trim();
    if (!text || status === 'streaming') return;
    sendMessage(text);
    setValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  const wrapperClass = ['chat-wrapper', className].filter(Boolean).join(' ');

  return (
    <div className={wrapperClass}>
      <div ref={scrollRef} className="chat-messages">
        {messages.length === 0 ? (
          <div className="chat-empty">
            <ChatCircleDotsIcon size={40} color="var(--accent-blue)" weight="duotone" />
            <p className="chat-empty-title">What can I help you with?</p>
            <div className="chat-suggestions">
              {suggestions.map(s => (
                <button
                  key={s.text}
                  type="button"
                  className="chat-suggestion"
                  onClick={() => {
                    setValue(s.text);
                    textareaRef.current?.focus();
                  }}
                >
                  {s.text}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="chat-messages-inner">
            {messages.map((msg, i) => (
              <div key={i} className="chat-message">
                {msg.content.map((block, j) => {
                  if (block.type === 'text') {
                    if (msg.role === 'user') {
                      return (
                        <div key={j} className="chat-row chat-row--user">
                          <div
                            className="chat-bubble-user"
                            dangerouslySetInnerHTML={{ __html: parseMarkdownToHTML(block.text) }}
                          />
                        </div>
                      );
                    }
                    return (
                      <div
                        key={j}
                        className="chat-bubble-assistant"
                        dangerouslySetInnerHTML={{ __html: parseMarkdownToHTML(block.text) }}
                      />
                    );
                  }
                  if (block.type === 'thinking') {
                    const isLast = status === 'streaming' && i === messages.length - 1;
                    return (
                      <details key={j} className="chat-thinking">
                        <summary
                          className={
                            isLast
                              ? 'chat-thinking-label chat-thinking-label--streaming'
                              : 'chat-thinking-label'
                          }
                        >
                          Thinking…
                        </summary>
                        <div
                          className="chat-thinking-content"
                          dangerouslySetInnerHTML={{ __html: parseMarkdownToHTML(block.text) }}
                        />
                      </details>
                    );
                  }
                  return null;
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="chat-input-bar">
        <div className="chat-input-inner">
          <textarea
            ref={textareaRef}
            className="chat-textarea"
            placeholder="Ask me anything…"
            value={value}
            rows={1}
            onChange={e => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            type="button"
            className="chat-submit"
            onClick={handleSubmit}
            disabled={!value.trim() || status === 'streaming'}
            aria-label="Send"
          >
            <PaperPlaneTiltIcon size={16} weight="fill" />
          </button>
        </div>
      </div>
    </div>
  );
}

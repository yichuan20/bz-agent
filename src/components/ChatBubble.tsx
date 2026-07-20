import type { UseChatReturn } from '@boltzbit/chat';
import { ChatCircleDotsIcon, XIcon } from '@phosphor-icons/react';
import { useState } from 'react';
import Chat from './Chat';

type ChatBubbleProps = {
  chat: UseChatReturn;
};

export default function ChatBubble({ chat }: ChatBubbleProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {open && <div className="chat-bubble-overlay" onClick={() => setOpen(false)} />}

      <div className={open ? 'chat-bubble-panel chat-bubble-panel--open' : 'chat-bubble-panel'}>
        <div className="chat-bubble-panel-header">
          <span className="chat-bubble-panel-title">Chat</span>
          <button
            type="button"
            className="chat-bubble-close"
            onClick={() => setOpen(false)}
            aria-label="Close chat"
          >
            <XIcon size={16} />
          </button>
        </div>
        <Chat chat={chat} />
      </div>

      {!open && (
        <button
          type="button"
          className="chat-bubble-trigger"
          onClick={() => setOpen(true)}
          aria-label="Open chat"
        >
          <ChatCircleDotsIcon size={22} weight="fill" />
        </button>
      )}
    </>
  );
}

import { createFileRoute } from '@tanstack/react-router';
import Chat from '#/components/Chat';
import { useAppChat } from '#/hooks/useAppChat';

export const Route = createFileRoute('/_app/chat')({
  component: ChatPage,
});

function ChatPage() {
  const chat = useAppChat();
  return <Chat className="chat-page" chat={chat} />;
}

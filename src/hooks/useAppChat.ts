import { useBzApiTools, useChat } from '@boltzbit/chat';
import { useDynasDbTools } from '@boltzbit/tools__dynas-db';
import { dynasClient } from '#/auth';

export function useAppChat() {
  const apiTools = useBzApiTools();
  const dynasDbTools = useDynasDbTools({
    client: dynasClient as never,
    appId: import.meta.env.VITE_DYNAS_APP_ID,
  });

  return useChat({
    chatKey: 'app-chat',
    model: 'anthropic-claude-4.5-sonnet',
    tools: [...apiTools, ...dynasDbTools],
  });
}

import { AgentPageShell, ChatPanel, GENERAL_MSGS } from './AgentShared'

interface Props { theme: 'light' | 'dark'; onToggleTheme: () => void }

export function AgentGeneral({ theme, onToggleTheme }: Props) {
  return (
    <AgentPageShell mode="general" theme={theme} onToggleTheme={onToggleTheme}>
      <ChatPanel messages={GENERAL_MSGS} />
    </AgentPageShell>
  )
}

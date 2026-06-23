import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Login } from './screens/Login'
import { Home } from './screens/Home'
import { AgentGeneral } from './screens/AgentGeneral'
import { AgentWidget } from './screens/AgentWidget'
import { AgentWorker } from './screens/AgentWorker'
import { AgentCoder } from './screens/AgentCoder'
import { Learning } from './screens/Learning'
import { Settings } from './screens/Settings'

type Screen =
  | 'login'
  | 'home'
  | 'agent-general'
  | 'agent-widget'
  | 'agent-worker'
  | 'agent-coder'
  | 'learning'
  | 'settings'

const SCREENS: { id: Screen; label: string; group?: string }[] = [
  { id: 'login', label: 'Login' },
  { id: 'home', label: 'Home' },
  { id: 'agent-general', label: 'General', group: 'Agent' },
  { id: 'agent-widget', label: 'Widget', group: 'Agent' },
  { id: 'agent-worker', label: 'Worker', group: 'Agent' },
  { id: 'agent-coder', label: 'Coder', group: 'Agent' },
  { id: 'learning', label: 'Learning' },
  { id: 'settings', label: 'Settings' },
]

const NAV_H = 46

export default function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light'
    setTheme(next)
    document.documentElement.setAttribute('data-theme', next)
  }

  // Sidebar NavKey → Screen mapping
  const navToScreen = (nav: string) => {
    switch (nav) {
      case 'home':     return setScreen('home')
      case 'agent':    return setScreen('agent-general')
      case 'learning': return setScreen('learning')
      case 'settings': return setScreen('settings')
      case 'chat':     return setScreen('home')
    }
  }

  const props = { theme, onToggleTheme: toggleTheme, onNavigate: navToScreen }

  const renderScreen = () => {
    switch (screen) {
      case 'login':         return <Login theme={theme} onToggleTheme={toggleTheme} />
      case 'home':          return <Home {...props} />
      case 'agent-general': return <AgentGeneral {...props} />
      case 'agent-widget':  return <AgentWidget {...props} />
      case 'agent-worker':  return <AgentWorker {...props} />
      case 'agent-coder':   return <AgentCoder {...props} />
      case 'learning':      return <Learning {...props} />
      case 'settings':      return <Settings {...props} />
    }
  }

  const navS: CSSProperties = {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    height: NAV_H,
    background: '#111',
    display: 'flex',
    alignItems: 'center',
    padding: '0 12px',
    gap: 4,
    zIndex: 9999,
    borderTop: '1px solid #333',
    userSelect: 'none',
  }

  // Group consecutive Agent screens
  let lastGroup: string | null = null

  return (
    <div style={{ height: `calc(100vh - ${NAV_H}px)`, position: 'relative' }}>
      {renderScreen()}

      {/* Designer navigation bar */}
      <div style={navS}>
        <span style={{ fontSize: 10, color: '#555', fontFamily: 'monospace', marginRight: 8, letterSpacing: '0.06em', flexShrink: 0 }}>
          UI MOCK
        </span>
        {SCREENS.map((s, i) => {
          const showGroupLabel = s.group && s.group !== lastGroup
          if (s.group) lastGroup = s.group
          else lastGroup = null

          const isActive = screen === s.id
          const btnS: CSSProperties = {
            padding: '5px 10px',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: isActive ? 700 : 400,
            color: isActive ? '#fff' : '#888',
            background: isActive ? '#2563eb' : 'transparent',
            border: 'none',
            fontFamily: 'system-ui, sans-serif',
            transition: 'all 0.12s',
            whiteSpace: 'nowrap',
          }

          return (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              {showGroupLabel && (
                <span style={{ fontSize: 10, color: '#444', marginLeft: 8, marginRight: 2, fontFamily: 'monospace', letterSpacing: '0.04em' }}>
                  Agent /
                </span>
              )}
              <button style={btnS} onClick={() => setScreen(s.id)}>
                {s.label}
              </button>
            </div>
          )
        })}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: '#444', fontFamily: 'monospace' }}>
          BoltzAgent UI Mock · {new Date().getFullYear()}
        </span>
      </div>
    </div>
  )
}

import type { CSSProperties } from 'react'
import { useState } from 'react'
import {
  File, FolderOpen, Folder, CaretRight, Play, X,
} from '@phosphor-icons/react'
import { AgentPageShell, ChatPanel, CODER_MSGS } from './AgentShared'

const TREE = [
  {
    name: 'src', open: true, children: [
      { name: 'App.tsx', active: false },
      { name: 'middleware', open: true, children: [
        { name: 'auth.ts', active: true },
        { name: 'logger.ts' },
        { name: 'rateLimit.ts' },
      ]},
      { name: 'routes', open: false, children: [
        { name: 'users.ts' },
        { name: 'products.ts' },
      ]},
      { name: 'types.ts' },
    ]
  },
  { name: 'package.json' },
  { name: 'tsconfig.json' },
  { name: 'README.md' },
]

type NodeType = { name: string; type?: string; active?: boolean; open?: boolean; children?: NodeType[] }

function TreeNode({ node, depth = 0 }: { node: NodeType; depth?: number }) {
  const [open, setOpen] = useState(node.open ?? false)
  const isDir = !!node.children
  return (
    <div>
      <div
        onClick={() => isDir && setOpen(!open)}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: `4px 8px 4px ${8 + depth * 14}px`,
          cursor: 'pointer',
          background: node.active ? 'var(--accent-blue-light)' : 'transparent',
          color: node.active ? 'var(--accent-blue)' : 'var(--text-primary)',
          borderRadius: 4,
          fontSize: 12,
          userSelect: 'none',
        }}
      >
        {isDir
          ? open ? <FolderOpen size={13} color="var(--accent-orange)" /> : <Folder size={13} color="var(--text-tertiary)" />
          : <File size={13} color="var(--text-tertiary)" />
        }
        {isDir && <CaretRight size={10} style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />}
        <span style={{ fontWeight: node.active ? 600 : 400 }}>{node.name}</span>
      </div>
      {isDir && open && node.children?.map(c => <TreeNode key={c.name} node={c as NodeType} depth={depth + 1} />)}
    </div>
  )
}

function FileTree() {
  return (
    <div style={{ width: 200, borderRight: '1px solid var(--border-primary)', background: 'var(--bg-primary)', overflow: 'auto', flexShrink: 0 }}>
      <div style={{ padding: '10px 8px', borderBottom: '1px solid var(--border-primary)', fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Explorer
      </div>
      <div style={{ padding: 4 }}>
        {TREE.map(n => <TreeNode key={n.name} node={n as NodeType} />)}
      </div>
    </div>
  )
}

const CODE = `import jwt from 'jsonwebtoken'
import type { Request, Response, NextFunction } from 'express'

interface JWTPayload {
  userId: string
  email: string
  roles: string[]
  iat: number
  exp: number
}

declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload
    }
  }
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No token provided' })
    return
  }

  const token = authHeader.split(' ')[1]

  try {
    const payload = jwt.verify(
      token,
      process.env.JWT_SECRET!
    ) as JWTPayload

    req.user = payload
    next()
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      res.status(401).json({ error: 'Token expired' })
    } else {
      res.status(401).json({ error: 'Invalid token' })
    }
  }
}
`

function tokenise(code: string) {
  // Very simple syntax highlighting
  const keywordColor = '#cba6f7'
  const stringColor = '#a6e3a1'
  const commentColor = '#6c7086'
  const typeColor = '#89b4fa'
  const fnColor = '#89dceb'

  return code
    .split('\n')
    .map((line, i) => {
      const escaped = line
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')

      const colored = escaped
        .replace(/(\/\/.*$)/g, `<span style="color:${commentColor}">$1</span>`)
        .replace(/\b(import|export|from|const|let|var|async|await|return|if|else|try|catch|new|type|interface|declare|namespace|global|as|of|in)\b/g, `<span style="color:${keywordColor}">$1</span>`)
        .replace(/\b(string|number|boolean|void|Promise|Request|Response|NextFunction|JWTPayload)\b/g, `<span style="color:${typeColor}">$1</span>`)
        .replace(/'([^']*)'/g, `<span style="color:${stringColor}">'$1'</span>`)

      return `<span style="color:#6c7086;user-select:none;padding-right:16px;text-align:right;display:inline-block;min-width:32px">${i + 1}</span>${colored}`
    })
    .join('\n')
}

function Editor() {
  const [activeTab, setActiveTab] = useState('auth.ts')
  const tabs = ['auth.ts', 'App.tsx']

  const tabBarS: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    borderBottom: '1px solid var(--border-primary)',
    background: 'var(--bg-primary)',
    height: 36,
    flexShrink: 0,
  }
  const tabS = (active: boolean): CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '0 14px', height: '100%', cursor: 'pointer',
    fontSize: 12, fontFamily: 'var(--font-heading)',
    color: active ? 'var(--text-primary)' : 'var(--text-tertiary)',
    borderBottom: active ? '2px solid var(--accent-blue)' : '2px solid transparent',
    background: active ? 'var(--bg-secondary)' : 'transparent',
    userSelect: 'none',
  })

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Tab bar */}
      <div style={tabBarS}>
        {tabs.map(t => (
          <div key={t} style={tabS(t === activeTab)} onClick={() => setActiveTab(t)}>
            <File size={12} />
            {t}
            <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 1, color: 'var(--text-tertiary)', display: 'flex', lineHeight: 1 }}>
              <X size={10} />
            </button>
          </div>
        ))}
        <div style={{ flex: 1 }} />
        {/* Run button */}
        <button style={{
          display: 'flex', alignItems: 'center', gap: 5,
          margin: '0 10px',
          padding: '5px 12px',
          background: 'var(--accent-green)',
          color: 'white',
          border: 'none', borderRadius: 6, cursor: 'pointer',
          fontSize: 12, fontWeight: 600,
        }}>
          <Play size={12} weight="fill" />
          Run
        </button>
      </div>
      {/* Code area */}
      <div style={{ flex: 1, overflow: 'auto', background: '#1e1e2e' }}>
        <pre
          style={{ margin: 0, padding: '16px 0', fontFamily: 'var(--font-heading)', fontSize: 12.5, lineHeight: 1.7, color: '#cdd6f4', whiteSpace: 'pre' }}
          dangerouslySetInnerHTML={{ __html: tokenise(CODE) }}
        />
      </div>
    </div>
  )
}

interface Props { theme: 'light' | 'dark'; onToggleTheme: () => void }

export function AgentCoder({ theme, onToggleTheme }: Props) {
  return (
    <AgentPageShell mode="coder" theme={theme} onToggleTheme={onToggleTheme}>
      <ChatPanel messages={CODER_MSGS} width={360} />
      <FileTree />
      <Editor />
    </AgentPageShell>
  )
}

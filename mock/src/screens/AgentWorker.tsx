import type { CSSProperties } from 'react'
import { useState } from 'react'
import {
  File, FilePdf, FileXls, FilePpt, FolderOpen, Folder, CaretRight,
} from '@phosphor-icons/react'
import { AgentPageShell, ChatPanel, WORKER_MSGS } from './AgentShared'

const TREE = [
  {
    name: 'documents', open: true, children: [
      { name: 'Q3_Report.docx', type: 'docx', active: true },
      { name: 'Marketing_Plan.docx', type: 'docx' },
      { name: 'Budget_2024.xlsx', type: 'xlsx' },
      { name: 'Q2_Presentation.pptx', type: 'pptx' },
      { name: 'Customer_Survey.pdf', type: 'pdf' },
    ]
  },
  {
    name: 'images', open: false, children: [
      { name: 'logo.png', type: 'png' },
      { name: 'banner.jpg', type: 'jpg' },
    ]
  },
  { name: 'README.md', type: 'md' },
]

type NodeType = { name: string; type?: string; active?: boolean; open?: boolean; children?: NodeType[] }

function FileIcon({ type }: { type?: string }) {
  if (type === 'pdf') return <FilePdf size={13} color="var(--accent-red)" />
  if (type === 'xlsx') return <FileXls size={13} color="var(--accent-green)" />
  if (type === 'pptx') return <FilePpt size={13} color="var(--accent-orange)" />
  return <File size={13} color="var(--text-tertiary)" />
}

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
          : <FileIcon type={node.type} />
        }
        {isDir && <CaretRight size={10} style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />}
        <span style={{ fontWeight: node.active ? 600 : 400 }}>{node.name}</span>
      </div>
      {isDir && open && node.children?.map(c => <TreeNode key={c.name} node={c} depth={depth + 1} />)}
    </div>
  )
}

function FileTree() {
  return (
    <div style={{ width: 220, borderRight: '1px solid var(--border-primary)', background: 'var(--bg-primary)', overflow: 'auto', flexShrink: 0 }}>
      <div style={{ padding: '10px 8px', borderBottom: '1px solid var(--border-primary)', fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Files
      </div>
      <div style={{ padding: 4 }}>
        {TREE.map(n => <TreeNode key={n.name} node={n as NodeType} />)}
      </div>
    </div>
  )
}

// Simplified Word doc renderer
function DocViewer() {
  const paraS: CSSProperties = {
    fontSize: 14, lineHeight: 1.8, marginBottom: 12, color: 'var(--text-primary)',
  }
  const h1S: CSSProperties = {
    fontSize: 22, fontWeight: 700, marginBottom: 16, letterSpacing: '-0.01em',
  }
  const h2S: CSSProperties = {
    fontSize: 16, fontWeight: 600, marginBottom: 10, marginTop: 24,
  }
  return (
    <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 32 }}>
      <div style={{ width: 680, background: 'var(--bg-primary)', borderRadius: 4, boxShadow: 'var(--shadow-md)', padding: '52px 72px', minHeight: 700 }}>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 32, textAlign: 'center', fontFamily: 'var(--font-heading)' }}>
          Q3_Report.docx
        </div>
        <h1 style={h1S}>Q3 2024 Sales Performance Report</h1>
        <p style={{ ...paraS, color: 'var(--text-secondary)' }}>Prepared by: Finance &amp; Analytics Team | October 2024</p>

        <h2 style={h2S}>Executive Summary</h2>
        <p style={paraS}>
          The third quarter of 2024 delivered outstanding results, with total revenue reaching $2.4 million—an
          18% increase quarter-over-quarter. The APAC region led growth at +32%, while EMEA contributed a
          strong +24%. Customer acquisition accelerated significantly, with 289 new clients onboarded.
        </p>

        <h2 style={h2S}>Key Metrics</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 20 }}>
          <thead>
            <tr style={{ background: 'var(--bg-secondary)' }}>
              {['Metric', 'Q2 2024', 'Q3 2024', 'Change'].map(h => (
                <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, borderBottom: '2px solid var(--border-primary)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              ['Revenue', '$2.03M', '$2.40M', '+18.2%'],
              ['Orders', '1,247', '1,508', '+20.9%'],
              ['Avg Order Value', '$1,628', '$1,592', '-2.2%'],
              ['New Customers', '203', '289', '+42.4%'],
              ['Customer Churn', '3.4%', '2.1%', '-1.3pp'],
            ].map(([m, q2, q3, ch]) => (
              <tr key={m} style={{ borderBottom: '1px solid var(--border-primary)' }}>
                <td style={{ padding: '8px 12px', fontWeight: 500 }}>{m}</td>
                <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{q2}</td>
                <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{q3}</td>
                <td style={{ padding: '8px 12px', fontWeight: 600, color: String(ch).startsWith('+') ? 'var(--accent-green)' : 'var(--accent-red)' }}>{ch}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2 style={h2S}>Regional Performance</h2>
        <p style={paraS}>
          APAC remained the fastest-growing region, driven by enterprise contract renewals in Japan and South Korea.
          EMEA saw renewed momentum in Germany and the UK following the launch of our new compliance suite.
          North America growth moderated to +8% due to planned restructuring of our SMB sales channel.
        </p>

        <h2 style={h2S}>Conclusion</h2>
        <p style={paraS}>
          Q3 2024 represents a landmark quarter for the business. The acceleration in new customer acquisition,
          combined with a significant reduction in churn, validates our product-led growth strategy.
          We remain on track to exceed our full-year revenue target of $9.2M.
        </p>
      </div>
    </div>
  )
}

interface Props { theme: 'light' | 'dark'; onToggleTheme: () => void }

export function AgentWorker({ theme, onToggleTheme }: Props) {
  return (
    <AgentPageShell mode="worker" theme={theme} onToggleTheme={onToggleTheme}>
      <ChatPanel messages={WORKER_MSGS} width={360} />
      <FileTree />
      <DocViewer />
    </AgentPageShell>
  )
}

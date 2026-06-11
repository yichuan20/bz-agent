import { CaretRightIcon, FileIcon, FolderIcon, FolderOpenIcon } from '@phosphor-icons/react';
import { useCallback, useEffect, useState } from 'react';

const HTTP_BASE = (import.meta.env.VITE_AGENT_HTTP_URL as string | undefined) ?? 'http://localhost:18789';

type FsEntry = { name: string; path: string; isDir: boolean; size?: number };

interface DirNodeProps {
  path:         string;
  depth:        number;
  selectedFile: string | null;
  onFileSelect: (path: string) => void;
}

function DirNode({ path, depth, selectedFile, onFileSelect }: DirNodeProps) {
  const [expanded, setExpanded] = useState(depth === 0);
  const [entries,  setEntries]  = useState<FsEntry[]>([]);
  const [loaded,   setLoaded]   = useState(false);

  const load = useCallback(() => {
    fetch(`${HTTP_BASE}/files?path=${encodeURIComponent(path)}`)
      .then(r => r.json())
      .then((d: { entries?: FsEntry[] }) => {
        // Hide hidden files/dirs (starting with .) and common noise
        const HIDDEN = new Set(['.git', 'node_modules', '__pycache__', '.venv', '.bzhub']);
        const filtered = (d.entries ?? []).filter(e => !e.name.startsWith('.') && !HIDDEN.has(e.name));
        setEntries(filtered);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [path]);

  useEffect(() => { if (expanded && !loaded) load(); }, [expanded, loaded, load]);

  const toggle = () => setExpanded(v => !v);
  const name   = path.split('/').filter(Boolean).pop() ?? path;

  return (
    <div>
      {depth > 0 && (
        <button
          type="button"
          className="ftree-dir"
          style={{ paddingLeft: 8 + depth * 14 }}
          onClick={toggle}
        >
          <CaretRightIcon
            size={10}
            className={`ftree-caret${expanded ? ' ftree-caret--open' : ''}`}
          />
          {expanded
            ? <FolderOpenIcon size={13} color="var(--accent-blue)" weight="duotone" />
            : <FolderIcon     size={13} color="var(--text-tertiary)" weight="duotone" />
          }
          <span className="ftree-name">{name}</span>
        </button>
      )}
      {expanded && entries.map(e =>
        e.isDir
          ? <DirNode
              key={e.path}
              path={e.path}
              depth={depth + 1}
              selectedFile={selectedFile}
              onFileSelect={onFileSelect}
            />
          : <button
              key={e.path}
              type="button"
              className={`ftree-file${e.path === selectedFile ? ' ftree-file--active' : ''}`}
              style={{ paddingLeft: 8 + (depth + 1) * 14 + 14 }}
              onClick={() => onFileSelect(e.path)}
            >
              <FileIcon size={12} color="var(--text-tertiary)" />
              <span className="ftree-name">{e.name}</span>
            </button>
      )}
    </div>
  );
}

interface Props {
  rootPath:     string;
  selectedFile: string | null;
  onFileSelect: (path: string) => void;
}

export function FolderTree({ rootPath, selectedFile, onFileSelect }: Props) {
  return (
    <div className="ftree">
      <DirNode
        path={rootPath}
        depth={0}
        selectedFile={selectedFile}
        onFileSelect={onFileSelect}
      />
    </div>
  );
}

import { clearAccessToken } from '#/auth-store';
import {
  AppWindowIcon,
  ArrowLineLeftIcon,
  ArrowLineRightIcon,
  ChatCircleDotsIcon,
  FolderSimpleIcon,
  HouseSimpleIcon,
  SignOutIcon,
  SquaresFourIcon,
  TerminalIcon,
} from '@phosphor-icons/react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import ThemeToggle from './ThemeToggle';

const NAV_ITEMS = [
  { to: '/',         label: 'Home',     icon: HouseSimpleIcon,    exact: true },
  { to: '/chat',     label: 'Chat',     icon: ChatCircleDotsIcon, exact: false },
  { to: '/agent',    label: 'Agent',    icon: TerminalIcon,       exact: false },
  { to: '/files',    label: 'Files',    icon: FolderSimpleIcon,   exact: false },
  { to: '/products', label: 'Products', icon: SquaresFourIcon,    exact: false },
] as const;

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();

  function handleLogout() {
    clearAccessToken();
    void navigate({ to: '/login' });
  }

  return (
    <aside className={`sidebar${collapsed ? ' sidebar--collapsed' : ''}`}>

      {/* ── Header ─────────────────────────────────────────────────── */}
      {collapsed ? (
        /* Collapsed: entire header is the expand button, icon swaps on hover */
        <button
          type="button"
          className="sidebar-header sidebar-header--btn"
          onClick={() => setCollapsed(false)}
          title="Expand sidebar"
        >
          <AppWindowIcon size={18} className="sb-icon-default" />
          <ArrowLineRightIcon size={18} className="sb-icon-hover" weight="bold" />
        </button>
      ) : (
        <div className="sidebar-header">
          <AppWindowIcon size={18} />
          <span className="sidebar-logo">My App</span>
          <ThemeToggle />
          <button
            type="button"
            className="sidebar-collapse-btn"
            onClick={() => setCollapsed(true)}
            title="Collapse sidebar"
          >
            <ArrowLineLeftIcon size={14} weight="bold" />
          </button>
        </div>
      )}

      {/* ── Nav ────────────────────────────────────────────────────── */}
      <nav className="sidebar-nav">
        {NAV_ITEMS.map(({ to, label, icon: Icon, exact }) => (
          <Link
            key={to}
            to={to}
            className="nav-link"
            activeProps={{ className: 'nav-link active' }}
            activeOptions={exact ? { exact: true } : undefined}
            title={collapsed ? label : undefined}
          >
            <Icon size={16} className="nav-link-icon" />
            <span className="nav-link-label">{label}</span>
          </Link>
        ))}
      </nav>

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <div className="sidebar-footer">
        {collapsed ? (
          <button
            type="button"
            className="sidebar-icon-btn"
            onClick={handleLogout}
            title="Sign out"
          >
            <SignOutIcon size={16} />
          </button>
        ) : (
          <button type="button" onClick={handleLogout} className="btn-secondary btn-small">
            Sign out
          </button>
        )}
      </div>
    </aside>
  );
}

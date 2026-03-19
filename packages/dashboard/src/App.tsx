import { BrowserRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { Agents } from './pages/Agents.js';
import { Tasks } from './pages/Tasks.js';
import { Workflows } from './pages/Workflows.js';
import { Runs } from './pages/Runs.js';
import { Metrics } from './pages/Metrics.js';

const NAV_ITEMS = [
  { to: '/',          label: 'Overview',  icon: IconGrid,   end: true  },
  { to: '/agents',    label: 'Agents',    icon: IconCpu,    end: false },
  { to: '/tasks',     label: 'Tasks',     icon: IconTasks,  end: false },
  { to: '/workflows', label: 'Workflows', icon: IconFlow,   end: false },
  { to: '/runs',      label: 'Runs',      icon: IconRun,    end: false },
];

function IconGrid() {
  return <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.5"/><rect x="9" y="1" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.5"/><rect x="1" y="9" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.5"/><rect x="9" y="9" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.5"/></svg>;
}
function IconCpu() {
  return <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><rect x="4" y="4" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.5"/><path d="M6 1v3M10 1v3M6 12v3M10 12v3M1 6h3M1 10h3M12 6h3M12 10h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>;
}
function IconTasks() {
  return <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M2 4h12M2 8h8M2 12h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>;
}
function IconFlow() {
  return <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><circle cx="3" cy="3" r="2" stroke="currentColor" strokeWidth="1.5"/><circle cx="13" cy="3" r="2" stroke="currentColor" strokeWidth="1.5"/><circle cx="8" cy="13" r="2" stroke="currentColor" strokeWidth="1.5"/><path d="M5 3h6M4.5 4.5l2.5 7M11.5 4.5l-2.5 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>;
}
function IconRun() {
  return <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><polygon points="4,2 14,8 4,14" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>;
}

function Sidebar() {
  return (
    <aside style={{
      width: 'var(--sidebar-width)',
      background: 'var(--bg-surface)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 180,
        background: 'radial-gradient(ellipse at 50% 0%, rgba(0,212,255,0.05) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* Logo */}
      <div style={{
        padding: '0 18px',
        height: 'var(--topbar-height)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <div style={{
          width: 26, height: 26,
          background: 'linear-gradient(135deg, var(--accent) 0%, var(--purple) 100%)',
          borderRadius: 6,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 800, color: '#fff',
          flexShrink: 0,
          boxShadow: '0 0 12px rgba(0,212,255,0.3)',
        }}>M</div>
        <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: '-0.2px', color: 'var(--text-primary)' }}>
          Mission Control
        </span>
      </div>

      {/* Section label */}
      <div style={{ padding: '18px 18px 6px', fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
        Workspace
      </div>

      {/* Nav items */}
      <nav style={{ padding: '0 10px', display: 'flex', flexDirection: 'column', gap: 1 }}>
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end}>
            {({ isActive }) => (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 9,
                padding: '7px 10px',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: isActive ? 600 : 500,
                color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                background: isActive ? 'var(--accent-dim)' : 'transparent',
                border: `1px solid ${isActive ? 'rgba(0,212,255,0.14)' : 'transparent'}`,
                transition: 'all 0.12s ease',
              }}>
                <Icon />
                {label}
                {isActive && (
                  <span style={{
                    marginLeft: 'auto', width: 5, height: 5, borderRadius: '50%',
                    background: 'var(--accent)', flexShrink: 0,
                    boxShadow: '0 0 6px var(--accent)',
                  }} />
                )}
              </div>
            )}
          </NavLink>
        ))}
      </nav>

      {/* System status */}
      <div style={{ marginTop: 'auto', padding: '14px 18px', borderTop: '1px solid var(--border)' }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>
          System
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{ position: 'relative', width: 8, height: 8, flexShrink: 0 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green)' }} />
            <div style={{
              position: 'absolute', inset: -2, borderRadius: '50%',
              border: '1px solid var(--green)', opacity: 0.4,
              animation: 'pulse-ring 2s ease-out infinite',
            }} />
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>All systems nominal</span>
        </div>
        <div style={{ marginTop: 5, fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
          v0.1.0 · SQLite · ESM
        </div>
      </div>
    </aside>
  );
}

function usePageTitle() {
  const location = useLocation();
  const map: Record<string, string> = {
    '/': 'Overview',
    '/agents': 'Agents',
    '/tasks': 'Tasks',
    '/workflows': 'Workflows',
    '/runs': 'Execution Runs',
  };
  return map[location.pathname] ?? 'Mission Control';
}

function TopBar() {
  const title = usePageTitle();
  return (
    <div style={{
      height: 'var(--topbar-height)',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 24px',
      gap: 12,
      background: 'var(--bg-surface)',
      flexShrink: 0,
    }}>
      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.2px' }}>
        {title}
      </span>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 7,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-strong)',
          borderRadius: 6,
          padding: '5px 10px',
          fontSize: 12, color: 'var(--text-secondary)',
          cursor: 'default',
        }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeWidth="1.4"/><path d="M8 8l2 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
          Search
          <kbd style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', background: 'var(--border)', padding: '1px 5px', borderRadius: 3 }}>⌘K</kbd>
        </div>
        <div style={{
          width: 28, height: 28, borderRadius: '50%',
          background: 'linear-gradient(135deg, var(--purple) 0%, var(--accent) 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, fontWeight: 700, color: '#fff', letterSpacing: '0.02em',
        }}>MC</div>
      </div>
    </div>
  );
}

function Layout() {
  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <TopBar />
        <main style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
          <Routes>
            <Route path="/" element={<Metrics />} />
            <Route path="/agents" element={<Agents />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/workflows" element={<Workflows />} />
            <Route path="/runs" element={<Runs />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <Layout />
    </BrowserRouter>
  );
}

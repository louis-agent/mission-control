import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom';
import { Agents } from './pages/Agents.js';
import { Tasks } from './pages/Tasks.js';
import { Workflows } from './pages/Workflows.js';
import { Runs } from './pages/Runs.js';
import { Metrics } from './pages/Metrics.js';

const LINK: React.CSSProperties = { color: '#94a3b8', textDecoration: 'none', fontSize: '0.9rem' };
const ACTIVE: React.CSSProperties = { ...LINK, color: '#7c3aed', fontWeight: 600 };

export function App() {
  return (
    <BrowserRouter>
      <header style={{ display: 'flex', gap: '1.5rem', padding: '0.75rem 1.5rem', background: '#1a1f2e', borderBottom: '1px solid #2d3748' }}>
        <span style={{ color: '#7c3aed', fontWeight: 700, marginRight: '1rem' }}>⚡ Mission Control</span>
        {([['/', 'Metrics'], ['/agents', 'Agents'], ['/tasks', 'Tasks'], ['/workflows', 'Workflows'], ['/runs', 'Runs']] as [string, string][]).map(([to, label]) => (
          <NavLink key={to} to={to} end={to === '/'} style={({ isActive }) => isActive ? ACTIVE : LINK}>{label}</NavLink>
        ))}
      </header>
      <main style={{ padding: '1.5rem' }}>
        <Routes>
          <Route path="/" element={<Metrics />} />
          <Route path="/agents" element={<Agents />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/workflows" element={<Workflows />} />
          <Route path="/runs" element={<Runs />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}

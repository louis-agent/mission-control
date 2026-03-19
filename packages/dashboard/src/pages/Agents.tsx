import { useEffect, useState } from 'react';
import { api, type Agent } from '../api.js';
import { useSSE } from '../hooks/useSSE.js';

const STATUS_COLORS: Record<string, string> = { idle: '#10b981', busy: '#f59e0b', offline: '#6b7280' };
const TH: React.CSSProperties = { textAlign: 'left', padding: '0.5rem 0.75rem', borderBottom: '1px solid #2d3748', color: '#94a3b8', fontSize: '0.75rem', textTransform: 'uppercase' };
const TD: React.CSSProperties = { padding: '0.5rem 0.75rem', borderBottom: '1px solid #1a1f2e' };

export function Agents() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const sseEvent = useSSE('/events/stream');

  const load = () => api.agents.list().then(setAgents).catch(console.error);
  useEffect(() => { void load(); }, []);
  useEffect(() => { if (sseEvent) void load(); }, [sseEvent]);

  return (
    <div>
      <h2 style={{ marginBottom: '1rem', color: '#e2e8f0' }}>Agents ({agents.length})</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
        <thead><tr>{['Name', 'Status', 'Capabilities', 'Last Heartbeat'].map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead>
        <tbody>
          {agents.map(a => (
            <tr key={a.id}>
              <td style={TD}>{a.name}</td>
              <td style={TD}>
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: STATUS_COLORS[a.status] ?? '#6b7280', marginRight: 6 }} />
                {a.status}
              </td>
              <td style={{ ...TD, color: '#94a3b8' }}>{a.capabilities.join(', ')}</td>
              <td style={{ ...TD, color: '#64748b', fontSize: '0.75rem' }}>{a.lastHeartbeatAt ? new Date(a.lastHeartbeatAt).toLocaleString() : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

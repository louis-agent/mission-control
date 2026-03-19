import { useEffect, useState } from 'react';
import { api, type ExecutionRun } from '../api.js';
import { useSSE } from '../hooks/useSSE.js';

const STATUS_COLOR: Record<string, string> = { pending: '#94a3b8', running: '#3b82f6', completed: '#10b981', failed: '#ef4444', cancelled: '#6b7280' };
const TH: React.CSSProperties = { textAlign: 'left', padding: '0.5rem 0.75rem', borderBottom: '1px solid #2d3748', color: '#94a3b8', fontSize: '0.75rem', textTransform: 'uppercase' };
const TD: React.CSSProperties = { padding: '0.5rem 0.75rem', borderBottom: '1px solid #1a1f2e' };

export function Runs() {
  const [runs, setRuns] = useState<ExecutionRun[]>([]);
  const sseEvent = useSSE('/events');

  const load = () => api.runs.list().then(setRuns).catch(console.error);
  useEffect(() => { void load(); }, []);
  useEffect(() => { if (sseEvent) void load(); }, [sseEvent]);

  return (
    <div>
      <h2 style={{ marginBottom: '1rem', color: '#e2e8f0' }}>Execution Runs ({runs.length})</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
        <thead><tr>{['ID', 'Workflow', 'Status', 'Started', 'Completed'].map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead>
        <tbody>
          {runs.map(r => (
            <tr key={r.id}>
              <td style={{ ...TD, fontFamily: 'monospace', fontSize: '0.75rem', color: '#94a3b8' }}>{r.id.slice(0, 8)}…</td>
              <td style={{ ...TD, fontFamily: 'monospace', fontSize: '0.75rem', color: '#94a3b8' }}>{r.workflowId.slice(0, 8)}…</td>
              <td style={{ ...TD, color: STATUS_COLOR[r.status] ?? '#94a3b8' }}>{r.status}</td>
              <td style={{ ...TD, color: '#64748b', fontSize: '0.75rem' }}>{r.startedAt ? new Date(r.startedAt).toLocaleString() : '—'}</td>
              <td style={{ ...TD, color: '#64748b', fontSize: '0.75rem' }}>{r.completedAt ? new Date(r.completedAt).toLocaleString() : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

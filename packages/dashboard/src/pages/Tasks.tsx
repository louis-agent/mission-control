import { useEffect, useState } from 'react';
import { api, type Task } from '../api.js';
import { useSSE } from '../hooks/useSSE.js';

const PRIORITY: Record<string, string> = { critical: '#ef4444', high: '#f97316', medium: '#f59e0b', low: '#94a3b8' };
const TH: React.CSSProperties = { textAlign: 'left', padding: '0.5rem 0.75rem', borderBottom: '1px solid #2d3748', color: '#94a3b8', fontSize: '0.75rem', textTransform: 'uppercase' };
const TD: React.CSSProperties = { padding: '0.5rem 0.75rem', borderBottom: '1px solid #1a1f2e' };
const STATUSES = ['all', 'pending', 'running', 'completed', 'failed'];

export function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState('all');
  const sseEvent = useSSE('/events');

  const load = () => api.tasks.list().then(setTasks).catch(console.error);
  useEffect(() => { void load(); }, []);
  useEffect(() => { if (sseEvent) void load(); }, [sseEvent]);

  const shown = filter === 'all' ? tasks : tasks.filter(t => t.status === filter);

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', alignItems: 'center' }}>
        <h2 style={{ color: '#e2e8f0', marginRight: 'auto' }}>Tasks ({tasks.length})</h2>
        {STATUSES.map(s => (
          <button key={s} onClick={() => setFilter(s)}
            style={{ padding: '0.25rem 0.75rem', borderRadius: 4, border: 'none', cursor: 'pointer',
              background: filter === s ? '#7c3aed' : '#1a1f2e', color: '#e2e8f0', fontSize: '0.8rem' }}>
            {s}
          </button>
        ))}
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
        <thead><tr>{['Title', 'Status', 'Priority', 'Created'].map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead>
        <tbody>
          {shown.map(t => (
            <tr key={t.id}>
              <td style={{ ...TD, maxWidth: 300 }}>{t.title}</td>
              <td style={TD}>{t.status}</td>
              <td style={{ ...TD, color: PRIORITY[t.priority] ?? '#94a3b8' }}>{t.priority}</td>
              <td style={{ ...TD, color: '#64748b', fontSize: '0.75rem' }}>{new Date(t.createdAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

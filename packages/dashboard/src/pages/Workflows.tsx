import { useEffect, useState } from 'react';
import { api, type Workflow } from '../api.js';

const TH: React.CSSProperties = { textAlign: 'left', padding: '0.5rem 0.75rem', borderBottom: '1px solid #2d3748', color: '#94a3b8', fontSize: '0.75rem', textTransform: 'uppercase' };
const TD: React.CSSProperties = { padding: '0.5rem 0.75rem', borderBottom: '1px solid #1a1f2e' };

export function Workflows() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [executing, setExecuting] = useState<string | null>(null);

  useEffect(() => { api.workflows.list().then(setWorkflows).catch(console.error); }, []);

  const execute = async (id: string) => {
    setExecuting(id);
    try { await api.workflows.execute(id); }
    finally { setExecuting(null); }
  };

  return (
    <div>
      <h2 style={{ marginBottom: '1rem', color: '#e2e8f0' }}>Workflows ({workflows.length})</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
        <thead><tr>{['Name', 'Status', 'Created', ''].map((h, i) => <th key={i} style={TH}>{h}</th>)}</tr></thead>
        <tbody>
          {workflows.map(w => (
            <tr key={w.id}>
              <td style={TD}>{w.name}</td>
              <td style={TD}>{w.status}</td>
              <td style={{ ...TD, color: '#64748b', fontSize: '0.75rem' }}>{new Date(w.createdAt).toLocaleString()}</td>
              <td style={TD}>
                <button onClick={() => void execute(w.id)} disabled={executing === w.id}
                  style={{ padding: '0.2rem 0.6rem', borderRadius: 4, border: 'none', cursor: 'pointer',
                    background: '#7c3aed', color: '#fff', fontSize: '0.75rem', opacity: executing === w.id ? 0.5 : 1 }}>
                  {executing === w.id ? 'Running…' : '▶ Execute'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

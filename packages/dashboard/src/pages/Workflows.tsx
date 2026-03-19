import { useEffect, useState } from 'react';
import { api, type Workflow } from '../api.js';

const STATUS_COLORS: Record<string, string> = {
  active:   'var(--green)',
  inactive: 'var(--text-muted)',
  draft:    'var(--amber)',
};

function WorkflowCard({ workflow, onExecute, executing }: {
  workflow: Workflow;
  onExecute: (id: string) => void;
  executing: boolean;
}) {
  const color = STATUS_COLORS[workflow.status] ?? 'var(--text-secondary)';

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      padding: '16px',
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
      animation: 'glow-in 0.25s ease both',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: color, opacity: 0.5 }} />

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {workflow.name}
          </div>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
            color, background: `${color}18`,
            padding: '2px 7px', borderRadius: 4, border: `1px solid ${color}30`,
          }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: color, flexShrink: 0 }} />
            {workflow.status}
          </span>
        </div>

        {/* Execute button */}
        <button
          onClick={() => onExecute(workflow.id)}
          disabled={executing}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 12px', borderRadius: 6,
            border: executing ? '1px solid var(--border)' : '1px solid rgba(0,212,255,0.3)',
            cursor: executing ? 'not-allowed' : 'pointer',
            background: executing ? 'var(--bg-elevated)' : 'var(--accent-dim)',
            color: executing ? 'var(--text-muted)' : 'var(--accent)',
            fontSize: 11, fontWeight: 600,
            transition: 'all 0.12s ease',
            flexShrink: 0,
          }}
        >
          {executing ? (
            <>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--amber)', animation: 'blink 0.8s ease infinite' }} />
              Running…
            </>
          ) : (
            <>
              <svg width="9" height="9" viewBox="0 0 9 9" fill="none"><polygon points="2,1 8,4.5 2,8" fill="currentColor"/></svg>
              Execute
            </>
          )}
        </button>
      </div>

      <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: 5 }}>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1.2"/><path d="M5 3v2.5l1.5 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
        Created {new Date(workflow.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
      </div>
    </div>
  );
}

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 960 }}>
      {/* Summary */}
      <div style={{ display: 'flex', gap: 10 }}>
        {[
          { label: 'Total',    value: workflows.length, color: 'var(--accent)' },
          { label: 'Active',   value: workflows.filter(w => w.status === 'active').length,   color: 'var(--green)' },
          { label: 'Inactive', value: workflows.filter(w => w.status === 'inactive').length, color: 'var(--text-muted)' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8,
            padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 18, color: 'var(--text-primary)' }}>{value}</span>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{label}</span>
          </div>
        ))}
      </div>

      {workflows.length === 0 ? (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10,
          padding: '48px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13,
        }}>
          No workflows defined yet.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {workflows.map(w => (
            <WorkflowCard
              key={w.id}
              workflow={w}
              onExecute={id => void execute(id)}
              executing={executing === w.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

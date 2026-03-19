import { useEffect, useState } from 'react';
import { api, type ExecutionRun } from '../api.js';
import { useSSE } from '../hooks/useSSE.js';

const STATUS_COLOR: Record<string, string> = {
  pending:   'var(--text-secondary)',
  running:   'var(--accent)',
  completed: 'var(--green)',
  failed:    'var(--red)',
  cancelled: 'var(--text-muted)',
};

function duration(start: string | null, end: string | null): string {
  if (!start) return '—';
  const endTime = end ? new Date(end).getTime() : Date.now();
  const ms = endTime - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function RunRow({ run, index }: { run: ExecutionRun; index: number }) {
  const color = STATUS_COLOR[run.status] ?? 'var(--text-muted)';
  const isRunning = run.status === 'running';

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '110px 110px 110px 1fr 90px',
      gap: 12,
      alignItems: 'center',
      padding: '10px 16px',
      borderBottom: '1px solid var(--border)',
      animation: `glow-in 0.2s ${index * 0.03}s ease both`,
      opacity: 0,
    }}
    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
    >
      {/* Run ID */}
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
        <svg width="9" height="9" viewBox="0 0 9 9" fill="none"><polygon points="2,1 8,4.5 2,8" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg>
        {run.id.slice(0, 8)}
      </span>

      {/* Workflow ID */}
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>
        {run.workflowId.slice(0, 8)}
      </span>

      {/* Status */}
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        fontSize: 10, fontWeight: 600, color,
        background: `${color}18`, padding: '2px 8px', borderRadius: 4,
        border: `1px solid ${color}30`, textTransform: 'capitalize',
        maxWidth: 100,
      }}>
        <span style={{
          width: 5, height: 5, borderRadius: '50%', background: color, flexShrink: 0,
          ...(isRunning ? { animation: 'blink 1s ease infinite' } : {}),
        }} />
        {run.status}
      </span>

      {/* Timeline */}
      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
        {run.startedAt ? (
          <span>
            {new Date(run.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            {' '}
            <span style={{ color: 'var(--text-muted)' }}>→</span>
            {' '}
            {run.completedAt
              ? new Date(run.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
              : <span style={{ color, animation: isRunning ? 'blink 2s ease infinite' : 'none' }}>now</span>
            }
          </span>
        ) : '—'}
      </div>

      {/* Duration */}
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: run.status === 'completed' ? 'var(--green)' : 'var(--text-muted)', textAlign: 'right' }}>
        {duration(run.startedAt, run.completedAt)}
      </span>
    </div>
  );
}

export function Runs() {
  const [runs, setRuns] = useState<ExecutionRun[]>([]);
  const sseEvent = useSSE('/events/stream');

  const load = () => api.runs.list().then(setRuns).catch(console.error);
  useEffect(() => { void load(); }, []);
  useEffect(() => { if (sseEvent) void load(); }, [sseEvent]);

  const active   = runs.filter(r => r.status === 'running').length;
  const success  = runs.filter(r => r.status === 'completed').length;
  const failed   = runs.filter(r => r.status === 'failed').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 960 }}>
      {/* Summary */}
      <div style={{ display: 'flex', gap: 10 }}>
        {[
          { label: 'Total',   value: runs.length, color: 'var(--accent)' },
          { label: 'Running', value: active,       color: 'var(--accent)' },
          { label: 'Done',    value: success,      color: 'var(--green)' },
          { label: 'Failed',  value: failed,       color: 'var(--red)' },
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

      {/* List */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '110px 110px 110px 1fr 90px', gap: 12,
          padding: '8px 16px', background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-strong)',
        }}>
          {['Run ID', 'Workflow', 'Status', 'Timeline', 'Duration'].map(h => (
            <div key={h} style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              {h}
            </div>
          ))}
        </div>

        {runs.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
            No execution runs yet.
          </div>
        ) : (
          runs.map((r, i) => <RunRow key={r.id} run={r} index={i} />)
        )}
      </div>
    </div>
  );
}

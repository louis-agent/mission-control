import { useEffect, useState } from 'react';
import { api, type Task } from '../api.js';
import { useSSE } from '../hooks/useSSE.js';

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'var(--red)',
  high:     'var(--amber)',
  medium:   '#a78bfa',
  low:      'var(--text-secondary)',
};
const STATUS_COLORS: Record<string, string> = {
  pending:   'var(--text-secondary)',
  running:   'var(--accent)',
  completed: 'var(--green)',
  failed:    'var(--red)',
  cancelled: 'var(--text-muted)',
};
const STATUSES = ['all', 'pending', 'running', 'completed', 'failed'] as const;

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function PriorityDot({ priority }: { priority: string }) {
  const color = PRIORITY_COLORS[priority] ?? 'var(--text-muted)';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
      color,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
      {priority}
    </span>
  );
}

function StatusPill({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? 'var(--text-muted)';
  const isRunning = status === 'running';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: 10, fontWeight: 600, letterSpacing: '0.06em',
      color, background: `${color}18`,
      padding: '2px 8px', borderRadius: 4,
      border: `1px solid ${color}30`,
      textTransform: 'capitalize',
    }}>
      <span style={{
        width: 5, height: 5, borderRadius: '50%', background: color, flexShrink: 0,
        ...(isRunning ? { animation: 'blink 1s ease infinite' } : {}),
      }} />
      {status}
    </span>
  );
}

function TaskRow({ task }: { task: Task }) {
  const priorityColor = PRIORITY_COLORS[task.priority] ?? 'var(--border)';
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 120px 100px 90px',
      alignItems: 'center',
      gap: 12,
      padding: '10px 14px',
      borderBottom: '1px solid var(--border)',
      position: 'relative',
      transition: 'background 0.12s ease',
    }}
    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
    >
      {/* Priority stripe */}
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 2, background: priorityColor, opacity: 0.5 }} />

      <div style={{ paddingLeft: 6, overflow: 'hidden' }}>
        <div style={{ fontWeight: 500, fontSize: 13, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {task.title}
        </div>
        {task.assigneeAgentId && (
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
            agent: {task.assigneeAgentId.slice(0, 8)}…
          </div>
        )}
      </div>

      <StatusPill status={task.status} />
      <PriorityDot priority={task.priority} />
      <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{timeAgo(task.createdAt)}</span>
    </div>
  );
}

export function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const sseEvent = useSSE('/events/stream');

  const load = () => api.tasks.list().then(setTasks).catch(console.error);
  useEffect(() => { void load(); }, []);
  useEffect(() => { if (sseEvent) void load(); }, [sseEvent]);

  const shown = filter === 'all' ? tasks : tasks.filter(t => t.status === filter);
  const counts = Object.fromEntries(STATUSES.map(s => [s, tasks.filter(t => t.status === s).length]));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 960 }}>
      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {STATUSES.map(s => {
          const active = filter === s;
          const count = s === 'all' ? tasks.length : (counts[s] ?? 0);
          return (
            <button key={s} onClick={() => setFilter(s)} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 12px', borderRadius: 6, cursor: 'pointer',
              background: active ? 'var(--accent-dim)' : 'var(--bg-elevated)',
              color: active ? 'var(--accent)' : 'var(--text-secondary)',
              fontSize: 12, fontWeight: active ? 600 : 500,
              border: active ? '1px solid rgba(0,212,255,0.2)' : '1px solid var(--border)',
              transition: 'all 0.12s ease',
            }}>
              {s}
              <span style={{
                fontSize: 10, fontFamily: 'var(--font-mono)',
                background: active ? 'rgba(0,212,255,0.2)' : 'var(--bg-hover)',
                color: active ? 'var(--accent)' : 'var(--text-muted)',
                padding: '0 5px', borderRadius: 3,
              }}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        {/* Header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 120px 100px 90px',
          gap: 12,
          padding: '8px 14px',
          borderBottom: '1px solid var(--border-strong)',
          background: 'var(--bg-elevated)',
        }}>
          {['Task', 'Status', 'Priority', 'Age'].map(h => (
            <div key={h} style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              {h}
            </div>
          ))}
        </div>

        {shown.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
            No tasks matching "{filter}".
          </div>
        ) : (
          shown.map(t => <TaskRow key={t.id} task={t} />)
        )}
      </div>
    </div>
  );
}

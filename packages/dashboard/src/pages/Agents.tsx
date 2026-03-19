import { useEffect, useState } from 'react';
import { api, type Agent } from '../api.js';
import { useSSE } from '../hooks/useSSE.js';

const STATUS_COLORS: Record<string, string> = {
  idle:    'var(--green)',
  busy:    'var(--amber)',
  offline: 'var(--text-muted)',
};
const STATUS_BG: Record<string, string> = {
  idle:    'var(--green-dim)',
  busy:    'var(--amber-dim)',
  offline: 'rgba(255,255,255,0.04)',
};

function timeAgo(iso: string | null): string {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

function AgentCard({ agent }: { agent: Agent }) {
  const color = STATUS_COLORS[agent.status] ?? 'var(--text-muted)';
  const bg = STATUS_BG[agent.status] ?? 'rgba(255,255,255,0.04)';
  const isBusy = agent.status === 'busy';

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      padding: '16px',
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      animation: 'glow-in 0.25s ease both',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 2, background: color, opacity: 0.6 }} />

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 8, flexShrink: 0,
          background: `linear-gradient(135deg, ${color}22, ${color}44)`,
          border: `1px solid ${color}33`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, fontWeight: 700, color,
          fontFamily: 'var(--font-mono)',
        }}>
          {agent.name.slice(0, 2).toUpperCase()}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {agent.name}
          </div>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
            color, background: bg,
            padding: '2px 7px', borderRadius: 4,
            border: `1px solid ${color}33`,
          }}>
            <span style={{
              width: 5, height: 5, borderRadius: '50%', background: color, flexShrink: 0,
              ...(isBusy ? { animation: 'blink 1.2s ease infinite' } : {}),
            }} />
            {agent.status}
          </span>
        </div>
      </div>

      {agent.capabilities.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {agent.capabilities.map(cap => (
            <span key={cap} style={{
              fontSize: 10, fontFamily: 'var(--font-mono)',
              color: 'var(--text-secondary)',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              padding: '2px 6px', borderRadius: 3,
            }}>{cap}</span>
          ))}
        </div>
      )}

      <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: 5 }}>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1.2"/><path d="M5 3v2.5l1.5 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
        {timeAgo(agent.lastHeartbeatAt)}
      </div>
    </div>
  );
}

export function Agents() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const sseEvent = useSSE('/events/stream');

  const load = () => api.agents.list().then(setAgents).catch(console.error);
  useEffect(() => { void load(); }, []);
  useEffect(() => { if (sseEvent) void load(); }, [sseEvent]);

  const busy    = agents.filter(a => a.status === 'busy');
  const idle    = agents.filter(a => a.status === 'idle');
  const offline = agents.filter(a => a.status === 'offline');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 960 }}>
      <div style={{ display: 'flex', gap: 10 }}>
        {[
          { label: 'Total',   value: agents.length, color: 'var(--accent)' },
          { label: 'Active',  value: busy.length,   color: 'var(--amber)' },
          { label: 'Idle',    value: idle.length,   color: 'var(--green)' },
          { label: 'Offline', value: offline.length, color: 'var(--text-muted)' },
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

      {agents.length === 0 ? (
        <div style={{ color: 'var(--text-secondary)', fontSize: 13, padding: '40px 0', textAlign: 'center' }}>
          No agents registered.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
          {[...busy, ...idle, ...offline].map(a => (
            <AgentCard key={a.id} agent={a} />
          ))}
        </div>
      )}
    </div>
  );
}

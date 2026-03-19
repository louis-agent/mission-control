import { useEffect, useState } from 'react';
import { api, type DashboardMetrics } from '../api.js';

function StatCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  const color = accent ?? 'var(--accent)';
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      padding: '16px 18px',
      position: 'relative',
      overflow: 'hidden',
      animation: 'glow-in 0.3s ease both',
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: color, opacity: 0.7 }} />
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1, letterSpacing: '-0.03em', fontFamily: 'var(--font-mono)' }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

function SparkBar({ data }: { data: Array<{ count: number }> }) {
  const max = Math.max(1, ...data.map(d => d.count));
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 52 }}>
      {data.map((d, i) => {
        const pct = Math.max(5, (d.count / max) * 100);
        const isLast = i === data.length - 1;
        return (
          <div key={i} style={{
            flex: 1, height: `${pct}%`, borderRadius: '3px 3px 0 0',
            background: isLast ? 'var(--accent)' : 'rgba(0,212,255,0.22)',
            boxShadow: isLast ? '0 0 10px rgba(0,212,255,0.5)' : 'none',
            transition: 'height 0.3s ease',
          }} />
        );
      })}
    </div>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
      color: 'var(--text-muted)', marginBottom: 14,
      display: 'flex', alignItems: 'center', gap: 10,
    }}>
      {children}
      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
    </div>
  );
}

export function Metrics() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const load = () => api.dashboard.metrics().then(setMetrics).catch(console.error);
    void load();
    const interval = setInterval(() => { void load(); setTick(t => t + 1); }, 10_000);
    return () => clearInterval(interval);
  }, []);

  if (!metrics) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-secondary)', fontSize: 13 }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', animation: 'blink 1s ease infinite' }} />
        Initializing telemetry…
      </div>
    );
  }

  const utilPct = metrics.agentUtilization.total > 0
    ? Math.round((metrics.agentUtilization.busy / metrics.agentUtilization.total) * 100)
    : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28, maxWidth: 960 }}>
      <SectionLabel>Core Metrics</SectionLabel>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))', gap: 12 }}>
        <StatCard label="Agents" value={metrics.agentUtilization.total} sub={`${metrics.agentUtilization.idle} idle · ${metrics.agentUtilization.busy} active`} accent="var(--accent)" />
        <StatCard label="Queue Depth" value={metrics.queueDepth} sub="pending tasks" accent="var(--amber)" />
        <StatCard label="Throughput / hr" value={metrics.taskThroughput.lastHour} sub={`${metrics.taskThroughput.lastDay} in 24h`} accent="var(--green)" />
        <StatCard label="Failure Rate" value={`${metrics.failureRate}%`} sub="last 24h" accent={metrics.failureRate > 10 ? 'var(--red)' : 'var(--green)'} />
        <StatCard label="Workflows" value={metrics.activeWorkflows} sub="active" accent="var(--purple)" />
        <StatCard label="Active Runs" value={metrics.activeExecutionRuns} sub="executing now" accent="var(--accent)" />
      </div>

      <div>
        <SectionLabel>Agent Utilization</SectionLabel>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {metrics.agentUtilization.busy} of {metrics.agentUtilization.total} agents active
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: utilPct > 80 ? 'var(--amber)' : 'var(--green)' }}>
              {utilPct}%
            </span>
          </div>
          <div style={{ height: 5, background: 'var(--bg-elevated)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${utilPct}%`, borderRadius: 3,
              background: utilPct > 80
                ? 'linear-gradient(90deg, var(--amber), var(--red))'
                : 'linear-gradient(90deg, var(--accent), var(--green))',
              transition: 'width 0.5s ease',
              boxShadow: '0 0 8px rgba(0,212,255,0.4)',
            }} />
          </div>
          <div style={{ display: 'flex', gap: 18, marginTop: 12 }}>
            {[
              { label: 'Idle', value: metrics.agentUtilization.idle, color: 'var(--green)' },
              { label: 'Busy', value: metrics.agentUtilization.busy, color: 'var(--amber)' },
              { label: 'Offline', value: metrics.agentUtilization.offline, color: 'var(--text-muted)' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{label} </span>
                <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-primary)' }}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {metrics.timeSeries.completedTasks.length > 0 && (
        <div>
          <SectionLabel>Completed Tasks — Last 24h</SectionLabel>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '18px 20px 14px' }}>
            <SparkBar data={metrics.timeSeries.completedTasks} />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>24h ago</span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>now</span>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: 11 }}>
        <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--green)', animation: 'blink 2s ease infinite' }} />
        Live · refreshes every 10s
        {tick > 0 && <span style={{ fontFamily: 'var(--font-mono)' }}>· {tick} refresh{tick !== 1 ? 'es' : ''}</span>}
      </div>
    </div>
  );
}

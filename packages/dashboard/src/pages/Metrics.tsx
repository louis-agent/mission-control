import { useEffect, useState } from 'react';
import { api, type DashboardMetrics } from '../api.js';

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div style={{ background: '#1a1f2e', borderRadius: 8, padding: '1rem', minWidth: 140 }}>
      <div style={{ color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      <div style={{ color: '#e2e8f0', fontSize: '1.5rem', fontWeight: 700 }}>{value}</div>
      {sub && <div style={{ color: '#64748b', fontSize: '0.75rem', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function MiniChart({ data }: { data: Array<{ count: number }> }) {
  const max = Math.max(1, ...data.map(d => d.count));
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 40 }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, background: '#7c3aed', borderRadius: 2,
          opacity: 0.4 + 0.6 * (d.count / max),
          height: `${Math.max(4, (d.count / max) * 100)}%` }} />
      ))}
    </div>
  );
}

export function Metrics() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);

  useEffect(() => {
    const load = () => api.dashboard.metrics().then(setMetrics).catch(console.error);
    void load();
    const interval = setInterval(load, 10_000);
    return () => clearInterval(interval);
  }, []);

  if (!metrics) return <div style={{ color: '#64748b' }}>Loading metrics…</div>;

  return (
    <div>
      <h2 style={{ marginBottom: '1rem', color: '#e2e8f0' }}>Dashboard</h2>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        <StatCard label="Total Agents" value={metrics.agentUtilization.total} sub={`${metrics.agentUtilization.idle} idle, ${metrics.agentUtilization.busy} busy`} />
        <StatCard label="Queue Depth" value={metrics.queueDepth} sub="pending tasks" />
        <StatCard label="Throughput / hr" value={metrics.taskThroughput.lastHour} sub={`${metrics.taskThroughput.lastDay} / 24h`} />
        <StatCard label="Failure Rate" value={`${metrics.failureRate}%`} sub="last 24h" />
        <StatCard label="Active Workflows" value={metrics.activeWorkflows} />
        <StatCard label="Active Runs" value={metrics.activeExecutionRuns} />
      </div>
      <div style={{ background: '#1a1f2e', borderRadius: 8, padding: '1rem' }}>
        <div style={{ color: '#94a3b8', fontSize: '0.8rem', marginBottom: '0.5rem' }}>Completed Tasks — Last 24h</div>
        <MiniChart data={metrics.timeSeries.completedTasks} />
      </div>
    </div>
  );
}

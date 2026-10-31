import React from 'react';

interface KpiCardProps {
  label: string;
  value: string | number;
  unit?: string;
  detail?: string;
  icon?: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  accent?: boolean;
}

export function KpiCard({ label, value, unit = 'MW', detail, icon, accent }: KpiCardProps) {
  return (
    <article className={`kpi-card${accent ? ' kpi-card--accent' : ''}`}>
      <div className="kpi-card__header">
        {icon && <span className="kpi-card__icon">{icon}</span>}
        <span className="kpi-card__label">{label}</span>
      </div>
      <strong className="kpi-card__value">{value}</strong>
      <small className="kpi-card__detail">{detail || unit}</small>
    </article>
  );
}

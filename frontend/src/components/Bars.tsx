import React from 'react';
import { fmt } from '../utils/format';

interface BarsProps {
  values: { label: string; value: number | null }[];
  label: string;
}

export function Bars({ values, label }: BarsProps) {
  const shown = values.filter(
    (entry) => entry.value != null && Number.isFinite(entry.value)
  );
  if (!shown.length)
    return (
      <div className="empty-state">
        No observations for this selection.
      </div>
    );
  const max = Math.max(
    1,
    ...shown.map((entry) => Math.abs(entry.value || 0))
  );
  return (
    <div className="bars" role="group" aria-label={label}>
      <div className="bars-scroll">
        {shown.map((entry, index) => (
          <div
            className="bar-item"
            key={`${entry.label}-${index}`}
            title={`${entry.label}: ${fmt(entry.value)}`}
          >
            <span>{fmt(entry.value)}</span>
            <div
              style={{
                height: `${Math.max(3, (Math.abs(entry.value || 0) / max) * 150)}px`,
              }}
              className={
                (entry.value || 0) < 0 ? 'bar neg' : 'bar'
              }
            />
            <small>{entry.label}</small>
          </div>
        ))}
      </div>
    </div>
  );
}

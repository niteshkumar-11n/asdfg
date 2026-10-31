import React from 'react';
import type { Meta } from '../types';

interface DecisionFiltersProps {
  meta: Meta | null;
  day: string;
  cutoff: string;
  useCustomCutoff: boolean;
  publicationLag: string;
  band: string;
  dayValid: boolean;
  onDayChange: (day: string) => void;
  onCutoffChange: (cutoff: string) => void;
  onUseCustomCutoffChange: (use: boolean) => void;
  onPublicationLagChange: (lag: string) => void;
  onBandChange: (band: string) => void;
}

export function DecisionFilters({
  meta,
  day,
  cutoff,
  useCustomCutoff,
  publicationLag,
  band,
  dayValid,
  onDayChange,
  onCutoffChange,
  onUseCustomCutoffChange,
  onPublicationLagChange,
  onBandChange,
}: DecisionFiltersProps) {
  const scopeWindow = meta?.window;
  const cutoffValue = (useCustomCutoff ? cutoff : cutoff || meta?.cutoff_presets?.[0]) || '';

  return (
    <section className="filters" aria-label="Analysis filters">
      <div className="filters__group">
        <label className="filter">
          <span className="filter__label">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            Decision day
          </span>
          <input
            type="date"
            min={scopeWindow?.decision_from}
            max={scopeWindow?.decision_to}
            value={dayValid ? day : ''}
            onChange={(e) => onDayChange(e.target.value)}
            disabled={!scopeWindow}
          />
        </label>

        <label className="filter">
          <span className="filter__label">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            Market cutoff
          </span>
          <select
            value={useCustomCutoff ? 'custom' : cutoffValue}
            onChange={(e) => {
              if (e.target.value === 'custom') onUseCustomCutoffChange(true);
              else { onUseCustomCutoffChange(false); onCutoffChange(e.target.value); }
            }}
            disabled={!meta}
          >
            {(meta?.cutoff_presets || []).map((v) => (
              <option key={v} value={v}>{v} UK</option>
            ))}
            <option value="custom">Custom time…</option>
          </select>
        </label>

        {useCustomCutoff && (
          <label className="filter">
            <span className="filter__label">Custom cutoff</span>
            <input
              type="time"
              value={cutoffValue}
              onChange={(e) => onCutoffChange(e.target.value)}
              aria-label="Custom market cutoff"
            />
          </label>
        )}

        <label className="filter">
          <span className="filter__label">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/></svg>
            Publication lag
          </span>
          <div className="filter__input-group">
            <input
              type="number"
              min="0"
              max="720"
              step="5"
              value={publicationLag}
              onChange={(e) => onPublicationLagChange(String(Math.max(0, Math.min(720, Number(e.target.value) || 0))))}
              aria-label="Additional forecast publication lag in minutes"
            />
            <span className="filter__suffix">min</span>
          </div>
        </label>

        <label className="filter">
          <span className="filter__label">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
            Uncertainty band
          </span>
          <select value={band} onChange={(e) => onBandChange(e.target.value)}>
            <option value="pooled">Pooled window</option>
            <option value="rolling">Rolling history</option>
          </select>
        </label>
      </div>
    </section>
  );
}

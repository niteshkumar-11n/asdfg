import React from 'react';
import { dateLabel, monthHeading } from '../utils/format';
import type { Meta } from '../types';

interface HeaderProps {
  meta: Meta | null;
  view: string;
  onMobileMenuToggle: () => void;
  mobileMenuOpen: boolean;
}

const VIEW_TITLES: Record<string, { title: string; description: string }> = {
  decision: { title: 'Decision Desk', description: "Forecast and outturn analysis for tomorrow's wind delivery" },
  accuracy: { title: 'Accuracy Analysis', description: 'Historical forecast performance metrics and distribution' },
  horizon: { title: 'Forecast Age', description: 'Vintage analysis — does waiting for newer forecasts help?' },
  data: { title: 'Data & Coverage', description: 'Source metadata, quality checks, and coverage statistics' },
};

export function Header({ meta, view, onMobileMenuToggle, mobileMenuOpen }: HeaderProps) {
  const viewInfo = VIEW_TITLES[view] || VIEW_TITLES.decision;
  const scopeWindow = meta?.window;
  const dateRange = scopeWindow
    ? `${dateLabel(scopeWindow.decision_from)} – ${dateLabel(scopeWindow.decision_to)}`
    : '';

  return (
    <header className="header">
      <div className="header__left">
        <button className="header__mobile-menu" onClick={onMobileMenuToggle} aria-label="Toggle navigation">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {mobileMenuOpen ? (
              <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>
            ) : (
              <><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></>
            )}
          </svg>
        </button>
        <div className="header__title-group">
          <h1 className="header__title">{viewInfo.title}</h1>
          <p className="header__description">{viewInfo.description}</p>
        </div>
      </div>
      <div className="header__right">
        {dateRange && (
          <div className="header__date-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            <span>{dateRange}</span>
          </div>
        )}
        {meta && (
          <div className="header__live-indicator">
            <span className={`header__live-dot${meta.synthetic ? ' header__live-dot--demo' : ''}`} />
            <span>{meta.synthetic ? 'Demo' : 'Live'}</span>
          </div>
        )}
      </div>
    </header>
  );
}

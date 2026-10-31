import React from 'react';
import type { Meta } from '../types';

interface SidebarProps {
  view: string;
  onNavigate: (view: string) => void;
  collapsed: boolean;
  onToggle: () => void;
  meta: Meta | null;
}

const NAV_ITEMS = [
  { id: 'decision', label: 'Decision Desk', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg> },
  { id: 'accuracy', label: 'Accuracy', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg> },
  { id: 'horizon', label: 'Forecast Age', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> },
  { id: 'data', label: 'Data', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg> },
];

export function Sidebar({ view, onNavigate, collapsed, onToggle, meta }: SidebarProps) {
  return (
    <aside className={`sidebar${collapsed ? ' sidebar--collapsed' : ''}`}>
      <div className="sidebar__brand">
        <div className="sidebar__logo">
          <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
            <rect width="32" height="32" rx="8" fill="#0d9488" />
            <path d="M8 22 L16 8 L24 22 Z" fill="none" stroke="white" strokeWidth="2.5" strokeLinejoin="round" />
            <path d="M12 18 L16 11 L20 18" fill="none" stroke="white" strokeWidth="2" strokeLinejoin="round" strokeOpacity="0.6" />
          </svg>
        </div>
        {!collapsed && (
          <div className="sidebar__brand-text">
            <span className="sidebar__brand-name">WindDesk</span>
            <span className="sidebar__brand-tag">Day-Ahead Intelligence</span>
          </div>
        )}
        <button className="sidebar__toggle" onClick={onToggle} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {collapsed ? (
              <><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></>
            ) : (
              <><polyline points="15 18 9 12 15 6"/></>
            )}
          </svg>
        </button>
      </div>

      <nav className="sidebar__nav">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            className={`sidebar__nav-item${view === item.id ? ' sidebar__nav-item--active' : ''}`}
            onClick={() => onNavigate(item.id)}
            title={collapsed ? item.label : undefined}
            aria-label={item.label}
            aria-current={view === item.id ? 'page' : undefined}
          >
            <span className="sidebar__nav-icon">{item.icon}</span>
            {!collapsed && <span className="sidebar__nav-label">{item.label}</span>}
            {view === item.id && !collapsed && <span className="sidebar__nav-indicator" />}
          </button>
        ))}
      </nav>

      {!collapsed && meta && (
        <div className="sidebar__footer">
          <div className="sidebar__status">
            <span className="sidebar__status-dot" />
            <span>{meta.synthetic ? 'Demo data' : 'Live snapshot'}</span>
          </div>
          <small className="sidebar__source">{meta.source || 'Elexon BMRS'}</small>
        </div>
      )}
    </aside>
  );
}

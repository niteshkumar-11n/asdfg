import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

import type { Meta, Decision, Accuracy, Horizon } from './types';
import { useApi } from './hooks/useApi';
import { fmt, dateLabel, rangeDays } from './utils/format';

import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { DecisionFilters } from './components/DecisionFilters';
import { LoadingState, ErrorState } from './components/States';

import { DecisionView } from './views/DecisionView';
import { AccuracyView } from './views/AccuracyView';
import { HorizonView } from './views/HorizonView';
import { DataView } from './views/DataView';

function App() {
  /* ─── Meta API ──────────────────────────────────────────────── */
  const metaState = useApi<Meta>('/api/meta');
  const meta = metaState.data;
  const scopeWindow = meta?.window;

  /* ─── Navigation ────────────────────────────────────────────── */
  const [view, setView] = useState(() => location.hash.slice(1) || 'decision');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const update = () => setView(location.hash.slice(1) || 'decision');
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);

  const handleNavigate = (id: string) => {
    location.hash = id;
    setView(id);
    setMobileMenuOpen(false);
  };

  /* ─── Filters ───────────────────────────────────────────────── */
  const [day, setDay] = useState(() => new URLSearchParams(location.search).get('decision_date') || '');
  const [cutoff, setCutoff] = useState(() => new URLSearchParams(location.search).get('cutoff') || '');
  const [useCustomCutoff, setUseCustomCutoff] = useState(false);
  const [publicationLag, setPublicationLag] = useState(
    () => new URLSearchParams(location.search).get('publication_lag_min') || ''
  );
  const [band, setBand] = useState(
    () => new URLSearchParams(location.search).get('band') || 'pooled'
  );

  /* ─── Sync filters to meta defaults ────────────────────────── */
  useEffect(() => {
    if (scopeWindow) {
      if (!day || day < scopeWindow.decision_from || day > scopeWindow.decision_to)
        setDay(scopeWindow.decision_from);
      if (!cutoff && meta?.cutoff_presets?.length) setCutoff(meta.cutoff_presets[0]);
      if (cutoff && !meta?.cutoff_presets?.includes(cutoff)) setUseCustomCutoff(true);
      if (publicationLag === '') setPublicationLag(String(meta?.publication_lag_min ?? 0));
    }
  }, [scopeWindow, day, cutoff, publicationLag, meta?.cutoff_presets, meta?.publication_lag_min]);

  /* ─── URL sync ──────────────────────────────────────────────── */
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (day) params.set('decision_date', day);
    if (cutoff) params.set('cutoff', cutoff);
    if (publicationLag !== '') params.set('publication_lag_min', publicationLag);
    params.set('band', band);
    history.replaceState(null, '', `${location.pathname}?${params}${location.hash}`);
  }, [day, cutoff, publicationLag, band]);

  /* ─── Derived values ────────────────────────────────────────── */
  const cutoffValue = (useCustomCutoff ? cutoff : cutoff || meta?.cutoff_presets?.[0]) || '';
  const lagValue = Math.max(0, Math.min(720, Number(publicationLag) || 0));
  const dayValid = Boolean(
    scopeWindow && day >= scopeWindow.decision_from && day <= scopeWindow.decision_to
  );

  /* ─── API calls ─────────────────────────────────────────────── */
  const decisionState = useApi<Decision>(
    meta && dayValid
      ? `/api/decision?${new URLSearchParams({
          decision_date: day,
          cutoff: cutoffValue,
          publication_lag_min: String(lagValue),
          band,
        })}`
      : null
  );

  const accuracyState = useApi<Accuracy>(
    meta
      ? `/api/accuracy?${new URLSearchParams({
          cutoff: cutoffValue,
          publication_lag_min: String(lagValue),
        })}`
      : null
  );

  const horizonState = useApi<Horizon>(
    meta
      ? `/api/horizon?${new URLSearchParams({
          cutoff: cutoffValue,
          publication_lag_min: String(lagValue),
        })}`
      : null
  );

  /* ─── Error handling ────────────────────────────────────────── */
  const metaError =
    metaState.error ||
    (!metaState.loading && !meta
      ? 'The data API did not return a snapshot. Start the Flask backend and verify /api/health.'
      : '');

  /* ─── Dashboard class ──────────────────────────────────────── */
  const dashboardClass = [
    'dashboard',
    sidebarCollapsed ? 'dashboard--sidebar-collapsed' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={dashboardClass}
      aria-busy={
        decisionState.loading || accuracyState.loading || horizonState.loading
      }
    >
      {/* Sidebar */}
      <Sidebar
        view={view}
        onNavigate={handleNavigate}
        collapsed={sidebarCollapsed}
        onToggle={() => {
          setSidebarCollapsed(!sidebarCollapsed);
          if (mobileMenuOpen) setMobileMenuOpen(false);
        }}
        meta={meta}
      />

      {/* Mobile overlay */}
      <div
        className={`sidebar-overlay${mobileMenuOpen ? ' sidebar-overlay--visible' : ''}`}
        onClick={() => setMobileMenuOpen(false)}
      />

      {/* Mobile sidebar open class */}
      {mobileMenuOpen && (
        <style>{`.sidebar { transform: translateX(0) !important; }`}</style>
      )}

      {/* Main area */}
      <div className="dashboard__main">
        <Header
          meta={meta}
          view={view}
          onMobileMenuToggle={() => setMobileMenuOpen(!mobileMenuOpen)}
          mobileMenuOpen={mobileMenuOpen}
        />

        <div className="dashboard__content">
          {/* Global error */}
          {metaError && <ErrorState message={metaError} onRetry={metaState.retry} />}

          {/* Synthetic data banner */}
          {meta?.synthetic && (
            <div className="banner" role="status">
              DEMO DATA · This snapshot is synthetic. It must not be used for trading decisions.
            </div>
          )}

          {/* Loading meta */}
          {metaState.loading && <LoadingState message="Loading snapshot details…" />}

          {/* Filters */}
          {meta && (
            <DecisionFilters
              meta={meta}
              day={day}
              cutoff={cutoff}
              useCustomCutoff={useCustomCutoff}
              publicationLag={publicationLag}
              band={band}
              dayValid={dayValid}
              onDayChange={setDay}
              onCutoffChange={setCutoff}
              onUseCustomCutoffChange={setUseCustomCutoff}
              onPublicationLagChange={setPublicationLag}
              onBandChange={setBand}
            />
          )}

          {/* Views */}
          {meta && view === 'decision' && (
            <DecisionView
              meta={meta}
              decision={decisionState.data}
              decisionLoading={decisionState.loading}
              decisionError={decisionState.error}
              day={day}
              cutoffValue={cutoffValue}
              lagValue={lagValue}
              band={band}
              accuracy={accuracyState.data}
              onDayChange={setDay}
              onRetry={decisionState.retry}
            />
          )}

          {meta && view === 'accuracy' && (
            <AccuracyView
              meta={meta}
              accuracy={accuracyState.data}
              accuracyLoading={accuracyState.loading}
              accuracyError={accuracyState.error}
              onRetry={accuracyState.retry}
            />
          )}

          {meta && view === 'horizon' && (
            <HorizonView
              meta={meta}
              horizon={horizonState.data}
              horizonLoading={horizonState.loading}
              horizonError={horizonState.error}
              cutoffValue={cutoffValue}
              onRetry={horizonState.retry}
            />
          )}

          {meta && view === 'data' && <DataView meta={meta} />}
        </div>

        {/* Footer */}
        <footer className="footer">
          <span>WINDDESK</span>
          <span>Source: {meta?.source || 'snapshot'} · Read-only forecast and outturn analysis</span>
        </footer>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);

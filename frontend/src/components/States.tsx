import React from 'react';

interface LoadingStateProps {
  message?: string;
}

export function LoadingState({ message = 'Loading data…' }: LoadingStateProps) {
  return (
    <div className="loading-state">
      <div className="loading-state__spinner">
        <svg viewBox="0 0 50 50" className="loading-state__svg">
          <circle cx="25" cy="25" r="20" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="80, 200" strokeDashoffset="0" />
        </svg>
      </div>
      <p className="loading-state__text">{message}</p>
    </div>
  );
}

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="error-state" role="alert">
      <div className="error-state__icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <p className="error-state__message">{message}</p>
      {onRetry && (
        <button className="error-state__retry" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function EmptyState({ message = 'No data available for this selection.' }: { message?: string }) {
  return (
    <div className="empty-state">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
        <polyline points="13 2 13 9 20 9" />
      </svg>
      <p>{message}</p>
    </div>
  );
}

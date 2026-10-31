import React from 'react';
import type { Accuracy } from '../types';
import { fmt } from '../utils/format';
import { DataTable } from './DataTable';

interface ScatterProps {
  points: Accuracy['points'];
}

export function Scatter({ points }: ScatterProps) {
  if (!points.length)
    return (
      <div className="empty-state">
        No forecast and outturn pairs for this selection.
      </div>
    );
  const size = 330;
  const pad = 36;
  const max = Math.max(
    1,
    ...points.flatMap((point) => [point.actual_mw, point.forecast_mw])
  );
  const place = (value: number) =>
    pad + (value / max) * (size - pad * 2);
  return (
    <div className="chart-wrap">
      <div className="chart-scroll">
        <svg
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label={`Scatter plot with ${fmt(points.length)} forecast and actual pairs`}
        >
          <line
            x1={pad}
            y1={size - pad}
            x2={size - pad}
            y2={pad}
            className="diagonal"
          />
          {points.map((point, index) => (
            <circle
              key={index}
              cx={place(point.forecast_mw)}
              cy={size - place(point.actual_mw)}
              r="2.8"
              className="point"
            >
              <title>
                Forecast {fmt(point.forecast_mw)} MW, outturn{' '}
                {fmt(point.actual_mw)} MW
              </title>
            </circle>
          ))}
          <text
            x={size / 2}
            y={size - 5}
            textAnchor="middle"
            className="axis"
          >
            Forecast MW
          </text>
          <text x="4" y="15" className="axis">
            Outturn MW
          </text>
        </svg>
      </div>
      <DataTable
        title="Scatter plot values"
        rows={points.map((point) => ({
          forecast_mw: point.forecast_mw,
          actual_mw: point.actual_mw,
        }))}
      />
    </div>
  );
}

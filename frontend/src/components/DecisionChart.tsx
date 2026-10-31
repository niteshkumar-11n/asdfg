import React, { KeyboardEvent, useState } from 'react';
import type { Row } from '../types';
import { fmt, clockLabel } from '../utils/format';

interface LineChartProps {
  rows: Row[];
  comparePrevious: boolean;
}

export function LineChart({ rows, comparePrevious }: LineChartProps) {
  const [active, setActive] = useState<number | null>(null);
  const width = 960;
  const height = 330;
  const pad = { left: 58, right: 20, top: 36, bottom: 38 };
  const seriesValues = rows
    .flatMap((row) => [
      row.forecast_mw,
      row.actual_mw,
      row.p10_mw,
      row.p90_mw,
      comparePrevious ? row.previous_forecast_mw : null,
    ])
    .filter(
      (value): value is number => value != null && Number.isFinite(value)
    );
  if (!seriesValues.length)
    return (
      <div className="empty-state">
        No forecast is available for this date and cutoff.
      </div>
    );
  const min = Math.min(0, ...seriesValues);
  const max = Math.max(...seriesValues);
  const x = (index: number) =>
    pad.left +
    (index * (width - pad.left - pad.right)) /
      Math.max(rows.length - 1, 1);
  const y = (value: number) =>
    height -
    pad.bottom -
    ((value - min) / (max - min || 1)) *
      (height - pad.top - pad.bottom);
  const pathFor = (key: keyof Row) => {
    let open = false;
    return rows
      .map((row, index) => {
        const value = row[key];
        if (typeof value !== 'number') {
          open = false;
          return '';
        }
        const command = open ? 'L' : 'M';
        open = true;
        return `${command}${x(index)} ${y(value)}`;
      })
      .filter(Boolean)
      .join(' ');
  };
  const bandPaths: string[] = [];
  let segment: { index: number; low: number; high: number }[] = [];
  const closeSegment = () => {
    if (segment.length > 1)
      bandPaths.push(
        `M${segment
          .map((point) => `${x(point.index)} ${y(point.high)}`)
          .join(' L')} L${[...segment]
          .reverse()
          .map((point) => `${x(point.index)} ${y(point.low)}`)
          .join(' L')} Z`
      );
    segment = [];
  };
  rows.forEach((row, index) => {
    if (row.p10_mw == null || row.p90_mw == null) closeSegment();
    else segment.push({ index, low: row.p10_mw, high: row.p90_mw });
  });
  closeSegment();
  const plottedKey: keyof Row = comparePrevious
    ? 'previous_forecast_mw'
    : 'forecast_mw';
  const forecastPoints = rows
    .map((row, index) => ({ row, index, plotted: row[plottedKey] }))
    .filter(
      (
        point
      ): point is { row: Row; index: number; plotted: number } =>
        typeof point.plotted === 'number'
    );
  const peak = forecastPoints.length
    ? forecastPoints.reduce((best, point) =>
        point.plotted > best.plotted ? point : best,
      forecastPoints[0])
    : null;
  const low = forecastPoints.length
    ? forecastPoints.reduce((best, point) =>
        point.plotted < best.plotted ? point : best,
      forecastPoints[0])
    : null;
  const activeRow = active == null ? null : rows[active];
  const handleKey = (
    event: KeyboardEvent<SVGRectElement>,
    index: number
  ) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const next = Math.max(
      0,
      Math.min(
        rows.length - 1,
        index + (event.key === 'ArrowRight' ? 1 : -1)
      )
    );
    setActive(next);
    document.getElementById(`chart-period-${next}`)?.focus();
  };

  return (
    <div className="chart-wrap">
      <div className="chart-scroll">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="group"
          aria-label="Forecast, outturn and uncertainty band by delivery period. Focus a period and use arrow keys to inspect values."
        >
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((step) => {
            const value = max - step * (max - min);
            const yy = pad.top + step * (height - pad.top - pad.bottom);
            return (
              <g key={step}>
                <line
                  x1={pad.left}
                  x2={width - pad.right}
                  y1={yy}
                  y2={yy}
                  className="grid"
                />
                <text
                  x={pad.left - 8}
                  y={yy + 4}
                  textAnchor="end"
                  className="axis"
                >
                  {fmt(value)}
                </text>
              </g>
            );
          })}

          {/* Uncertainty band */}
          {bandPaths.map((path, index) => (
            <path key={index} d={path} className="band" />
          ))}

          {/* Lines */}
          <path
            d={pathFor(plottedKey)}
            className={`line ${comparePrevious ? 'previous' : 'forecast'}`}
          />
          <path d={pathFor('actual_mw')} className="line actual" />

          {/* Peak / low labels */}
          {peak && (
            <text
              x={x(peak.index)}
              y={Math.max(pad.top + 14, y(peak.plotted) - 9)}
              textAnchor="middle"
              className="point-label"
            >
              Peak {fmt(peak.plotted)} MW
            </text>
          )}
          {low && low.index !== peak?.index && (
            <text
              x={x(low.index)}
              y={Math.min(
                height - pad.bottom - 7,
                y(low.plotted) + 16
              )}
              textAnchor="middle"
              className="point-label"
            >
              Low {fmt(low.plotted)} MW
            </text>
          )}

          {/* X axis labels */}
          {rows
            .filter(
              (_, index) =>
                index %
                  Math.max(1, Math.ceil(rows.length / 6)) ===
                0
            )
            .map((row) => {
              const originalIndex = rows.indexOf(row);
              return (
                <text
                  key={row.start_time}
                  x={x(originalIndex)}
                  y={height - 10}
                  textAnchor="middle"
                  className="axis"
                >
                  {new Intl.DateTimeFormat('en-GB', {
                    timeZone: 'Europe/London',
                    hour: '2-digit',
                    minute: '2-digit',
                    hourCycle: 'h23',
                  }).format(new Date(row.start_time))}
                </text>
              );
            })}

          {/* Crosshair */}
          {activeRow && (
            <line
              x1={x(active!)}
              x2={x(active!)}
              y1={pad.top}
              y2={height - pad.bottom}
              className="crosshair"
            />
          )}

          {/* Interactive regions */}
          {rows.map((row, index) => (
            <rect
              id={`chart-period-${index}`}
              key={row.start_time}
              x={
                x(index) -
                Math.max(
                  4,
                  (width - pad.left - pad.right) /
                    rows.length /
                    2
                )
              }
              y={pad.top}
              width={Math.max(
                8,
                (width - pad.left - pad.right) / rows.length
              )}
              height={height - pad.top - pad.bottom}
              fill="transparent"
              tabIndex={0}
              role="button"
              aria-label={`${clockLabel(row.start_time)}. Forecast ${fmt(row.forecast_mw)} megawatts; outturn ${fmt(row.actual_mw)} megawatts.`}
              onFocus={() => setActive(index)}
              onBlur={() => setActive(null)}
              onMouseEnter={() => setActive(index)}
              onMouseLeave={() => setActive(null)}
              onKeyDown={(event) => handleKey(event, index)}
            />
          ))}
        </svg>
      </div>
      <div className="chart-legend">
        <span className={comparePrevious ? 'previous-key' : 'blue'}>
          <span className="chart-legend__dot" style={{ background: comparePrevious ? '#7c63a8' : '#2476a4' }} />
          {comparePrevious ? 'Earlier vintage' : 'Latest forecast'}
        </span>
        <span className="orange">
          <span className="chart-legend__dot" style={{ background: '#de8350' }} />
          Outturn
        </span>
        <span className="band-key">
          <span className="chart-legend__dot chart-legend__dot--band" />
          P10–P90 band
        </span>
      </div>
      <p className="chart-tooltip" role="status">
        {activeRow
          ? `${clockLabel(activeRow.start_time)} · Latest ${fmt(activeRow.forecast_mw)} MW · Plotted ${fmt(activeRow[plottedKey] as number | null)} MW · Outturn ${fmt(activeRow.actual_mw)} MW · Error ${fmt(activeRow.error_mw)} MW · Band ${fmt(activeRow.p10_mw)}–${fmt(activeRow.p90_mw)} MW`
          : 'Focus or hover over a delivery period to inspect its values. Use left and right arrow keys to move between periods.'}
      </p>
    </div>
  );
}

export { LineChart as DecisionChart };

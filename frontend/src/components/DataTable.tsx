import React from 'react';
import { fmtCell, fmt } from '../utils/format';

interface DataTableProps {
  rows: Record<string, unknown>[];
  title?: string;
}

export function DataTable({ rows, title = 'View data table' }: DataTableProps) {
  if (!rows.length) return <p className="muted">No matching observations.</p>;
  const keys = Object.keys(rows[0]);
  return (
    <details className="tablebox">
      <summary>
        {title}
        <span>{fmt(rows.length)} rows</span>
      </summary>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              {keys.map((key) => (
                <th key={key}>{key.replaceAll('_', ' ')}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                {keys.map((key) => (
                  <td key={key}>{fmtCell(key, row[key])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

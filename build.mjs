import { build } from 'esbuild';
import { mkdir, cp } from 'node:fs/promises';

const apiUrl =
  process.env.VITE_API_URL ||
  process.env.API_URL ||
  process.env.BACKEND_URL ||
  '';

await mkdir('frontend/dist', { recursive: true });
await build({
  entryPoints: ['./frontend/src/main.tsx'],
  bundle: true,
  minify: true,
  sourcemap: true,
  outfile: './frontend/dist/app.js',
  format: 'esm',
  loader: { '.css': 'css' },
  define: {
    'process.env.VITE_API_URL': JSON.stringify(apiUrl),
  },
});
await cp('frontend/index.html', 'frontend/dist/index.html');

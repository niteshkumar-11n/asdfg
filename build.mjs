import { build } from 'esbuild';
import { mkdir, cp } from 'node:fs/promises';
await mkdir('frontend/dist', { recursive: true });
await build({ entryPoints: ['./frontend/src/main.tsx'], bundle: true, minify: true, sourcemap: true, outfile: './frontend/dist/app.js', format: 'esm', loader: { '.css': 'css' } });
await cp('frontend/index.html', 'frontend/dist/index.html');

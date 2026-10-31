import { context } from 'esbuild';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const apiUrl = process.env.VITE_API_URL || process.env.API_URL || '';

const buildContext = await context({
  entryPoints: ['./frontend/src/main.tsx'],
  bundle: true,
  outfile: './frontend/dev.js',
  format: 'esm',
  loader: { '.css': 'css' },
  sourcemap: 'inline',
  define: {
    'process.env.VITE_API_URL': JSON.stringify(apiUrl),
  },
});
await buildContext.rebuild();
await buildContext.watch();
createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if (u.pathname.startsWith('/api/')) {
    try {
      const r = await fetch('http://127.0.0.1:8000' + u.pathname + u.search);
      res.writeHead(r.status, Object.fromEntries(r.headers));
      res.end(Buffer.from(await r.arrayBuffer()));
    } catch (error) {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          error: `Cannot reach Flask API at http://127.0.0.1:8000. Start the backend first. ${error.message}`,
          code: 'backend_unavailable',
        })
      );
    }
    return;
  }
  if (u.pathname === '/app.js') {
    res.setHeader('Content-Type', 'text/javascript');
    res.end(await readFile('frontend/dev.js'));
    return;
  }
  if (u.pathname === '/app.css') {
    res.setHeader('Content-Type', 'text/css');
    res.end(await readFile('frontend/dev.css').catch(() => ''));
    return;
  }
  res.setHeader('Content-Type', 'text/html');
  res.end(await readFile('frontend/index.html'));
}).listen(5173, () =>
  console.log('WindDesk dev server: http://localhost:5173 (watching frontend/src)')
);

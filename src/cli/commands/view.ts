/**
 * spec-gen view command
 *
 * Starts a local React (Vite) server to visualize analysis graphs,
 * then opens the user's browser.
 */

import { Command } from 'commander';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { logger } from '../../utils/logger.js';

function openBrowser(url: string): void {
  const platform = process.platform;
  const cmd =
    platform === 'darwin' ? 'open' :
    platform === 'win32' ? 'cmd' :
    'xdg-open';

  const args =
    platform === 'win32' ? ['/c', 'start', '', url] :
    [url];

  const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
  child.unref();
}

export const viewCommand = new Command('view')
  .description('Start an interactive graph viewer (React) for .spec-gen/analysis')
  .option('--analysis <path>', 'Path to analysis directory', '.spec-gen/analysis/')
  .option('--port <n>', 'Port to run the viewer on', '5173')
  .option('--host <host>', 'Host to bind (use 0.0.0.0 for LAN)', '127.0.0.1')
  .option('--no-open', 'Do not open the browser automatically', false)
  .action(async (options: { analysis: string; port: string; host: string; open: boolean }) => {
    const rootPath = process.cwd();
    const analysisDir = resolve(rootPath, options.analysis);
    const graphPath = join(analysisDir, 'dependency-graph.json');

    if (!existsSync(graphPath)) {
      logger.error(`Missing graph file: ${graphPath}`);
      logger.info('Tip', 'Run "spec-gen analyze" first (or pass --analysis)');
      process.exitCode = 1;
      return;
    }

    const here = fileURLToPath(new URL('.', import.meta.url));
    const candidateA = resolve(join(here, '../../viewer/app'));          // when running from src/cli/commands
    const candidateB = resolve(join(here, '../../../src/viewer/app'));   // when running from dist/cli/commands
    const viewerRoot = existsSync(join(candidateA, 'index.html')) ? candidateA : candidateB;

    if (!existsSync(join(viewerRoot, 'index.html'))) {
      logger.error(`Viewer assets not found (expected index.html). Tried: ${candidateA} and ${candidateB}`);
      process.exitCode = 1;
      return;
    }

    const port = Number.parseInt(options.port, 10) || 5173;
    const host = options.host || '127.0.0.1';

    logger.section('Starting Graph Viewer');
    logger.info('Analysis', analysisDir);
    logger.info('Graph', graphPath);

    const server = await createServer({
      root: viewerRoot,
      logLevel: 'error',
      plugins: [
        react(),
        {
          name: 'spec-gen-graph-api',
          configureServer(devServer) {
            devServer.middlewares.use('/api/dependency-graph', async (_req, res) => {
              try {
                const json = await readFile(graphPath, 'utf-8');
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
                res.statusCode = 200;
                res.end(json);
              } catch (err) {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: (err as Error).message }));
              }
            });
          },
        },
      ],
      server: {
        port,
        host,
        strictPort: true,
      },
    });

    await server.listen();

    const url = `http://${host}:${port}/`;
    logger.success(`Viewer running at ${url}`);

    if (options.open) {
      openBrowser(url);
    }

    // Vite keeps the event loop alive; nothing else to do here.
  });


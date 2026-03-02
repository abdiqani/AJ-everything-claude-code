import * as path from 'path';
import * as fs from 'fs/promises';
import { DockerRunner } from '../runner/docker-runner';

export interface HttpxResult {
  lines: unknown[];
}

export class HttpxScanner {
  constructor(
    private readonly docker: DockerRunner,
    private readonly jobDir: string,
  ) {}

  async run(targetUrl: string, network: string): Promise<HttpxResult> {
    const outFile = path.join(this.jobDir, 'httpx.jsonl');

    await this.docker.run({
      image: 'projectdiscovery/httpx:latest',
      command: [
        '-u', targetUrl,
        '-json',
        '-o', '/output/httpx.jsonl',
        '-title', '-tech-detect', '-status-code', '-content-length',
        '-follow-redirects',
        '-timeout', '10',
        '-retries', '2',
        '-silent',
      ],
      volumes: [`${this.jobDir}:/output`],
      network,
      cpus: '0.5',
      memory: '256m',
      pidsLimit: 100,
      timeoutMs: 60_000,
    });

    const content = await fs.readFile(outFile, 'utf8').catch(() => '');
    const lines = content
      .split('\n')
      .filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);

    return { lines };
  }
}

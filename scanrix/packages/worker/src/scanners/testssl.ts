import * as path from 'path';
import * as fs from 'fs/promises';
import { DockerRunner } from '../runner/docker-runner';

export interface TestsslResult {
  findings: unknown[];
}

export class TestsslScanner {
  constructor(
    private readonly docker: DockerRunner,
    private readonly jobDir: string,
  ) {}

  async run(targetUrl: string, network: string): Promise<TestsslResult> {
    const u = new URL(targetUrl);
    const host = u.hostname + (u.port ? `:${u.port}` : '');

    await this.docker.run({
      image: 'drwetter/testssl.sh:3.2',
      command: [
        '--jsonfile', '/output/testssl.json',
        '--quiet',
        '--warnings', 'off',
        host,
      ],
      volumes: [`${this.jobDir}:/output`],
      network,
      cpus: '0.5',
      memory: '256m',
      pidsLimit: 100,
      timeoutMs: 300_000,
    });

    const content = await fs.readFile(path.join(this.jobDir, 'testssl.json'), 'utf8').catch(() => '[]');
    let parsed: unknown = [];
    try { parsed = JSON.parse(content); } catch {}

    return { findings: Array.isArray(parsed) ? parsed : [] };
  }
}

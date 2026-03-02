import * as path from 'path';
import * as fs from 'fs/promises';
import { DockerRunner } from '../runner/docker-runner';

export interface NiktoResult {
  vulnerabilities: unknown[];
}

export class NiktoScanner {
  constructor(
    private readonly docker: DockerRunner,
    private readonly jobDir: string,
  ) {}

  async run(targetUrl: string, network: string): Promise<NiktoResult> {
    await this.docker.run({
      image: 'frapsoft/nikto:latest',
      command: [
        '-h', targetUrl,
        '-Format', 'json',
        '-output', '/output/nikto.json',
        '-timeout', '10',
        '-maxtime', '300s',
        '-nointeractive',
      ],
      volumes: [`${this.jobDir}:/output`],
      network,
      cpus: '0.5',
      memory: '256m',
      pidsLimit: 100,
      timeoutMs: 360_000,
    });

    const content = await fs.readFile(path.join(this.jobDir, 'nikto.json'), 'utf8').catch(() => '{}');
    let parsed: unknown = {};
    try { parsed = JSON.parse(content); } catch {}

    return { vulnerabilities: (parsed as any)?.vulnerabilities ?? [] };
  }
}

import * as path from 'path';
import * as fs from 'fs/promises';
import { DockerRunner } from '../runner/docker-runner';

type ScanProfile = 'QUICK' | 'STANDARD' | 'DEEP';

const PROFILE_TEMPLATES: Record<ScanProfile, string[]> = {
  QUICK:    ['-t', 'exposures/', '-t', 'misconfiguration/', '-t', 'technologies/'],
  STANDARD: ['-t', 'exposures/', '-t', 'misconfiguration/', '-t', 'cves/', '-t', 'technologies/'],
  DEEP:     ['-t', 'exposures/', '-t', 'misconfiguration/', '-t', 'cves/', '-t', 'vulnerabilities/', '-t', 'technologies/'],
};

const PROFILE_SEVERITY: Record<ScanProfile, string> = {
  QUICK:    'medium,high,critical',
  STANDARD: 'low,medium,high,critical',
  DEEP:     'info,low,medium,high,critical',
};

export interface NucleiResult {
  lines: unknown[];
}

export class NucleiScanner {
  constructor(
    private readonly docker: DockerRunner,
    private readonly jobDir: string,
  ) {}

  async run(targetUrl: string, profile: ScanProfile, network: string): Promise<NucleiResult> {
    const outFile = path.join(this.jobDir, 'nuclei.jsonl');

    const templateArgs = PROFILE_TEMPLATES[profile];

    await this.docker.run({
      image: 'projectdiscovery/nuclei:latest',
      command: [
        '-u', targetUrl,
        '-json', '-jsonl',
        '-o', '/output/nuclei.jsonl',
        ...templateArgs,
        '-severity', PROFILE_SEVERITY[profile],
        '-timeout', '10',
        '-retries', '2',
        '-silent',
        '-no-update-templates',
      ],
      volumes: [`${this.jobDir}:/output`],
      network,
      cpus: '1.0',
      memory: '512m',
      pidsLimit: 200,
      timeoutMs: profile === 'QUICK' ? 120_000 : profile === 'STANDARD' ? 300_000 : 600_000,
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

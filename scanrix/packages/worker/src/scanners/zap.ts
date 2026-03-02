import * as path from 'path';
import * as fs from 'fs/promises';
import { DockerRunner } from '../runner/docker-runner';

type ScanProfile = 'STANDARD' | 'DEEP';

export interface ZapResult {
  alerts: unknown[];
  rawJson?: unknown;
}

export class ZapScanner {
  constructor(
    private readonly docker: DockerRunner,
    private readonly jobDir: string,
  ) {}

  async run(targetUrl: string, profile: ScanProfile, network: string): Promise<ZapResult> {
    // ZAP automation framework YAML
    const zapAjaxCrawl = profile === 'DEEP';
    const zapPlan = this.buildZapPlan(targetUrl, zapAjaxCrawl);
    const planFile = path.join(this.jobDir, 'zap-plan.yaml');
    await fs.writeFile(planFile, zapPlan);

    await this.docker.run({
      image: 'ghcr.io/zaproxy/zaproxy:stable',
      command: [
        'zap.sh', '-cmd',
        '-autorun', '/zap/wrk/zap-plan.yaml',
      ],
      volumes: [`${this.jobDir}:/zap/wrk:rw`],
      network,
      cpus: '2.0',
      memory: '2g',
      pidsLimit: 500,
      timeoutMs: profile === 'STANDARD' ? 600_000 : 1_800_000,
      env: { ZAP_PORT: '8080' },
    });

    const jsonContent = await fs.readFile(path.join(this.jobDir, 'zap.json'), 'utf8').catch(() => '{}');
    let rawJson: unknown = {};
    try { rawJson = JSON.parse(jsonContent); } catch {}

    const alerts: unknown[] = (rawJson as any)?.site?.[0]?.alerts ?? [];
    return { alerts, rawJson };
  }

  private buildZapPlan(targetUrl: string, ajaxCrawl: boolean): string {
    return `---
env:
  contexts:
    - name: "target"
      urls:
        - "${targetUrl}"
      includePaths:
        - "${targetUrl}.*"
  parameters:
    failOnError: false
    progressToStdout: true

jobs:
  - type: passiveScan-config
    parameters:
      maxAlertsPerRule: 10

  - type: spider
    parameters:
      context: "target"
      url: "${targetUrl}"
      maxDuration: ${ajaxCrawl ? 10 : 5}
      maxChildren: 50

${ajaxCrawl ? `
  - type: spiderAjax
    parameters:
      context: "target"
      url: "${targetUrl}"
      maxDuration: 10
` : ''}

  - type: passiveScan-wait
    parameters:
      maxDuration: 5

  - type: activeScan
    parameters:
      context: "target"
      policy: "Default Policy"
      maxRuleDurationInMins: 2
      maxScanDurationInMins: ${ajaxCrawl ? 30 : 10}

  - type: report
    parameters:
      template: "traditional-json"
      reportDir: "/zap/wrk"
      reportFile: "zap.json"

  - type: report
    parameters:
      template: "traditional-html"
      reportDir: "/zap/wrk"
      reportFile: "zap.html"
`;
  }
}

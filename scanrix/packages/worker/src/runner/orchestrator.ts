import { Pool } from 'pg';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { DockerRunner } from './docker-runner';
import { HttpxScanner } from '../scanners/httpx';
import { NucleiScanner } from '../scanners/nuclei';
import { ZapScanner } from '../scanners/zap';
import { NiktoScanner } from '../scanners/nikto';
import { TestsslScanner } from '../scanners/testssl';
import { NormalizerService } from '../normalizer/normalizer.service';
import { ReportGenerator } from '../normalizer/report-generator';
import { StorageAdapter } from '../storage/storage.adapter';

type ScanProfile = 'QUICK' | 'STANDARD' | 'DEEP';

export class ScanOrchestrator {
  private readonly docker: DockerRunner;
  private readonly normalizer: NormalizerService;
  private readonly reporter: ReportGenerator;

  constructor(
    private readonly db: Pool,
    private readonly storage: StorageAdapter,
  ) {
    this.docker = new DockerRunner();
    this.normalizer = new NormalizerService(db);
    this.reporter = new ReportGenerator(db, storage);
  }

  async run(scanId: string, targetUrl: string, profile: ScanProfile): Promise<void> {
    const jobDir = await fs.mkdtemp(path.join(os.tmpdir(), `scanrix-${scanId}-`));

    try {
      await this.markRunning(scanId);

      const storagePrefix = `scans/${scanId}`;
      const networkName = `scanrix-${scanId.slice(0, 8)}`;

      // Create isolated Docker network
      await this.docker.createNetwork(networkName);

      try {
        // ── PREFLIGHT: httpx ────────────────────────────────────────────
        const httpx = new HttpxScanner(this.docker, jobDir);
        const httpxResult = await httpx.run(targetUrl, networkName);
        await this.uploadArtifact(scanId, storagePrefix, jobDir, 'httpx.jsonl', 'application/x-ndjson');
        await this.normalizer.ingest(scanId, 'httpx', httpxResult);

        if (profile === 'QUICK' || profile === 'STANDARD' || profile === 'DEEP') {
          // ── NUCLEI ──────────────────────────────────────────────────────
          const nuclei = new NucleiScanner(this.docker, jobDir);
          const nucleiResult = await nuclei.run(targetUrl, profile, networkName);
          await this.uploadArtifact(scanId, storagePrefix, jobDir, 'nuclei.jsonl', 'application/x-ndjson');
          await this.normalizer.ingest(scanId, 'nuclei', nucleiResult);
        }

        if (profile === 'STANDARD' || profile === 'DEEP') {
          // ── ZAP ─────────────────────────────────────────────────────────
          const zap = new ZapScanner(this.docker, jobDir);
          const zapResult = await zap.run(targetUrl, profile, networkName);
          await this.uploadArtifact(scanId, storagePrefix, jobDir, 'zap.json', 'application/json');
          await this.uploadArtifact(scanId, storagePrefix, jobDir, 'zap.html', 'text/html');
          await this.normalizer.ingest(scanId, 'zap', zapResult);
        }

        if (profile === 'DEEP') {
          // ── NIKTO ───────────────────────────────────────────────────────
          const nikto = new NiktoScanner(this.docker, jobDir);
          const niktoResult = await nikto.run(targetUrl, networkName);
          await this.uploadArtifact(scanId, storagePrefix, jobDir, 'nikto.json', 'application/json');
          await this.normalizer.ingest(scanId, 'nikto', niktoResult);

          // ── TESTSSL ─────────────────────────────────────────────────────
          const testssl = new TestsslScanner(this.docker, jobDir);
          const testsslResult = await testssl.run(targetUrl, networkName);
          await this.uploadArtifact(scanId, storagePrefix, jobDir, 'testssl.json', 'application/json');
          await this.normalizer.ingest(scanId, 'testssl', testsslResult);
        }

        // ── REPORT GENERATION ───────────────────────────────────────────
        await this.reporter.generate(scanId, storagePrefix);

        await this.markCompleted(scanId);
      } finally {
        await this.docker.removeNetwork(networkName).catch(() => {});
      }
    } catch (err) {
      await this.markFailed(scanId, (err as Error).message);
      throw err;
    } finally {
      await fs.rm(jobDir, { recursive: true, force: true });
    }
  }

  private async uploadArtifact(
    scanId: string,
    prefix: string,
    jobDir: string,
    filename: string,
    contentType: string,
  ): Promise<void> {
    const filePath = path.join(jobDir, filename);
    try {
      const content = await fs.readFile(filePath);
      const key = `${prefix}/${filename}`;
      await this.storage.putObject(key, content, contentType);

      await this.db.query(
        `INSERT INTO scan_artifacts (scan_id, tool, artifact_key, content_type, size_bytes)
         VALUES ($1, $2, $3, $4, $5)`,
        [scanId, filename.split('.')[0], key, contentType, content.length],
      );
    } catch {
      // Artifact upload is best-effort
    }
  }

  private async markRunning(scanId: string): Promise<void> {
    await this.db.query(
      `UPDATE scans SET status = 'RUNNING', started_at = NOW() WHERE id = $1`,
      [scanId],
    );
  }

  private async markCompleted(scanId: string): Promise<void> {
    await this.db.query(
      `UPDATE scans SET status = 'COMPLETED', completed_at = NOW() WHERE id = $1`,
      [scanId],
    );
  }

  private async markFailed(scanId: string, message: string): Promise<void> {
    await this.db.query(
      `UPDATE scans SET status = 'FAILED', error_message = $2, completed_at = NOW() WHERE id = $1`,
      [scanId, message],
    );
  }
}

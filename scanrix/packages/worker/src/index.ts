import * as Bull from 'bull';
import { Pool } from 'pg';
import { ScanOrchestrator } from './runner/orchestrator';
import { S3StorageAdapter } from './storage/s3.adapter';

const SCAN_QUEUE = 'scan-queue';

const db = new Pool({ connectionString: process.env.DATABASE_URL });

const storage = new S3StorageAdapter({
  endpoint: process.env.STORAGE_ENDPOINT,
  region: process.env.STORAGE_REGION || 'us-east-1',
  accessKeyId: process.env.STORAGE_ACCESS_KEY_ID!,
  secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY!,
  bucket: process.env.STORAGE_BUCKET!,
  forcePathStyle: process.env.STORAGE_PROVIDER === 'minio',
});

const queue = new Bull(SCAN_QUEUE, {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
  },
});

const orchestrator = new ScanOrchestrator(db, storage);

queue.process('run-scan', parseInt(process.env.WORKER_CONCURRENCY || '2', 10), async (job) => {
  const { scanId, targetUrl, scanProfile } = job.data as {
    scanId: string;
    targetUrl: string;
    scanProfile: 'QUICK' | 'STANDARD' | 'DEEP';
  };

  console.log(`[worker] Starting scan ${scanId} | profile=${scanProfile} | url=${targetUrl}`);
  await orchestrator.run(scanId, targetUrl, scanProfile);
  console.log(`[worker] Completed scan ${scanId}`);
});

queue.on('failed', (job, err) => {
  console.error(`[worker] Job ${job.id} failed:`, err.message);
});

console.log('[worker] Listening for scan jobs...');

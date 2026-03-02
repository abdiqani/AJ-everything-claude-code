export type ScanProfile = 'QUICK' | 'STANDARD' | 'DEEP';
export type ScanStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface Scan {
  id: string;
  orgId: string;
  createdBy: string;
  targetUrl: string;
  targetHost: string;
  scanProfile: ScanProfile;
  status: ScanStatus;
  errorMessage?: string;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
}

export const SCAN_QUEUE = 'scan-queue';

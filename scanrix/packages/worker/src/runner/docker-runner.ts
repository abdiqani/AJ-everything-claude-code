import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface DockerRunOptions {
  image: string;
  command: string[];
  volumes?: string[];        // host:container pairs
  network?: string;
  cpus?: string;             // e.g. "0.5"
  memory?: string;           // e.g. "512m"
  pidsLimit?: number;
  timeoutMs?: number;
  env?: Record<string, string>;
  readOnly?: boolean;
}

/**
 * Thin wrapper around the Docker CLI.
 * Each scanner call runs in an ephemeral container with strict resource limits.
 */
export class DockerRunner {
  async run(opts: DockerRunOptions): Promise<{ stdout: string; stderr: string }> {
    const args: string[] = ['run', '--rm'];

    if (opts.network)    args.push(`--network=${opts.network}`);
    if (opts.cpus)       args.push(`--cpus=${opts.cpus}`);
    if (opts.memory)     args.push(`--memory=${opts.memory}`);
    if (opts.pidsLimit)  args.push(`--pids-limit=${opts.pidsLimit}`);
    if (opts.readOnly)   args.push('--read-only');

    // Drop all capabilities — no root privileges inside container
    args.push('--cap-drop=ALL');
    // No new privileges escalation
    args.push('--security-opt=no-new-privileges');

    for (const [k, v] of Object.entries(opts.env ?? {})) {
      args.push('-e', `${k}=${v}`);
    }
    for (const vol of opts.volumes ?? []) {
      args.push('-v', vol);
    }

    args.push(opts.image, ...opts.command);

    const { stdout, stderr } = await execFileAsync('docker', args, {
      timeout: opts.timeoutMs ?? 300_000,
      maxBuffer: 50 * 1024 * 1024, // 50MB
    });

    return { stdout, stderr };
  }

  async createNetwork(name: string): Promise<void> {
    await execFileAsync('docker', ['network', 'create', '--driver=bridge', name]).catch(() => {});
  }

  async removeNetwork(name: string): Promise<void> {
    await execFileAsync('docker', ['network', 'rm', name]);
  }
}

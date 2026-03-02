/**
 * Vendor-neutral object storage abstraction.
 * All adapters implement this interface.
 */
export interface StorageAdapter {
  /** Upload bytes to key */
  putObject(key: string, body: Buffer | string, contentType: string): Promise<void>;
  /** Generate a pre-signed download URL */
  getSignedUrl(key: string, ttlSeconds: number): Promise<string>;
  /** List keys under a prefix */
  list(prefix: string): Promise<string[]>;
  /** Delete all keys under a prefix */
  delete(prefix: string): Promise<void>;
}

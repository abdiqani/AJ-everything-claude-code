export interface StorageAdapter {
  putObject(key: string, body: Buffer | string, contentType: string): Promise<void>;
  getSignedUrl(key: string, ttlSeconds: number): Promise<string>;
  list(prefix: string): Promise<string[]>;
  delete(prefix: string): Promise<void>;
}

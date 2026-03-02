import { Module, Global } from '@nestjs/common';
import { S3StorageAdapter } from './s3.adapter';
import { StorageAdapter } from './storage.adapter';

export const STORAGE_ADAPTER = 'STORAGE_ADAPTER';

@Global()
@Module({
  providers: [
    {
      provide: STORAGE_ADAPTER,
      useFactory: (): StorageAdapter => {
        const provider = process.env.STORAGE_PROVIDER ?? 's3';

        if (provider === 's3' || provider === 'minio') {
          return new S3StorageAdapter({
            endpoint: process.env.STORAGE_ENDPOINT,        // MinIO URL or undefined for AWS
            region: process.env.STORAGE_REGION || 'us-east-1',
            accessKeyId: process.env.STORAGE_ACCESS_KEY_ID!,
            secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY!,
            bucket: process.env.STORAGE_BUCKET!,
            forcePathStyle: provider === 'minio',          // MinIO requires path-style
          });
        }

        throw new Error(`Unsupported STORAGE_PROVIDER: ${provider}`);
      },
    },
  ],
  exports: [STORAGE_ADAPTER],
})
export class StorageModule {}

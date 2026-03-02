import { Controller, Get, Inject } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Pool } from 'pg';
import { DATABASE_POOL } from './database.module';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(@Inject(DATABASE_POOL) private readonly db: Pool) {}

  @Get()
  @ApiOperation({ summary: 'Health check — returns service status' })
  async check() {
    let dbOk = false;
    try {
      await this.db.query('SELECT 1');
      dbOk = true;
    } catch {}

    const status = dbOk ? 'ok' : 'degraded';
    return {
      status,
      timestamp: new Date().toISOString(),
      services: { database: dbOk ? 'ok' : 'error' },
    };
  }
}

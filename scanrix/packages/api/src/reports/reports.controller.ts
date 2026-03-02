import { Controller, Get, Param, Query, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { AuthGuard, AuthUser } from '../auth/auth.guard';

@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('scans/:scanId/report')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get()
  @ApiOperation({ summary: 'Get scan report summary' })
  get(@Req() req: { user: AuthUser }, @Param('scanId') scanId: string) {
    return this.reports.getReport(req.user.orgId, scanId);
  }

  @Get('download')
  @ApiOperation({ summary: 'Get a pre-signed download URL for a scan report' })
  @ApiQuery({ name: 'format', required: false, enum: ['html', 'json'], description: 'Report format (default: html)' })
  download(
    @Req() req: { user: AuthUser },
    @Param('scanId') scanId: string,
    @Query('format') format: 'html' | 'json' = 'html',
  ) {
    return this.reports.getDownloadUrl(req.user.orgId, scanId, format);
  }
}

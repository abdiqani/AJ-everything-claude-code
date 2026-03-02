import { Controller, Get, Param, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
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
}

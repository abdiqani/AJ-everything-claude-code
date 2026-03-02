import { Controller, Get, Param, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { FindingsService } from './findings.service';
import { AuthGuard, AuthUser } from '../auth/auth.guard';

@ApiTags('findings')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('scans/:scanId/findings')
export class FindingsController {
  constructor(private readonly findings: FindingsService) {}

  @Get()
  @ApiOperation({ summary: 'Get findings for a scan (gated by plan)' })
  list(@Req() req: { user: AuthUser }, @Param('scanId') scanId: string) {
    return this.findings.findingsByScan(req.user.orgId, scanId, req.user.plan);
  }
}

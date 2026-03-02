import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsString, IsUrl, IsIn, IsOptional } from 'class-validator';
import { ScansService } from './scans.service';
import { AuthGuard, AuthUser } from '../auth/auth.guard';
import { ScanProfile } from './scans.types';

class CreateScanDto {
  @IsUrl()
  targetUrl!: string;

  @IsIn(['QUICK', 'STANDARD', 'DEEP'])
  @IsOptional()
  scanProfile: ScanProfile = 'QUICK';
}

@ApiTags('scans')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('scans')
export class ScansController {
  constructor(private readonly scans: ScansService) {}

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Submit a new scan request' })
  create(@Req() req: { user: AuthUser }, @Body() dto: CreateScanDto) {
    return this.scans.createScan(
      req.user.orgId,
      req.user.id,
      req.user.plan,
      dto.targetUrl,
      dto.scanProfile,
    );
  }

  @Get()
  @ApiOperation({ summary: 'List scans for the org' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  list(
    @Req() req: { user: AuthUser },
    @Query('limit') limit = 20,
    @Query('offset') offset = 0,
  ) {
    return this.scans.listScans(req.user.orgId, +limit, +offset);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get scan details' })
  get(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    return this.scans.getScan(req.user.orgId, id);
  }

  @Get(':id/artifacts')
  @ApiOperation({ summary: 'List artifacts for a scan' })
  listArtifacts(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    return this.scans.listArtifacts(req.user.orgId, id);
  }

  @Get(':id/artifacts/download')
  @ApiOperation({ summary: 'Get a pre-signed download URL for a scan artifact' })
  @ApiQuery({ name: 'key', required: true, type: String, description: 'Artifact storage key' })
  getArtifactDownloadUrl(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Query('key') key: string,
  ) {
    return this.scans.getArtifactDownloadUrl(req.user.orgId, id, key);
  }
}

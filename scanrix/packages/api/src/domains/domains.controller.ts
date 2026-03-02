import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsString, IsUrl } from 'class-validator';
import { DomainsService } from './domains.service';
import { AuthGuard, AuthUser } from '../auth/auth.guard';

class AddDomainDto {
  @IsString()
  @IsUrl()
  rootDomain!: string;
}

@ApiTags('domains')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('domains')
export class DomainsController {
  constructor(private readonly domains: DomainsService) {}

  @Get()
  @ApiOperation({ summary: 'List verified domains for the org' })
  list(@Req() req: { user: AuthUser }) {
    return this.domains.getDomains(req.user.orgId);
  }

  @Post()
  @ApiOperation({ summary: 'Add a domain for verification' })
  add(@Req() req: { user: AuthUser }, @Body() dto: AddDomainDto) {
    return this.domains.addDomain(req.user.orgId, dto.rootDomain);
  }

  @Post(':id/verify')
  @ApiOperation({ summary: 'Trigger a verification check for a domain' })
  verify(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    return this.domains.checkVerification(req.user.orgId, id);
  }
}

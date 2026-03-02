import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { IsString, IsOptional, Matches, MaxLength } from 'class-validator';
import { SkipThrottle } from '@nestjs/throttler';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';

class BlockUserDto {
  @IsString()
  @IsOptional()
  reason?: string;
}

class BlockDomainDto {
  @IsString()
  @MaxLength(253)
  @Matches(/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/, { message: 'domain must be a valid hostname' })
  domain!: string;

  @IsString()
  @IsOptional()
  reason?: string;
}

class UnblockDomainParamDto {
  @IsString()
  @MaxLength(253)
  @Matches(/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/, { message: 'domain must be a valid hostname' })
  domain!: string;
}

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminGuard)
@SkipThrottle()
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('scans')
  @ApiOperation({ summary: 'List all scans across all orgs' })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'offset', required: false })
  @ApiQuery({ name: 'status', required: false })
  listScans(
    @Query('limit') limit = 50,
    @Query('offset') offset = 0,
    @Query('status') status?: string,
  ) {
    return this.admin.listAllScans(+limit, +offset, status);
  }

  @Get('users')
  @ApiOperation({ summary: 'List all users and their orgs' })
  @ApiQuery({ name: 'limit', required: false })
  listUsers(@Query('limit') limit = 50) {
    return this.admin.listUsers(+limit);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Platform-level statistics' })
  stats() {
    return this.admin.getStats();
  }

  @Post('users/:userId/block')
  @ApiOperation({ summary: 'Block a user and cancel their active scans' })
  blockUser(@Param('userId') userId: string, @Body() dto: BlockUserDto) {
    return this.admin.blockUser(userId, dto.reason);
  }

  @Post('users/:userId/unblock')
  @ApiOperation({ summary: 'Unblock a previously blocked user' })
  unblockUser(@Param('userId') userId: string) {
    return this.admin.unblockUser(userId);
  }

  @Get('domains/blocklist')
  @ApiOperation({ summary: 'List all blocked domains' })
  getBlockedDomains(@Query('limit') limit = 100) {
    return this.admin.getBlockedDomains(+limit);
  }

  @Post('domains/block')
  @ApiOperation({ summary: 'Add a domain to the global blocklist' })
  blockDomain(@Req() req: { user: any }, @Body() dto: BlockDomainDto) {
    return this.admin.blockDomain(dto.domain, dto.reason, req.user?.id);
  }

  @Delete('domains/:domain/block')
  @ApiOperation({ summary: 'Remove a domain from the blocklist' })
  unblockDomain(@Req() req: { user: any }, @Param() params: UnblockDomainParamDto) {
    return this.admin.unblockDomain(params.domain, req.user?.id);
  }
}

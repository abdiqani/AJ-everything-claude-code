import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AuthModule } from '../auth/auth.module';
import { AdminGuard } from './admin.guard';

@Module({
  imports: [AuthModule],
  controllers: [AdminController],
  providers: [AdminService, AdminGuard],
})
export class AdminModule {}

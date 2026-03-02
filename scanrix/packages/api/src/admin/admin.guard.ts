import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';

/**
 * Admin guard — requires the user to have role 'admin' or 'owner'
 * in their user_profile record. Extends AuthGuard (must be authenticated first).
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly authGuard: AuthGuard) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // First: verify JWT and populate req.user
    await this.authGuard.canActivate(context);

    const req = context.switchToHttp().getRequest();
    if (!['owner', 'admin'].includes(req.user?.role ?? '')) {
      throw new ForbiddenException('Admin access required');
    }
    return true;
  }
}

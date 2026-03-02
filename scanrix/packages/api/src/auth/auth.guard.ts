import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';

export interface AuthUser {
  id: string;
  email: string;
  orgId: string;
  plan: string;
}

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const authHeader: string | undefined = req.headers['authorization'];

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing auth token');
    }

    const token = authHeader.slice(7);
    const { data, error } = await this.supabase.auth.getUser(token);

    if (error || !data.user) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    // Fetch org context
    const { data: profile } = await this.supabase
      .from('user_profiles')
      .select('org_id, orgs(plan)')
      .eq('id', data.user.id)
      .single();

    if (!profile) {
      throw new UnauthorizedException('User profile not found');
    }

    req.user = {
      id: data.user.id,
      email: data.user.email!,
      orgId: profile.org_id,
      plan: (profile as any).orgs?.plan ?? 'free',
    } satisfies AuthUser;

    return true;
  }
}

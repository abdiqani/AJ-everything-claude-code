import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';

/**
 * Supabase auth callback — handles:
 *  - Email magic link clicks
 *  - OAuth redirects (GitHub, Google, etc.)
 *
 * Supabase redirects here after authentication with ?code=...
 * We exchange the code for a session, then redirect to the dashboard.
 */
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const next = requestUrl.searchParams.get('next') ?? '/dashboard/scans';

  if (code) {
    const supabase = createRouteHandlerClient({ cookies });
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin));
}

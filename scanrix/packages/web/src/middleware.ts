import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Server-side auth middleware.
 * - Refreshes Supabase session on every request (keeps token alive).
 * - Redirects unauthenticated users away from /dashboard/* to /login.
 * - Redirects authenticated users away from /login to /dashboard/scans.
 */
export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });

  const { data: { session } } = await supabase.auth.getSession();

  const { pathname } = req.nextUrl;

  // Protect dashboard routes
  if (pathname.startsWith('/dashboard') && !session) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Redirect logged-in users away from login page
  if (pathname === '/login' && session) {
    const dashUrl = req.nextUrl.clone();
    dashUrl.pathname = '/dashboard/scans';
    return NextResponse.redirect(dashUrl);
  }

  return res;
}

export const config = {
  // Run middleware on dashboard and login routes only
  matcher: ['/dashboard/:path*', '/login'],
};

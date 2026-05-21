import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export function proxy(request: NextRequest) {
  const existingUserId = request.cookies.get('userId')?.value;

  if (existingUserId) {
    return NextResponse.next();
  }

  const newUserId = crypto.randomUUID();

  // Inject into the forwarded request Cookie header so server components
  // can read userId via cookies() on this first-visit request, before the
  // browser receives the Set-Cookie header and sends it back.
  const requestHeaders = new Headers(request.headers);
  const existingCookies = request.headers.get('cookie');
  requestHeaders.set(
    'cookie',
    existingCookies ? `userId=${newUserId}; ${existingCookies}` : `userId=${newUserId}`
  );

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.cookies.set('userId', newUserId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 365,
    path: '/',
  });

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico).*)'],
};

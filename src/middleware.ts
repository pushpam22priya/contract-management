'use server';

import { NextRequest, NextResponse } from 'next/server';

/**
 * Strip browser security headers before the Next.js rewrite forwards
 * /api/backend/* requests to the Spring Boot backend.
 *
 * WHY: Spring Security's CSRF filter checks the `Origin` and `Referer`
 * headers on state-changing requests (PATCH, POST, PUT, DELETE). If it
 * sees `Referer: http://localhost:3000` and that origin is not in Spring
 * Boot's allowed-origins list (which only allows localhost:8081), it
 * rejects the request with 403 Forbidden — even when the JWT is valid.
 *
 * Server-to-server HTTP calls (Next.js → Spring Boot) never include these
 * headers naturally. The browser adds them for same-site requests, and the
 * Next.js rewrite forwards them as-is. Stripping them here makes the
 * proxied request look like a genuine server-to-server call to Spring Boot.
 */
export function middleware(request: NextRequest) {
    if (request.nextUrl.pathname.startsWith('/api/backend/')) {
        const headers = new Headers(request.headers);
        headers.delete('origin');
        headers.delete('referer');

        return NextResponse.next({ request: { headers } });
    }

    return NextResponse.next();
}

export const config = {
    matcher: '/api/backend/:path*',
};

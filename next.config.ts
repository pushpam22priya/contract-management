import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const SPRING_BOOT_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8080';

const nextConfig: NextConfig = {
  reactCompiler: true,

  /**
   * Proxy all /api/backend/* requests to the Spring Boot backend server-side.
   *
   * WHY: Spring Boot's CORS config only allows specific origins. Direct browser
   * calls from localhost:3000 → localhost:8080 are blocked. By routing through
   * Next.js rewrites, the browser calls localhost:3000/api/backend/... (same
   * origin, no CORS), and Next.js forwards to Spring Boot server-to-server
   * (no CORS headers required for server-to-server HTTP).
   *
   * All Authorization headers from the browser are forwarded automatically.
   */
  async rewrites() {
    return [
      {
        source: '/api/backend/:path*',
        destination: `${SPRING_BOOT_URL}/:path*`,
      },
    ];
  },
};

export default withNextIntl(nextConfig);

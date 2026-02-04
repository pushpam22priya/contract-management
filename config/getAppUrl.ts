/**
 * Dynamically detect the correct app URL based on current window location.
 * Falls back to NEXT_PUBLIC_APP_URL env variable or localhost:3000
 */
export const getAppUrl = (): string => {
    // Server-side: use env variable
    if (typeof window === 'undefined') {
        return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    }
    
    // Client-side: detect from browser
    const { protocol, hostname, port } = window.location;
    return `${protocol}//${hostname}${port ? `:${port}` : ''}`;
};

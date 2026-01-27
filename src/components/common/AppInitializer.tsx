'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { initializeEmailService } from '@/services/emailService';
import { validateConfig } from '../../../config/externalSignature';
import { authService } from '@/services/authService';
import { CircularProgress, Box } from '@mui/material';

/**
 * App Initializer Component
 * 
 * This component runs initialization code when the app starts.
 * It validates configuration and initializes services.
 * It also handles client-side route protection.
 * 
 * Add this component to your root layout.
 */
export default function AppInitializer({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const [authorized, setAuthorized] = useState(false);

    useEffect(() => {
        console.log('🚀 [AppInitializer] Starting initialization...');

        // Validate configuration
        const configResult = validateConfig();

        if (configResult.valid) {
            // Initialize EmailJS
            initializeEmailService();
            console.log('✅ [AppInitializer] All services initialized');
        } else {
            console.warn('⚠️ [AppInitializer] Some services not initialized due to missing config');
        }
    }, []);

    // Route Protection Logic
    useEffect(() => {
        // List of public paths that don't require authentication
        // Note: We use startsWith for /sign/ to match dynamic routes like /sign/[token]
        const publicPaths = ['/login', '/sign'];

        const isPublicPath = publicPaths.some(path =>
            pathname === path || pathname?.startsWith(path + '/')
        );

        if (isPublicPath) {
            setAuthorized(true);
            return;
        }

        const isAuthenticated = authService.isAuthenticated();

        if (!isAuthenticated) {
            console.log('🔒 [AppInitializer] User not authenticated, redirecting to login');
            setAuthorized(false);
            router.push('/login');
        } else {
            setAuthorized(true);
        }
    }, [pathname, router]);

    // Show loading or nothing while checking authorization
    // dependent on if we are on a protected route
    if (!authorized && !pathname?.startsWith('/login') && !pathname?.startsWith('/sign')) {
        return (
            <Box sx={{
                height: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
            }}>
                <CircularProgress />
            </Box>
        );
    }

    return <>{children}</>;
}

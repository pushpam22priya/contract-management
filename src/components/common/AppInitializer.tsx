'use client';

import { useEffect } from 'react';
import { initializeEmailService } from '@/services/emailService';
import { validateConfig } from '../../../config/externalSignature';

/**
 * App Initializer Component
 * 
 * This component runs initialization code when the app starts.
 * It validates configuration and initializes services.
 * 
 * Add this component to your root layout.
 */
export default function AppInitializer({ children }: { children: React.ReactNode }) {
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

    return <>{children}</>;
}

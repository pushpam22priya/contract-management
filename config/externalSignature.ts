/**
 * Configuration for external signature functionality.
 * 
 * This centralizes all configuration values making it easy to
 * switch between demo mode and production mode later.
 */
 
export const externalSignatureConfig = {
    // EmailJS configuration
    emailjs: {
        serviceId: process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID || '',
        templateId: process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID || '',
        signedCopyTemplateId: process.env.NEXT_PUBLIC_EMAILJS_SIGNED_COPY_TEMPLATE_ID || '',
        publicKey: process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY || '',
    },
    
    // JSONBin configuration
    jsonbin: {
        baseUrl: 'https://api.jsonbin.io/v3',
        masterKey: process.env.NEXT_PUBLIC_JSONBIN_MASTER_KEY || '',
    },
    
    // App configuration
    app: {
    baseUrl: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
    signingPagePath: '/sign',  // Public signing page route
    // Helper to get dynamic URL
    getDynamicBaseUrl: () => {
        if (typeof window === 'undefined') {
            return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        }
        const { protocol, hostname, port } = window.location;
        return `${protocol}//${hostname}${port ? `:${port}` : ''}`;
    },
},
    
    // Signature request settings
    settings: {
        expiryDays: 7,  // Links expire after 7 days
        pollIntervalMs: 30000,  // Check for updates every 30 seconds
    }
};
 
/**
 * Validate that all required configuration is present.
 * Call this on app startup to catch missing env vars early.
 */
export const validateConfig = (): { valid: boolean; missing: string[] } => {
    const missing: string[] = [];
    
    if (!externalSignatureConfig.emailjs.serviceId) {
        missing.push('NEXT_PUBLIC_EMAILJS_SERVICE_ID');
    }
    if (!externalSignatureConfig.emailjs.templateId) {
        missing.push('NEXT_PUBLIC_EMAILJS_TEMPLATE_ID');
    }
    if (!externalSignatureConfig.emailjs.publicKey) {
        missing.push('NEXT_PUBLIC_EMAILJS_PUBLIC_KEY');
    }
    if (!externalSignatureConfig.jsonbin.masterKey) {
        missing.push('NEXT_PUBLIC_JSONBIN_MASTER_KEY');
    }
    
    if (missing.length > 0) {
        console.warn('⚠️ [Config] Missing environment variables:', missing);
    } else {
        console.log('✅ [Config] All external signature configuration is valid');
    }
    
    return { valid: missing.length === 0, missing };
};
 
/**
 * Signature configuration.
Spring Boot handles all emails via SMTP.
 */

export const signatureConfig = {
    app: {
        signingPagePath: '/sign',
        getBaseUrl: (): string => {
            if (typeof window === 'undefined') {
                return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
            }
            const { protocol, hostname, port } = window.location;
            return `${protocol}//${hostname}${port ? `:${port}` : ''}`;
        },
    },
};

/** @deprecated Use signatureConfig instead */
export const externalSignatureConfig = {
    ...signatureConfig,
    settings: {
        expiryDays: 7,
        pollIntervalMs: 30000,
    },
} as any;

/** @deprecated No-op — EmailJS removed. Kept to avoid breaking AppInitializer. */
export const validateConfig = (): { valid: boolean; missing: string[] } => {
    return { valid: true, missing: [] };
};

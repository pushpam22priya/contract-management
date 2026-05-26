import { httpClient } from '@/lib/httpClient';

/**
 * Fetches a template's PDF binary from the backend with JWT auth and returns a
 * browser-accessible blob URL suitable for Apryse WebViewer.
 *
 * WHY: After the MinIO migration, template.fileUrl is a MinIO storage key
 * (e.g. "templates/{id}.pdf"), not a browser URL. Apryse cannot inject auth
 * headers internally, so we must: fetch with JWT → .blob() → createObjectURL().
 *
 * IMPORTANT: Caller must call URL.revokeObjectURL(url) when done to free memory.
 */
export async function fetchTemplateBlobUrl(templateId: string): Promise<string | null> {
    console.log(`[fetchTemplateBlobUrl] Starting fetch for template id="${templateId}"`);

    const res = await httpClient.getRaw(`/templates/${templateId}/file`);

    if (!res) {
        console.error(`[fetchTemplateBlobUrl] ✗ No response for template "${templateId}" (likely 401 or network error)`);
        return null;
    }

    if (!res.ok) {
        console.error(`[fetchTemplateBlobUrl] ✗ HTTP ${res.status} for template "${templateId}"`);
        return null;
    }

    try {
        const blob = await res.blob();
        console.log(`[fetchTemplateBlobUrl] ✓ Blob received: size=${blob.size} type="${blob.type}"`);

        if (blob.size === 0) {
            console.error(`[fetchTemplateBlobUrl] ✗ Empty blob for template "${templateId}"`);
            return null;
        }

        const url = URL.createObjectURL(blob);
        console.log(`[fetchTemplateBlobUrl] ✓ Blob URL created for template "${templateId}": ${url.slice(0, 60)}...`);
        return url;
    } catch (e) {
        console.error(`[fetchTemplateBlobUrl] ✗ Failed to create blob URL for template "${templateId}":`, e);
        return null;
    }
}

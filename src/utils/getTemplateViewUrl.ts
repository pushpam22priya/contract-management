import { httpClient } from '@/lib/httpClient';

/**
 * Fetches a short-lived MinIO presigned GET URL for a template's PDF.
 *
 * WHY: Apryse WebViewer needs a real HTTP URL that supports range requests
 * (206 Partial Content) for large PDFs. Blob URLs don't support HEAD/range
 * requests, causing Apryse to spin indefinitely on files > a few MB.
 *
 * The presigned URL is signed by MinIO — Apryse calls MinIO directly with
 * no Authorization header (credentials are baked into the URL query params).
 *
 * URL expires in 15 minutes. If the user keeps the viewer open beyond that,
 * call this function again to get a fresh URL and reload the document.
 *
 * Backend: GET /templates/{id}/file/view-url → { url: string }
 */
export async function getTemplateViewUrl(templateId: string): Promise<string | null> {
    console.log(`[getTemplateViewUrl] GET /templates/${templateId}/file/view-url`);

    const response = await httpClient.get<{ url: string }>(`/templates/${templateId}/file/view-url`);

    if (!response.ok || !response.data?.url) {
        console.error(`[getTemplateViewUrl] ✗ status=${response.status} message="${response.message}"`);
        return null;
    }

    console.log(`[getTemplateViewUrl] ✓ Presigned URL received (expires in ~15min)`);
    return response.data.url;
}

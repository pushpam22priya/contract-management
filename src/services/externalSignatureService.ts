import { httpClient } from '@/lib/httpClient';
import { SignerAssignment } from '@/types/contract';

const BACKEND = '/api/backend';

/**
 * Submit a contract for signature via Spring Boot.
 * Replaces submitForExternalSignature / submitForMultiPartySignature / submitForMixedSignature.
 * Spring Boot generates tokens, creates signature requests, sends emails, and manages auto-advance.
 */
export async function submitForSignature(
    contractId: string,
    assignments: SignerAssignment[],
    senderName: string,
): Promise<{ success: boolean; contract?: any; message?: string }> {
    const res = await httpClient.post(`/contracts/${contractId}/submit-for-signature`, {
        assignments: assignments.map(a => ({
            partyId:    a.partyId,
            partyLabel: a.partyLabel,
            type:       a.type,
            email:      a.email,
            name:       a.name,
            userId:     a.userId,
            order:      a.order,
        })),
        senderName,
    });

    if (!res.ok) return { success: false, message: res.message };
    return { success: true, contract: res.data };
}

/**
 * Load signing page data for an external signer.
 * PUBLIC endpoint — no JWT. Uses plain fetch through the Next.js proxy.
 */
export async function getSignatureRequestData(token: string): Promise<{
    success: boolean;
    data?: any;
    error?: string;
}> {
    try {
        const res = await fetch(`${BACKEND}/sign-requests/${token}`);
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            return { success: false, error: body.message || `HTTP ${res.status}` };
        }
        const data = await res.json();
        return { success: true, data };
    } catch (err: any) {
        return { success: false, error: err.message || 'Network error' };
    }
}

/**
 * Submit the signed PDF for an external signer.
 * PUBLIC endpoint — no JWT. Uses multipart/form-data.
 */
export async function completeExternalSignature(
    token: string,
    pdfBlob: Blob,
    xfdfString: string,
    fieldValues: Record<string, string>,
    formFields?: any[],
): Promise<{ success: boolean; error?: string }> {
    try {
        const formData = new FormData();
        formData.append('pdf', pdfBlob, 'signed.pdf');
        formData.append('xfdf', xfdfString);
        formData.append('fieldValues', JSON.stringify(fieldValues));
        formData.append('formFields', JSON.stringify(formFields || []));

        const res = await fetch(`${BACKEND}/sign-requests/${token}/complete`, {
            method: 'PUT',
            body: formData,
        });

        if (res.status === 409) {
            // Version conflict — caller should reload the page
            return { success: false, error: 'VERSION_CONFLICT' };
        }

        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            return { success: false, error: body.message || `HTTP ${res.status}` };
        }

        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message || 'Network error' };
    }
}

/**
 * Finalize a contract after all parties have signed.
 * Spring Boot creates the final PDF in MinIO and emails signed copies to all parties.
 */
export async function finalizeContract(
    contractId: string,
): Promise<{ success: boolean; contract?: any; message?: string }> {
    const res = await httpClient.post(`/contracts/${contractId}/finalize`, {});
    if (!res.ok) return { success: false, message: res.message };
    return { success: true, contract: res.data };
}

/**
 * External Signature Service
 * 
 * This service orchestrates the external signature flow using internal MongoDB storage.
 * It replaces the legacy JSONBin implementation.
 */

import { Contract } from '@/types/contract';
import { SignatureRequest, SignatureCompletionData } from '@/types/signature';
import { sendSignatureRequestEmail } from './emailService';
import { externalSignatureConfig } from '../../config/externalSignature';

// Internal API base URL
const API_BASE = '/api';

/**
 * Generate a unique token for the signature request.
 */
const generateToken = (): string => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    return `sig_${timestamp}_${random}`;
};

/**
 * Generate the signing URL that will be sent to the client.
 */
const generateSigningUrl = (token: string): string => {
    const baseUrl = externalSignatureConfig.app.getDynamicBaseUrl();
    const path = externalSignatureConfig.app.signingPagePath;
    // Uses token only, binId is no longer needed
    return `${baseUrl}${path}/${token}`;
};

/**
 * Calculate expiry date based on configured days.
 */
const calculateExpiryDate = (): string => {
    const days = externalSignatureConfig.settings.expiryDays;
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + days);
    return expiryDate.toISOString();
};

/**
 * Format date for display in email.
 */
const formatDateForEmail = (isoString: string): string => {
    return new Date(isoString).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });
};

/**
 * Submit a contract for external signature.
 * Creates a record in local MongoDB (signature_requests)
 */
export const submitForExternalSignature = async (
    contract: Contract,
    signerEmail: string,
    senderName: string
): Promise<{
    success: boolean;
    token?: string;
    signingUrl?: string;
    error?: string;
}> => {
    console.log('🚀 [ExternalSignature] Starting submission (Internal Flow)...');

    try {
        const token = generateToken();
        const expiresAt = calculateExpiryDate();

        // Prepare request data
        // ✅ CRITICAL FIX: Include xfdfData and fieldValues so external signers can see pre-filled field values
        const requestPayload = {
            token,
            contractId: contract.id,
            contractTitle: contract.title,
            signerEmail,
            createdBy: contract.createdBy,
            createdByName: senderName,
            createdAt: new Date().toISOString(),
            expiresAt,
            templateId: contract.templateId,
            formFields: contract.formFields,
            hasFormFields: contract.hasFormFields,
            xfdfData: contract.xfdfData,  // Include XFDF for field values and signatures
            fieldValues: contract.fieldValues  // ✅ Include fieldValues for text field restoration
        };

        // 1. Create Request via API
        const res = await fetch(`${API_BASE}/sign-requests`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestPayload)
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Failed to create signature request');
        }

        console.log('✅ [ExternalSignature] Request stored in DB');

        // 2. Generate URL
        const signingUrl = generateSigningUrl(token);

        // 3. Send Email
        console.log('📧 [ExternalSignature] Sending email...');
        const emailResult = await sendSignatureRequestEmail({
            to_email: signerEmail,
            contract_title: contract.title,
            sender_name: senderName,
            sent_date: formatDateForEmail(new Date().toISOString()),
            expiry_date: formatDateForEmail(expiresAt),
            signing_url: signingUrl,
        });

        if (!emailResult.success) {
            console.error('❌ [ExternalSignature] Email failed:', emailResult.error);
        }

        return { success: true, token, signingUrl };

    } catch (error: any) {
        console.error('❌ [ExternalSignature] Error:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Get full signature request data.
 * Used by the public signing page.
 */
export const getSignatureRequestData = async (
    token: string
): Promise<{
    success: boolean;
    data?: SignatureRequest;
    error?: string;
}> => {
    try {
        const res = await fetch(`${API_BASE}/sign-requests/${token}`, { cache: 'no-store' });
        if (!res.ok) {
            return { success: false, error: 'Failed to fetch request' };
        }
        const json = await res.json();
        return { success: true, data: json.data };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
};

/**
 * Complete a signature.
 * Uploads BLOB directly to backend.
 *
 * @param isAutoSave - If true, only save progress without marking as signed
 */
export const completeExternalSignature = async (
    token: string,
    pdfBlob: Blob,
    xfdfString: string,
    fieldValues?: Record<string, string>,
    formFields?: any[],
    isAutoSave?: boolean
): Promise<{ success: boolean; message?: string; error?: string }> => {
    try {
        console.log(isAutoSave
            ? '💾 [ExternalSignature] Auto-saving progress...'
            : '✍️ [ExternalSignature] Uploading signed binary...');

        // Use FormData to send both PDF and XFDF securely
        const formData = new FormData();
        formData.append('pdf', pdfBlob, 'signed_contract.pdf');
        formData.append('xfdf', xfdfString);

        // ✅ FIX: Also send fieldValues and formFields for full tracking like contract creation
        if (fieldValues) {
            formData.append('fieldValues', JSON.stringify(fieldValues));
        }
        if (formFields) {
            formData.append('formFields', JSON.stringify(formFields));
        }

        // ✅ Pass isAutoSave flag so API knows not to mark as signed
        if (isAutoSave) {
            formData.append('isAutoSave', 'true');
        }

        // Upload FormData to completion endpoint
        const res = await fetch(`${API_BASE}/sign-requests/${token}/complete`, {
            method: 'PUT',
            body: formData,
        });

        if (!res.ok) {
            // Check content type before trying to parse JSON
            const contentType = res.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                const err = await res.json();
                throw new Error(err.error || 'Failed to complete signature');
            } else {
                throw new Error(`Upload failed with status ${res.status}`);
            }
        }

        return { success: true };
    } catch (error: any) {
        console.error('Completion error:', error);
        return { success: false, error: error.message };
    }
};

// Legacy Polling (Optional - can be reimplemented if needed)
export const checkSignatureStatus = async (token: string): Promise<any> => {
    // Re-use getData
    const result = await getSignatureRequestData(token);
    if (!result.success || !result.data) return { success: false };
    return {
        success: true,
        status: result.data.status,
        signedAt: result.data.signedAt
    };
};


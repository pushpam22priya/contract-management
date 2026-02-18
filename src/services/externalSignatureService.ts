/**
 * External Signature Service
 *
 * This service orchestrates the external signature flow using internal MongoDB storage.
 * It replaces the legacy JSONBin implementation.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * MULTI-PARTY SIGNATURE FLOW
 * ═══════════════════════════════════════════════════════════════════════════
 * Supports sending contracts to multiple external parties, where each party
 * can only edit their assigned fields. The flow is:
 * 1. Contractor creates contract with fields assigned to different parties
 * 2. Contractor sends to multiple external signers (each assigned to a party)
 * 3. Each signer fills their party's fields and submits
 * 4. When all parties complete, contractor finalizes and emails are sent
 */

import { Contract, ExternalSigner } from '@/types/contract';
import { SignatureRequest, SignatureCompletionData } from '@/types/signature';
import { sendSignatureRequestEmail, sendSignedCopyEmail } from './emailService';
import { externalSignatureConfig } from '../../config/externalSignature';

// Internal API base URL
const API_BASE = '/api';

/**
 * Recipient for multi-party signature flow
 */
export interface SignatureRecipient {
    email: string;
    name?: string;
    partyId: string;       // Which party they fill
    partyLabel: string;    // Display label (e.g., "P2", "Buyer")
}

/**
 * Result of multi-party submission
 */
export interface MultiPartySubmitResult {
    success: boolean;
    error?: string;
    signers?: {
        email: string;
        partyId: string;
        partyLabel: string;
        token: string;
        signingUrl: string;
        emailSent: boolean;
    }[];
}

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
 * ═══════════════════════════════════════════════════════════════════════════
 * MULTI-PARTY: Submit contract for external signature to multiple parties
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Creates signature requests for multiple external signers, each assigned to
 * a specific party. Also updates the contract with multi-party tracking data.
 */
export const submitForMultiPartySignature = async (
    contract: Contract,
    recipients: SignatureRecipient[],
    senderName: string,
    contractorParty?: string  // Which party the contractor will fill
): Promise<MultiPartySubmitResult> => {
    console.log('🚀 [MultiPartySignature] Starting multi-party submission...');
    console.log(`   Contract: ${contract.id} - ${contract.title}`);
    console.log(`   Recipients: ${recipients.length}`);
    console.log(`   Contractor party: ${contractorParty || 'none'}`);

    try {
        const expiresAt = calculateExpiryDate();
        const now = new Date().toISOString();
        const signers: MultiPartySubmitResult['signers'] = [];
        const externalSigners: ExternalSigner[] = [];
        const partyCompletions: any[] = [];

        // Initialize partyCompletions for all parties
        const parties = contract.parties || [];
        for (const party of parties) {
            const isContractorParty = party.id === contractorParty;
            const recipientForParty = recipients.find(r => r.partyId === party.id);

            partyCompletions.push({
                partyId: party.id,
                partyLabel: party.label,
                status: 'pending',
                isContractor: isContractorParty,
                assignedTo: isContractorParty ? 'contractor' : recipientForParty?.email,
            });
        }

        // Get current contract version (for optimistic locking)
        const contractVersion = contract.version || 0;

        // Process each recipient
        for (const recipient of recipients) {
            console.log(`📧 [MultiPartySignature] Processing: ${recipient.email} → ${recipient.partyLabel}`);

            const token = generateToken();
            const signingUrl = generateSigningUrl(token);

            // Create signature request for this recipient
            const requestPayload = {
                token,
                contractId: contract.id,
                contractTitle: contract.title,
                signerEmail: recipient.email,
                signerName: recipient.name || '',
                createdBy: contract.createdBy,
                createdByName: senderName,
                createdAt: now,
                expiresAt,
                templateId: contract.templateId,
                formFields: contract.formFields,
                hasFormFields: contract.hasFormFields,
                xfdfData: contract.xfdfData,
                fieldValues: contract.fieldValues,
                // Multi-party fields
                assignedParty: recipient.partyId,
                assignedPartyLabel: recipient.partyLabel,
                contractVersion,
            };

            const res = await fetch(`${API_BASE}/sign-requests`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestPayload)
            });

            if (!res.ok) {
                const err = await res.json();
                console.error(`❌ [MultiPartySignature] Failed to create request for ${recipient.email}:`, err);
                throw new Error(`Failed to create request for ${recipient.email}: ${err.error}`);
            }

            console.log(`✅ [MultiPartySignature] Request created for ${recipient.email}`);

            // Send email
            let emailSent = false;
            try {
                console.log(`📧 [MultiPartySignature] Sending email to ${recipient.email}...`);
                const emailResult = await sendSignatureRequestEmail({
                    to_email: recipient.email,
                    contract_title: contract.title,
                    sender_name: senderName,
                    sent_date: formatDateForEmail(now),
                    expiry_date: formatDateForEmail(expiresAt),
                    signing_url: signingUrl,
                });

                emailSent = emailResult.success;
                if (!emailSent) {
                    console.error(`❌ [MultiPartySignature] Email failed for ${recipient.email}:`, emailResult.error);
                } else {
                    console.log(`✅ [MultiPartySignature] Email sent to ${recipient.email}`);
                }
            } catch (emailError: any) {
                console.error(`❌ [MultiPartySignature] Email error for ${recipient.email}:`, emailError);
            }

            // Track signer
            signers.push({
                email: recipient.email,
                partyId: recipient.partyId,
                partyLabel: recipient.partyLabel,
                token,
                signingUrl,
                emailSent,
            });

            // Add to externalSigners array
            externalSigners.push({
                email: recipient.email,
                name: recipient.name,
                partyId: recipient.partyId,
                partyLabel: recipient.partyLabel,
                token,
                status: 'pending',
                sentAt: now,
            });
        }

        // Update contract with multi-party tracking data
        // NOTE: Do NOT increment version here - version should only increment when
        // actual document content (PDF/XFDF) changes. This is just tracking data.
        console.log(`📝 [MultiPartySignature] Updating contract with tracking data...`);

        const contractUpdate = {
            signatureFlowStatus: 'pending_signatures',
            // Keep version unchanged - signature requests have this version for validation
            externalSigners,
            contractorParty: contractorParty || null,
            partyCompletions,
            updatedAt: now,
        };

        const updateRes = await fetch(`${API_BASE}/contracts/${contract.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(contractUpdate)
        });

        if (!updateRes.ok) {
            console.error(`⚠️ [MultiPartySignature] Failed to update contract tracking data`);
            // Don't fail the whole operation - requests were created
        } else {
            console.log(`✅ [MultiPartySignature] Contract tracking data updated`);
        }

        console.log(`🎉 [MultiPartySignature] Complete! Created ${signers.length} signature requests`);

        return {
            success: true,
            signers,
        };

    } catch (error: any) {
        console.error('❌ [MultiPartySignature] Error:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Send finalized contract emails to all external signers.
 * Called after contractor finalizes the contract.
 */
export const sendFinalizedContractEmails = async (
    contract: Contract,
    senderName: string
): Promise<{ success: boolean; sentCount: number; errors: string[] }> => {
    console.log(`📧 [FinalizedEmails] Sending finalized contract emails...`);
    console.log(`   Contract: ${contract.title}`);

    const errors: string[] = [];
    let sentCount = 0;

    const externalSigners = contract.externalSigners || [];

    for (const signer of externalSigners) {
        try {
            console.log(`📧 [FinalizedEmails] Sending to ${signer.email}...`);

            // Generate download URL
            const baseUrl = externalSignatureConfig.app.getDynamicBaseUrl();
            const downloadUrl = `${baseUrl}/api/contracts/${contract.id}/download`;

            const result = await sendSignedCopyEmail({
                to_email: signer.email,
                contract_title: contract.title,
                signer_name: signer.name || signer.email,
                signed_date: formatDateForEmail(contract.finalizedAt || new Date().toISOString()),
                download_url: downloadUrl,
            });

            if (result.success) {
                sentCount++;
                console.log(`✅ [FinalizedEmails] Sent to ${signer.email}`);
            } else {
                errors.push(`${signer.email}: ${result.error}`);
                console.error(`❌ [FinalizedEmails] Failed for ${signer.email}:`, result.error);
            }
        } catch (error: any) {
            errors.push(`${signer.email}: ${error.message}`);
            console.error(`❌ [FinalizedEmails] Error for ${signer.email}:`, error);
        }
    }

    console.log(`📧 [FinalizedEmails] Complete. Sent: ${sentCount}/${externalSigners.length}`);

    return {
        success: errors.length === 0,
        sentCount,
        errors,
    };
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


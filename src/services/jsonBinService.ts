/**
 * JSONBin Service
 * 
 * Handles all interactions with JSONBin.io API for storing and retrieving
 * signature requests. JSONBin acts as our "database" for cross-device
 * data sharing since localStorage doesn't sync across browsers.
 * 
 * In production, this will be replaced with calls to your Java backend.
 */

import { externalSignatureConfig } from '../../config/externalSignature';

import {
    SignatureRequest,
    JSONBinCreateResponse,
    JSONBinReadResponse,
    SignatureCompletionData
} from '@/types/signature';

const { baseUrl, masterKey } = externalSignatureConfig.jsonbin;

/**
 * Create a new bin with signature request data.
 * Returns the bin ID which will be used in the signing URL.
 */
export const createSignatureRequest = async (
    data: SignatureRequest
): Promise<{ success: boolean; binId?: string; error?: string }> => {
    console.log('📤 [JSONBin] Creating signature request bin...');
    console.log('📤 [JSONBin] Contract:', data.contractTitle);
    console.log('📤 [JSONBin] Signer:', data.signerEmail);

    try {
        console.log('📤 [JSONBin] Request data size analysis:');
        console.log(`   - signedPdfBase64: ${data.signedPdfBase64?.length || 0} chars`);
        console.log(`   - templateFileUrl: ${data.templateFileUrl?.length || 0} chars`);
        console.log(`   - fieldValues count: ${Object.keys(data.fieldValues || {}).length}`);

        const payload = JSON.stringify(data);
        console.log(`📤 [JSONBin] POST Payload Size: ${(payload.length / 1024).toFixed(2)} KB`);

        const response = await fetch(`${baseUrl}/b`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Master-Key': masterKey,
                'X-Bin-Private': 'false',  // Allow public read access
                'X-Bin-Name': `sig_${data.token}`,  // Name for easy identification
            },
            body: payload,
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ [JSONBin] Failed to create bin:', response.status, errorText);
            return { success: false, error: `Failed to create bin: ${response.status}` };
        }

        const result: JSONBinCreateResponse = await response.json();
        const binId = result.metadata.id;

        console.log('✅ [JSONBin] Bin created successfully');
        console.log('✅ [JSONBin] Bin ID:', binId);
        console.log('✅ [JSONBin] Result Metadata:', result.metadata);


        return { success: true, binId };

    } catch (error) {
        console.error('❌ [JSONBin] Network error:', error);
        return { success: false, error: 'Network error while creating signature request' };
    }
};

/**
 * Read a signature request from JSONBin by bin ID.
 * Used by the public signing page to load contract data.
 */
export const getSignatureRequest = async (
    binId: string
): Promise<{ success: boolean; data?: SignatureRequest; error?: string }> => {
    console.log('📥 [JSONBin] Fetching signature request...');
    console.log('📥 [JSONBin] Bin ID:', binId);

    try {
        const response = await fetch(`${baseUrl}/b/${binId}/latest`, {
            method: 'GET',
            headers: {
                'X-Master-Key': masterKey,
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ [JSONBin] Failed to fetch bin:', response.status, errorText);
            return { success: false, error: `Failed to fetch signature request: ${response.status}` };
        }

        const result: JSONBinReadResponse = await response.json();

        console.log('✅ [JSONBin] Signature request fetched successfully');
        console.log('✅ [JSONBin] Contract:', result.record.contractTitle);
        console.log('✅ [JSONBin] Status:', result.record.status);

        return { success: true, data: result.record };

    } catch (error) {
        console.error('❌ [JSONBin] Network error:', error);
        return { success: false, error: 'Network error while fetching signature request' };
    }
};

/**
 * Update a signature request (e.g., mark as viewed, signed, etc.)
 */
export const updateSignatureRequest = async (
    binId: string,
    updates: Partial<SignatureRequest>
): Promise<{ success: boolean; error?: string }> => {
    console.log('🔄 [JSONBin] Updating signature request...');
    console.log('🔄 [JSONBin] Bin ID:', binId);
    console.log('🔄 [JSONBin] Updates:', Object.keys(updates));

    try {
        // First, fetch current data
        const currentResult = await getSignatureRequest(binId);
        if (!currentResult.success || !currentResult.data) {
            return { success: false, error: 'Failed to fetch current data' };
        }

        // Merge updates
        const updatedData = {
            ...currentResult.data,
            ...updates,
        };

        // Log update size
        console.log('🔄 [JSONBin] Full update payload analysis:');
        console.log(`   - Payload keys: ${Object.keys(updatedData).join(', ')}`);
        if (updates.signedPdfBase64) {
            console.log(`   - signedPdfBase64 length: ${updates.signedPdfBase64.length} chars`);
            console.log(`   - signedPdfBase64 prefix: ${updates.signedPdfBase64.substring(0, 50)}...`);
        }
        if (updatedData.fieldValues) {
            console.log(`   - fieldValues count: ${Object.keys(updatedData.fieldValues).length}`);
            console.log('   - fieldValues content:', updatedData.fieldValues);
        }

        // Update the bin
        const payload = JSON.stringify(updatedData);
        console.log(`🔄 [JSONBin] PUT Payload Size: ${(payload.length / 1024).toFixed(2)} KB`);

        const response = await fetch(`${baseUrl}/b/${binId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-Master-Key': masterKey,
            },
            body: payload,
        });


        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ [JSONBin] Failed to update bin:', response.status, errorText);
            return { success: false, error: `Failed to update: ${response.status}` };
        }

        console.log('✅ [JSONBin] Signature request updated successfully');

        return { success: true };

    } catch (error) {
        console.error('❌ [JSONBin] Network error:', error);
        return { success: false, error: 'Network error while updating signature request' };
    }
};

/**
 * Complete a signature - update status to 'signed' and store signed XFDF.
 */
export const completeSignature = async (
    binId: string,
    signatureData: SignatureCompletionData
): Promise<{ success: boolean; error?: string }> => {
    console.log('✍️ [JSONBin] Completing signature...');
    console.log('✍️ [JSONBin] Bin ID:', binId);

    const updates: Partial<SignatureRequest> = {
        status: 'signed',
        signedAt: new Date().toISOString(),
        signedPdfBase64: signatureData.signedPdfBase64,
        signatureImage: signatureData.signatureImage,
    };

    const result = await updateSignatureRequest(binId, updates);

    if (result.success) {
        console.log('✅ [JSONBin] Signature completed and saved');
    }

    return result;
};

/**
 * Mark a signature request as viewed (when client opens the link)
 */
export const markAsViewed = async (binId: string): Promise<void> => {
    console.log('👁️ [JSONBin] Marking signature request as viewed...');

    await updateSignatureRequest(binId, { status: 'viewed' });
};

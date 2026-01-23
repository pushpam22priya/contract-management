/**
 * External Signature Service
 * 
 * This is the main service that orchestrates the external signature flow.
 * It combines JSONBin (storage) and EmailJS (email) to provide a complete
 * signature request workflow.
 * 
 * In production, this entire service will call your Java backend instead.
 */

import { Contract } from '@/types/contract';
import { SignatureRequest, SignatureCompletionData } from '@/types/signature';
import { 
    createSignatureRequest as createBin,
    getSignatureRequest as getBin,
    completeSignature as completeBinSignature,
    markAsViewed
} from './jsonBinService';
import { sendSignatureRequestEmail } from './emailService';
import { templateService } from './templateService';
import { externalSignatureConfig } from '../../config/externalSignature';

/**
 * Generate a unique token for the signature request.
 * This token is used in the signing URL for security.
 */
const generateToken = (): string => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    const token = `sig_${timestamp}_${random}`;
    
    console.log('🔑 [ExternalSignature] Generated token:', token);
    
    return token;
};

/**
 * Generate the signing URL that will be sent to the client.
 */
const generateSigningUrl = (token: string, binId: string): string => {
    const baseUrl = externalSignatureConfig.app.baseUrl;
    const path = externalSignatureConfig.app.signingPagePath;
    const url = `${baseUrl}${path}/${token}?bin=${binId}`;
    
    console.log('🔗 [ExternalSignature] Generated signing URL:', url);
    
    return url;
};

/**
 * Calculate expiry date based on configured days.
 */
const calculateExpiryDate = (): string => {
    const days = externalSignatureConfig.settings.expiryDays;
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + days);
    
    console.log('📅 [ExternalSignature] Expiry date:', expiryDate.toISOString());
    
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
 * Main function: Submit a contract for external signature.
 * 
 * This function:
 * 1. Generates a unique token
 * 2. Prepares all contract data for the signing page
 * 3. Stores it in JSONBin
 * 4. Sends an email with the signing link
 * 5. Returns the token and bin ID for tracking
 */
export const submitForExternalSignature = async (
    contract: Contract,
    signerEmail: string,
    senderName: string
): Promise<{
    success: boolean;
    token?: string;
    binId?: string;
    signingUrl?: string;
    error?: string;
}> => {
    console.log('🚀 [ExternalSignature] Starting external signature submission...');
    console.log('🚀 [ExternalSignature] Contract ID:', contract.id);
    console.log('🚀 [ExternalSignature] Contract Title:', contract.title);
    console.log('🚀 [ExternalSignature] Signer Email:', signerEmail);
    console.log('🚀 [ExternalSignature] Sender:', senderName);
    
    try {
        // Step 1: Generate unique token
        const token = generateToken();
        
        // Step 2: Get template file URL (base64 PDF)
        console.log('📄 [ExternalSignature] Fetching template data...');
        const template = templateService.getTemplateById(contract.templateId);
        
        if (!template?.fileUrl) {
            console.error('❌ [ExternalSignature] Template not found or has no fileUrl');
            return { success: false, error: 'Contract template not found' };
        }
        console.log('✅ [ExternalSignature] Template found:', template.name);
        
        // Step 3: Calculate expiry
        const expiresAt = calculateExpiryDate();
        
        // Step 4: Create signature request data
        const signatureRequest: SignatureRequest = {
            token,
            contractId: contract.id,
            contractTitle: contract.title,
            contractDescription: contract.description || '',
            signerEmail,
            createdBy: contract.createdBy,
            createdByName: senderName,
            createdAt: new Date().toISOString(),
            expiresAt,
            status: 'pending',
            templateId: contract.templateId,
            templateFileUrl: template.fileUrl,
            xfdfString: contract.xfdfString || '',
            formFields: contract.formFields || template.formFields || [],
            fieldValues: contract.fieldValues || {},
        };
        
        console.log('📦 [ExternalSignature] Signature request data prepared');
        
        // Step 5: Store in JSONBin
        console.log('☁️ [ExternalSignature] Uploading to JSONBin...');
        const binResult = await createBin(signatureRequest);
        
        if (!binResult.success || !binResult.binId) {
            console.error('❌ [ExternalSignature] Failed to create JSONBin:', binResult.error);
            return { success: false, error: binResult.error || 'Failed to store signature request' };
        }
        
        const binId = binResult.binId;
        console.log('✅ [ExternalSignature] Stored in JSONBin, ID:', binId);
        
        // Step 6: Generate signing URL
        const signingUrl = generateSigningUrl(token, binId);
        
        // Step 7: Send email
        console.log('📧 [ExternalSignature] Sending email to signer...');
        const emailResult = await sendSignatureRequestEmail({
            to_email: signerEmail,
            contract_title: contract.title,
            sender_name: senderName,
            sent_date: formatDateForEmail(new Date().toISOString()),
            expiry_date: formatDateForEmail(expiresAt),
            signing_url: signingUrl,
        });
        
        if (!emailResult.success) {
            console.error('❌ [ExternalSignature] Failed to send email:', emailResult.error);
            // Note: We don't fail the whole operation if email fails
            // The signing URL is still valid
            console.warn('⚠️ [ExternalSignature] Continuing despite email failure...');
        } else {
            console.log('✅ [ExternalSignature] Email sent successfully');
        }
        
        // Step 8: Return success with all tracking info
        console.log('🎉 [ExternalSignature] Submission completed successfully!');
        console.log('🎉 [ExternalSignature] Token:', token);
        console.log('🎉 [ExternalSignature] Bin ID:', binId);
        console.log('🎉 [ExternalSignature] Signing URL:', signingUrl);
        
        return {
            success: true,
            token,
            binId,
            signingUrl,
        };
        
    } catch (error: any) {
        console.error('❌ [ExternalSignature] Unexpected error:', error);
        return { success: false, error: error.message || 'Unexpected error occurred' };
    }
};

/**
 * Check the status of a signature request.
 * Used for polling to detect when client has signed.
 */
export const checkSignatureStatus = async (
    binId: string
): Promise<{
    success: boolean;
    status?: SignatureRequest['status'];
    signedXfdf?: string;
    signedAt?: string;
    error?: string;
}> => {
    console.log('🔍 [ExternalSignature] Checking signature status...');
    console.log('🔍 [ExternalSignature] Bin ID:', binId);
    
    const result = await getBin(binId);
    
    if (!result.success || !result.data) {
        console.error('❌ [ExternalSignature] Failed to fetch status:', result.error);
        return { success: false, error: result.error };
    }
    
    const { status, signedXfdf, signedAt } = result.data;
    
    console.log('✅ [ExternalSignature] Status:', status);
    if (status === 'signed') {
        console.log('✅ [ExternalSignature] Signed at:', signedAt);
    }
    
    return {
        success: true,
        status,
        signedXfdf,
        signedAt,
    };
};

/**
 * Get full signature request data.
 * Used by the public signing page to load the contract.
 */
export const getSignatureRequestData = async (
    binId: string
): Promise<{
    success: boolean;
    data?: SignatureRequest;
    error?: string;
}> => {
    console.log('📥 [ExternalSignature] Fetching signature request data...');
    
    const result = await getBin(binId);
    
    if (result.success && result.data) {
        // Mark as viewed if still pending
        if (result.data.status === 'pending') {
            console.log('👁️ [ExternalSignature] Marking as viewed...');
            await markAsViewed(binId);
        }
    }
    
    return result;
};

/**
 * Complete a signature from the public signing page.
 */
export const completeExternalSignature = async (
    binId: string,
    signatureData: SignatureCompletionData
): Promise<{ success: boolean; error?: string }> => {
    console.log('✍️ [ExternalSignature] Completing external signature...');
    
    return completeBinSignature(binId, signatureData);
};

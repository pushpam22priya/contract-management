/**
 * Email Service
 * 
 * Handles sending emails via EmailJS. In this demo, we use EmailJS
 * to send signature request emails directly from the browser.
 * 
 * In production, this will be replaced with your Java backend's
 * email sending functionality.
 */

import emailjs from '@emailjs/browser';
import { SignatureEmailParams } from '@/types/signature';
import { externalSignatureConfig } from '../../config/externalSignature';

const { serviceId, templateId, publicKey } = externalSignatureConfig.emailjs;

// Track if EmailJS has been initialized
let isInitialized = false;

/**
 * Initialize EmailJS with your public key.
 * Should be called once when the app starts.
 */
export const initializeEmailService = (): void => {
    if (isInitialized) {
        console.log('📧 [EmailJS] Already initialized');
        return;
    }
    
    if (!publicKey) {
        console.error('❌ [EmailJS] Public key not configured');
        return;
    }
    
    emailjs.init(publicKey);
    isInitialized = true;
    console.log('✅ [EmailJS] Initialized successfully');
};

/**
 * Send a signature request email to the client.
 */
export const sendSignatureRequestEmail = async (
    params: SignatureEmailParams
): Promise<{ success: boolean; error?: string }> => {
    console.log('📧 [EmailJS] Preparing to send signature request email...');
    console.log('📧 [EmailJS] To:', params.to_email);
    console.log('📧 [EmailJS] Contract:', params.contract_title);
    console.log('📧 [EmailJS] Signing URL:', params.signing_url);
    
    // Ensure EmailJS is initialized
    if (!isInitialized) {
        initializeEmailService();
    }
    
    // Validate configuration
    if (!serviceId || !templateId) {
        console.error('❌ [EmailJS] Service ID or Template ID not configured');
        return { success: false, error: 'Email service not configured' };
    }
    
    try {
        console.log('📧 [EmailJS] Sending email...');
        
        const templateParams = {
            to_email: params.to_email,
            contract_title: params.contract_title,
            sender_name: params.sender_name,
            sent_date: params.sent_date,
            expiry_date: params.expiry_date,
            signing_url: params.signing_url,
        };

        console.log('📧 [EmailJS] Template params being sent:', JSON.stringify(templateParams, null, 2));

        const response = await emailjs.send(
            serviceId,
            templateId,
            templateParams
        );
        
        console.log('✅ [EmailJS] Email sent successfully');
        console.log('✅ [EmailJS] Response status:', response.status);
        console.log('✅ [EmailJS] Response text:', response.text);
        
        return { success: true };
        
    } catch (error: any) {
        console.error('❌ [EmailJS] Failed to send email:', error);
        console.error('❌ [EmailJS] Error details:', error?.text || error?.message);
        
        return { 
            success: false, 
            error: error?.text || error?.message || 'Failed to send email' 
        };
    }
};

/**
 * Test email configuration by sending a test email.
 * Useful for debugging setup issues.
 */
export const testEmailConfiguration = async (
    testEmail: string
): Promise<{ success: boolean; error?: string }> => {
    console.log('🧪 [EmailJS] Testing email configuration...');
    
    return sendSignatureRequestEmail({
        to_email: testEmail,
        contract_title: 'Test Contract',
        sender_name: 'System Test',
        sent_date: new Date().toLocaleDateString(),
        expiry_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString(),
        signing_url: `${externalSignatureConfig.app.baseUrl}/sign/test-token?bin=test-bin`,
    });
};

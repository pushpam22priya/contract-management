/**
* Types for external signature functionality.
*
* This file defines the data structures used when sending contracts
* for external signature via email link.
*
* Note: Signing data is now stored directly in the contracts collection
* (see Contract.signingRequest in contract.ts). This type is maintained
* for API response compatibility with the signing page.
*/
 
/**
* Represents signature request data returned to the signing page.
* This is now derived from the contract document.
*/
export interface SignatureRequest {
    // Unique identifier for this signature request
    token: string;
 
    // Reference to the original contract in localStorage
    contractId: string;
 
    // Contract details for display
    contractTitle: string;
    contractDescription: string;
 
    // Signer information
    signerEmail: string;
    signerName?: string;
 
    // Sender information
    createdBy: string;
    createdByName?: string;
 
    // Timestamps
    createdAt: string;
    expiresAt: string;
 
    // Current status of the signature request
    status: SignatureRequestStatus;
 
    // Contract data needed for PDF viewing/signing
    templateId: string;
    templateFileUrl: string;      // Base64 PDF data
    xfdfString?: string;          // Legacy: Current annotations/form data (deprecated)
    xfdfData?: string;            // ✅ NEW: XFDF data for restoring pre-filled field values and signatures
    signedPdfBase64?: string;     // Full PDF with embedded signals/form fields
    hasFormFields?: boolean;      // Quick check if contract has form fields
    formFields: any[];            // Form field definitions
    fieldValues: Record<string, string>;
 
    // Filled after signing
    signedAt?: string;
    signedXfdf?: string;          // XFDF with signature
    signatureImage?: string;      // Optional signature image
}
 
/**
* Status of a signature request
*/
export type SignatureRequestStatus =
    | 'pending'      // Waiting for client to sign
    | 'viewed'       // Client opened the link
    | 'signed'       // Client completed signing
    | 'expired'      // Link has expired
    | 'cancelled';   // Contractor cancelled the request
 
// Legacy JSONBin types removed - no longer using external storage
 
/**
* Data sent when completing a signature
*/
export interface SignatureCompletionData {
    signedPdfBase64?: string;  // Full PDF with embedded signals/form fields
    signedXfdf?: string;       // XFDF with signature structure (new)
    signatureImage?: string;
}
 
/**
* Email template parameters for EmailJS
*/
export interface SignatureEmailParams {
    to_email: string;
    contract_title: string;
    sender_name: string;
    sent_date: string;
    expiry_date: string;
    signing_url: string;
}
 
/**
* Email template parameters for sending signed copy to the client
*/
export interface SignedCopyEmailParams {
    to_email: string;
    contract_title: string;
    signer_name: string;
    signed_date: string;
    download_url: string;
}
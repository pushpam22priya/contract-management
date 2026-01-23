/**
 * Types for external signature functionality.
 * 
 * This file defines the data structures used when sending contracts
 * for external signature via email link.
 */

/**
 * Represents a signature request sent to an external party.
 * This is stored in JSONBin and contains all data needed for signing.
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
    xfdfString: string;           // Current annotations/form data
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

/**
 * Response from JSONBin API when creating a bin
 */
export interface JSONBinCreateResponse {
    record: SignatureRequest;
    metadata: {
        id: string;
        createdAt: string;
        private: boolean;
    };
}

/**
 * Response from JSONBin API when reading a bin
 */
export interface JSONBinReadResponse {
    record: SignatureRequest;
    metadata: {
        id: string;
        createdAt: string;
        private: boolean;
    };
}

/**
 * Data sent when completing a signature
 */
export interface SignatureCompletionData {
    signedXfdf: string;
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

/**
 * MSW HANDLERS — Fake Spring Boot API responses
 *
 * These intercept fetch() calls at the network level.
 * Your component code doesn't change — it still calls fetch('/api/backend/...')
 * but MSW catches it and returns the response defined here.
 *
 * These are the DEFAULT (happy-path) responses.
 * Individual tests can override specific handlers using server.use(...).
 */

import { http, HttpResponse } from 'msw';

// ─── Shared test data ────────────────────────────────────────────────────────

export const mockSignatureRequest = {
    token: 'test_token_123',
    contractId: 'contract_abc',
    contractTitle: 'Service Agreement',
    signerEmail: 'buyer@example.com',
    signerName: 'John Buyer',
    status: 'unlocked',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days from now
    assignedParty: 'party_buyer',
    assignedPartyLabel: 'Buyer',
    parties: [
        { id: 'party_buyer', label: 'Buyer', color: '#4CAF50' },
        { id: 'party_seller', label: 'Seller', color: '#2196F3' },
    ],
    formFields: [
        { name: 'BuyerName', type: 'text', assignedParty: 'party_buyer', partyLabel: 'Buyer', partyColor: '#4CAF50' },
        { name: 'BuyerEmail', type: 'text', assignedParty: 'party_buyer', partyLabel: 'Buyer', partyColor: '#4CAF50' },
        { name: 'SellerName', type: 'text', assignedParty: 'party_seller', partyLabel: 'Seller', partyColor: '#2196F3' },
    ],
    fieldValues: {},
    xfdfData: '<?xml version="1.0" encoding="UTF-8"?><xfdf></xfdf>',
};

// ─── Default handlers ─────────────────────────────────────────────────────────

export const handlers = [

    // GET /sign-requests/:token — returns signer data
    // Used by sign/[token]/page.tsx on load
    http.get('/api/backend/sign-requests/:token', () => {
        return HttpResponse.json(mockSignatureRequest);
    }),

    // GET /sign-requests/:token/file-url — returns presigned URL for the PDF
    http.get('/api/backend/sign-requests/:token/file-url', () => {
        return HttpResponse.json({
            url: 'https://minio.test/contracts/contract_abc.pdf?presigned=true',
        });
    }),

    // PATCH /sign-requests/:token/viewed — fire-and-forget, just needs to succeed
    http.patch('/api/backend/sign-requests/:token/viewed', () => {
        return HttpResponse.json({ success: true });
    }),

    // POST /sign-requests/:token/upload/initiate — starts chunked upload
    http.post('/api/backend/sign-requests/:token/upload/initiate', () => {
        return HttpResponse.json({ uploadId: 'upload_test_123' });
    }),

    // GET /sign-requests/:token/upload/presign — returns presigned chunk URL
    http.get('/api/backend/sign-requests/:token/upload/presign', () => {
        return HttpResponse.json({ url: 'https://minio.test/presigned-chunk-url' });
    }),

    // POST /sign-requests/:token/upload/complete — records the signature
    http.post('/api/backend/sign-requests/:token/upload/complete', () => {
        return HttpResponse.json({ success: true, message: 'Signature submitted successfully' });
    }),
];

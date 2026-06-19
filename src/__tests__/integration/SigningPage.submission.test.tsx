/**
 * INTEGRATION TESTS — External Signing Page: submission flow
 *
 * Tests the "Send" button path in sign/[token]/page.tsx.
 * This file is SEPARATE from SigningPage.test.tsx (which covers loading/error
 * states) because the submission tests need a different PDFViewerContainer mock —
 * one that exposes exportAnnotations() and exportFormFields() on the ref so the
 * component's handleSubmitSignature() can call them.
 *
 * Upload sequence that is tested:
 *   POST /upload/initiate  →  { uploadId }
 *   GET  /upload/presign   →  { url: 'https://minio.test/...' }
 *   PUT  https://minio.test/...   →  200  ETag
 *   POST /upload/complete  →  { success: true }
 *
 * Scenarios covered:
 *  1. Happy path: full upload sequence succeeds → "Document Signed Successfully!"
 *  2. Upload initiate fails (500) → error message shown
 *  3. Upload complete rejected by backend → backend error message shown
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { mockSignatureRequest } from './mocks/handlers';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('next/navigation', () => ({
    useParams: () => ({ token: 'test_token_123' }),
}));

// next/dynamic with ssr:false creates a class-component wrapper that does NOT
// forward refs to the inner loaded component.  We replace it with a forwardRef
// wrapper that loads the module via useEffect and passes the ref through.
// This ensures useImperativeHandle in the PDFViewerContainer mock actually runs
// and sets pdfViewerRef.current = { exportAnnotations, exportFormFields, ... }.
jest.mock('next/dynamic', () => {
    const React = require('react');
    return function dynamic(importFn: () => Promise<any>, options?: any) {
        return React.forwardRef((props: any, ref: any) => {
            const [LoadedComp, setLoadedComp] = React.useState(null);

            React.useEffect(() => {
                importFn().then((mod: any) => {
                    setLoadedComp(() => mod.default ?? mod);
                });
            }, []);

            if (!LoadedComp) {
                const Loading = options?.loading;
                return Loading ? React.createElement(Loading) : null;
            }

            return React.createElement(LoadedComp, { ...props, ref });
        });
    };
});

// PDFViewerContainer with ref methods exposed via useImperativeHandle.
// exportAnnotations() simulates Apryse exporting the signed PDF + XFDF.
// exportFormFields() simulates Apryse returning stripped field metadata.
jest.mock('@/components/viewer/PDFViewerContainer', () => {
    const React = require('react');
    return {
        __esModule: true,
        default: React.forwardRef((_props: any, ref: any) => {
            React.useImperativeHandle(ref, () => ({
                exportAnnotations: () =>
                    Promise.resolve({
                        blob: new Blob(['%PDF-1.4 fake signed content'], { type: 'application/pdf' }),
                        xfdfString: '<?xml version="1.0" encoding="UTF-8"?><xfdf></xfdf>',
                    }),
                exportFormFields: () =>
                    Promise.resolve([
                        { name: 'BuyerName', type: 'text', value: 'John', readOnly: false },
                    ]),
                clearSignatureStore: () => {},
            }));
            return React.createElement('div', { 'data-testid': 'pdf-viewer' });
        }),
    };
});

jest.mock('@/components/contracts/SignAllDialog', () => ({
    __esModule: true,
    default: () => null,
}));

jest.mock('@/components/viewer/pdfViewer/WrongPartyWarningDialog', () => ({
    __esModule: true,
    default: () => null,
}));

jest.mock('@/components/viewer/pdfViewer/PartyValidationWarningPopup', () => ({
    __esModule: true,
    default: () => null,
}));

// ─── MSW server ───────────────────────────────────────────────────────────────

// Base request fixture with assignedParty: null so field validation is skipped.
// (hasFilledAllAssignedFields returns true when assignedParty is null, meaning
// the "Send" button is always enabled without needing fields to be filled.)
const noPartyRequest = {
    ...mockSignatureRequest,
    assignedParty: null,
    formFields: [],
};

const server = setupServer(
    // ── Page load ──
    http.get('/api/backend/sign-requests/:token', () =>
        HttpResponse.json(noPartyRequest)
    ),
    http.get('/api/backend/sign-requests/:token/file-url', () =>
        HttpResponse.json({ url: 'https://minio.test/contracts/contract_abc.pdf' })
    ),
    http.patch('/api/backend/sign-requests/:token/viewed', () =>
        HttpResponse.json({ success: true })
    ),

    // ── Upload sequence (happy path defaults) ──
    http.post('/api/backend/sign-requests/:token/upload/initiate', () =>
        HttpResponse.json({ uploadId: 'upload_test_123' })
    ),
    http.get('/api/backend/sign-requests/:token/upload/presign', () =>
        HttpResponse.json({ url: 'https://minio.test/presigned-chunk' })
    ),
    // PUT to the MinIO presigned URL (external origin, not /api/backend)
    http.put('https://minio.test/presigned-chunk', () =>
        new HttpResponse(null, {
            status: 200,
            headers: { ETag: '"etag-part-001"' },
        })
    ),
    http.post('/api/backend/sign-requests/:token/upload/complete', () =>
        HttpResponse.json({ success: true, message: 'Signature submitted successfully' })
    )
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// ─── Component under test ─────────────────────────────────────────────────────

import SigningPage from '@/app/sign/[token]/page';

// ─── Helper ───────────────────────────────────────────────────────────────────

/** Wait for the page to finish loading and the PDF viewer to appear. */
async function waitForPageLoad() {
    // Loading spinner disappears when both fetches complete
    await waitFor(() => {
        expect(screen.queryByText('Loading document...')).not.toBeInTheDocument();
    });
    // PDF viewer is rendered once documentUrl is set
    await screen.findByTestId('pdf-viewer');
}

// ─────────────────────────────────────────────────────────────────────────────

describe('SigningPage — submission: happy path', () => {

    it('shows "Document Signed Successfully!" after a successful upload sequence', async () => {
        /**
         * WHAT WE'RE TESTING:
         * The full upload flow:
         *   1. Initiate multipart upload
         *   2. Get presigned URL for each chunk
         *   3. PUT the chunk directly to MinIO
         *   4. Complete the upload (record signature in backend)
         *   5. Component transitions to the completed state
         *
         * After this, the page should show "Document Signed Successfully!".
         */

        const user = userEvent.setup();
        render(<SigningPage />);

        await waitForPageLoad();

        // The "Send" button is in the top toolbar
        const sendButton = screen.getByRole('button', { name: /send/i });
        expect(sendButton).not.toBeDisabled();

        await user.click(sendButton);

        // After the full upload sequence, the page transitions to completed state
        expect(await screen.findByText('Document Signed Successfully!')).toBeInTheDocument();

        // Error screen must NOT appear
        expect(screen.queryByText('Unable to Load Document')).not.toBeInTheDocument();
    });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('SigningPage — submission: error states', () => {

    it('shows an error when the upload initiate call returns 500', async () => {
        /**
         * WHAT WE'RE TESTING:
         * If the backend rejects the initiate request (storage unavailable, etc.),
         * the component should catch the error and show an error message.
         * The page must NOT transition to the success state.
         */

        server.use(
            http.post('/api/backend/sign-requests/:token/upload/initiate', () =>
                new HttpResponse(null, { status: 500 })
            )
        );

        const user = userEvent.setup();
        render(<SigningPage />);

        await waitForPageLoad();

        await user.click(screen.getByRole('button', { name: /send/i }));

        // Error message should appear (caught by the catch block)
        await waitFor(() => {
            expect(screen.getByText(/failed to initiate upload/i)).toBeInTheDocument();
        });

        // Must NOT show success
        expect(screen.queryByText('Document Signed Successfully!')).not.toBeInTheDocument();
    });

    it('shows backend error message when the complete call returns 500', async () => {
        /**
         * WHAT WE'RE TESTING:
         * The initiate and chunk upload succeed, but the final "complete" call
         * (which records the signature in the database) fails.
         * The backend sends a specific error message that should be shown to the user.
         */

        server.use(
            http.post('/api/backend/sign-requests/:token/upload/complete', () =>
                HttpResponse.json(
                    { message: 'Storage service is temporarily unavailable' },
                    { status: 500 }
                )
            )
        );

        const user = userEvent.setup();
        render(<SigningPage />);

        await waitForPageLoad();

        await user.click(screen.getByRole('button', { name: /send/i }));

        // The backend's specific error message should appear
        await waitFor(() => {
            expect(
                screen.getByText('Storage service is temporarily unavailable')
            ).toBeInTheDocument();
        });

        expect(screen.queryByText('Document Signed Successfully!')).not.toBeInTheDocument();
    });
});

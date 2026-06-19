/**
 * INTEGRATION TESTS — External Signing Page (sign/[token]/page.tsx)
 *
 * These tests render the real component but:
 * - Mock the PDF viewer (Apryse can't run in jsdom)
 * - Mock Next.js router hooks
 * - Use MSW to fake Spring Boot API responses
 *
 * Scenarios covered:
 *  1. Loading state shown on initial render
 *  2. "Already Submitted" shows green CheckCircle (not error icon)
 *  3. "Already Signed" variant wording also shows green icon
 *  4. 404 / generic error shows red ErrorIcon
 *  5. Completed state (status: 'signed') shows success screen
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { handlers, mockSignatureRequest } from './mocks/handlers';

// ─── Mocks ────────────────────────────────────────────────────────────────────

// 1. Mock Next.js useParams — the page reads the token from the URL
jest.mock('next/navigation', () => ({
    useParams: () => ({ token: 'test_token_123' }),
}));

// 2. Mock PDFViewerContainer — Apryse WebViewer is a browser-only library.
//    It tries to load a WebAssembly file and manipulate a real DOM canvas,
//    neither of which works in jsdom. We replace it with a simple placeholder.
jest.mock('@/components/viewer/PDFViewerContainer', () => ({
    __esModule: true,
    default: React.forwardRef((_props: any, _ref: any) => (
        <div data-testid="pdf-viewer">PDF Viewer Placeholder</div>
    )),
}));

// 3. Mock child dialogs — keeps tests focused on the page, not the dialogs
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

// ─── MSW Server setup ─────────────────────────────────────────────────────────

// Create the fake API server with our default handlers
const server = setupServer(...handlers);

// Start the server before all tests in this file
beforeAll(() => server.listen());

// Reset any handler overrides between tests so they don't bleed across tests
afterEach(() => server.resetHandlers());

// Shut down the server after all tests are done
afterAll(() => server.close());

// ─── Import the component under test ─────────────────────────────────────────

// We import AFTER jest.mock() calls so the mocks are in place before the module loads
import SigningPage from '@/app/sign/[token]/page';

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SigningPage — loading state', () => {

    it('shows a loading spinner while fetching signer data', () => {
        /**
         * WHAT WE'RE TESTING:
         * The page starts with loading=true. Before any fetch response arrives,
         * the component should show a loading indicator.
         *
         * HOW IT WORKS:
         * render() returns immediately after the first render (before effects settle).
         * At that point loading is still true → loading UI visible.
         */

        render(<SigningPage />);

        // getByText throws if not found — good, we EXPECT it to be there
        expect(screen.getByText('Loading document...')).toBeInTheDocument();
    });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('SigningPage — error states', () => {

    it('shows green CheckCircle and "Signature Already Submitted" title when backend returns 400 already-submitted', async () => {
        /**
         * WHAT WE'RE TESTING:
         * When a signer opens a link they already used, the backend returns:
         *   HTTP 400 { message: "You have already submitted your signature" }
         * The page should show a SUCCESS-style screen (green icon, not red error).
         *
         * HOW server.use() WORKS:
         * This overrides the default GET handler just for this one test.
         * After the test, server.resetHandlers() in afterEach() removes the override.
         */

        server.use(
            http.get('/api/backend/sign-requests/:token', () => {
                return HttpResponse.json(
                    { message: 'You have already submitted your signature' },
                    { status: 400 }
                );
            })
        );

        render(<SigningPage />);

        // findByText is ASYNC — it waits up to 1 second for the element to appear.
        // We need this because the fetch is async (even with MSW it takes a tick).
        expect(await screen.findByText('Signature Already Submitted')).toBeInTheDocument();

        // The generic error title should NOT be shown
        expect(screen.queryByText('Unable to Load Document')).not.toBeInTheDocument();

        // The error message from the backend should appear in the alert
        expect(screen.getByText('You have already submitted your signature')).toBeInTheDocument();
    });

    it('shows green CheckCircle when message says "already signed" (alternate wording)', async () => {
        /**
         * WHAT WE'RE TESTING:
         * Some backend messages may say "already signed" instead of "already submitted".
         * The isAlreadySubmitted check covers both:
         *   error.toLowerCase().includes('already submitted') ||
         *   error.toLowerCase().includes('already signed')
         */

        server.use(
            http.get('/api/backend/sign-requests/:token', () => {
                return HttpResponse.json(
                    { message: 'This request has already signed' },
                    { status: 400 }
                );
            })
        );

        render(<SigningPage />);

        // Should still show the "already submitted" style screen
        expect(await screen.findByText('Signature Already Submitted')).toBeInTheDocument();
        expect(screen.queryByText('Unable to Load Document')).not.toBeInTheDocument();
    });

    it('shows red ErrorIcon and "Unable to Load Document" for a 404 not-found error', async () => {
        /**
         * WHAT WE'RE TESTING:
         * A real error (invalid/expired token) should show the red error screen.
         * This is the opposite of the already-submitted case.
         */

        server.use(
            http.get('/api/backend/sign-requests/:token', () => {
                return HttpResponse.json(
                    { message: 'Signing request not found' },
                    { status: 404 }
                );
            })
        );

        render(<SigningPage />);

        expect(await screen.findByText('Unable to Load Document')).toBeInTheDocument();

        // The "already submitted" title must NOT appear
        expect(screen.queryByText('Signature Already Submitted')).not.toBeInTheDocument();

        expect(screen.getByText('Signing request not found')).toBeInTheDocument();
    });

    it('shows "Unable to Load Document" for a generic network-level error message', async () => {
        /**
         * WHAT WE'RE TESTING:
         * Other non-already-submitted error messages (expired link, server error)
         * should still show the generic red error screen.
         */

        server.use(
            http.get('/api/backend/sign-requests/:token', () => {
                return HttpResponse.json(
                    { message: 'Unable to load document. The link may be invalid or expired.' },
                    { status: 400 }
                );
            })
        );

        render(<SigningPage />);

        expect(await screen.findByText('Unable to Load Document')).toBeInTheDocument();
        expect(screen.queryByText('Signature Already Submitted')).not.toBeInTheDocument();
    });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('SigningPage — completed state', () => {

    it('shows "Document Signed Successfully!" when backend returns status: signed', async () => {
        /**
         * WHAT WE'RE TESTING:
         * If the signer already completed BUT the request returns 200 with
         * status: 'signed', the page sets completed=true and shows the
         * post-submission success screen (different from the error screen).
         *
         * NOTE: This is a different path from the 400 "already submitted" case.
         * - 400 → setError() → error screen
         * - 200 + status:'signed' → setCompleted(true) → completed screen
         */

        server.use(
            http.get('/api/backend/sign-requests/:token', () => {
                return HttpResponse.json({
                    ...mockSignatureRequest,
                    status: 'signed', // ← this triggers setCompleted(true)
                });
            })
        );

        render(<SigningPage />);

        // The completion screen has this specific heading
        expect(await screen.findByText('Document Signed Successfully!')).toBeInTheDocument();

        // Neither error screen should appear
        expect(screen.queryByText('Unable to Load Document')).not.toBeInTheDocument();
        expect(screen.queryByText('Signature Already Submitted')).not.toBeInTheDocument();
    });
});

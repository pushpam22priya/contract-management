/**
 * INTEGRATION TESTS — UnifiedFlowReviewerPanel
 * (src/components/unified-flow/UnifiedFlowReviewerPanel.tsx)
 *
 * DocumentViewerDialog (heavy PDF viewer) is dynamically imported and mocked.
 * unifiedFlowService and apiService are mocked for all API calls.
 *
 * Key differences from ApproverPanel:
 *  - Action button is "Mark Complete" (not "Sign & Approve")
 *  - Reviewer still uploads the PDF via multipart upload (preserves any field edits)
 *  - No internal-field gate (that's approver-only)
 *  - Role passed to DocumentViewerDialog is "REVIEWER"
 *
 * Scenarios covered:
 *  1.  Shows loading spinner while fetching file URL
 *  2.  Shows error alert when getParticipantFileUrl fails
 *  3.  Renders DocumentViewerDialog with role="REVIEWER" when file URL loads
 *  4.  Mark Complete button is always enabled (not gated on prior viewer save)
 *  5.  Clicking Mark Complete with no prior PDF export shows action error
 *  6.  Mark Complete triggers initiateFlowUpload after viewer save
 *  7.  Calls markFlowComplete with uploadId + parts + xfdfData after successful upload
 *  8.  Shows upload progress stepper during upload phase
 *  9.  Shows error overlay + Retry button on upload failure
 * 10.  Abort is called when upload fails mid-way
 * 11.  Reject button opens UnifiedFlowRejectDialog with role="REVIEWER"
 * 12.  Read-only mode — Mark Complete and Reject buttons not shown when completed
 * 13.  XFDF loaded from apiService.getContractDetails and passed as initialXfdf to viewer
 */

import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UnifiedFlowReviewerPanel from '@/components/unified-flow/UnifiedFlowReviewerPanel';
import type { WorkflowParticipant } from '@/types/unifiedFlow';

// ─── Mock DocumentViewerDialog ────────────────────────────────────────────────
let capturedOnSave: Function | undefined;
let capturedInitialXfdf: string | undefined;
let capturedRole: string | undefined;

jest.mock('@/components/viewer/DocumentViewerDialog', () => ({
    __esModule: true,
    default: (props: any) => {
        capturedOnSave = props.onSave;
        capturedInitialXfdf = props.initialXfdf;
        capturedRole = props.unifiedParticipantRole;
        if (!props.open) return null;
        return (
            <div data-testid="pdf-viewer">
                <div data-testid="extra-actions">{props.extraActions}</div>
            </div>
        );
    },
}));

// ─── Mock unifiedFlowService ──────────────────────────────────────────────────
const mockGetFileUrl = jest.fn();
const mockInitiate = jest.fn();
const mockPresign = jest.fn();
const mockMarkComplete = jest.fn();
const mockAbort = jest.fn();
const mockRejectFlow = jest.fn();

jest.mock('@/services/unifiedFlowService', () => ({
    unifiedFlowService: {
        getParticipantFileUrl: (...a: any[]) => mockGetFileUrl(...a),
        initiateFlowUpload: (...a: any[]) => mockInitiate(...a),
        getFlowPresignedUrl: (...a: any[]) => mockPresign(...a),
        markFlowComplete: (...a: any[]) => mockMarkComplete(...a),
        abortFlowUpload: (...a: any[]) => mockAbort(...a),
        rejectFlow: (...a: any[]) => mockRejectFlow(...a),
    },
}));

// ─── Mock apiService ──────────────────────────────────────────────────────────
const mockGetContractDetails = jest.fn();

jest.mock('@/services/apiService', () => ({
    apiService: {
        getContractDetails: (...a: any[]) => mockGetContractDetails(...a),
    },
}));

// fetch is used to PUT chunks to MinIO
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const UNLOCKED_PARTICIPANT: WorkflowParticipant = {
    email: 'reviewer@co.com',
    role: 'REVIEWER',
    order: 1,
    status: 'unlocked',
};

const COMPLETED_PARTICIPANT: WorkflowParticipant = {
    ...UNLOCKED_PARTICIPANT,
    status: 'completed',
};

function renderPanel(participant: WorkflowParticipant = UNLOCKED_PARTICIPANT) {
    const props = {
        open: true,
        onClose: jest.fn(),
        onActed: jest.fn(),
        contractId: 'c-reviewer',
        contractTitle: 'Review Contract',
        participant,
    };
    render(<UnifiedFlowReviewerPanel {...props} />);
    return props;
}

beforeEach(() => {
    jest.clearAllMocks();
    capturedOnSave = undefined;
    capturedInitialXfdf = undefined;
    capturedRole = undefined;
    mockGetFileUrl.mockResolvedValue({ ok: true, data: { url: 'https://minio.example.com/doc.pdf' } });
    mockGetContractDetails.mockResolvedValue({ xfdfData: undefined });
    mockInitiate.mockResolvedValue({ ok: true, data: { uploadId: 'uid-rev-1' } });
    mockPresign.mockResolvedValue({ ok: true, data: { url: 'https://minio.example.com/presigned' } });
    mockMarkComplete.mockResolvedValue({ ok: true });
    mockAbort.mockResolvedValue({ ok: true });
    mockRejectFlow.mockResolvedValue({ ok: true });
    mockFetch.mockResolvedValue({
        ok: true,
        headers: { get: () => '"etag-xyz"' },
    } as any);
});

// ─── Tests ───────────────────────────────────────────────────────────────────

test('1. shows loading spinner while fetching file URL', () => {
    mockGetFileUrl.mockReturnValue(new Promise(() => {})); // never resolves
    renderPanel();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
});

test('2. shows error alert when getParticipantFileUrl fails', async () => {
    mockGetFileUrl.mockResolvedValue({ ok: false, message: 'File not found.' });
    renderPanel();
    await waitFor(() => {
        expect(screen.getByText(/file not found/i)).toBeInTheDocument();
    });
});

test('3. renders DocumentViewerDialog with role REVIEWER when file URL loads', async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByTestId('pdf-viewer')).toBeInTheDocument());
    expect(capturedRole).toBe('REVIEWER');
});

test('4. Mark Complete button is always enabled (not gated on prior viewer save)', async () => {
    renderPanel();
    await waitFor(() => screen.getByTestId('extra-actions'));
    expect(screen.getByRole('button', { name: /mark complete/i })).not.toBeDisabled();
});

test('5. clicking Mark Complete with no prior PDF export shows action error', async () => {
    renderPanel();
    await waitFor(() => screen.getByTestId('extra-actions'));
    // Click without viewer ever calling onSave (no blob cached)
    await userEvent.click(screen.getByRole('button', { name: /mark complete/i }));
    await waitFor(() => {
        expect(screen.getByText(/could not export the pdf/i)).toBeInTheDocument();
    });
    expect(mockInitiate).not.toHaveBeenCalled();
});

test('6. Mark Complete triggers initiateFlowUpload after viewer onSave fires', async () => {
    renderPanel();
    await waitFor(() => screen.getByTestId('extra-actions'));

    const blob = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
    await act(async () => { capturedOnSave?.(blob, '<xfdf/>', {}, []); });

    await userEvent.click(screen.getByRole('button', { name: /mark complete/i }));
    await waitFor(() => {
        expect(mockInitiate).toHaveBeenCalledWith('c-reviewer');
    });
});

test('7. calls markFlowComplete with uploadId + parts + xfdfData after successful upload', async () => {
    renderPanel();
    await waitFor(() => screen.getByTestId('extra-actions'));

    const blob = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
    await act(async () => { capturedOnSave?.(blob, '<xfdf><annots/></xfdf>', {}, []); });
    await userEvent.click(screen.getByRole('button', { name: /mark complete/i }));

    await waitFor(() => {
        expect(mockMarkComplete).toHaveBeenCalledWith(
            'c-reviewer',
            expect.objectContaining({
                uploadId: 'uid-rev-1',
                parts: expect.any(Array),
                xfdfData: '<xfdf><annots/></xfdf>',
            }),
        );
    });
});

test('8. shows upload stepper during uploading phase', async () => {
    mockFetch.mockReturnValue(new Promise(() => {})); // hang to keep uploading phase visible
    renderPanel();
    await waitFor(() => screen.getByTestId('extra-actions'));

    const blob = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
    await act(async () => { capturedOnSave?.(blob, '<xfdf/>', {}, []); });
    await userEvent.click(screen.getByRole('button', { name: /mark complete/i }));

    await waitFor(() => {
        expect(screen.getByText(/uploading pdf/i)).toBeInTheDocument();
    });
});

test('9. shows error overlay and Retry button on upload failure', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500, headers: { get: () => null } } as any);
    renderPanel();
    await waitFor(() => screen.getByTestId('extra-actions'));

    const blob = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
    await act(async () => { capturedOnSave?.(blob, '<xfdf/>', {}, []); });
    await userEvent.click(screen.getByRole('button', { name: /mark complete/i }));

    await waitFor(() => {
        expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });
});

test('10. abort is called when upload fails mid-way', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500, headers: { get: () => null } } as any);
    renderPanel();
    await waitFor(() => screen.getByTestId('extra-actions'));

    const blob = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
    await act(async () => { capturedOnSave?.(blob, '<xfdf/>', {}, []); });
    await userEvent.click(screen.getByRole('button', { name: /mark complete/i }));

    await waitFor(() => {
        expect(mockAbort).toHaveBeenCalledWith('c-reviewer', 'uid-rev-1');
    });
});

test('11. Reject button opens UnifiedFlowRejectDialog with role REVIEWER', async () => {
    renderPanel();
    await waitFor(() => screen.getByTestId('extra-actions'));
    await userEvent.click(screen.getByRole('button', { name: /reject/i }));
    await waitFor(() => {
        // Reject dialog title includes the role
        expect(screen.getByText(/reject contract \(reviewer\)/i)).toBeInTheDocument();
    });
});

test('12. Mark Complete and Reject buttons not shown when status is completed', async () => {
    renderPanel(COMPLETED_PARTICIPANT);
    await waitFor(() => screen.getByTestId('pdf-viewer'));
    expect(screen.queryByRole('button', { name: /mark complete/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^reject$/i })).not.toBeInTheDocument();
});

test('13. XFDF loaded from apiService.getContractDetails and passed as initialXfdf to viewer', async () => {
    const xfdf = '<xfdf><fields><field name="Sig1"/></fields></xfdf>';
    mockGetContractDetails.mockResolvedValue({ xfdfData: xfdf });

    renderPanel();
    await waitFor(() => screen.getByTestId('pdf-viewer'));

    expect(mockGetContractDetails).toHaveBeenCalledWith('c-reviewer');
    expect(capturedInitialXfdf).toBe(xfdf);
});

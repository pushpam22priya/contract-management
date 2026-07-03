/**
 * INTEGRATION TESTS — UnifiedFlowApproverPanel
 * (src/components/unified-flow/UnifiedFlowApproverPanel.tsx)
 *
 * DocumentViewerDialog (heavy PDF viewer) is dynamically imported and mocked.
 * unifiedFlowService is mocked for all API calls.
 *
 * Scenarios covered:
 *  1.  Shows loading spinner while fetching file URL
 *  2.  Shows error alert when getParticipantFileUrl fails
 *  3.  Renders DocumentViewerDialog when file URL loads successfully
 *  4.  Sign & Approve button is disabled before viewer save (no blob yet)
 *  5.  Sign & Approve button enables after viewer onSave fires
 *  6.  Initiates upload and calls initiateFlowUpload on Sign & Approve click
 *  7.  Calls markFlowComplete with uploadId + parts after all chunks uploaded
 *  8.  Shows upload progress stepper during upload phase
 *  9.  Shows error overlay + Retry button on upload failure
 * 10.  Abort is called when upload fails mid-way
 * 11.  Reject button opens UnifiedFlowRejectDialog
 * 12.  Read-only mode — Sign & Approve and Reject buttons not shown when completed
 */

import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UnifiedFlowApproverPanel from '@/components/unified-flow/UnifiedFlowApproverPanel';
import type { WorkflowParticipant } from '@/types/unifiedFlow';

// ─── Mock DocumentViewerDialog ────────────────────────────────────────────────
// Render a minimal stub that exposes the extraActions and onSave callback
let capturedOnSave: Function | undefined;
let capturedExtraActions: React.ReactNode;

jest.mock('@/components/viewer/DocumentViewerDialog', () => ({
    __esModule: true,
    default: (props: any) => {
        capturedOnSave = props.onSave;
        capturedExtraActions = props.extraActions;
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
const mockSaveFields = jest.fn();
const mockRejectFlow = jest.fn();

jest.mock('@/services/unifiedFlowService', () => ({
    unifiedFlowService: {
        getParticipantFileUrl: (...a: any[]) => mockGetFileUrl(...a),
        initiateFlowUpload: (...a: any[]) => mockInitiate(...a),
        getFlowPresignedUrl: (...a: any[]) => mockPresign(...a),
        markFlowComplete: (...a: any[]) => mockMarkComplete(...a),
        abortFlowUpload: (...a: any[]) => mockAbort(...a),
        saveFlowFields: (...a: any[]) => mockSaveFields(...a),
        rejectFlow: (...a: any[]) => mockRejectFlow(...a),
    },
}));

// fetch is used to PUT chunks to MinIO
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

const UNLOCKED_PARTICIPANT: WorkflowParticipant = {
    email: 'approver@co.com',
    role: 'APPROVER',
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
        contractId: 'c-approver',
        contractTitle: 'Approval Contract',
        participant,
    };
    render(<UnifiedFlowApproverPanel {...props} />);
    return props;
}

beforeEach(() => {
    jest.clearAllMocks();
    capturedOnSave = undefined;
    mockGetFileUrl.mockResolvedValue({ ok: true, data: { url: 'https://minio.example.com/doc.pdf' } });
    mockInitiate.mockResolvedValue({ ok: true, data: { uploadId: 'uid-123' } });
    mockPresign.mockResolvedValue({ ok: true, data: { url: 'https://minio.example.com/presigned', partNumber: 1 } });
    mockMarkComplete.mockResolvedValue({ ok: true });
    mockAbort.mockResolvedValue({ ok: true });
    mockSaveFields.mockResolvedValue({ ok: true });
    mockRejectFlow.mockResolvedValue({ ok: true });
    mockFetch.mockResolvedValue({
        ok: true,
        headers: { get: () => '"etag-abc"' },
    } as any);
});

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

test('3. renders PDF viewer when file URL loads', async () => {
    renderPanel();
    await waitFor(() => {
        expect(screen.getByTestId('pdf-viewer')).toBeInTheDocument();
    });
});

test('4. Sign & Approve button disabled before viewer onSave fires', async () => {
    renderPanel();
    await waitFor(() => screen.getByTestId('extra-actions'));
    expect(screen.getByRole('button', { name: /sign.*approve/i })).toBeDisabled();
});

test('5. Sign & Approve button enables after viewer onSave fires', async () => {
    renderPanel();
    await waitFor(() => screen.getByTestId('extra-actions'));

    // Simulate viewer calling onSave with a PDF blob
    const blob = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
    await act(async () => {
        capturedOnSave?.(blob, '<xfdf/>', {}, []);
    });
    await waitFor(() => {
        expect(mockSaveFields).toHaveBeenCalledWith('c-approver', expect.any(Object));
    });
    expect(screen.getByRole('button', { name: /sign.*approve/i })).not.toBeDisabled();
});

test('6. initiates upload when Sign & Approve clicked', async () => {
    renderPanel();
    await waitFor(() => screen.getByTestId('extra-actions'));

    const blob = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
    await act(async () => { capturedOnSave?.(blob, '<xfdf/>', {}, []); });
    await waitFor(() => screen.getByRole('button', { name: /sign.*approve/i }));

    await userEvent.click(screen.getByRole('button', { name: /sign.*approve/i }));
    await waitFor(() => {
        expect(mockInitiate).toHaveBeenCalledWith('c-approver');
    });
});

test('7. calls markFlowComplete with uploadId + parts after successful upload', async () => {
    renderPanel();
    await waitFor(() => screen.getByTestId('extra-actions'));

    const blob = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
    await act(async () => { capturedOnSave?.(blob, '<xfdf/>', {}, []); });
    await waitFor(() => screen.getByRole('button', { name: /sign.*approve/i }));
    await userEvent.click(screen.getByRole('button', { name: /sign.*approve/i }));

    await waitFor(() => {
        expect(mockMarkComplete).toHaveBeenCalledWith(
            'c-approver',
            expect.objectContaining({ uploadId: 'uid-123', parts: expect.any(Array) }),
        );
    });
});

test('8. shows upload stepper during uploading phase', async () => {
    // Never resolve so the uploading phase stays visible
    mockFetch.mockReturnValue(new Promise(() => {}));
    renderPanel();
    await waitFor(() => screen.getByTestId('extra-actions'));

    const blob = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
    await act(async () => { capturedOnSave?.(blob, '<xfdf/>', {}, []); });
    await waitFor(() => screen.getByRole('button', { name: /sign.*approve/i }));
    await userEvent.click(screen.getByRole('button', { name: /sign.*approve/i }));

    await waitFor(() => {
        expect(screen.getByText(/uploading pdf/i)).toBeInTheDocument();
    });
});

test('9. shows error overlay and retry button on upload failure', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500, headers: { get: () => null } } as any);
    renderPanel();
    await waitFor(() => screen.getByTestId('extra-actions'));

    const blob = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
    await act(async () => { capturedOnSave?.(blob, '<xfdf/>', {}, []); });
    await userEvent.click(screen.getByRole('button', { name: /sign.*approve/i }));

    await waitFor(() => {
        expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });
});

test('10. abort is called when upload fails', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500, headers: { get: () => null } } as any);
    renderPanel();
    await waitFor(() => screen.getByTestId('extra-actions'));

    const blob = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
    await act(async () => { capturedOnSave?.(blob, '<xfdf/>', {}, []); });
    await userEvent.click(screen.getByRole('button', { name: /sign.*approve/i }));

    await waitFor(() => {
        expect(mockAbort).toHaveBeenCalledWith('c-approver', 'uid-123');
    });
});

test('11. Reject button opens UnifiedFlowRejectDialog', async () => {
    renderPanel();
    await waitFor(() => screen.getByTestId('extra-actions'));
    await userEvent.click(screen.getByRole('button', { name: /reject/i }));
    await waitFor(() => {
        expect(screen.getByRole('textbox')).toBeInTheDocument();
    });
});

test('12. Sign & Approve and Reject buttons not shown when status is completed', async () => {
    renderPanel(COMPLETED_PARTICIPANT);
    await waitFor(() => screen.getByTestId('pdf-viewer'));
    expect(screen.queryByRole('button', { name: /sign.*approve/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^reject$/i })).not.toBeInTheDocument();
});

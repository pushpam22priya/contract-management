'use client';

import { use, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
    Box,
    Typography,
    IconButton,
    Tooltip,
    Chip,
    useTheme,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import BlockOutlinedIcon from '@mui/icons-material/BlockOutlined';
import SignatureProgressTimeline from '@/components/contracts/SignatureProgressTimeline';
import AppButton from '@/components/common/AppButton';
import AppLayout from '@/components/layout/AppLayout';
import ContractInformation from '@/components/contracts/ContractInformation';
import ContractDetailsPanel from '@/components/contracts/ContractDetailsPanel';
import { contractService } from '@/services/contractService';
import { apiService } from '@/services/apiService';
import { templateService } from '@/services/templateService';
import { finalizeContract } from '@/services/externalSignatureService';
import { authService } from '@/services/authService';
import DocumentViewerDialog from '@/components/viewer/DocumentViewerDialog';
import { Document } from '@/components/contracts/ContractDetailsPanel';
import { useContractPolling } from '@/hooks/useContractPolling';
import { ContractDetailShimmer } from '@/components/common/ShimmerCard';
import ContractHistoryPanel from '@/components/contracts/ContractHistoryPanel';
import ContractHistoryDialog from '@/components/contracts/ContractHistoryDialog';
import type { HistoryEntry } from '@/components/contracts/ContractHistoryPanel';
import { ContractStatus } from '@/types/contract';
import HistoryIcon from '@mui/icons-material/History';
import { useTranslations } from 'next-intl';
import UnifiedFlowParticipantTimeline from '@/components/unified-flow/UnifiedFlowParticipantTimeline';
import UnifiedFlowOrgGateStatus from '@/components/unified-flow/UnifiedFlowOrgGateStatus';
import UnifiedFlowSubmitDialog from '@/components/unified-flow/UnifiedFlowSubmitDialog';
import UnifiedFlowResubmitDialog from '@/components/unified-flow/UnifiedFlowResubmitDialog';
import UnifiedFlowSendForSignatureDialog from '@/components/unified-flow/UnifiedFlowSendForSignatureDialog';
import { unifiedFlowService } from '@/services/unifiedFlowService';

export default function ContractViewPage({ params }: { params: Promise<{ id: string }> }) {
    const router = useRouter();
    const resolvedParams = use(params);
    const id = resolvedParams?.id;

    // State
    const [loading, setLoading] = useState(true);
    const [contract, setContract] = useState<any | null>(null);
    const [details, setDetails] = useState<any | null>(null);
    const [contractTemplate, setContractTemplate] = useState<any | null>(null); // New state for template
    const [viewerOpen, setViewerOpen] = useState(false);
    const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
    const [viewingWithFlowUrl, setViewingWithFlowUrl] = useState(false);

    // History panel + dialog state
    const [historyAnchorEl, setHistoryAnchorEl] = useState<HTMLElement | null>(null);
    const historyPanelOpen = Boolean(historyAnchorEl);
    const [historyDialogEntry, setHistoryDialogEntry] = useState<HistoryEntry | null>(null);

    // Multi-party finalization state
    const [finalizing, setFinalizing] = useState(false);
    const [finalizeError, setFinalizeError] = useState<string | null>(null);
    const [finalizeSuccess, setFinalizeSuccess] = useState(false);

    // Unified flow dialog state
    const [unifiedSubmitOpen, setUnifiedSubmitOpen] = useState(false);
    const [unifiedResubmitOpen, setUnifiedResubmitOpen] = useState(false);
    const [unifiedSendForSigOpen, setUnifiedSendForSigOpen] = useState(false);

    const t = useTranslations('contractDetail');
    const tStatus = useTranslations('contractStatus');
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';

    // Strip all stacked "(Renewal)" suffixes for display — raw title kept in DB
    const displayTitle = contract?.title?.replace(/\s*\(Renewal\d*\)$/i, '') ?? '';

    // --- ROBUST DATA FETCHING LOGIC ---
    useEffect(() => {
        let isMounted = true;
        const loadData = async () => {
            console.log("🚀 Starting load for ID:", id);

            // 0. Safety Check
            if (!id) {
                console.warn("⚠️ No ID found in URL params yet");
                return;
            }

            setLoading(true);

            try {
                // Fetch full contract detail from Spring Boot — GET /contracts/{id}
                const found = await apiService.getContractDetails(id);

                // Handle Not Found
                if (!found) {
                    throw new Error(`Contract ${id} not found.`);
                }

                if (isMounted) setContract(found);

                // 3.5 Fetch Template if needed
                if (found.templateId) {
                    try {
                        const tmpl = await templateService.getTemplateById(found.templateId);
                        if (isMounted && tmpl) setContractTemplate(tmpl);
                    } catch (e) {
                        console.warn("Could not fetch template:", e);
                    }
                }

                // 4. Load extra details (from service or mock local)
                // Build activities timeline from contract data
                if (isMounted) {
                    // Each entry carries a raw ISO timestamp for sorting + a formatted date for display
                    const activities: { id: string; title: string; user: string; date: string; _ts: number }[] = [];

                    const toTs = (dateStr: string | undefined): number =>
                        dateStr ? new Date(dateStr).getTime() : 0;

                    const formatDate = (dateStr: string | undefined): string => {
                        if (!dateStr) return 'Date not available';
                        try {
                            const date = new Date(dateStr);
                            if (isNaN(date.getTime())) return 'Date not available';
                            return date.toLocaleDateString('en-GB');
                        } catch {
                            return 'Date not available';
                        }
                    };

                    const push = (id: string, title: string, user: string, dateStr: string | undefined) => {
                        activities.push({ id, title, user, date: formatDate(dateStr), _ts: toTs(dateStr) });
                    };

                    // ── 1. Contract Created ──────────────────────────────────────────
                    if (found.createdAt) {
                        push('created', 'Contract Created', found.createdBy || 'System', found.createdAt);
                    }

                    // ── 2a. Unified flow participants ─────────────────────────────────
                    if (found.participants && found.participants.length > 0) {
                        found.participants.forEach((p: any, idx: number) => {
                            const roleLabel = p.role === 'REVIEWER' ? 'Reviewer' : 'Approver';
                            if (p.sentAt) push(`unified-sent-${idx}`, `Submitted for ${roleLabel} to ${p.email} (Order ${p.order})`, p.sentBy || found.createdBy || 'System', p.sentAt);
                            if (p.unlockedAt) push(`unified-unlocked-${idx}`, `${roleLabel} unlocked — ${p.email}`, p.email, p.unlockedAt);
                            if (p.status === 'completed' && p.completedAt) push(`unified-completed-${idx}`, `${roleLabel} completed — ${p.email}`, p.email, p.completedAt);
                            if (p.status === 'rejected' && p.rejectedAt) push(`unified-rejected-${idx}`, `${roleLabel} rejected — ${p.email}`, p.email, p.rejectedAt);
                        });
                    }

                    // ── 2. Submitted for Review ──────────────────────────────────────
                    // One entry per reviewer showing who the request was sent to
                    if (found.reviewers && found.reviewers.length > 0) {
                        found.reviewers.forEach((reviewer: any, idx: number) => {
                            const sentAt = reviewer.sentAt;
                            const sentBy = reviewer.sentBy || found.createdBy || 'System';
                            push(
                                `submitted-review-${idx}`,
                                `Submitted for Review to ${reviewer.email}`,
                                sentBy,
                                sentAt || found.createdAt
                            );
                        });

                        // ── 3. Each Reviewer's Action ────────────────────────────────
                        found.reviewers.forEach((reviewer: any, idx: number) => {
                            if (reviewer.status === 'reviewed' && reviewer.reviewedAt) {
                                push(`reviewed-${idx}`, 'Reviewed', reviewer.email, reviewer.reviewedAt);
                            } else if (reviewer.status === 'requested_changes') {
                                push(`changes-requested-${idx}`, 'Changes Requested', reviewer.email, reviewer.reviewedAt);
                            } else if (reviewer.status === 'rejected') {
                                push(`review-rejected-${idx}`, 'Review Rejected', reviewer.email, reviewer.rejectedAt || reviewer.reviewedAt);
                            }
                        });
                    }

                    // ── 4. Submitted for Approval ────────────────────────────────────
                    if (found.approver) {
                        const sentAt = found.approver.sentAt;
                        const sentBy = found.approver.sentBy || found.createdBy || 'System';
                        push(
                            'submitted-approval',
                            `Submitted for Approval to ${found.approver.email}`,
                            sentBy,
                            sentAt || found.createdAt
                        );

                        // ── 5. Approver Action ───────────────────────────────────────
                        if (found.approver.status === 'approved' && found.approver.approvedAt) {
                            push('approved', 'Approved', found.approver.email, found.approver.approvedAt);
                        } else if (found.approver.status === 'rejected') {
                            push('approval-rejected', 'Approval Rejected', found.approver.email, found.approver.approvedAt || found.updatedAt);
                        }
                    }

                    // ── 6. Sent for Signature — all signers listed individually ───────
                    // Internal signers
                    if (found.internalSigners && found.internalSigners.length > 0) {
                        found.internalSigners.forEach((signer: any, idx: number) => {
                            const partyLabel = signer.partyLabel || 'Party';
                            const assignedAt = signer.assignedAt || signer.sentAt;
                            if (assignedAt) {
                                push(
                                    `sent-internal-${idx}`,
                                    `Sent for Signature — ${partyLabel} (Order ${signer.order})`,
                                    signer.email,
                                    assignedAt
                                );
                            }

                            // Signer unlocked for signing (sequential flow)
                            if (signer.unlockedAt && signer.unlockedAt !== assignedAt) {
                                push(
                                    `internal-unlocked-${idx}`,
                                    `Signature unlocked — ${partyLabel} (Order ${signer.order})`,
                                    signer.email,
                                    signer.unlockedAt
                                );
                            }

                            // Signer submitted their signature
                            if (signer.status === 'completed' && signer.completedAt) {
                                push(
                                    `internal-signed-${idx}`,
                                    `Signed — ${partyLabel}`,
                                    signer.email,
                                    signer.completedAt
                                );
                            }
                        });
                    }

                    // External signers
                    if (found.externalSigners && found.externalSigners.length > 0) {
                        found.externalSigners.forEach((signer: any, idx: number) => {
                            const partyLabel = signer.partyLabel || 'Party';
                            const sentAt = signer.sentAt;
                            if (sentAt) {
                                push(
                                    `sent-external-${idx}`,
                                    `Sent for Signature — ${partyLabel} (Order ${signer.order})`,
                                    signer.email,
                                    sentAt
                                );
                            }

                            // External signer unlocked via auto-advance
                            if (signer.unlockedAt && signer.unlockedAt !== sentAt) {
                                push(
                                    `external-unlocked-${idx}`,
                                    `Signature unlocked — ${partyLabel} (Order ${signer.order})`,
                                    signer.email,
                                    signer.unlockedAt
                                );
                            }

                            // External signer submitted their signature
                            if (signer.status === 'completed' && signer.completedAt) {
                                push(
                                    `external-signed-${idx}`,
                                    `Signed — ${partyLabel}`,
                                    signer.email,
                                    signer.completedAt
                                );
                            }
                        });
                    }

                    // Legacy single-signer flow
                    if (found.signingRequest && !found.externalSigners?.length && !found.internalSigners?.length) {
                        push(
                            'signature-requested',
                            `Sent for Signature to ${found.signingRequest.signerEmail || found.signer?.email || 'Signer'}`,
                            found.createdBy || 'System',
                            found.externalSigningSentAt || found.signingRequest?.createdAt
                        );
                        if (found.signer?.status === 'signed' && found.signer?.signedAt) {
                            push('signed', 'Signed', found.signer.email || 'Client', found.signer.signedAt);
                        } else if (found.signingRequest?.status === 'signed' && found.signingRequest?.signedAt) {
                            push('signed', 'Signed', found.signingRequest.signerEmail || 'Client', found.signingRequest.signedAt);
                        }
                    }

                    // ── 7. Contract Finalized ────────────────────────────────────────
                    if (found.finalizedAt) {
                        push('finalized', 'Contract Finalized', found.finalizedBy || found.createdBy || 'System', found.finalizedAt);
                    }

                    // ── 8. Renewed ───────────────────────────────────────────────────
                    // Show on the original contract when a renewal was created
                    if (found.renewedContractId && found.renewalStatus) {
                        push(
                            'renewed',
                            'Contract Renewed',
                            found.createdBy || 'System',
                            found.updatedAt || found.createdAt
                        );
                    }

                    // Show on the renewal contract — link back to original
                    if (found.renewedFromId) {
                        push(
                            'renewal-of',
                            'Renewal Contract Created',
                            found.createdBy || 'System',
                            found.createdAt
                        );
                    }

                    // ── 9. Terminated ────────────────────────────────────────────────
                    if (found.terminatedAt) {
                        push('terminated', 'Contract Terminated', found.terminatedBy || found.createdBy || 'System', found.terminatedAt);
                    }

                    // Sort by raw timestamp ascending (chronological), then strip _ts
                    activities.sort((a, b) => a._ts - b._ts);
                    const sortedActivities = activities.map(({ _ts: _ignored, ...rest }) => rest);

                    // ── Build document list (current contract only) ────────────
                    const contractId = found.id;
                    const viewUrl = await apiService.getContractViewUrl(contractId) || '';
                    const documents = [{
                        id: contractId,
                        name: `${found.title.replace(/\s*\(Renewal\d*\)$/i, '')}.pdf`,
                        size: 'PDF',
                        uploadDate: new Date(found.createdAt).toLocaleDateString('en-GB'),
                        url: viewUrl,
                    }];

                    setDetails({
                        documents,
                        activities: sortedActivities,
                        ...found
                    });
                }
            } catch (err) {
                console.error("💥 Load Error:", err);
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        loadData();
        return () => { isMounted = false; };
    }, [id]);

    // ═══════════════════════════════════════════════════════════════════
    // REAL-TIME POLLING: Auto-refresh when workflow state changes
    // ═══════════════════════════════════════════════════════════════════
    const isUnifiedFlow = (contract?.participants?.length ?? 0) > 0;
    const pageCurrentUser = authService.getCurrentUser();
    const isContractOwner = !!pageCurrentUser && contract?.createdBy === pageCurrentUser.email;

    const shouldPoll = !loading && !!contract && (
        contract.status === ContractStatus.IN_SIGNATURE ||
        contract.status === ContractStatus.SIGNED_BY_EVERYONE ||
        (contract.signatureFlowStatus && contract.signatureFlowStatus !== 'finalized') ||
        (isUnifiedFlow && (
            contract.status === ContractStatus.IN_REVIEW ||
            contract.status === ContractStatus.IN_APPROVAL
        ))
    );

    const handleContractUpdate = useCallback(async (freshContract: any) => {
        console.log('🔄 [ContractViewPage] Auto-refresh triggered — updating UI');
        setContract(freshContract);

        setDetails((prev: any) => ({
            ...prev,
            ...freshContract,
            documents: [{
                id: 'main-contract',
                name: `${freshContract.title.replace(/\s*\(Renewal\d*\)$/i, '')}.pdf`,
                size: 'PDF',
                uploadDate: new Date(freshContract.createdAt).toLocaleDateString('en-GB'),
                url: '',
            }],
        }));
    }, []);

    useContractPolling(
        id,
        contract?.updatedAt,
        handleContractUpdate,
        shouldPoll,
        12000 // 12 seconds
    );


    // Handlers
    const handleBack = () => router.back();

    /**
     * Helper to download a document (PDF)
     */
    const handleDownloadDocument = async (doc: Document) => {
        console.log('📥 [ContractViewPage] Downloading document:', doc.id);

        let downloadUrl = doc.url;

        // Use signedPdfBase64 if available for the main contract
        if (doc.id === 'main-contract' && contract?.signedPdfBase64) {
            console.log('📄 [ContractViewPage] Using signedPdfBase64 for download');
            downloadUrl = `data:application/pdf;base64,${contract.signedPdfBase64}`;
        }

        if (!downloadUrl) {
            downloadUrl = await apiService.getContractViewUrl(doc.id) || '';
        }

        if (!downloadUrl) {
            console.error('❌ [ContractViewPage] No URL or data found for download');
            return;
        }

        try {
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = doc.name || 'document.pdf';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            console.log('✅ [ContractViewPage] Download triggered');
        } catch (error) {
            console.error('❌ [ContractViewPage] Download failed:', error);
        }
    };
    /**
     * Handle finalizing the contract after all parties have completed
     */
    const handleFinalize = async () => {
        if (!contract) return;

        setFinalizing(true);
        setFinalizeError(null);

        try {
            // Spring Boot creates the final PDF in MinIO and emails signed copies to all parties.
            const result = await finalizeContract(contract.id);

            if (!result.success) {
                throw new Error(result.message || 'Failed to finalize contract');
            }

            setFinalizeSuccess(true);

            const updatedContract = await apiService.getContractDetails(contract.id);
            if (updatedContract) setContract(updatedContract);

        } catch (error: any) {
            console.error('❌ [ContractViewPage] Finalize error:', error);
            setFinalizeError(error.message || 'Failed to finalize contract');
        } finally {
            setFinalizing(false);
        }
    };

    /**
     * Check if this is a multi-party contract
     */
    const isMultiPartyContract = (contract?.externalSigners && contract.externalSigners.length > 0) ||
        (contract?.internalSigners && contract.internalSigners.length > 0);

    // True once the working copy contracts/{id}_signed.pdf exists. Once it does, it is the single
    // source of truth: the owner reads AND writes it (never the original), and we never overlay XFDF
    // on it (its signatures/values are already baked into the binary — overlaying would wipe ink
    // signatures like the owner's "admin" mark). On rejection the working copy is archived to
    // _rejected.pdf and the flow falls back to the original, so rejected contracts report false.
    // Primary signal is the backend `hasSignedCopy` flag; the participant/signature heuristics keep
    // this correct even if that field isn't present yet.
    const isRejectedState = contract?.status === ContractStatus.REJECTED_BY_REVIEWER
        || contract?.status === ContractStatus.REJECTED_BY_APPROVER
        || contract?.status === ContractStatus.REJECTED;
    const hasSignedCopy = !isRejectedState && (
        !!contract?.hasSignedCopy
        || (contract?.participants || []).some((p: any) => p.status === 'completed')
        || !!contract?.signatureFlowStatus
        || !!isMultiPartyContract
    );

    /**
     * Check if all signers (internal + external) have completed
     */
    const allSignersCompleted = isMultiPartyContract &&
        (contract.externalSigners || []).every((signer: any) => signer.status === 'completed') &&
        (contract.internalSigners || []).every((signer: any) => signer.status === 'completed');

    const currentOrder = contract?.currentSigningOrder;

    const allOrders = [
        ...(contract?.internalSigners || []).map((s: any) => s.order),
        ...(contract?.externalSigners || []).map((s: any) => s.order),
    ];
    const uniqueOrders = [...new Set(allOrders)].sort((a: number, b: number) => a - b);

    /**
     * Check if contract can be finalized
     */
    const canFinalize = allSignersCompleted &&
        contract?.signatureFlowStatus === 'all_completed';

    /**
     * Check if contract is already finalized
     */
    const isFinalized = contract?.signatureFlowStatus === 'finalized';

    /**
     * Signature fields the APPROVER has already applied. The owner may edit every other internal
     * field (text, their own signature, reviewer-filled fields) but must not alter the approver's
     * signature. Identified via `filledBy` (stamped server-side) so it works even when the owner
     * and approver share the same org party. Enforced read-only in the viewer.
     */
    const approverSignatureFieldNames: string[] = (() => {
        const participants = contract?.participants;
        const formFields = contract?.formFields;
        if (!participants?.length || !formFields?.length) return [];
        const approverEmails = new Set(
            participants
                .filter((p: any) => p.role === 'APPROVER')
                .map((p: any) => (p.email || '').toLowerCase())
        );
        if (approverEmails.size === 0) return [];
        const isSignatureType = (t: any) => ['signature', 'sig'].includes(String(t || '').toLowerCase());
        return (formFields as any[])
            .filter((f) => isSignatureType(f.type) && f.filledBy && approverEmails.has(String(f.filledBy).toLowerCase()))
            .map((f) => f.name)
            .filter(Boolean);
    })();

    /**
     * Save contract changes from PDF viewer
     */
    const handleSaveChanges = async (pdfBlob: Blob, xfdfString: string, fieldValues?: Record<string, string>, formFields?: any[]) => {
        if (!contract) return;

        try {
            let result: { success: boolean; message: string };

            if (hasSignedCopy) {
                // A working copy (_signed.pdf) exists — it is the single source of truth. Write the
                // owner's edits back to that SAME object (and persist field data in the same request)
                // so everyone sees them. Otherwise they'd land in the shadowed original .pdf and
                // silently disappear behind the working copy that everyone actually reads.
                result = await contractService.saveOwnerWorkingCopy(contract.id, pdfBlob, {
                    xfdfData: xfdfString,
                    fieldValues: fieldValues && Object.keys(fieldValues).length > 0
                        ? { ...(contract.fieldValues || {}), ...fieldValues }
                        : undefined,
                    formFields: formFields && formFields.length > 0 ? formFields : undefined,
                });
            } else {
                // No working copy yet (fresh contract, or fell back to the original after a
                // rejection) — save the base PDF + field metadata to the original .pdf.
                const arrayBuffer = await pdfBlob.arrayBuffer();
                const bytes = new Uint8Array(arrayBuffer);
                let binary = '';
                for (let i = 0; i < bytes.byteLength; i++) {
                    binary += String.fromCharCode(bytes[i]);
                }
                const pdfBase64 = btoa(binary);

                result = await contractService.updateContractSignedPdf(contract.id, pdfBase64, xfdfString);

                if (result.success) {
                    const metadataUpdates: Record<string, any> = {};
                    if (fieldValues && Object.keys(fieldValues).length > 0) {
                        metadataUpdates.fieldValues = { ...(contract.fieldValues || {}), ...fieldValues };
                    }
                    if (formFields && formFields.length > 0) {
                        metadataUpdates.formFields = formFields;
                        metadataUpdates.hasFormFields = true;
                    }
                    if (Object.keys(metadataUpdates).length > 0) {
                        await apiService.updateContractMetadata(contract.id, metadataUpdates);
                    }
                }
            }

            if (result.success) {
                // Refresh contract data from Spring Boot
                const updatedContract = await apiService.getContractDetails(contract.id);
                if (updatedContract) setContract(updatedContract);
            }
        } catch (error) {
            console.error('❌ Error saving contract:', error);
        }
    };

    // View Document Handler
    const handleViewDocument = async (doc: Document) => {
        const isMainContract = !doc.id || doc.id === contract?.id || doc.id === id || doc.id === 'main-contract';

        // Once a working copy (_signed.pdf) exists, always prefer it — it has all parties' data baked
        // correctly into the PDF binary. The base PDF + XFDF combo can misrepresent drawn ink
        // signatures as text values because the XFDF stores the form field value (text) while the
        // ink appearance is only in the PDF binary. This applies from the first reviewer edit onward,
        // not just once signers exist.
        if (isMainContract && hasSignedCopy) {
            try {
                const flowRes = await unifiedFlowService.getParticipantFileUrl(contract.id);
                if (flowRes.ok && flowRes.data?.url) {
                    setViewingWithFlowUrl(true);
                    setSelectedDoc({ ...doc, url: flowRes.data.url });
                    setViewerOpen(true);
                    return;
                }
            } catch (e) {
                console.warn('[ContractViewPage] Could not get flow file URL, falling back to base PDF:', e);
            }
        }

        setViewingWithFlowUrl(false);
        let docWithUrl = doc;
        if (!doc.url) {
            docWithUrl = {
                ...doc,
                url: await apiService.getContractViewUrl(doc.id) || ''
            };
        }
        setSelectedDoc(docWithUrl);
        setViewerOpen(true);
    };

    // Helper: Status Color
    const getStatusColor = (status: string) => {
        if (isDark) {
            switch (status) {
                case 'active':
                case 'signed':
                case 'ACTIVE':
                case 'SIGNED': return { bgcolor: 'rgba(16,185,129,0.08)', color: '#6bac8e' };
                case 'expiring':
                case 'EXPIRING': return { bgcolor: 'rgba(245,158,11,0.08)', color: '#b8935a' };
                case 'terminated':
                case 'TERMINATED': return { bgcolor: 'rgba(148,163,184,0.07)', color: '#6b7e90' };
                case 'expired':
                case 'rejected':
                case 'rejected_by_reviewer':
                case 'rejected_by_approver':
                case 'EXPIRED':
                case 'REJECTED':
                case 'REJECTED_BY_REVIEWER':
                case 'REJECTED_BY_APPROVER': return { bgcolor: 'rgba(239,68,68,0.08)', color: '#b07070' };
                case 'in_review':
                case 'IN_REVIEW': return { bgcolor: 'rgba(139,92,246,0.08)', color: '#9080c0' };
                case 'in_approval':
                case 'IN_APPROVAL': return { bgcolor: 'rgba(245,158,11,0.08)', color: '#b8935a' };
                case 'reviewed':
                case 'approved': return { bgcolor: 'rgba(16,185,129,0.08)', color: '#6bac8e' };
                case 'waiting_for_signature':
                case 'IN_SIGNATURE':
                case 'READY_FOR_SIGNATURE': return { bgcolor: 'rgba(245,158,11,0.08)', color: '#b8935a' };
                case 'signed_by_everyone':
                case 'SIGNED_BY_EVERYONE': return { bgcolor: 'rgba(59,130,246,0.08)', color: '#6888ac' };
                case 'DRAFT': return { bgcolor: 'rgba(148,163,184,0.07)', color: '#6b7e90' };
                default: return { bgcolor: 'rgba(148,163,184,0.07)', color: '#6b7e90' };
            }
        }
        switch (status) {
            case 'active':
            case 'signed':
            case 'ACTIVE':
            case 'SIGNED': return { bgcolor: '#d1fae5', color: '#065f46' };
            case 'expiring':
            case 'EXPIRING': return { bgcolor: '#fef3c7', color: '#92400e' };
            case 'terminated':
            case 'TERMINATED': return { bgcolor: '#f1f5f9', color: '#334155' };
            case 'expired':
            case 'rejected':
            case 'rejected_by_reviewer':
            case 'rejected_by_approver':
            case 'EXPIRED':
            case 'REJECTED':
            case 'REJECTED_BY_REVIEWER':
            case 'REJECTED_BY_APPROVER': return { bgcolor: '#fee2e2', color: '#991b1b' };
            case 'in_review':
            case 'IN_REVIEW': return { bgcolor: '#ede9fe', color: '#5b21b6' };
            case 'in_approval':
            case 'IN_APPROVAL': return { bgcolor: '#fef9c3', color: '#92400e' };
            case 'reviewed':
            case 'approved': return { bgcolor: '#d1fae5', color: '#065f46' };
            case 'waiting_for_signature':
            case 'IN_SIGNATURE':
            case 'READY_FOR_SIGNATURE': return { bgcolor: '#fff9c4', color: '#f57f17' };
            case 'signed_by_everyone':
            case 'SIGNED_BY_EVERYONE': return { bgcolor: '#e3f2fd', color: '#1565c0' };
            case 'DRAFT': return { bgcolor: '#f1f5f9', color: '#334155' };
            default: return { bgcolor: '#e5e7eb', color: '#374151' };
        }
    };


    // --- RENDER: LOADING STATE ---
    if (loading) {
        return (
            <AppLayout>
                <ContractDetailShimmer />
            </AppLayout>
        );
    }

    // --- RENDER: NOT FOUND STATE ---
    if (!contract) {
        return (
            <AppLayout>
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mt: 10, gap: 2 }}>
                    <Typography variant="h6">{t('notFound')}</Typography>
                    <Typography color="text.secondary">ID: {id}</Typography>
                    <IconButton onClick={handleBack}><ArrowBackIcon /> Go Back</IconButton>
                </Box>
            </AppLayout>
        );
    }

    // --- MAIN RENDER ---
    const statusColors = getStatusColor(contract.status);

    // Fallback data for details in case loading failed partially
    const displayDetails = details || {
        description: contract.description,
        keyTerms: [],
        documents: [],
        activities: []
    };

    return (
        <AppLayout>
            {/* Main content box */}
            <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', p: 1 }}>
                {/* Header Section */}
                <Box
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexDirection: { xs: 'column', md: 'row' },
                        gap: 1,
                        py: 0.25,
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                    }}
                >
                    {/* Left: Back Button + Title */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flex: 1 }}>
                        <Tooltip title={t('goBack')} arrow>
                            <IconButton
                                size="small"
                                onClick={handleBack}
                                sx={{
                                    color: 'text.secondary',
                                    '&:hover': { bgcolor: 'action.hover', color: 'primary.main' },
                                }}
                            >
                                <ArrowBackIcon sx={{ fontSize: 18 }} />
                            </IconButton>
                        </Tooltip>

                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                            <Typography
                                fontWeight={600}
                                sx={{ color: 'text.primary', fontSize: '0.95rem' }}
                            >
                                {displayTitle}
                            </Typography>
                            <Chip
                                label={tStatus(contract.status as Parameters<typeof tStatus>[0])}
                                size="small"
                                sx={{
                                    bgcolor: statusColors.bgcolor,
                                    color: statusColors.color,
                                    fontWeight: 600,
                                    fontSize: '0.68rem',
                                    height: 20,
                                    borderRadius: 1,
                                }}
                            />
                        </Box>
                    </Box>

                    {/* Right: Action Buttons */}
                    <Box
                        sx={{
                            display: 'flex',
                            gap: 1,
                            alignSelf: { xs: 'flex-end', md: 'center' },
                        }}
                    >
                        {/* Unified flow action buttons (owner-only) */}
                        {isContractOwner && !isUnifiedFlow && (
                            <AppButton
                                size="small"
                                variant="outlined"
                                onClick={() => setUnifiedSubmitOpen(true)}
                                sx={{ fontSize: '0.78rem', borderColor: '#7c3aed', color: '#7c3aed', '&:hover': { bgcolor: 'rgba(124,58,237,0.06)', borderColor: '#7c3aed' } }}
                            >
                                Start Unified Review/Approval
                            </AppButton>
                        )}
                        {isContractOwner && isUnifiedFlow && contract.status === ContractStatus.REJECTED && (
                            <AppButton
                                size="small"
                                variant="outlined"
                                onClick={() => setUnifiedResubmitOpen(true)}
                                sx={{ fontSize: '0.78rem', borderColor: '#f59e0b', color: '#f59e0b', '&:hover': { bgcolor: 'rgba(245,158,11,0.06)', borderColor: '#f59e0b' } }}
                            >
                                Resubmit
                            </AppButton>
                        )}

                        {/* History button — shown whenever this contract is part of a renewal chain */}
                        {(contract?.renewedFromId || contract?.renewedContractId) && (
                            <Tooltip title={t('contractHistory')} arrow>
                                <IconButton
                                    onClick={(e) => setHistoryAnchorEl(e.currentTarget)}
                                    sx={{
                                        bgcolor: 'transparent',
                                        border: '1px solid',
                                        borderColor: 'divider',
                                        color: 'text.secondary',
                                        width: 36,
                                        height: 36,
                                        transition: 'all 0.2s',
                                        '&:hover': {
                                            bgcolor: 'primary.main',
                                            borderColor: 'primary.main',
                                            color: 'white',
                                            transform: 'translateY(-2px)',
                                            boxShadow: (theme) => `0 4px 8px ${theme.palette.primary.main}33`,
                                        },
                                    }}
                                >
                                    <HistoryIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>
                        )}
                    </Box>
                </Box>

                <Box sx={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 1, pb: 1 }}>

                        {/* Terminated Banner */}
                        {contract.status === ContractStatus.TERMINATED && (
                            <Box
                                sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 1.5,
                                    px: 2,
                                    py: 1.25,
                                    bgcolor: isDark ? 'rgba(239,68,68,0.08)' : '#fef2f2',
                                    border: '1px solid',
                                    borderColor: isDark ? 'rgba(239,68,68,0.22)' : '#fecaca',
                                    borderRadius: 2,
                                    flexWrap: 'wrap',
                                }}
                            >
                                <BlockOutlinedIcon sx={{ color: isDark ? '#b07070' : '#dc2626', fontSize: '1.1rem', flexShrink: 0 }} />
                                <Typography variant="body2" sx={{ color: isDark ? '#b07070' : '#7f1d1d', fontWeight: 500, flex: 1 }}>
                                    {t('terminatedOn')}{' '}
                                    <strong>
                                        {contract.terminatedAt
                                            ? new Date(contract.terminatedAt).toLocaleDateString('en-GB')
                                            : '—'}
                                    </strong>
                                    {contract.terminatedBy && (
                                        <> {t('terminatedBy')} <strong>{contract.terminatedBy}</strong></>
                                    )}
                                    . {t('noFurtherActions')}
                                </Typography>
                            </Box>
                        )}


                        {/* ═══════════════════════════════════════════════════════════════════════════ */}
                        {/* UNIFIED FLOW: PARTICIPANT TIMELINE + ORG GATE */}
                        {/* ═══════════════════════════════════════════════════════════════════════════ */}
                        {isUnifiedFlow && (
                            <UnifiedFlowParticipantTimeline
                                contractId={contract.id}
                                contractStatus={contract.status}
                                initialParticipants={contract.participants}
                            />
                        )}
                        {isUnifiedFlow && isContractOwner && (
                            <UnifiedFlowOrgGateStatus
                                contractId={contract.id}
                                onSendForSignature={() => setUnifiedSendForSigOpen(true)}
                                onEditContract={() => router.push(`/contracts/${contract.id}/edit`)}
                                externalSigningIncluded={contract.externalSigningIncluded}
                                contractStatus={contract.status}
                            />
                        )}

                        {/* ═══════════════════════════════════════════════════════════════════════════ */}
                        {/* MULTI-PARTY SIGNATURE STATUS */}
                        {/* ═══════════════════════════════════════════════════════════════════════════ */}
                        {isMultiPartyContract && (
                            <SignatureProgressTimeline
                                contract={contract}
                                isFinalized={isFinalized}
                                canFinalize={canFinalize}
                                currentOrder={currentOrder}
                                uniqueOrders={uniqueOrders}
                                finalizing={finalizing}
                                finalizeError={finalizeError}
                                finalizeSuccess={finalizeSuccess}
                                onFinalize={handleFinalize}
                            />
                        )}

                        {/* Content Grid: Contract Info + Details Panel */}
                        <Box
                            sx={{
                                display: 'grid',
                                gridTemplateColumns: { xs: '1fr', lg: '1.5fr 1fr' },
                                gap: 1.5,
                            }}
                        >
                            {/* Contract Information Section (Left) */}
                            <Box>
                                <ContractInformation
                                    client={contract.client || 'N/A'}
                                    category={contract.category || 'N/A'}
                                    template={contract.templateName || 'Custom Template'}
                                    startDate={contract.startDate ? new Date(contract.startDate).toLocaleDateString('en-GB') : 'N/A'}
                                    endDate={contract.endDate ? new Date(contract.endDate).toLocaleDateString('en-GB') : 'N/A'}
                                    daysRemaining={contract.expiresInDays || 0}
                                    progressPercentage={(() => {
                                        // Calculate REMAINING progress based on dates
                                        // 100% = full duration remaining, 0% = expired
                                        if (!contract.startDate || !contract.endDate) return 100;

                                        const start = new Date(contract.startDate).getTime();
                                        const end = new Date(contract.endDate).getTime();
                                        const now = new Date().getTime();

                                        // If contract hasn't started yet - 100% remaining
                                        if (now < start) return 100;
                                        // If contract has ended - 0% remaining
                                        if (now > end) return 0;

                                        // Calculate percentage REMAINING (not elapsed)
                                        const totalDuration = end - start;
                                        const remaining = end - now;
                                        const percentage = Math.round((remaining / totalDuration) * 100);

                                        return Math.min(100, Math.max(0, percentage));
                                    })()}
                                    status={contract.status}
                                    description={displayDetails.description}
                                />
                            </Box>

                            {/* Contract Details Panel Section (Right) */}
                            <Box>
                                <ContractDetailsPanel
                                    documents={displayDetails.documents}
                                    activities={displayDetails.activities}
                                    onViewDocument={handleViewDocument}
                                    onDownloadDocument={handleDownloadDocument}
                                />
                            </Box>
                        </Box>
                    </Box>
                </Box>
            </Box>

            {/* Debug: Log what's being passed to viewer */}
            {viewerOpen && (() => {
                console.log('🔍 [ContractViewPage] Opening DocumentViewer with:', {
                    hasSignedPdfBase64: !!contract.signedPdfBase64,
                    signedPdfBase64Length: contract.signedPdfBase64?.length || 0,
                    hasXfdfData: !!contract.xfdfData,
                    xfdfDataLength: contract.xfdfData?.length || 0,
                    xfdfDataPreview: contract.xfdfData?.substring(0, 100) || 'none',
                    formFieldsCount: contract.formFields?.length || 0,
                    templateId: contract.templateId,
                });
                return null;
            })()}
            <DocumentViewerDialog
                open={viewerOpen}
                onClose={() => { setViewerOpen(false); setViewingWithFlowUrl(false); }}
                fileUrl={(() => {
                    // For chain docs (predecessor / renewal), always use their own URL directly
                    const isChainDoc = !!selectedDoc && selectedDoc.id !== 'main-contract' && selectedDoc?.id !== contract?.id;
                    if (isChainDoc && selectedDoc?.url) {
                        return selectedDoc.url;
                    }

                    // 1. Signed PDF Base64 (highest priority for current contract)
                    if (contract?.signedPdfBase64) {
                        console.log('📄 [ContractViewPage] Using signedPdfBase64');
                        return `data:application/pdf;base64,${contract.signedPdfBase64}`;
                    }

                    // 2. Selected Document from panel
                    if (selectedDoc?.url) {
                        console.log('📄 [ContractViewPage] Using selectedDoc.url');
                        return selectedDoc.url;
                    }

                    // 3. Contract's main file URL (points to saved PDF)
                    if (contract?.fileUrl) {
                        console.log('📄 [ContractViewPage] Using contract.fileUrl');
                        return contract.fileUrl;
                    }

                    // 4. Fallback to Template (only if no contract file exists)
                    if (contract?.templateId && contractTemplate) {
                        console.log('📄 [ContractViewPage] Fallback: Using template URL');
                        return contractTemplate.fileData || contractTemplate.fileUrl || "";
                    }

                    return '';
                })()}
                fileName={selectedDoc?.name || `${displayTitle}.pdf`}
                title={selectedDoc?.name || displayTitle}
                contractId={(() => {
                    // For chain docs, use the chain doc's id; for main contract use contract.id
                    if (selectedDoc && selectedDoc.id !== 'main-contract' && selectedDoc.id !== contract?.id) {
                        return selectedDoc.id;
                    }
                    return contract?.id || '';
                })()}
                // Only pass XFDF/formFields for the main (current) contract — chain docs are read-only.
                // Once a working copy (_signed.pdf) exists, the served PDF already has ALL signatures
                // and field values baked in as PDF appearances. Applying XFDF on top would override ink
                // signatures with their text form-field values (e.g. wipe the owner's baked "admin"
                // signature while keeping the reviewer's text) — so we suppress it whenever hasSignedCopy,
                // not just on the flow-url path. Before any working copy exists, the XFDF is the owner's
                // own consistent export, so it's still applied to restore field values.
                initialXfdf={(!viewingWithFlowUrl && !hasSignedCopy && (!selectedDoc || selectedDoc.id === contract?.id)) ? contract?.xfdfData : undefined}
                formFields={(!selectedDoc || selectedDoc.id === contract?.id) ? contract?.formFields : undefined}
                currentUserRole="contractor"
                // Chain docs are always read-only; main contract is editable unless finalized
                onSave={(!selectedDoc || selectedDoc.id === contract?.id) && !isFinalized ? handleSaveChanges : undefined}
                readOnly={isFinalized || !!(selectedDoc && selectedDoc.id !== contract?.id)}
                // Owner may edit ALL internal party fields (filled or empty) until finalized — the
                // approver's applied signature is locked separately via lockedFieldNames below.
                editableFieldMode={(!selectedDoc || selectedDoc.id === contract?.id) && !isFinalized ? 'all' : 'none'}
                // Lock only the approver's already-applied signature for the owner.
                lockedFieldNames={(!selectedDoc || selectedDoc.id === contract?.id) && !isFinalized ? approverSignatureFieldNames : undefined}
                showAnnotationNavigation={true}
                parties={contract?.parties}
                // ✅ Pass external signers info so contractor can't edit client party fields
                externalSigners={contract?.externalSigners}
                // ✅ Pass internal signers info so contractor can't edit internal client party fields
                internalSigners={contract?.internalSigners}
            />

            {/* Contract History Panel (popover on desktop, drawer on mobile) */}
            {contract && (
                <ContractHistoryPanel
                    open={historyPanelOpen}
                    anchorEl={historyAnchorEl}
                    onClose={() => setHistoryAnchorEl(null)}
                    contractId={contract?.id}
                    currentContractId={contract?.id}
                    onSelectEntry={(entry) => setHistoryDialogEntry(entry)}
                />
            )}

            {/* Contract History Detail Dialog */}
            <ContractHistoryDialog
                open={!!historyDialogEntry}
                onClose={() => setHistoryDialogEntry(null)}
                entry={historyDialogEntry}
                currentContractId={contract?.id || ''}
            />

            {/* Unified Flow — Submit (start a new flow) */}
            <UnifiedFlowSubmitDialog
                open={unifiedSubmitOpen}
                onClose={() => setUnifiedSubmitOpen(false)}
                onSubmitted={async () => {
                    setUnifiedSubmitOpen(false);
                    const fresh = await apiService.getContractDetails(contract.id);
                    if (fresh) setContract(fresh);
                }}
                contractId={contract.id}
                contractTitle={displayTitle}
            />

            {/* Unified Flow — Resubmit (after rejection) */}
            {isUnifiedFlow && contract.participants && (
                <UnifiedFlowResubmitDialog
                    open={unifiedResubmitOpen}
                    onClose={() => setUnifiedResubmitOpen(false)}
                    onSubmitted={async () => {
                        setUnifiedResubmitOpen(false);
                        const fresh = await apiService.getContractDetails(contract.id);
                        if (fresh) setContract(fresh);
                    }}
                    contractId={contract.id}
                    contractTitle={displayTitle}
                />
            )}

            {/* Unified Flow — Send for External Signature */}
            <UnifiedFlowSendForSignatureDialog
                open={unifiedSendForSigOpen}
                onClose={() => setUnifiedSendForSigOpen(false)}
                onSent={async () => {
                    setUnifiedSendForSigOpen(false);
                    const fresh = await apiService.getContractDetails(contract.id);
                    if (fresh) setContract(fresh);
                }}
                contractId={contract.id}
                contractTitle={displayTitle}
                senderName={pageCurrentUser?.fullName || pageCurrentUser?.email}
            />
        </AppLayout>
    );
}
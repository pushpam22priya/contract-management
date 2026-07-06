'use client';

import { useState, useEffect } from 'react';
import {
    Box, Typography, TextField, Chip, Autocomplete, Alert,
    Divider, Switch, FormControlLabel, IconButton, Tooltip,
    Paper, useTheme,
} from '@mui/material';
import {
    Add, Delete, RateReview, ThumbUp, DragIndicator,
    Groups, PeopleAlt, InfoOutlined, SendOutlined, DriveFileRenameOutline,
    BusinessCenter, CheckCircle, RadioButtonUnchecked, TaskAlt,
    HourglassEmpty, ErrorOutline, AutoAwesome, Person,
} from '@mui/icons-material';
import { alpha } from '@mui/material/styles';
import BaseDialog from '@/components/common/BaseDialog';
import AppButton from '@/components/common/AppButton';
import { userService, User } from '@/services/userService';
import { authService } from '@/services/authService';
import { unifiedFlowService } from '@/services/unifiedFlowService';
import type { ParticipantAssignment, ParticipantRole, ExternalSignerSubmitInput, FlowStatusResponse, WorkflowParticipant } from '@/types/unifiedFlow';

interface UnifiedFlowSubmitDialogProps {
    open: boolean;
    onClose: () => void;
    onSubmitted: () => void;
    contractId: string;
    contractTitle?: string;
}

interface ParticipantRow extends ParticipantAssignment {
    _id: string;
}

interface ExternalSignerRow extends ExternalSignerSubmitInput {
    _id: string;
}

let _rowCounter = 0;
const newParticipantRow = (role: ParticipantRole): ParticipantRow => ({
    _id: `row_${++_rowCounter}`,
    email: '',
    name: '',
    role,
    order: 0, // computed from position at submit time
});

let _signerCounter = 0;
const newSignerRow = (): ExternalSignerRow => ({
    _id: `sig_${++_signerCounter}`,
    email: '',
    name: '',
    order: 0, // computed from position at submit time
});

const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

function reorder<T extends { _id: string }>(arr: T[], fromId: string, toId: string): T[] {
    const from = arr.findIndex((r) => r._id === fromId);
    const to = arr.findIndex((r) => r._id === toId);
    if (from < 0 || to < 0 || from === to) return arr;
    const next = [...arr];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return next;
}

export default function UnifiedFlowSubmitDialog({
    open,
    onClose,
    onSubmitted,
    contractId,
    contractTitle,
}: UnifiedFlowSubmitDialogProps) {
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';
    const currentUser = authService.getCurrentUser();

    const [users, setUsers] = useState<User[]>([]);
    const [loadingUsers, setLoadingUsers] = useState(false);
    const [reviewerRows, setReviewerRows] = useState<ParticipantRow[]>([]);
    const [approverRows, setApproverRows] = useState<ParticipantRow[]>([]);
    const [externalSigningIncluded, setExternalSigningIncluded] = useState(false);
    const [externalSigners, setExternalSigners] = useState<ExternalSignerRow[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [externalParties, setExternalParties] = useState<Array<{ id: string; label: string; order: number }>>([]);
    const [loadingParties, setLoadingParties] = useState(false);
    const [activeFlowStatus, setActiveFlowStatus] = useState<FlowStatusResponse | null>(null);
    const [checkingStatus, setCheckingStatus] = useState(false);
    const [dragging, setDragging] = useState<{ id: string; group: 'reviewer' | 'approver' | 'signer' } | null>(null);
    const [dragOverId, setDragOverId] = useState<string | null>(null);

    useEffect(() => {
        if (open) {
            setCheckingStatus(true);
            setActiveFlowStatus(null);
            unifiedFlowService.getFlowStatus(contractId).then((res) => {
                if (res.ok && res.data && (res.data.participants?.length ?? 0) > 0) {
                    setActiveFlowStatus(res.data);
                } else {
                    loadUsers();
                    setReviewerRows([newParticipantRow('REVIEWER')]);
                    setApproverRows([newParticipantRow('APPROVER')]);
                    setExternalSigningIncluded(false);
                    setExternalSigners([]);
                    setExternalParties([]);
                    setError(null);
                }
                setCheckingStatus(false);
            });
        }
    }, [open]);

    const loadUsers = async () => {
        setLoadingUsers(true);
        const all = await userService.getAllUsers();
        setUsers(all);
        setLoadingUsers(false);
    };

    const loadExternalParties = async () => {
        setLoadingParties(true);
        const res = await unifiedFlowService.getFlowStatus(contractId);
        if (res.ok && res.data?.parties) {
            const ext = res.data.parties
                .filter((p) => p.type === 'EXTERNAL')
                .map((p) => ({ id: p.id, label: p.label, order: p.order }));
            setExternalParties(ext);
            if (ext.length === 1) {
                setExternalSigners((prev) =>
                    prev.map((s) => (!s.partyId ? { ...s, partyId: ext[0].id, partyLabel: ext[0].label } : s)),
                );
            }
        }
        setLoadingParties(false);
    };

    const handleExternalToggle = (checked: boolean) => {
        setExternalSigningIncluded(checked);
        if (checked) {
            if (externalSigners.length === 0) setExternalSigners([newSignerRow()]);
            loadExternalParties();
        } else {
            setExternalSigners([]);
            setExternalParties([]);
        }
    };

    const usedEmails = [...reviewerRows, ...approverRows].map((r) => r.email).filter(Boolean);
    const availableUsers = (excludeEmail?: string) =>
        users.filter((u) => {
            if (currentUser && u.email === currentUser.email) return false;
            if (!excludeEmail && usedEmails.includes(u.email)) return false;
            if (excludeEmail && usedEmails.filter((e) => e !== excludeEmail).includes(u.email)) return false;
            return true;
        });

    const updateRow = (id: string, patch: Partial<ParticipantRow>) => {
        setReviewerRows((prev) => prev.map((r) => (r._id === id ? { ...r, ...patch } : r)));
        setApproverRows((prev) => prev.map((r) => (r._id === id ? { ...r, ...patch } : r)));
    };

    const removeRow = (id: string) => {
        setReviewerRows((prev) => prev.filter((r) => r._id !== id));
        setApproverRows((prev) => prev.filter((r) => r._id !== id));
    };

    const addSigner = () => {
        const row = newSignerRow();
        if (externalParties.length === 1) {
            row.partyId = externalParties[0].id;
            row.partyLabel = externalParties[0].label;
        }
        setExternalSigners((prev) => [...prev, row]);
    };

    const removeSigner = (id: string) => {
        setExternalSigners((prev) => prev.filter((s) => s._id !== id));
    };

    const updateSigner = (id: string, patch: Partial<ExternalSignerRow>) => {
        setExternalSigners((prev) => prev.map((s) => (s._id === id ? { ...s, ...patch } : s)));
    };

    const validate = (): string | null => {
        if (reviewerRows.length === 0 && approverRows.length === 0)
            return 'Add at least one reviewer or approver.';
        if (approverRows.length === 0)
            return 'At least one Approver is required.';
        const allRows = [...reviewerRows, ...approverRows];
        for (const r of allRows) {
            if (!r.email.trim()) return 'All participants must have an email address.';
        }
        const emails = allRows.map((r) => r.email.toLowerCase().trim());
        if (new Set(emails).size !== emails.length) return 'Duplicate emails are not allowed.';
        if (currentUser && emails.includes(currentUser.email.toLowerCase()))
            return 'You cannot add yourself as a participant.';

        if (externalSigningIncluded) {
            if (externalSigners.length === 0)
                return 'Add at least one external signer when external client signing is enabled.';
            for (const s of externalSigners) {
                if (!s.email.trim()) return 'All external signers must have an email address.';
                if (!isValidEmail(s.email.trim())) return `"${s.email}" is not a valid email address.`;
                if (externalParties.length > 0 && !s.partyId)
                    return `Select a party for the signer "${s.email || 'unknown'}".`;
            }
            const signerEmails = externalSigners.map((s) => s.email.toLowerCase().trim());
            if (new Set(signerEmails).size !== signerEmails.length)
                return 'Duplicate external signer emails are not allowed.';
        }

        return null;
    };

    const handleSubmit = async () => {
        setError(null);
        const validationError = validate();
        if (validationError) { setError(validationError); return; }

        setSubmitting(true);
        // Orders are purely positional: reviewers 1..n, approvers n+1..n+m
        const assignments: ParticipantAssignment[] = [
            ...reviewerRows.map((r, i) => ({ email: r.email, name: r.name, role: 'REVIEWER' as const, order: i + 1 })),
            ...approverRows.map((r, i) => ({ email: r.email, name: r.name, role: 'APPROVER' as const, order: reviewerRows.length + i + 1 })),
        ];
        const signers: ExternalSignerSubmitInput[] | undefined = externalSigningIncluded
            ? externalSigners.map(({ email, name, partyId, partyLabel }, i) => ({
                email: email.trim(),
                name: name?.trim() || undefined,
                order: i + 1,
                ...(partyId ? { partyId, partyLabel } : {}),
            }))
            : undefined;

        const res = await unifiedFlowService.submitFlow(
            contractId,
            assignments,
            externalSigningIncluded,
            signers,
            currentUser?.fullName || currentUser?.email,
        );
        setSubmitting(false);

        if (res.ok) {
            handleClose();
            onSubmitted();
        } else {
            setError(res.message || 'Failed to submit. Please try again.');
        }
    };

    const handleClose = () => {
        if (submitting) return;
        setReviewerRows([]);
        setApproverRows([]);
        setExternalSigners([]);
        setError(null);
        onClose();
    };

    const sectionBg = isDark ? alpha('#ffffff', 0.03) : '#f8fafc';
    const sectionBorder = isDark ? alpha('#ffffff', 0.08) : '#e2e8f0';

    // ─── Read-only mode helpers ────────────────────────────────────────────────
    const FLOW_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
        IN_REVIEW:            { label: 'Under Review',         color: '#3b82f6', bg: isDark ? alpha('#3b82f6', 0.1) : '#eff6ff' },
        IN_APPROVAL:          { label: 'In Approval',          color: '#f59e0b', bg: isDark ? alpha('#f59e0b', 0.1) : '#fffbeb' },
        READY_FOR_SIGNATURE:  { label: 'Ready for Signature',  color: '#8b5cf6', bg: isDark ? alpha('#8b5cf6', 0.1) : '#f5f3ff' },
        IN_SIGNATURE:         { label: 'In Signature',         color: '#14b8a6', bg: isDark ? alpha('#14b8a6', 0.1) : '#f0fdfa' },
        REJECTED:             { label: 'Rejected',             color: '#ef4444', bg: isDark ? alpha('#ef4444', 0.1) : '#fef2f2' },
        ALL_COMPLETED:        { label: 'Completed',            color: '#10b981', bg: isDark ? alpha('#10b981', 0.1) : '#f0fdf4' },
        COMPLETED:            { label: 'Completed',            color: '#10b981', bg: isDark ? alpha('#10b981', 0.1) : '#f0fdf4' },
    };

    const PARTICIPANT_STATUS_CONFIG: Record<string, { label: string; color: string; Icon: React.ElementType }> = {
        pending:     { label: 'Waiting',     color: '#94a3b8', Icon: RadioButtonUnchecked },
        unlocked:    { label: 'Notified',    color: '#3b82f6', Icon: HourglassEmpty },
        in_progress: { label: 'In Progress', color: '#f59e0b', Icon: HourglassEmpty },
        completed:   { label: 'Completed',   color: '#10b981', Icon: TaskAlt },
        rejected:    { label: 'Rejected',    color: '#ef4444', Icon: ErrorOutline },
    };

    const renderParticipantCard = (p: WorkflowParticipant, isActive: boolean) => {
        const cfg = PARTICIPANT_STATUS_CONFIG[p.status] ?? PARTICIPANT_STATUS_CONFIG.pending;
        const { Icon: StatusIcon } = cfg;
        const roleColor = p.role === 'REVIEWER' ? '#3b82f6' : '#10b981';
        const RoleIcon = p.role === 'REVIEWER' ? RateReview : ThumbUp;

        return (
            <Box
                key={`${p.email}-${p.order}`}
                sx={{
                    display: 'flex', alignItems: 'center', gap: 1.5, p: 1.25, borderRadius: 2,
                    bgcolor: isActive ? (isDark ? alpha(roleColor, 0.12) : alpha(roleColor, 0.06)) : 'background.paper',
                    border: '1px solid',
                    borderColor: isActive ? alpha(roleColor, 0.4) : 'divider',
                    transition: 'all 0.2s',
                    boxShadow: isActive ? `0 0 0 2px ${alpha(roleColor, 0.2)}` : 'none',
                }}
            >
                <Box sx={{ minWidth: 26, height: 26, borderRadius: '50%', bgcolor: alpha(roleColor, 0.15), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Typography variant="caption" fontWeight={700} sx={{ fontSize: '0.68rem', color: roleColor }}>{p.order}</Typography>
                </Box>
                <RoleIcon sx={{ fontSize: 16, color: roleColor, flexShrink: 0 }} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    {p.name && <Typography variant="body2" fontWeight={600} noWrap sx={{ lineHeight: 1.2 }}>{p.name}</Typography>}
                    <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>{p.email}</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
                    <StatusIcon sx={{ fontSize: 14, color: cfg.color }} />
                    <Typography variant="caption" fontWeight={600} sx={{ color: cfg.color, whiteSpace: 'nowrap' }}>{cfg.label}</Typography>
                </Box>
                {isActive && (
                    <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: roleColor, flexShrink: 0, animation: 'pulse 1.5s infinite', '@keyframes pulse': { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.3 } } }} />
                )}
            </Box>
        );
    };

    const renderReadOnlyView = () => {
        if (!activeFlowStatus) return null;
        const { status, participants, externalSigningIncluded: extIncluded, parties, externalSigners: extSigners, currentParticipantOrder } = activeFlowStatus;
        const flowCfg = FLOW_STATUS_CONFIG[status] ?? { label: status, color: '#64748b', bg: sectionBg };

        const roViewers = participants.filter((p) => p.role === 'REVIEWER').sort((a, b) => a.order - b.order);
        const roApprovers = participants.filter((p) => p.role === 'APPROVER').sort((a, b) => a.order - b.order);
        const externalPartySlots = (parties ?? []).filter((p) => p.type === 'EXTERNAL');

        const isActiveParticipant = (p: WorkflowParticipant) =>
            p.order === currentParticipantOrder && (p.status === 'unlocked' || p.status === 'in_progress');

        const renderGroup = (label: string, subtext: string, accentColor: string, Icon: React.ElementType, members: WorkflowParticipant[]) => (
            <Paper elevation={0} sx={{ bgcolor: sectionBg, border: `1px solid ${sectionBorder}`, borderRadius: 2, overflow: 'hidden' }}>
                <Box sx={{ px: 1.5, py: 0.75, display: 'flex', alignItems: 'center', gap: 1, borderBottom: `1px solid ${sectionBorder}`, bgcolor: isDark ? alpha(accentColor, 0.08) : alpha(accentColor, 0.05) }}>
                    <Icon sx={{ fontSize: 16, color: accentColor }} />
                    <Box sx={{ flex: 1 }}>
                        <Typography variant="subtitle2" fontWeight={700} sx={{ color: accentColor }}>{label}</Typography>
                        <Typography variant="caption" color="text.secondary">{subtext}</Typography>
                    </Box>
                    <Chip label={members.length} size="small" sx={{ height: 18, fontSize: '0.65rem', fontWeight: 700, bgcolor: alpha(accentColor, 0.15), color: accentColor }} />
                </Box>
                <Box sx={{ p: 1, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                    {members.length === 0 ? (
                        <Typography variant="caption" color="text.disabled" sx={{ textAlign: 'center', py: 1 }}>None assigned</Typography>
                    ) : (
                        members.map((p) => renderParticipantCard(p, isActiveParticipant(p)))
                    )}
                </Box>
            </Paper>
        );

        return (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {contractTitle && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1, borderRadius: 1.5, bgcolor: isDark ? alpha('#ffffff', 0.04) : '#f8fafc', border: '1px solid', borderColor: 'divider' }}>
                        <Groups sx={{ fontSize: 18, color: 'text.secondary' }} />
                        <Typography variant="body2" color="text.secondary">Contract: <strong>{contractTitle}</strong></Typography>
                    </Box>
                )}

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5, borderRadius: 2, bgcolor: flowCfg.bg, border: '1px solid', borderColor: alpha(flowCfg.color, 0.35) }}>
                    <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: flowCfg.color, flexShrink: 0 }} />
                    <Box sx={{ flex: 1 }}>
                        <Typography variant="subtitle2" fontWeight={700} sx={{ color: flowCfg.color }}>{flowCfg.label}</Typography>
                        <Typography variant="caption" color="text.secondary">
                            {currentParticipantOrder !== null
                                ? `Currently waiting on participants at order ${currentParticipantOrder}`
                                : 'All participant steps are complete'}
                        </Typography>
                    </Box>
                    {['IN_REVIEW', 'IN_APPROVAL', 'IN_SIGNATURE'].includes(status) && (
                        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: flowCfg.color, animation: 'pulse 2s infinite', '@keyframes pulse': { '0%, 100%': { opacity: 1, transform: 'scale(1)' }, '50%': { opacity: 0.4, transform: 'scale(0.8)' } } }} />
                    )}
                </Box>

                {roViewers.length > 0 && renderGroup('Reviewers', 'Can review & edit organisation fields.', '#3b82f6', RateReview, roViewers)}
                {roApprovers.length > 0 && renderGroup('Approvers', 'Can sign the PDF and approve the contract.', '#10b981', ThumbUp, roApprovers)}

                {extIncluded && (
                    <Paper elevation={0} sx={{ bgcolor: sectionBg, border: `1px solid ${isDark ? alpha('#f59e0b', 0.3) : '#fde68a'}`, borderRadius: 2, overflow: 'hidden' }}>
                        <Box sx={{ px: 1.5, py: 0.75, display: 'flex', alignItems: 'center', gap: 1, borderBottom: `1px solid ${sectionBorder}`, bgcolor: isDark ? alpha('#f59e0b', 0.08) : '#fffbeb' }}>
                            <DriveFileRenameOutline sx={{ fontSize: 16, color: '#f59e0b' }} />
                            <Box sx={{ flex: 1 }}>
                                <Typography variant="subtitle2" fontWeight={700} sx={{ color: isDark ? '#fcd34d' : '#92400e' }}>External Client Signing</Typography>
                                <Typography variant="caption" color="text.secondary">Emails sent automatically after all approvals</Typography>
                            </Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <AutoAwesome sx={{ fontSize: 12, color: '#f59e0b' }} />
                                <Typography variant="caption" sx={{ color: '#f59e0b', fontWeight: 600 }}>Auto</Typography>
                            </Box>
                        </Box>
                        <Box sx={{ p: 1, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                            {(extSigners && extSigners.length > 0 ? extSigners : externalPartySlots).length === 0 ? (
                                <Typography variant="caption" color="text.secondary" sx={{ p: 1 }}>External signers will be notified after all approvers complete.</Typography>
                            ) : extSigners && extSigners.length > 0 ? (
                                extSigners.map((signer) => (
                                    <Box key={signer.email} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1, borderRadius: 1.5, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider' }}>
                                        <Box sx={{ minWidth: 26, height: 26, borderRadius: '50%', bgcolor: alpha('#f59e0b', 0.12), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                            <Typography variant="caption" fontWeight={700} sx={{ fontSize: '0.68rem', color: '#f59e0b' }}>{signer.order}</Typography>
                                        </Box>
                                        <Person sx={{ fontSize: 16, color: '#f59e0b', flexShrink: 0 }} />
                                        <Box sx={{ flex: 1, minWidth: 0 }}>
                                            {signer.name && <Typography variant="body2" fontWeight={600} noWrap sx={{ lineHeight: 1.2 }}>{signer.name}</Typography>}
                                            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>{signer.email}</Typography>
                                            {signer.partyLabel && <Typography variant="caption" sx={{ color: '#f59e0b', fontWeight: 600 }}>{signer.partyLabel}</Typography>}
                                        </Box>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
                                            {status === 'IN_SIGNATURE' ? (
                                                <><CheckCircle sx={{ fontSize: 14, color: '#10b981' }} /><Typography variant="caption" fontWeight={600} sx={{ color: '#10b981' }}>Sent</Typography></>
                                            ) : (
                                                <><HourglassEmpty sx={{ fontSize: 14, color: '#94a3b8' }} /><Typography variant="caption" fontWeight={600} sx={{ color: '#94a3b8' }}>Pending approval</Typography></>
                                            )}
                                        </Box>
                                    </Box>
                                ))
                            ) : (
                                externalPartySlots.map((slot) => (
                                    <Box key={slot.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1, borderRadius: 1.5, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider' }}>
                                        <Box sx={{ minWidth: 26, height: 26, borderRadius: '50%', bgcolor: alpha('#f59e0b', 0.12), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                            <Typography variant="caption" fontWeight={700} sx={{ fontSize: '0.68rem', color: '#f59e0b' }}>{slot.order}</Typography>
                                        </Box>
                                        <Person sx={{ fontSize: 16, color: '#f59e0b', flexShrink: 0 }} />
                                        <Typography variant="body2" fontWeight={600} sx={{ flex: 1 }}>{slot.label}</Typography>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
                                            {status === 'IN_SIGNATURE' ? (
                                                <><CheckCircle sx={{ fontSize: 14, color: '#10b981' }} /><Typography variant="caption" fontWeight={600} sx={{ color: '#10b981' }}>Sent</Typography></>
                                            ) : (
                                                <><HourglassEmpty sx={{ fontSize: 14, color: '#94a3b8' }} /><Typography variant="caption" fontWeight={600} sx={{ color: '#94a3b8' }}>Pending approval</Typography></>
                                            )}
                                        </Box>
                                    </Box>
                                ))
                            )}
                        </Box>
                    </Paper>
                )}
            </Box>
        );
    };
    // ──────────────────────────────────────────────────────────────────────────

    const renderParticipantSection = (
        role: ParticipantRole,
        sectionRows: ParticipantRow[],
        setSectionRows: React.Dispatch<React.SetStateAction<ParticipantRow[]>>,
        orderOffset: number,
    ) => {
        const isReviewer = role === 'REVIEWER';
        const accentColor = isReviewer ? '#3b82f6' : '#10b981';
        const Icon = isReviewer ? RateReview : ThumbUp;
        const label = isReviewer ? 'Reviewers' : 'Approvers';
        const subtext = isReviewer ? 'Can review & edit organisation fields.' : 'Can sign the PDF and approve the contract.';
        const group: 'reviewer' | 'approver' = isReviewer ? 'reviewer' : 'approver';

        return (
            <Paper elevation={0} sx={{ bgcolor: sectionBg, border: `1px solid ${sectionBorder}`, borderRadius: 2, overflow: 'hidden' }}>
                <Box sx={{ px: 1.5, py: 1, display: 'flex', alignItems: 'center', gap: 1, borderBottom: `1px solid ${sectionBorder}`, bgcolor: isDark ? alpha(accentColor, 0.08) : alpha(accentColor, 0.05) }}>
                    <Icon sx={{ fontSize: 16, color: accentColor }} />
                    <Box sx={{ flex: 1 }}>
                        <Typography variant="subtitle2" fontWeight={700} sx={{ color: accentColor }}>{label}</Typography>
                        <Typography variant="caption" color="text.secondary">{subtext}</Typography>
                    </Box>
                    <Chip label={sectionRows.length} size="small" sx={{ height: 18, fontSize: '0.65rem', fontWeight: 700, bgcolor: alpha(accentColor, 0.15), color: accentColor }} />
                </Box>

                <Box sx={{ p: 1, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                    {sectionRows.length === 0 && (
                        <Typography variant="caption" color="text.disabled" sx={{ textAlign: 'center', py: 1 }}>
                            No {label.toLowerCase()} added yet
                        </Typography>
                    )}

                    {sectionRows.map((row, idx) => {
                        const order = orderOffset + idx + 1;
                        const isDraggingThis = dragging?.id === row._id;
                        const isDragTarget = dragOverId === row._id && dragging?.group === group && !isDraggingThis;
                        return (
                            <Box
                                key={row._id}
                                draggable
                                onDragStart={(e) => {
                                    setDragging({ id: row._id, group });
                                    e.dataTransfer.effectAllowed = 'move';
                                }}
                                onDragOver={(e) => {
                                    e.preventDefault();
                                    if (dragging?.group !== group) return;
                                    e.dataTransfer.dropEffect = 'move';
                                    if (dragOverId !== row._id) setDragOverId(row._id);
                                }}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    if (!dragging || dragging.group !== group) return;
                                    setSectionRows((prev) => reorder(prev, dragging.id, row._id));
                                    setDragging(null);
                                    setDragOverId(null);
                                }}
                                onDragEnd={() => { setDragging(null); setDragOverId(null); }}
                                sx={{
                                    display: 'flex', alignItems: 'center', gap: 1,
                                    p: 1, borderRadius: 1.5,
                                    bgcolor: 'background.paper',
                                    border: '1px solid',
                                    borderColor: isDragTarget ? accentColor : 'divider',
                                    cursor: isDraggingThis ? 'grabbing' : 'grab',
                                    opacity: isDraggingThis ? 0.4 : 1,
                                    boxShadow: isDragTarget ? `0 0 0 2px ${alpha(accentColor, 0.25)}` : 'none',
                                    transition: 'border-color 0.1s, box-shadow 0.1s, opacity 0.15s',
                                    userSelect: 'none',
                                }}
                            >
                                <Box sx={{ minWidth: 22, height: 22, borderRadius: '50%', bgcolor: alpha(accentColor, 0.12), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <Typography variant="caption" fontWeight={700} sx={{ fontSize: '0.62rem', color: accentColor }}>{order}</Typography>
                                </Box>

                                <DragIndicator sx={{ fontSize: 18, color: 'text.disabled', flexShrink: 0 }} />

                                <Autocomplete
                                    options={availableUsers(row.email)}
                                    getOptionLabel={(u) => typeof u === 'string' ? u : `${u.name || ''} (${u.email})`}
                                    value={users.find((u) => u.email === row.email) || null}
                                    onChange={(_, val) => {
                                        if (val && typeof val !== 'string') {
                                            updateRow(row._id, { email: val.email, name: val.name });
                                        } else {
                                            updateRow(row._id, { email: '', name: '' });
                                        }
                                    }}
                                    loading={loadingUsers}
                                    size="small"
                                    sx={{ flex: 1 }}
                                    renderInput={(params) => (
                                        <TextField
                                            {...params}
                                            placeholder="Search user…"
                                            size="small"
                                            sx={{ '& .MuiOutlinedInput-root': { fontSize: '0.82rem' } }}
                                        />
                                    )}
                                    freeSolo
                                    onInputChange={(_, val, reason) => {
                                        if (reason === 'input') updateRow(row._id, { email: val });
                                    }}
                                />

                                <Tooltip title="Remove" arrow>
                                    <IconButton size="small" color="error" onClick={() => removeRow(row._id)} sx={{ flexShrink: 0, p: 0.5 }}>
                                        <Delete sx={{ fontSize: 16 }} />
                                    </IconButton>
                                </Tooltip>
                            </Box>
                        );
                    })}

                    <AppButton
                        variant="outlined"
                        size="small"
                        startIcon={<Add />}
                        onClick={() => setSectionRows((prev) => [...prev, newParticipantRow(role)])}
                        sx={{ mt: 0.25, borderColor: alpha(accentColor, 0.4), color: accentColor, '&:hover': { borderColor: accentColor, bgcolor: alpha(accentColor, 0.06) }, fontSize: '0.78rem' }}
                    >
                        Add {isReviewer ? 'Reviewer' : 'Approver'}
                    </AppButton>
                </Box>
            </Paper>
        );
    };

    const renderExternalSignersSection = () => (
        <Paper elevation={0} sx={{ bgcolor: sectionBg, border: `1px solid ${isDark ? alpha('#f59e0b', 0.3) : '#fde68a'}`, borderRadius: 2, overflow: 'hidden' }}>
            <Box sx={{ px: 1.5, py: 0.75, display: 'flex', alignItems: 'center', gap: 1, borderBottom: `1px solid ${sectionBorder}`, bgcolor: isDark ? alpha('#f59e0b', 0.08) : '#fffbeb' }}>
                <DriveFileRenameOutline sx={{ fontSize: 16, color: '#f59e0b' }} />
                <Box sx={{ flex: 1 }}>
                    <Typography variant="subtitle2" fontWeight={700} sx={{ color: isDark ? '#fcd34d' : '#92400e' }}>External Signers</Typography>
                    <Typography variant="caption" color="text.secondary">
                        {externalParties.length > 0
                            ? 'Assign each client to their party so they know which fields belong to them.'
                            : 'External clients who will sign after all approvals are complete.'}
                    </Typography>
                </Box>
                <Chip label={externalSigners.length} size="small" sx={{ height: 18, fontSize: '0.65rem', fontWeight: 700, bgcolor: alpha('#f59e0b', 0.15), color: '#f59e0b' }} />
            </Box>

            <Box sx={{ p: 1, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                {externalSigners.map((signer, idx) => {
                    const order = idx + 1;
                    const isDraggingThis = dragging?.id === signer._id;
                    const isDragTarget = dragOverId === signer._id && dragging?.group === 'signer' && !isDraggingThis;
                    return (
                        <Box
                            key={signer._id}
                            draggable
                            onDragStart={(e) => {
                                setDragging({ id: signer._id, group: 'signer' });
                                e.dataTransfer.effectAllowed = 'move';
                            }}
                            onDragOver={(e) => {
                                e.preventDefault();
                                if (dragging?.group !== 'signer') return;
                                e.dataTransfer.dropEffect = 'move';
                                if (dragOverId !== signer._id) setDragOverId(signer._id);
                            }}
                            onDrop={(e) => {
                                e.preventDefault();
                                if (!dragging || dragging.group !== 'signer') return;
                                setExternalSigners((prev) => reorder(prev, dragging.id, signer._id));
                                setDragging(null);
                                setDragOverId(null);
                            }}
                            onDragEnd={() => { setDragging(null); setDragOverId(null); }}
                            sx={{
                                display: 'flex', alignItems: 'center', gap: 1,
                                p: 0.75, borderRadius: 1.5,
                                bgcolor: 'background.paper',
                                border: '1px solid',
                                borderColor: isDragTarget ? '#f59e0b' : 'divider',
                                cursor: isDraggingThis ? 'grabbing' : 'grab',
                                opacity: isDraggingThis ? 0.4 : 1,
                                boxShadow: isDragTarget ? `0 0 0 2px ${alpha('#f59e0b', 0.25)}` : 'none',
                                transition: 'border-color 0.1s, box-shadow 0.1s, opacity 0.15s',
                                userSelect: 'none',
                            }}
                        >
                            <Box sx={{ minWidth: 22, height: 22, borderRadius: '50%', bgcolor: alpha('#f59e0b', 0.12), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <Typography variant="caption" fontWeight={700} sx={{ fontSize: '0.62rem', color: '#f59e0b' }}>{order}</Typography>
                            </Box>

                            <DragIndicator sx={{ fontSize: 18, color: 'text.disabled', flexShrink: 0 }} />

                            <TextField
                                size="small"
                                placeholder="client@example.com *"
                                type="email"
                                value={signer.email}
                                onChange={(e) => updateSigner(signer._id, { email: e.target.value })}
                                sx={{ flex: 2, '& .MuiOutlinedInput-root': { fontSize: '0.82rem' } }}
                                error={signer.email !== '' && !isValidEmail(signer.email)}
                            />

                            <TextField
                                size="small"
                                placeholder="Name (optional)"
                                value={signer.name || ''}
                                onChange={(e) => updateSigner(signer._id, { name: e.target.value })}
                                sx={{ flex: 1.5, '& .MuiOutlinedInput-root': { fontSize: '0.82rem' } }}
                            />

                            {externalParties.length > 0 && (
                                <Autocomplete
                                    options={externalParties}
                                    getOptionLabel={(p) => p.label}
                                    value={externalParties.find((p) => p.id === signer.partyId) ?? null}
                                    onChange={(_, val) => {
                                        updateSigner(signer._id, { partyId: val?.id ?? undefined, partyLabel: val?.label ?? undefined });
                                    }}
                                    loading={loadingParties}
                                    size="small"
                                    sx={{ flex: 1.5 }}
                                    renderInput={(params) => (
                                        <TextField
                                            {...params}
                                            placeholder="Party *"
                                            size="small"
                                            error={!signer.partyId}
                                            InputProps={{
                                                ...params.InputProps,
                                                startAdornment: (
                                                    <>
                                                        <BusinessCenter sx={{ fontSize: 14, color: '#f59e0b', mr: 0.5 }} />
                                                        {params.InputProps.startAdornment}
                                                    </>
                                                ),
                                            }}
                                            sx={{ '& .MuiOutlinedInput-root': { fontSize: '0.82rem' } }}
                                        />
                                    )}
                                    isOptionEqualToValue={(o, v) => o.id === v.id}
                                    disableClearable={false}
                                />
                            )}

                            <Tooltip title="Remove" arrow>
                                <span>
                                    <IconButton
                                        size="small"
                                        color="error"
                                        onClick={() => removeSigner(signer._id)}
                                        disabled={externalSigners.length === 1}
                                        sx={{ flexShrink: 0, p: 0.5 }}
                                    >
                                        <Delete sx={{ fontSize: 16 }} />
                                    </IconButton>
                                </span>
                            </Tooltip>
                        </Box>
                    );
                })}

                <AppButton
                    variant="outlined"
                    size="small"
                    startIcon={<Add />}
                    onClick={addSigner}
                    sx={{ mt: 0.25, borderColor: alpha('#f59e0b', 0.4), color: '#f59e0b', '&:hover': { borderColor: '#f59e0b', bgcolor: alpha('#f59e0b', 0.06) }, fontSize: '0.78rem' }}
                >
                    Add External Signer
                </AppButton>
            </Box>
        </Paper>
    );

    const isReadOnlyMode = !checkingStatus && activeFlowStatus !== null;

    return (
        <BaseDialog
            open={open}
            onClose={handleClose}
            title={isReadOnlyMode ? 'UNIFIED FLOW STATUS' : 'SUBMIT FOR UNIFIED REVIEW'}
            maxWidth="md"
            disableBackdropClick={submitting}
            actions={
                isReadOnlyMode ? (
                    <AppButton variant="outlined" onClick={handleClose}>Close</AppButton>
                ) : (
                    <>
                        <AppButton variant="outlined" onClick={handleClose} disabled={submitting}>Cancel</AppButton>
                        <AppButton
                            variant="contained"
                            loading={submitting}
                            disabled={reviewerRows.length === 0 && approverRows.length === 0}
                            startIcon={<SendOutlined />}
                            onClick={handleSubmit}
                            sx={{ fontWeight: 600, px: 3, boxShadow: (t) => `0 2px 8px ${t.palette.primary.main}40` }}
                        >
                            {submitting ? 'Submitting…' : 'Submit Flow'}
                        </AppButton>
                    </>
                )
            }
        >
            {checkingStatus ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    {[80, 120, 120].map((h, i) => (
                        <Box key={i} sx={{ height: h, borderRadius: 2, bgcolor: isDark ? alpha('#ffffff', 0.06) : '#f1f5f9', animation: 'shimmer 1.5s infinite', '@keyframes shimmer': { '0%': { opacity: 0.6 }, '50%': { opacity: 1 }, '100%': { opacity: 0.6 } } }} />
                    ))}
                </Box>
            ) : isReadOnlyMode ? (
                renderReadOnlyView()
            ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    {contractTitle && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1, borderRadius: 1.5, bgcolor: isDark ? alpha('#ffffff', 0.04) : '#f8fafc', border: '1px solid', borderColor: 'divider' }}>
                            <Groups sx={{ fontSize: 18, color: 'text.secondary' }} />
                            <Typography variant="body2" color="text.secondary">Contract: <strong>{contractTitle}</strong></Typography>
                        </Box>
                    )}

                    {error && (
                        <Alert severity="error" onClose={() => setError(null)} sx={{ borderRadius: 2 }}>{error}</Alert>
                    )}

                    <Alert severity="info" icon={<InfoOutlined fontSize="inherit" />} sx={{ borderRadius: 2, py: 0.5, '& .MuiAlert-message': { py: 0.25 } }}>
                        <Typography variant="caption">
                            Reviewers are notified first (in order), then approvers. Drag rows within each group to reorder. Participants with the same position are notified simultaneously.
                        </Typography>
                    </Alert>

                    <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1.5 }}>
                        <Box sx={{ flex: 1 }}>
                            {renderParticipantSection('REVIEWER', reviewerRows, setReviewerRows, 0)}
                        </Box>
                        <Box sx={{ flex: 1 }}>
                            {renderParticipantSection('APPROVER', approverRows, setApproverRows, reviewerRows.length)}
                        </Box>
                    </Box>

                    <Divider />

                    <Paper
                        elevation={0}
                        sx={{
                            p: 1.5, borderRadius: 2,
                            bgcolor: externalSigningIncluded ? (isDark ? alpha('#10b981', 0.08) : '#f0fdf4') : sectionBg,
                            border: '1px solid',
                            borderColor: externalSigningIncluded ? (isDark ? alpha('#10b981', 0.3) : '#a7f3d0') : sectionBorder,
                            transition: 'all 0.2s',
                        }}
                    >
                        <FormControlLabel
                            control={<Switch checked={externalSigningIncluded} onChange={(e) => handleExternalToggle(e.target.checked)} color="success" size="small" />}
                            label={
                                <Box sx={{ ml: 0.5 }}>
                                    <Typography variant="body2" fontWeight={600}>Include external client signing</Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        {externalSigningIncluded
                                            ? 'Signature emails will be sent automatically after all approvals are complete.'
                                            : 'After all approvals, you can manually send the contract to external clients for signature.'}
                                    </Typography>
                                </Box>
                            }
                            sx={{ alignItems: 'flex-start', m: 0 }}
                        />
                    </Paper>

                    {externalSigningIncluded && renderExternalSignersSection()}

                    {(reviewerRows.length > 0 || approverRows.length > 0) && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                            <PeopleAlt sx={{ fontSize: 16, color: 'text.secondary' }} />
                            <Typography variant="caption" color="text.secondary">
                                {reviewerRows.length} reviewer{reviewerRows.length !== 1 ? 's' : ''},{' '}
                                {approverRows.length} approver{approverRows.length !== 1 ? 's' : ''}
                                {externalSigningIncluded
                                    ? ` · ${externalSigners.length} external signer${externalSigners.length !== 1 ? 's' : ''} (auto-sent after approval)`
                                    : ''}
                            </Typography>
                        </Box>
                    )}
                </Box>
            )}
        </BaseDialog>
    );
}

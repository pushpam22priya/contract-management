'use client';

import { useState } from 'react';
import {
    TextField,
    Box,
    Typography,
    Alert,
    IconButton,
    Chip,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
    List,
    ListItem,
    ListItemText,
    Paper,
    useTheme,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
    Send,
    CheckCircle,
    Add,
    Delete,
    Email,
    BusinessCenter,
    Groups,
    DragIndicator,
} from '@mui/icons-material';
import AppButton from '@/components/common/AppButton';
import BaseDialog from '@/components/common/BaseDialog';
import { PartyConfiguration } from '@/types/template';
import { ExternalSigner, InternalSigner, SignerAssignment } from '@/types/contract';

interface MultiPartySignatureDialogProps {
    open: boolean;
    onClose: () => void;
    onSubmit: (assignments: SignerAssignment[]) => Promise<{ success: boolean; error?: string }>;
    contractTitle?: string;
    parties: PartyConfiguration[];
    formFields?: any[];
    existingExternalSigners?: ExternalSigner[];
    existingInternalSigners?: InternalSigner[]; // kept for backward compat display only
    fieldValues?: Record<string, string>;
}

const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

const MultiPartySignatureDialog = ({
    open,
    onClose,
    onSubmit,
    contractTitle,
    parties,
    formFields = [],
    existingExternalSigners = [],
    existingInternalSigners = [],
    fieldValues = {},
}: MultiPartySignatureDialogProps) => {
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';

    const [selectedPartyId, setSelectedPartyId] = useState('');
    const [email, setEmail] = useState('');
    const [name, setName] = useState('');
    const [assignments, setAssignments] = useState<SignerAssignment[]>([]);

    const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    // Parties that have at least one form field assigned to them
    const hasFormFields = formFields.length > 0;
    const partiesWithFields = hasFormFields
        ? parties.filter(party => formFields.some(field => field.assignedParty === party.id))
        : parties;

    // Party IDs already taken by existing or new assignments
    const existingAssignedPartyIds = [
        ...existingExternalSigners.map(s => s.partyId),
        ...existingInternalSigners.map(s => s.partyId),
    ];
    const newAssignedPartyIds = assignments.map(a => a.partyId);
    const allAssignedPartyIds = [...existingAssignedPartyIds, ...newAssignedPartyIds];

    // Parties whose fields are fully filled by the contractor (no signer needed)
    const contractorFilledPartyIds = hasFormFields
        ? partiesWithFields
            .filter(party => {
                if (allAssignedPartyIds.includes(party.id)) return false;
                const partyFields = formFields.filter(f => f.assignedParty === party.id);
                if (partyFields.length === 0) return false;
                return partyFields.every(f => {
                    const val = fieldValues[f.name];
                    return val !== undefined && val !== null && val !== '';
                });
            })
            .map(p => p.id)
        : [];

    // Parties still available for assignment — external parties only
    const availableParties = partiesWithFields.filter(
        p => p.type === 'EXTERNAL' && !allAssignedPartyIds.includes(p.id) && !contractorFilledPartyIds.includes(p.id),
    );

    // Max order among already-committed signers — new assignments continue from here
    const existingMaxOrder = [...existingExternalSigners, ...existingInternalSigners]
        .reduce((max, s) => Math.max(max, s.order ?? 0), 0);

    const getPartyColor = (partyId: string) => parties.find(p => p.id === partyId)?.color ?? '#666';
    const getPartyLabel = (partyId: string) => parties.find(p => p.id === partyId)?.label ?? partyId;

    // Combine existing signers for the read-only "Already Assigned" section
    const allExistingSigners = [
        ...existingInternalSigners.map(s => ({ ...s, signerKind: 'internal' as const })),
        ...existingExternalSigners.map(s => ({ ...s, signerKind: 'external' as const })),
    ].sort((a, b) => a.order - b.order);

    // ─── Handlers ─────────────────────────────────────────────────────────────

    const handleAddAssignment = () => {
        if (!selectedPartyId) { setError('Please select a party'); return; }
        if (!email.trim()) { setError('Please enter an email address'); return; }
        if (!isValidEmail(email)) { setError('Please enter a valid email address'); return; }

        const targetEmail = email.trim().toLowerCase();
        const alreadyTaken =
            allExistingSigners.some(s => s.email?.toLowerCase() === targetEmail) ||
            assignments.some(a => a.email?.toLowerCase() === targetEmail);
        if (alreadyTaken) {
            setError(`${targetEmail} is already assigned to a party.`);
            return;
        }

        const party = parties.find(p => p.id === selectedPartyId);
        if (!party) return;

        setAssignments(prev => [...prev, {
            id: `assignment_${Date.now()}`,
            partyId: selectedPartyId,
            partyLabel: party.label,
            type: 'external',
            email: email.trim(),
            name: name.trim() || undefined,
            order: 0, // set at submit time from position
        }]);

        setSelectedPartyId('');
        setEmail('');
        setName('');
        setError(null);
    };

    const handleRemoveAssignment = (id: string) => {
        setAssignments(prev => prev.filter(a => a.id !== id));
    };

    const handleDragStart = (index: number) => setDraggedIndex(index);
    const handleDragOver = (e: React.DragEvent, index: number) => { e.preventDefault(); setDragOverIndex(index); };
    const handleDragEnd = () => { setDraggedIndex(null); setDragOverIndex(null); };
    const handleDrop = (_e: React.DragEvent, dropIndex: number) => {
        if (draggedIndex === null || draggedIndex === dropIndex) { setDraggedIndex(null); setDragOverIndex(null); return; }
        const reordered = [...assignments];
        const [moved] = reordered.splice(draggedIndex, 1);
        reordered.splice(dropIndex, 0, moved);
        setAssignments(reordered);
        setDraggedIndex(null);
        setDragOverIndex(null);
    };

    const handleSubmit = async () => {
        if (assignments.length === 0) { setError('Please add at least one assignment'); return; }

        // Gate: all internal party fields must be filled before external clients can sign
        if (formFields.length > 0) {
            const internalParties = parties.filter(p => (p as any).type === 'INTERNAL');
            if (internalParties.length > 0) {
                const internalPartyIds = new Set(internalParties.map(p => p.id));
                const missing: string[] = [];
                for (const field of formFields) {
                    if (!field.assignedParty || !internalPartyIds.has(field.assignedParty)) continue;
                    const val = fieldValues[field.name];
                    if (!val || String(val).trim() === '') missing.push(field.name);
                }
                if (missing.length > 0) {
                    setError(`Fill all internal party fields before assigning external signers. Unfilled: ${missing.join(', ')}`);
                    return;
                }
            }
        }

        setLoading(true);
        setError(null);
        try {
            const startOrder = existingMaxOrder > 0 ? existingMaxOrder + 1 : 1;
            const assignmentsWithOrders = assignments.map((a, i) => ({ ...a, order: startOrder + i }));
            const result = await onSubmit(assignmentsWithOrders);
            if (result.success) {
                setSuccess(true);
            } else {
                setError(result.error || 'Failed to create assignments');
            }
        } catch (err: any) {
            setError(err.message || 'An unexpected error occurred');
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        setAssignments([]);
        setSelectedPartyId('');
        setEmail('');
        setName('');
        setError(null);
        setSuccess(false);
        setLoading(false);
        setDraggedIndex(null);
        setDragOverIndex(null);
        onClose();
    };

    // ─── Render ───────────────────────────────────────────────────────────────

    const sectionBg = isDark ? 'rgba(255,255,255,0.05)' : '#f6faf6';
    const sectionBorder = isDark ? 'rgba(255,255,255,0.14)' : '#e2e8f0';

    return (
        <BaseDialog
            open={open}
            onClose={loading ? () => {} : handleClose}
            title={success ? 'Assignments Created' : 'Assign Signers'}
            maxWidth="md"
            actions={
                success ? (
                    <AppButton onClick={handleClose} variant="contained">Done</AppButton>
                ) : (
                    <>
                        <AppButton variant="outlined" onClick={handleClose} disabled={loading}>Cancel</AppButton>
                        <AppButton
                            onClick={handleSubmit}
                            variant="contained"
                            disabled={assignments.length === 0}
                            loading={loading}
                            startIcon={<Send />}
                        >
                            {loading ? 'Submitting…' : `Submit for Signatures`}
                        </AppButton>
                    </>
                )
            }
        >
            {contractTitle && (
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                    Contract: <strong>{contractTitle}</strong>
                </Typography>
            )}

            {/* ── Success state ──────────────────────────────────────────── */}
            {success ? (
                <Box>
                    <Alert severity="success" icon={<CheckCircle />} sx={{ mb: 2, borderRadius: 2 }}>
                        Signer assignments have been created successfully!
                    </Alert>
                    <Typography variant="body2" color="text.secondary">
                        External clients will receive a secure email with a signing link when it is their turn to sign.
                    </Typography>
                </Box>
            ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    {error && (
                        <Alert severity="error" sx={{ borderRadius: 2 }} onClose={() => setError(null)}>
                            {error}
                        </Alert>
                    )}

                    {/* ── Already assigned (existing signers) ───────────── */}
                    {(allExistingSigners.length > 0 || contractorFilledPartyIds.length > 0) && (
                        <Paper
                            elevation={0}
                            sx={{
                                px: 1.5, py: 1, borderRadius: 2,
                                bgcolor: isDark ? 'rgba(99,102,241,0.08)' : '#eff6ff',
                                border: '1px solid',
                                borderColor: isDark ? 'rgba(99,102,241,0.25)' : '#bfdbfe',
                            }}
                        >
                            <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', mb: 0.75, display: 'block' }}>
                                Already Assigned
                            </Typography>

                            {contractorFilledPartyIds.length > 0 && (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}>
                                    <BusinessCenter sx={{ color: 'primary.main', fontSize: 16 }} />
                                    <Typography variant="caption" fontWeight={600}>Filled by you:</Typography>
                                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                                        {contractorFilledPartyIds.map(pid => (
                                            <Chip
                                                key={pid}
                                                label={getPartyLabel(pid)}
                                                size="small"
                                                sx={{ bgcolor: getPartyColor(pid), color: '#fff', fontWeight: 600, height: 20, fontSize: '0.7rem' }}
                                            />
                                        ))}
                                    </Box>
                                </Box>
                            )}

                            {allExistingSigners.map((signer, idx) => (
                                <Box
                                    key={`${signer.signerKind}-${signer.partyId}`}
                                    sx={{
                                        display: 'flex', alignItems: 'center', gap: 1, py: 0.5,
                                        borderTop: idx > 0 || contractorFilledPartyIds.length > 0 ? '1px solid' : 'none',
                                        borderColor: 'divider',
                                    }}
                                >
                                    <Chip
                                        label={`#${signer.order}`}
                                        size="small"
                                        sx={{ bgcolor: 'grey.600', color: '#fff', fontWeight: 700, height: 20, fontSize: '0.7rem', minWidth: 28 }}
                                    />
                                    <Chip
                                        label={signer.partyLabel}
                                        size="small"
                                        sx={{ bgcolor: getPartyColor(signer.partyId), color: '#fff', fontWeight: 600, height: 20, fontSize: '0.7rem' }}
                                    />
                                    <Email sx={{ color: 'warning.main', fontSize: 16, flexShrink: 0 }} />
                                    <Typography variant="caption" fontWeight={500} noWrap sx={{ flex: 1 }}>{signer.email}</Typography>
                                    <Chip
                                        label={signer.status}
                                        size="small"
                                        sx={{
                                            textTransform: 'capitalize', height: 20, fontSize: '0.65rem', fontWeight: 600,
                                            bgcolor: signer.status === 'completed'
                                                ? (isDark ? alpha('#22c55e', 0.15) : '#e8f5e9')
                                                : signer.status === 'unlocked'
                                                    ? (isDark ? alpha('#3b82f6', 0.15) : '#e3f2fd')
                                                    : (isDark ? alpha('#f97316', 0.15) : '#fff3e0'),
                                            color: signer.status === 'completed'
                                                ? (isDark ? '#86efac' : '#2e7d32')
                                                : signer.status === 'unlocked'
                                                    ? (isDark ? '#93c5fd' : '#1565c0')
                                                    : (isDark ? '#fdba74' : '#e65100'),
                                        }}
                                    />
                                </Box>
                            ))}
                        </Paper>
                    )}

                    {/* ── Add assignment form ───────────────────────────── */}
                    {availableParties.length > 0 ? (
                        <Paper
                            elevation={0}
                            sx={{ p: 2, borderRadius: 2, bgcolor: sectionBg, border: '1px solid', borderColor: sectionBorder }}
                        >
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                                <Groups sx={{ color: 'primary.main', fontSize: 20 }} />
                                <Typography variant="subtitle2">Add Signer Assignment</Typography>
                            </Box>

                            {/* Party selector */}
                            <FormControl size="small" fullWidth sx={{ mb: 2 }}>
                                <InputLabel>Party</InputLabel>
                                <Select
                                    value={selectedPartyId}
                                    onChange={(e) => setSelectedPartyId(e.target.value)}
                                    label="Party"
                                    disabled={loading}
                                    sx={{ bgcolor: 'background.paper' }}
                                >
                                    {availableParties.map((party) => (
                                        <MenuItem key={party.id} value={party.id}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <Chip
                                                    label={party.label}
                                                    size="small"
                                                    sx={{ bgcolor: party.color, color: '#fff', fontWeight: 600 }}
                                                />
                                            </Box>
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>

                            {/* Email + Name + Add button */}
                            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                                <TextField
                                    size="small"
                                    label="Email *"
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddAssignment(); }}
                                    placeholder="client@example.com"
                                    error={email !== '' && !isValidEmail(email)}
                                    sx={{ flex: '1 1 220px', minWidth: 200, '& .MuiOutlinedInput-root': { bgcolor: 'background.paper' } }}
                                    disabled={loading}
                                />
                                <TextField
                                    size="small"
                                    label="Name (optional)"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddAssignment(); }}
                                    placeholder="Client Name"
                                    sx={{ flex: '1 1 160px', minWidth: 150, '& .MuiOutlinedInput-root': { bgcolor: 'background.paper' } }}
                                    disabled={loading}
                                />
                                <AppButton
                                    variant="outlined"
                                    onClick={handleAddAssignment}
                                    disabled={loading || !selectedPartyId || !email.trim()}
                                    startIcon={<Add />}
                                    sx={{
                                        height: 40, flexShrink: 0,
                                        borderColor: 'primary.main', color: 'primary.main',
                                        '&:hover': { borderColor: 'primary.dark', bgcolor: alpha(theme.palette.primary.main, 0.08) },
                                    }}
                                >
                                    Add
                                </AppButton>
                            </Box>
                        </Paper>
                    ) : availableParties.length === 0 && (existingExternalSigners.length > 0 || existingInternalSigners.length > 0) ? (
                        <Paper
                            elevation={0}
                            sx={{ p: 2, borderRadius: 2, textAlign: 'center', bgcolor: sectionBg, border: '1px solid', borderColor: sectionBorder }}
                        >
                            <CheckCircle sx={{ fontSize: 36, color: 'primary.main', mb: 1 }} />
                            <Typography variant="body2" fontWeight={600}>All parties have been assigned</Typography>
                        </Paper>
                    ) : null}

                    {/* ── New assignments list ──────────────────────────── */}
                    {assignments.length > 0 && (
                        <Paper
                            elevation={0}
                            sx={{ p: 2, borderRadius: 2, bgcolor: 'background.paper', border: '1px solid', borderColor: 'primary.main' }}
                        >
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                <Typography variant="subtitle2" sx={{ color: 'primary.main' }}>New Assignments</Typography>
                                <Chip label={assignments.length} size="small" sx={{ bgcolor: 'primary.main', color: '#fff', fontWeight: 700, height: 20 }} />
                                {existingMaxOrder > 0 && (
                                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                                        Continuing from order {existingMaxOrder + 1}
                                    </Typography>
                                )}
                                <Typography variant="caption" color="text.disabled" sx={{ ml: 'auto' }}>
                                    Drag to reorder
                                </Typography>
                            </Box>

                            <List dense disablePadding>
                                {assignments.map((assignment, index) => {
                                    const startOrder = existingMaxOrder > 0 ? existingMaxOrder + 1 : 1;
                                    const computedOrder = startOrder + index;
                                    const isDragging = draggedIndex === index;
                                    const isOver = dragOverIndex === index && draggedIndex !== index;
                                    return (
                                        <ListItem
                                            key={assignment.id}
                                            divider={index < assignments.length - 1}
                                            draggable
                                            onDragStart={() => handleDragStart(index)}
                                            onDragOver={(e) => handleDragOver(e, index)}
                                            onDrop={(e) => handleDrop(e, index)}
                                            onDragEnd={handleDragEnd}
                                            sx={{
                                                py: 1, cursor: 'grab',
                                                opacity: isDragging ? 0.35 : 1,
                                                borderTop: isOver ? '2px solid' : undefined,
                                                borderTopColor: isOver ? 'primary.main' : undefined,
                                                transition: 'opacity 0.15s',
                                                userSelect: 'none',
                                            }}
                                        >
                                            <DragIndicator sx={{ color: 'grey.400', fontSize: 20, mr: 0.5, flexShrink: 0 }} />
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mr: 2, flexShrink: 0 }}>
                                                <Chip
                                                    label={`#${computedOrder}`}
                                                    size="small"
                                                    sx={{ bgcolor: 'grey.700', color: '#fff', fontWeight: 700, height: 22, minWidth: 32 }}
                                                />
                                                <Chip
                                                    label={assignment.partyLabel}
                                                    size="small"
                                                    sx={{ bgcolor: getPartyColor(assignment.partyId), color: '#fff', fontWeight: 600 }}
                                                />
                                            </Box>
                                            <Email sx={{ color: 'warning.main', fontSize: 16, mr: 0.75, flexShrink: 0 }} />
                                            <ListItemText
                                                primary={assignment.email}
                                                secondary={assignment.name || undefined}
                                                slotProps={{
                                                    primary: { sx: { fontWeight: 500, fontSize: '0.9rem' } },
                                                    secondary: { sx: { fontSize: '0.75rem' } },
                                                }}
                                            />
                                            <IconButton
                                                edge="end"
                                                onClick={() => handleRemoveAssignment(assignment.id)}
                                                disabled={loading}
                                                size="small"
                                                sx={{ color: 'error.main', opacity: 0.7, '&:hover': { opacity: 1 } }}
                                            >
                                                <Delete />
                                            </IconButton>
                                        </ListItem>
                                    );
                                })}
                            </List>
                        </Paper>
                    )}

                    {/* ── Empty state ───────────────────────────────────── */}
                    {assignments.length === 0 && availableParties.length > 0 && (
                        <Paper
                            variant="outlined"
                            sx={{ p: 3, textAlign: 'center', bgcolor: 'background.paper', borderStyle: 'dashed', borderColor: 'divider', borderRadius: 2 }}
                        >
                            <Groups sx={{ fontSize: 44, color: 'grey.300', mb: 1 }} />
                            <Typography variant="body2" color="text.secondary" fontWeight={500}>
                                No assignments added yet
                            </Typography>
                            <Typography variant="caption" color="text.disabled">
                                Select a party and enter the client's email to add an assignment
                            </Typography>
                        </Paper>
                    )}
                </Box>
            )}
        </BaseDialog>
    );
};

export default MultiPartySignatureDialog;

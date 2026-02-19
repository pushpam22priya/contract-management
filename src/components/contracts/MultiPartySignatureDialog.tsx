'use client';

/**
 * MultiPartySignatureDialog
 *
 * Dialog for sending a contract to multiple external parties for signature.
 * Each recipient is assigned to a specific party and can only edit fields
 * assigned to their party.
 */

import { useState, useEffect } from 'react';
import {
    Button,
    TextField,
    Box,
    Typography,
    CircularProgress,
    Alert,
    IconButton,
    Chip,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
    Divider,
    List,
    ListItem,
    ListItemText,
    ListItemSecondaryAction,
    Paper,
    Checkbox,
    ListItemIcon,
} from '@mui/material';
import {
    Email,
    Send,
    CheckCircle,
    ContentCopy,
    Add,
    Delete,
    Person,
    Warning,
    BusinessCenter,
    Groups,
    Info,
    Description,
} from '@mui/icons-material';
import BaseDialog from '@/components/common/BaseDialog';
import { PartyConfiguration } from '@/types/template';
import { ExternalSigner } from '@/types/contract';
import { SignatureRecipient, MultiPartySubmitResult } from '@/services/externalSignatureService';

interface MultiPartySignatureDialogProps {
    open: boolean;
    onClose: () => void;
    onSubmit: (
        recipients: SignatureRecipient[]
    ) => Promise<MultiPartySubmitResult>;
    contractTitle?: string;
    parties: PartyConfiguration[];
    formFields?: any[];  // To check which parties have fields
    existingSigners?: ExternalSigner[];  // Previously sent signers
    fieldValues?: Record<string, string>;  // Current field values to detect filled parties
}

interface RecipientEntry {
    id: string;
    email: string;
    name: string;
    partyIds: string[];  // Multiple parties per signer
}

const MultiPartySignatureDialog = ({
    open,
    onClose,
    onSubmit,
    contractTitle,
    parties,
    formFields = [],
    existingSigners = [],
    fieldValues = {},
}: MultiPartySignatureDialogProps) => {
    // Form state
    const [recipients, setRecipients] = useState<RecipientEntry[]>([]);
    const [newEmail, setNewEmail] = useState('');
    const [newName, setNewName] = useState('');
    const [newPartyIds, setNewPartyIds] = useState<string[]>([]);

    // UI state
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [result, setResult] = useState<MultiPartySubmitResult | null>(null);

    console.log('🖥️ [MultiPartySignatureDialog] Rendered');
    console.log('   Parties:', parties?.length || 0);
    console.log('   Form fields:', formFields?.length || 0);

    // Get parties that have fields assigned
    const partiesWithFields = parties.filter(party => {
        return formFields.some(field => field.assignedParty === party.id);
    });

    console.log('   Parties with fields:', partiesWithFields.map(p => p.label).join(', '));

    // Get party IDs already assigned to existing (previously sent) signers
    const existingPartyIds = existingSigners.flatMap(s => {
        if (Array.isArray(s.partyId)) return s.partyId;
        return s.partyId ? [s.partyId] : [];
    });

    // Detect parties whose fields are ALL filled by the contractor
    const contractorFilledPartyIds = partiesWithFields
        .filter(party => {
            // Skip parties already sent to external signers
            if (existingPartyIds.includes(party.id)) return false;
            // Get all fields for this party
            const partyFields = formFields.filter(f => f.assignedParty === party.id);
            if (partyFields.length === 0) return false;
            // Check if ALL fields have non-empty values
            return partyFields.every(f => {
                const val = fieldValues[f.name];
                return val !== undefined && val !== null && val !== '';
            });
        })
        .map(p => p.id);

    // Available parties = have fields, not already sent, not already filled by contractor
    const availablePartiesForSigners = partiesWithFields.filter(
        p => !existingPartyIds.includes(p.id) && !contractorFilledPartyIds.includes(p.id)
    );

    // Get parties already assigned to NEW recipients (flatten all partyIds)
    const assignedPartyIds = recipients.flatMap(r => r.partyIds);

    // All assigned (existing + new)
    const allAssignedPartyIds = [...existingPartyIds, ...assignedPartyIds];

    /**
     * Validate email format
     */
    const isValidEmail = (email: string): boolean => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    };

    /**
     * Add a new recipient
     */
    const handleAddRecipient = () => {
        console.log('➕ [MultiPartySignatureDialog] Adding recipient:', newEmail, newPartyIds);

        if (!newEmail.trim()) {
            setError('Please enter an email address');
            return;
        }

        if (!isValidEmail(newEmail)) {
            setError('Please enter a valid email address');
            return;
        }

        if (newPartyIds.length === 0) {
            setError('Please select at least one party for this signer');
            return;
        }

        // Check if any selected party is already assigned to another signer
        const alreadyAssigned = newPartyIds.filter(pid => assignedPartyIds.includes(pid));
        if (alreadyAssigned.length > 0) {
            const labels = alreadyAssigned.map(pid => parties.find(p => p.id === pid)?.label || pid).join(', ');
            setError(`Party ${labels} is already assigned to another signer`);
            return;
        }

        // Check if email is already used
        if (recipients.some(r => r.email.toLowerCase() === newEmail.toLowerCase())) {
            setError('This email is already added');
            return;
        }

        setRecipients([
            ...recipients,
            {
                id: `recipient_${Date.now()}`,
                email: newEmail.trim(),
                name: newName.trim(),
                partyIds: newPartyIds,
            }
        ]);

        // Reset inputs
        setNewEmail('');
        setNewName('');
        setNewPartyIds([]);
        setError(null);

        console.log('✅ [MultiPartySignatureDialog] Recipient added');
    };

    /**
     * Remove a recipient
     */
    const handleRemoveRecipient = (id: string) => {
        console.log('➖ [MultiPartySignatureDialog] Removing recipient:', id);
        setRecipients(recipients.filter(r => r.id !== id));
    };

    /**
     * Handle form submission
     */
    const handleSubmit = async () => {
        console.log('📤 [MultiPartySignatureDialog] Submit clicked');
        console.log('   Recipients:', recipients.length);

        if (recipients.length === 0) {
            setError('Please add at least one recipient');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const signatureRecipients: SignatureRecipient[] = recipients.map(r => {
                const partyLabels = r.partyIds.map(pid => {
                    const party = parties.find(p => p.id === pid);
                    return party?.label || pid;
                });
                return {
                    email: r.email,
                    name: r.name || undefined,
                    partyId: r.partyIds,
                    partyLabel: partyLabels,
                };
            });

            console.log('📤 [MultiPartySignatureDialog] Calling onSubmit...');
            const submitResult = await onSubmit(
                signatureRecipients
            );

            if (submitResult.success) {
                console.log('✅ [MultiPartySignatureDialog] Submission successful');
                setSuccess(true);
                setResult(submitResult);
            } else {
                console.error('❌ [MultiPartySignatureDialog] Submission failed:', submitResult.error);
                setError(submitResult.error || 'Failed to send signature requests');
            }
        } catch (err: any) {
            console.error('❌ [MultiPartySignatureDialog] Error:', err);
            setError(err.message || 'An unexpected error occurred');
        } finally {
            setLoading(false);
        }
    };

    /**
     * Copy URL to clipboard
     */
    const handleCopyUrl = async (url: string) => {
        await navigator.clipboard.writeText(url);
        console.log('📋 [MultiPartySignatureDialog] URL copied');
    };

    /**
     * Handle dialog close - reset state
     */
    const handleClose = () => {
        console.log('🚪 [MultiPartySignatureDialog] Closing dialog');
        setRecipients([]);
        setNewEmail('');
        setNewName('');
        setNewPartyIds([]);
        setError(null);
        setSuccess(false);
        setResult(null);
        setLoading(false);
        onClose();
    };

    /**
     * Get party color by ID
     */
    const getPartyColor = (partyId: string): string => {
        const party = parties.find(p => p.id === partyId);
        return party?.color || '#666';
    };

    /**
     * Get party label by ID
     */
    const getPartyLabel = (partyId: string): string => {
        const party = parties.find(p => p.id === partyId);
        return party?.label || partyId;
    };

    return (
        <BaseDialog
            open={open}
            onClose={loading ? () => { } : handleClose}
            title={success ? 'Signature Requests Sent!' : 'Send for Signatures'}
            maxWidth="md"
            actions={
                success ? (
                    <Button onClick={handleClose} variant="contained">
                        Done
                    </Button>
                ) : (
                    <>
                        <Button onClick={handleClose} disabled={loading}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSubmit}
                            variant="contained"
                            disabled={loading || recipients.length === 0}
                            startIcon={loading ? <CircularProgress size={20} /> : <Send />}
                        >
                            {loading ? 'Sending...' : `Send to ${recipients.length} Recipient${recipients.length !== 1 ? 's' : ''}`}
                        </Button>
                    </>
                )
            }
        >
            {/* Contract Title */}
            {contractTitle && (
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    Contract: <strong>{contractTitle}</strong>
                </Typography>
            )}

            {/* Success State */}
            {success && result ? (
                <Box>
                    <Alert severity="success" icon={<CheckCircle />} sx={{ mb: 2 }}>
                        Signature requests have been sent to {result.signers?.length} recipient(s)
                    </Alert>

                    <Typography variant="body2" sx={{ mb: 2 }}>
                        Each recipient will receive an email with a link to fill and sign their assigned fields.
                        You will be able to track their progress from the contract details page.
                    </Typography>

                    {/* List of sent requests */}
                    <Typography variant="subtitle2" sx={{ mt: 3, mb: 1 }}>
                        Signing Links:
                    </Typography>
                    <Paper variant="outlined" sx={{ maxHeight: 300, overflow: 'auto' }}>
                        <List dense>
                            {result.signers?.map((signer, index) => (
                                <ListItem key={index} divider={index < (result.signers?.length || 0) - 1}>
                                    <Chip
                                        label={signer.partyLabel}
                                        size="small"
                                        sx={{
                                            bgcolor: getPartyColor(signer.partyId),
                                            color: '#fff',
                                            fontWeight: 600,
                                            mr: 2,
                                            minWidth: 40,
                                        }}
                                    />
                                    <ListItemText
                                        primary={signer.email}
                                        secondary={
                                            <Typography
                                                variant="caption"
                                                component="span"
                                                sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}
                                            >
                                                {signer.signingUrl}
                                            </Typography>
                                        }
                                    />
                                    <ListItemSecondaryAction>
                                        <IconButton
                                            size="small"
                                            onClick={() => handleCopyUrl(signer.signingUrl)}
                                            title="Copy link"
                                        >
                                            <ContentCopy fontSize="small" />
                                        </IconButton>
                                    </ListItemSecondaryAction>
                                </ListItem>
                            ))}
                        </List>
                    </Paper>
                </Box>
            ) : (
                /* Input State */
                <Box>

                    {/* Error Alert */}
                    {error && (
                        <Alert severity="error" sx={{ mb: 1 }} onClose={() => setError(null)}>
                            {error}
                        </Alert>
                    )}
                    {/* ── Contractor-Filled & Existing Signers (compact) ── */}
                    {(contractorFilledPartyIds.length > 0 || existingSigners.length > 0) && (
                        <Paper
                            elevation={0}
                            sx={{
                                mb: 1,
                                px: 1.5,
                                py: 1,
                                borderRadius: 2,
                                bgcolor: '#eff9ffff',
                                border: '1px solid',
                                borderColor: 'grey.200',
                                maxHeight: '120px',
                                overflowY: 'auto',
                            }}
                        >
                            {/* Filled by You row */}
                            {contractorFilledPartyIds.length > 0 && (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}>
                                    <BusinessCenter sx={{ color: 'primary.main', fontSize: 16 }} />
                                    <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', minWidth: 70 }}>
                                        Filled by you
                                    </Typography>
                                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                                        {contractorFilledPartyIds.map(pid => (
                                            <Chip key={pid} label={getPartyLabel(pid)} size="small"
                                                sx={{ bgcolor: getPartyColor(pid), color: '#fff', fontWeight: 600, height: 20, fontSize: '0.7rem' }}
                                            />
                                        ))}
                                    </Box>
                                </Box>
                            )}

                            {/* Existing signers rows */}
                            {existingSigners.map((signer, index) => {
                                const signerPartyIds = Array.isArray(signer.partyId) ? signer.partyId : [signer.partyId];
                                return (
                                    <Box key={signer.token} sx={{
                                        display: 'flex', alignItems: 'center', gap: 1, py: 0.5,
                                        borderTop: (contractorFilledPartyIds.length > 0 || index > 0) ? '1px solid' : 'none',
                                        borderColor: 'grey.200',
                                    }}>
                                        <Email sx={{ color: 'primary.main', fontSize: 16 }} />
                                        <Box sx={{ display: 'flex', gap: 0.4, mr: 0.5 }}>
                                            {signerPartyIds.map(pid => (
                                                <Chip key={pid} label={getPartyLabel(pid)} size="small"
                                                    sx={{ bgcolor: getPartyColor(pid), color: '#fff', fontWeight: 600, height: 20, fontSize: '0.7rem' }}
                                                />
                                            ))}
                                        </Box>
                                        <Typography variant="caption" sx={{ fontWeight: 500, flexGrow: 1 }} noWrap>
                                            {signer.email}
                                        </Typography>
                                        <Chip
                                            label={signer.status}
                                            size="small"
                                            sx={{
                                                textTransform: 'capitalize', height: 20, fontSize: '0.65rem', fontWeight: 600,
                                                bgcolor: signer.status === 'completed' ? '#e8f5e9' : signer.status === 'viewed' ? '#e3f2fd' : '#fff3e0',
                                                color: signer.status === 'completed' ? '#2e7d32' : signer.status === 'viewed' ? '#1565c0' : '#e65100',
                                            }}
                                        />
                                    </Box>
                                );
                            })}
                        </Paper>
                    )}

                    {/* ── Add New Signers ── */}
                    {availablePartiesForSigners.length > 0 ? (
                        <Paper
                            elevation={0}
                            sx={{
                                p: 2,
                                borderRadius: 2,
                                bgcolor: '#f6faf6',
                                border: '1px solid',
                                borderColor: 'grey.200',
                            }}
                        >
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                                <Groups sx={{ color: '#2e7d32', fontSize: 20 }} />
                                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.primary' }}>
                                    {existingSigners.length > 0 ? 'Add More Signers' : 'External Signers'}
                                </Typography>
                                {recipients.length > 0 && (
                                    <Chip
                                        label={recipients.length}
                                        size="small"
                                        sx={{
                                            ml: 'auto',
                                            bgcolor: '#2e7d32',
                                            color: '#fff',
                                            fontWeight: 700,
                                        }}
                                    />
                                )}
                            </Box>

                            <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
                                <TextField
                                    size="small"
                                    label="Email"
                                    type="email"
                                    value={newEmail}
                                    onChange={(e) => setNewEmail(e.target.value)}
                                    placeholder="client@example.com"
                                    sx={{ flex: '1 1 200px', minWidth: 200, '& .MuiOutlinedInput-root': { bgcolor: '#fff' } }}
                                    disabled={loading}
                                />
                                <TextField
                                    size="small"
                                    label="Name (optional)"
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    placeholder="Client Name"
                                    sx={{ flex: '1 1 150px', minWidth: 150, '& .MuiOutlinedInput-root': { bgcolor: '#fff' } }}
                                    disabled={loading}
                                />
                                <FormControl size="small" sx={{ flex: '1 1 200px', minWidth: 200 }}>
                                    <InputLabel>Parties</InputLabel>
                                    <Select
                                        multiple
                                        value={newPartyIds}
                                        onChange={(e) => {
                                            const value = e.target.value;
                                            setNewPartyIds(typeof value === 'string' ? value.split(',') : value);
                                        }}
                                        label="Parties"
                                        disabled={loading}
                                        sx={{ bgcolor: '#fff' }}
                                        renderValue={(selected) => (
                                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                                {selected.map((id) => (
                                                    <Chip
                                                        key={id}
                                                        label={getPartyLabel(id)}
                                                        size="small"
                                                        onDelete={() => setNewPartyIds(prev => prev.filter(p => p !== id))}
                                                        onMouseDown={(e) => e.stopPropagation()}
                                                        sx={{
                                                            bgcolor: getPartyColor(id),
                                                            color: '#fff',
                                                            fontWeight: 600,
                                                            height: 20,
                                                            '& .MuiChip-deleteIcon': { color: 'rgba(255,255,255,0.7)', '&:hover': { color: '#fff' } },
                                                        }}
                                                    />
                                                ))}
                                            </Box>
                                        )}
                                    >
                                        {availablePartiesForSigners.map((party) => (
                                            <MenuItem
                                                key={party.id}
                                                value={party.id}
                                                disabled={assignedPartyIds.includes(party.id)}
                                            >
                                                <Checkbox checked={newPartyIds.includes(party.id)} size="small" />
                                                <Chip
                                                    label={party.label}
                                                    size="small"
                                                    sx={{
                                                        bgcolor: party.color,
                                                        color: '#fff',
                                                        fontWeight: 600,
                                                        minWidth: 32,
                                                    }}
                                                />
                                            </MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                                <Button
                                    variant="outlined"
                                    onClick={handleAddRecipient}
                                    disabled={loading || !newEmail || newPartyIds.length === 0}
                                    startIcon={<Add />}
                                    sx={{ height: 40, borderColor: '#2e7d32', color: '#2e7d32', '&:hover': { borderColor: '#1b5e20', bgcolor: '#e8f5e9' } }}
                                >
                                    Add
                                </Button>
                            </Box>

                            {recipients.length > 0 ? (
                                <Paper variant="outlined" sx={{ mb: 2, bgcolor: '#fff', borderRadius: 1.5 }}>
                                    <List dense>
                                        {recipients.map((recipient, index) => (
                                            <ListItem
                                                key={recipient.id}
                                                divider={index < recipients.length - 1}
                                                sx={{ '&:hover': { bgcolor: 'grey.50' }, transition: 'background-color 0.15s' }}
                                            >
                                                <Box sx={{ display: 'flex', gap: 0.5, mr: 2, flexWrap: 'wrap' }}>
                                                    {recipient.partyIds.map(pid => (
                                                        <Chip
                                                            key={pid}
                                                            label={getPartyLabel(pid)}
                                                            size="small"
                                                            sx={{
                                                                bgcolor: getPartyColor(pid),
                                                                color: '#fff',
                                                                fontWeight: 600,
                                                                minWidth: 32,
                                                            }}
                                                        />
                                                    ))}
                                                </Box>
                                                <ListItemText
                                                    primary={recipient.email}
                                                    secondary={recipient.name || 'No name provided'}
                                                    primaryTypographyProps={{ fontWeight: 500 }}
                                                />
                                                <ListItemSecondaryAction>
                                                    <IconButton
                                                        edge="end"
                                                        onClick={() => handleRemoveRecipient(recipient.id)}
                                                        disabled={loading}
                                                        size="small"
                                                        sx={{ color: 'error.light', '&:hover': { color: 'error.main', bgcolor: 'error.50' } }}
                                                    >
                                                        <Delete />
                                                    </IconButton>
                                                </ListItemSecondaryAction>
                                            </ListItem>
                                        ))}
                                    </List>
                                </Paper>
                            ) : (
                                <Paper
                                    variant="outlined"
                                    sx={{
                                        p: 2,
                                        mb: 2,
                                        textAlign: 'center',
                                        bgcolor: '#fff',
                                        borderStyle: 'dashed',
                                        borderColor: 'grey.300',
                                        borderRadius: 2,
                                    }}
                                >
                                    <Groups sx={{ fontSize: 44, color: 'grey.300', mb: 1 }} />
                                    <Typography variant="body2" color="text.secondary" fontWeight={500}>
                                        No recipients added yet
                                    </Typography>
                                    <Typography variant="caption" color="text.disabled">
                                        Add external signers using the form above
                                    </Typography>
                                </Paper>
                            )}
                        </Paper>
                    ) : existingSigners.length > 0 ? (
                        <Paper
                            elevation={0}
                            sx={{
                                p: 2,
                                borderRadius: 2,
                                textAlign: 'center',
                                bgcolor: '#f6faf6',
                                border: '1px solid',
                                borderColor: 'grey.200',
                            }}
                        >
                            <CheckCircle sx={{ fontSize: 36, color: 'primary.main', mb: 1 }} />
                            <Typography variant="body2" fontWeight={600} color="text.primary">
                                All parties have been assigned
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                Every party with fields has a signer assigned.
                            </Typography>
                        </Paper>
                    ) : null}

                </Box>
            )
            }
        </BaseDialog >
    );
};

export default MultiPartySignatureDialog;

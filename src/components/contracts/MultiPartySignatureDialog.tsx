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
} from '@mui/icons-material';
import BaseDialog from '@/components/common/BaseDialog';
import { PartyConfiguration } from '@/types/template';
import { SignatureRecipient, MultiPartySubmitResult } from '@/services/externalSignatureService';

interface MultiPartySignatureDialogProps {
    open: boolean;
    onClose: () => void;
    onSubmit: (
        recipients: SignatureRecipient[],
        contractorParty?: string
    ) => Promise<MultiPartySubmitResult>;
    contractTitle?: string;
    parties: PartyConfiguration[];
    formFields?: any[];  // To check which parties have fields
}

interface RecipientEntry {
    id: string;
    email: string;
    name: string;
    partyId: string;
}

const MultiPartySignatureDialog = ({
    open,
    onClose,
    onSubmit,
    contractTitle,
    parties,
    formFields = [],
}: MultiPartySignatureDialogProps) => {
    // Form state
    const [recipients, setRecipients] = useState<RecipientEntry[]>([]);
    const [contractorParty, setContractorParty] = useState<string>('');
    const [newEmail, setNewEmail] = useState('');
    const [newName, setNewName] = useState('');
    const [newPartyId, setNewPartyId] = useState('');

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

    // Get available parties for external signers (excluding contractor party)
    const availablePartiesForSigners = partiesWithFields.filter(
        p => p.id !== contractorParty
    );

    // Get parties already assigned to recipients
    const assignedPartyIds = recipients.map(r => r.partyId);

    // Get unassigned parties (for warnings)
    const unassignedParties = partiesWithFields.filter(
        p => p.id !== contractorParty && !assignedPartyIds.includes(p.id)
    );

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
        console.log('➕ [MultiPartySignatureDialog] Adding recipient:', newEmail, newPartyId);

        if (!newEmail.trim()) {
            setError('Please enter an email address');
            return;
        }

        if (!isValidEmail(newEmail)) {
            setError('Please enter a valid email address');
            return;
        }

        if (!newPartyId) {
            setError('Please select a party for this signer');
            return;
        }

        // Check if party is already assigned
        if (assignedPartyIds.includes(newPartyId)) {
            setError('This party is already assigned to another signer');
            return;
        }

        // Check if email is already used
        if (recipients.some(r => r.email.toLowerCase() === newEmail.toLowerCase())) {
            setError('This email is already added');
            return;
        }

        const party = parties.find(p => p.id === newPartyId);

        setRecipients([
            ...recipients,
            {
                id: `recipient_${Date.now()}`,
                email: newEmail.trim(),
                name: newName.trim(),
                partyId: newPartyId,
            }
        ]);

        // Reset inputs
        setNewEmail('');
        setNewName('');
        setNewPartyId('');
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
        console.log('   Contractor party:', contractorParty);

        if (recipients.length === 0) {
            setError('Please add at least one recipient');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const signatureRecipients: SignatureRecipient[] = recipients.map(r => {
                const party = parties.find(p => p.id === r.partyId);
                return {
                    email: r.email,
                    name: r.name || undefined,
                    partyId: r.partyId,
                    partyLabel: party?.label || r.partyId,
                };
            });

            console.log('📤 [MultiPartySignatureDialog] Calling onSubmit...');
            const submitResult = await onSubmit(
                signatureRecipients,
                contractorParty || undefined
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
        setContractorParty('');
        setNewEmail('');
        setNewName('');
        setNewPartyId('');
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
            onClose={loading ? () => {} : handleClose}
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
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Contract: <strong>{contractTitle}</strong>
                </Typography>
            )}

            {/* Success State */}
            {success && result ? (
                <Box>
                    <Alert severity="success" icon={<CheckCircle />} sx={{ mb: 3 }}>
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
                    <Typography variant="body2" sx={{ mb: 3 }}>
                        Add external signers and assign each one to a party. Each signer will only be able
                        to fill the fields assigned to their party.
                    </Typography>

                    {/* Error Alert */}
                    {error && (
                        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
                            {error}
                        </Alert>
                    )}

                    {/* Contractor Party Selection */}
                    <Box sx={{ mb: 3 }}>
                        <FormControl fullWidth size="small">
                            <InputLabel>Your Party (Contractor fills)</InputLabel>
                            <Select
                                value={contractorParty}
                                onChange={(e) => setContractorParty(e.target.value)}
                                label="Your Party (Contractor fills)"
                            >
                                <MenuItem value="">
                                    <em>None - External signers fill all parties</em>
                                </MenuItem>
                                {partiesWithFields.map((party) => (
                                    <MenuItem
                                        key={party.id}
                                        value={party.id}
                                        disabled={assignedPartyIds.includes(party.id)}
                                    >
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
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
                                            <Typography variant="body2">
                                                {party.label} (I will fill these fields)
                                            </Typography>
                                        </Box>
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Box>

                    <Divider sx={{ my: 2 }} />

                    {/* Add Recipient Form */}
                    <Typography variant="subtitle2" sx={{ mb: 2 }}>
                        External Signers
                    </Typography>

                    <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
                        <TextField
                            size="small"
                            label="Email"
                            type="email"
                            value={newEmail}
                            onChange={(e) => setNewEmail(e.target.value)}
                            placeholder="client@example.com"
                            sx={{ flex: '1 1 200px', minWidth: 200 }}
                            disabled={loading}
                        />
                        <TextField
                            size="small"
                            label="Name (optional)"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            placeholder="Client Name"
                            sx={{ flex: '1 1 150px', minWidth: 150 }}
                            disabled={loading}
                        />
                        <FormControl size="small" sx={{ flex: '1 1 150px', minWidth: 150 }}>
                            <InputLabel>Party</InputLabel>
                            <Select
                                value={newPartyId}
                                onChange={(e) => setNewPartyId(e.target.value)}
                                label="Party"
                                disabled={loading}
                            >
                                {availablePartiesForSigners.map((party) => (
                                    <MenuItem
                                        key={party.id}
                                        value={party.id}
                                        disabled={assignedPartyIds.includes(party.id)}
                                    >
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
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
                                        </Box>
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        <Button
                            variant="outlined"
                            onClick={handleAddRecipient}
                            disabled={loading || !newEmail || !newPartyId}
                            startIcon={<Add />}
                            sx={{ height: 40 }}
                        >
                            Add
                        </Button>
                    </Box>

                    {/* Recipients List */}
                    {recipients.length > 0 ? (
                        <Paper variant="outlined" sx={{ mb: 2 }}>
                            <List dense>
                                {recipients.map((recipient, index) => (
                                    <ListItem
                                        key={recipient.id}
                                        divider={index < recipients.length - 1}
                                    >
                                        <Chip
                                            label={getPartyLabel(recipient.partyId)}
                                            size="small"
                                            sx={{
                                                bgcolor: getPartyColor(recipient.partyId),
                                                color: '#fff',
                                                fontWeight: 600,
                                                mr: 2,
                                                minWidth: 40,
                                            }}
                                        />
                                        <ListItemText
                                            primary={recipient.email}
                                            secondary={recipient.name || 'No name provided'}
                                        />
                                        <ListItemSecondaryAction>
                                            <IconButton
                                                edge="end"
                                                onClick={() => handleRemoveRecipient(recipient.id)}
                                                disabled={loading}
                                                size="small"
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
                                p: 3,
                                mb: 2,
                                textAlign: 'center',
                                bgcolor: 'grey.50',
                            }}
                        >
                            <Person sx={{ fontSize: 40, color: 'grey.400', mb: 1 }} />
                            <Typography variant="body2" color="text.secondary">
                                No recipients added yet. Add signers above.
                            </Typography>
                        </Paper>
                    )}

                    {/* Unassigned Parties Warning */}
                    {unassignedParties.length > 0 && (
                        <Alert severity="warning" icon={<Warning />} sx={{ mt: 2 }}>
                            <Box component="div" sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.5 }}>
                                <Typography variant="body2" component="span">
                                    The following parties have fields but no signer assigned:
                                </Typography>
                                {unassignedParties.map((p) => (
                                    <Chip
                                        key={p.id}
                                        label={p.label}
                                        size="small"
                                        sx={{
                                            bgcolor: p.color,
                                            color: '#fff',
                                            fontWeight: 600,
                                            height: 20,
                                            fontSize: '0.7rem',
                                        }}
                                    />
                                ))}
                            </Box>
                        </Alert>
                    )}

                    {/* Info Text */}
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
                        Each signer will receive an email with a unique link. They can fill and sign
                        their assigned fields without creating an account.
                    </Typography>
                </Box>
            )}
        </BaseDialog>
    );
};

export default MultiPartySignatureDialog;

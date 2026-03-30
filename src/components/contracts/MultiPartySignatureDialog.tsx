'use client';

/**
 * MultiPartySignatureDialog
 *
 * Dialog for assigning contract parties to internal users or external clients for signature.
 * Each party is assigned to exactly ONE signer with a specific order.
 * - Internal users: See the contract in their Signatures page
 * - External clients: Receive email with signing link
 *
 * Order is auto-assigned based on position in the new assignments list.
 * Drag-and-drop reordering is supported in the new assignments section.
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
    List,
    ListItem,
    ListItemText,
    Paper,
    ToggleButton,
    ToggleButtonGroup,
    Autocomplete,
} from '@mui/material';
import {
    Send,
    CheckCircle,
    Add,
    Delete,
    Person,
    Email,
    BusinessCenter,
    Groups,
    DragIndicator,
} from '@mui/icons-material';
import BaseDialog from '@/components/common/BaseDialog';
import { PartyConfiguration } from '@/types/template';
import { ExternalSigner, InternalSigner, SignerAssignment } from '@/types/contract';
import { authService } from '@/services/authService';

interface MultiPartySignatureDialogProps {
    open: boolean;
    onClose: () => void;
    onSubmit: (
        assignments: SignerAssignment[]
    ) => Promise<{ success: boolean; error?: string }>;
    contractTitle?: string;
    parties: PartyConfiguration[];
    formFields?: any[];  // To check which parties have fields
    existingExternalSigners?: ExternalSigner[];  // Previously assigned external signers
    existingInternalSigners?: InternalSigner[];  // Previously assigned internal signers
    fieldValues?: Record<string, string>;  // Current field values to detect filled parties
}

interface RegisteredUser {
    email: string;
    name?: string;
    _id?: string;
}

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
    // Form state for new assignment
    const [selectedPartyId, setSelectedPartyId] = useState<string>('');
    const [signerType, setSignerType] = useState<'internal' | 'external'>('external');
    const [email, setEmail] = useState('');
    const [name, setName] = useState('');
    const [selectedUser, setSelectedUser] = useState<RegisteredUser | null>(null);

    // Assignments list
    const [assignments, setAssignments] = useState<SignerAssignment[]>([]);

    // Drag-and-drop state
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

    // Registered users for internal signer dropdown
    const [registeredUsers, setRegisteredUsers] = useState<RegisteredUser[]>([]);
    const [loadingUsers, setLoadingUsers] = useState(false);

    // UI state
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    // Load registered users when dialog opens
    useEffect(() => {
        if (open) {
            loadRegisteredUsers();
        }
    }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

    const loadRegisteredUsers = async () => {
        setLoadingUsers(true);
        try {
            const users = await authService.getAllRegisteredUsers();
            // Filter out current user (contractor shouldn't assign to themselves)
            const currentUser = authService.getCurrentUser();
            const filteredUsers = users.filter(u => u.email !== currentUser?.email);
            setRegisteredUsers(filteredUsers);
        } catch (err) {
            console.error('Failed to load registered users:', err);
        } finally {
            setLoadingUsers(false);
        }
    };

    // Get parties that have fields assigned
    const partiesWithFields = parties.filter(party => {
        return formFields.some(field => field.assignedParty === party.id);
    });

    // Get party IDs already assigned (existing + new)
    const existingAssignedPartyIds = [
        ...existingExternalSigners.map(s => s.partyId),
        ...existingInternalSigners.map(s => s.partyId),
    ];
    const newAssignedPartyIds = assignments.map(a => a.partyId);
    const allAssignedPartyIds = [...existingAssignedPartyIds, ...newAssignedPartyIds];

    // Detect parties whose fields are ALL filled by the contractor
    const contractorFilledPartyIds = partiesWithFields
        .filter(party => {
            if (allAssignedPartyIds.includes(party.id)) return false;
            const partyFields = formFields.filter(f => f.assignedParty === party.id);
            if (partyFields.length === 0) return false;
            return partyFields.every(f => {
                const val = fieldValues[f.name];
                return val !== undefined && val !== null && val !== '';
            });
        })
        .map(p => p.id);

    // Available parties = have fields, not already assigned, not already filled by contractor
    const availableParties = partiesWithFields.filter(
        p => !allAssignedPartyIds.includes(p.id) && !contractorFilledPartyIds.includes(p.id)
    );

    // Filter assigned users from internal user dropdown
    const availableUsers = registeredUsers.filter(user => {
        // Filter out if user is already in existingInternalSigners
        const isExisting = existingInternalSigners.some(s => s.email === user.email);
        // Filter out if user is already in new assignments
        const isInNew = assignments.some(a => a.type === 'internal' && a.email === user.email);
        return !isExisting && !isInNew;
    });

    // Max order among already-committed signers — new assignments continue from here
    const existingMaxOrder = [...existingExternalSigners, ...existingInternalSigners]
        .reduce((max, s) => Math.max(max, s.order ?? 0), 0);

    /**
     * Validate email format
     */
    const isValidEmail = (emailVal: string): boolean => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(emailVal);
    };

    /**
     * Add a new assignment (order is determined by position in the list)
     */
    const handleAddAssignment = () => {
        if (!selectedPartyId) {
            setError('Please select a party');
            return;
        }

        if (signerType === 'external') {
            if (!email.trim()) {
                setError('Please enter an email address');
                return;
            }
            if (!isValidEmail(email)) {
                setError('Please enter a valid email address');
                return;
            }
        } else {
            if (!selectedUser) {
                setError('Please select an internal user');
                return;
            }
        }

        const targetEmail = (signerType === 'external' ? email.trim() : selectedUser?.email)?.toLowerCase();
        if (!targetEmail) return;

        // Check if this email is already assigned to any party (existing or new)
        const isAlreadyAssigned =
            allExistingSigners.some(s => s.email?.toLowerCase() === targetEmail) ||
            assignments.some(a => a.email?.toLowerCase() === targetEmail);

        if (isAlreadyAssigned) {
            setError(`User with email ${targetEmail} is already assigned to another party.`);
            return;
        }

        const party = parties.find(p => p.id === selectedPartyId);
        if (!party) return;

        const newAssignment: SignerAssignment = {
            id: `assignment_${Date.now()}`,
            partyId: selectedPartyId,
            partyLabel: party.label,
            type: signerType,
            email: signerType === 'external' ? email.trim() : selectedUser?.email,
            name: signerType === 'external' ? name.trim() || undefined : selectedUser?.name,
            userId: signerType === 'internal' ? selectedUser?._id : undefined,
            order: 0, // placeholder; real order computed from list position at submit
        };

        setAssignments([...assignments, newAssignment]);

        // Reset form
        setSelectedPartyId('');
        setSignerType('external');
        setEmail('');
        setName('');
        setSelectedUser(null);
        setError(null);
    };

    /**
     * Remove an assignment
     */
    const handleRemoveAssignment = (id: string) => {
        setAssignments(assignments.filter(a => a.id !== id));
    };

    // ── Drag-and-drop handlers ────────────────────────────────────────────────

    const handleDragStart = (index: number) => {
        setDraggedIndex(index);
    };

    const handleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        setDragOverIndex(index);
    };

    const handleDrop = (_e: React.DragEvent, dropIndex: number) => {
        if (draggedIndex === null || draggedIndex === dropIndex) {
            setDraggedIndex(null);
            setDragOverIndex(null);
            return;
        }
        const reordered = [...assignments];
        const [moved] = reordered.splice(draggedIndex, 1);
        reordered.splice(dropIndex, 0, moved);
        setAssignments(reordered);
        setDraggedIndex(null);
        setDragOverIndex(null);
    };

    const handleDragEnd = () => {
        setDraggedIndex(null);
        setDragOverIndex(null);
    };

    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Handle form submission — injects computed orders before calling onSubmit
     */
    const handleSubmit = async () => {
        if (assignments.length === 0) {
            setError('Please add at least one assignment');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            // Assign final order numbers based on list position
            const assignmentsWithOrders = assignments.map((a, i) => ({
                ...a,
                order: existingMaxOrder + i + 1,
            }));
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

    /**
     * Handle dialog close - reset state
     */
    const handleClose = () => {
        setAssignments([]);
        setSelectedPartyId('');
        setSignerType('external');
        setEmail('');
        setName('');
        setSelectedUser(null);
        setError(null);
        setSuccess(false);
        setLoading(false);
        setDraggedIndex(null);
        setDragOverIndex(null);
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

    // Combine existing signers for display
    const allExistingSigners = [
        ...existingInternalSigners.map(s => ({
            partyId: s.partyId,
            partyLabel: s.partyLabel,
            type: 'internal' as const,
            email: s.email,
            name: s.name,
            order: s.order,
            status: s.status,
        })),
        ...existingExternalSigners.map(s => ({
            partyId: s.partyId,
            partyLabel: s.partyLabel,
            type: 'external' as const,
            email: s.email,
            name: s.name,
            order: s.order,
            status: s.status,
        })),
    ].sort((a, b) => a.order - b.order);

    return (
        <BaseDialog
            open={open}
            onClose={loading ? () => { } : handleClose}
            title={success ? 'Send Successfully' : 'Assign Signers'}
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
                            disabled={loading || assignments.length === 0}
                            startIcon={loading ? <CircularProgress size={20} /> : <Send />}
                        >
                            {loading ? 'Creating...' : `Create ${assignments.length} Assignment${assignments.length !== 1 ? 's' : ''}`}
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
            {success ? (
                <Box>
                    <Alert severity="success" icon={<CheckCircle />} sx={{ mb: 2 }}>
                        Signer assignments have been created successfully!
                    </Alert>
                    <Typography variant="body2" sx={{ mb: 2 }}>
                        <strong>Internal users</strong> will see this contract in their Signatures page when it's their turn.
                        <br />
                        <strong>External clients</strong> will receive an email with a signing link when it's their turn.
                    </Typography>
                    {/* <Typography variant="body2" color="text.secondary">
                        You can unlock each order from the contract details page after the previous order completes.
                    </Typography> */}
                </Box>
            ) : (
                <Box>
                    {/* Error Alert */}
                    {error && (
                        <Alert severity="error" sx={{ mb: 1 }} onClose={() => setError(null)}>
                            {error}
                        </Alert>
                    )}

                    {/* Existing Signers Display */}
                    {(allExistingSigners.length > 0 || contractorFilledPartyIds.length > 0) && (
                        <Paper
                            elevation={0}
                            sx={{
                                mb: 2,
                                px: 1.5,
                                py: 1,
                                borderRadius: 2,
                                bgcolor: '#eff9ff',
                                border: '1px solid',
                                borderColor: 'grey.200',
                            }}
                        >
                            <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', mb: 1, display: 'block' }}>
                                Already Assigned
                            </Typography>

                            {/* Contractor filled parties */}
                            {contractorFilledPartyIds.length > 0 && (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}>
                                    <BusinessCenter sx={{ color: 'primary.main', fontSize: 16 }} />
                                    <Typography variant="caption" sx={{ fontWeight: 600, minWidth: 100 }}>
                                        Filled by you:
                                    </Typography>
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

                            {/* Existing signers */}
                            {allExistingSigners.map((signer, index) => (
                                <Box
                                    key={`${signer.type}-${signer.partyId}`}
                                    sx={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 1,
                                        py: 0.5,
                                        borderTop: index > 0 || contractorFilledPartyIds.length > 0 ? '1px solid' : 'none',
                                        borderColor: 'grey.200',
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
                                    {signer.type === 'internal' ? (
                                        <Person sx={{ color: 'primary.main', fontSize: 16 }} />
                                    ) : (
                                        <Email sx={{ color: 'warning.main', fontSize: 16 }} />
                                    )}
                                    <Typography variant="caption" sx={{ fontWeight: 500, flexGrow: 1 }} noWrap>
                                        {signer.email}
                                    </Typography>
                                    <Chip
                                        label={signer.status}
                                        size="small"
                                        sx={{
                                            textTransform: 'capitalize',
                                            height: 20,
                                            fontSize: '0.65rem',
                                            fontWeight: 600,
                                            bgcolor: signer.status === 'completed' ? '#e8f5e9' : signer.status === 'unlocked' ? '#e3f2fd' : '#fff3e0',
                                            color: signer.status === 'completed' ? '#2e7d32' : signer.status === 'unlocked' ? '#1565c0' : '#e65100',
                                        }}
                                    />
                                </Box>
                            ))}
                        </Paper>
                    )}

                    {/* Add New Assignment Form */}
                    {availableParties.length > 0 ? (
                        <Paper
                            elevation={0}
                            sx={{
                                p: 2,
                                borderRadius: 2,
                                bgcolor: '#f6faf6',
                                border: '1px solid',
                                borderColor: 'grey.200',
                                mb: 2,
                            }}
                        >
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                                <Groups sx={{ color: '#2e7d32', fontSize: 20 }} />
                                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                                    Add Signer Assignment
                                </Typography>
                            </Box>

                            {/* Row 1: Party Selection */}
                            <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
                                <FormControl size="small" sx={{ flex: '1 1 200px', minWidth: 150 }}>
                                    <InputLabel>Party</InputLabel>
                                    <Select
                                        value={selectedPartyId}
                                        onChange={(e) => setSelectedPartyId(e.target.value)}
                                        label="Party"
                                        disabled={loading}
                                        sx={{ bgcolor: '#fff' }}
                                    >
                                        {availableParties.map((party) => (
                                            <MenuItem key={party.id} value={party.id}>
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
                            </Box>

                            {/* Row 2: Type Selection */}
                            <Box sx={{ mb: 2 }}>
                                <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', mb: 0.5, display: 'block' }}>
                                    Signer Type
                                </Typography>
                                <ToggleButtonGroup
                                    value={signerType}
                                    exclusive
                                    onChange={(_e, value) => value && setSignerType(value)}
                                    size="small"
                                    sx={{ bgcolor: '#fff' }}
                                >
                                    <ToggleButton value="internal" sx={{ px: 2 }}>
                                        <Person sx={{ mr: 0.5, fontSize: 18 }} />
                                        Internal User
                                    </ToggleButton>
                                    <ToggleButton value="external" sx={{ px: 2 }}>
                                        <Email sx={{ mr: 0.5, fontSize: 18 }} />
                                        External Client
                                    </ToggleButton>
                                </ToggleButtonGroup>
                            </Box>

                            {/* Row 3: Signer Details */}
                            <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                                {signerType === 'internal' ? (
                                    <Autocomplete
                                        size="small"
                                        options={availableUsers}
                                        getOptionLabel={(option) => option.name ? `${option.name} (${option.email})` : option.email}
                                        value={selectedUser}
                                        onChange={(_e, value) => setSelectedUser(value)}
                                        loading={loadingUsers}
                                        sx={{ flex: '1 1 300px', minWidth: 250 }}
                                        renderInput={(params) => (
                                            <TextField
                                                {...params}
                                                label="Select Internal User"
                                                placeholder="Search by name or email..."
                                                sx={{ '& .MuiOutlinedInput-root': { bgcolor: '#fff' } }}
                                            />
                                        )}
                                        renderOption={(props, option) => {
                                            const { key, ...otherProps } = props as any;
                                            return (
                                                <li key={key} {...otherProps}>
                                                    <Box>
                                                        <Typography variant="body2" fontWeight={500}>
                                                            {option.name || option.email}
                                                        </Typography>
                                                        {option.name && (
                                                            <Typography variant="caption" color="text.secondary">
                                                                {option.email}
                                                            </Typography>
                                                        )}
                                                    </Box>
                                                </li>
                                            );
                                        }}
                                        disabled={loading}
                                    />
                                ) : (
                                    <>
                                        <TextField
                                            size="small"
                                            label="Email"
                                            type="email"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            placeholder="client@example.com"
                                            sx={{ flex: '1 1 200px', minWidth: 200, '& .MuiOutlinedInput-root': { bgcolor: '#fff' } }}
                                            disabled={loading}
                                        />
                                        <TextField
                                            size="small"
                                            label="Name (optional)"
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            placeholder="Client Name"
                                            sx={{ flex: '1 1 150px', minWidth: 150, '& .MuiOutlinedInput-root': { bgcolor: '#fff' } }}
                                            disabled={loading}
                                        />
                                    </>
                                )}

                                <Button
                                    variant="outlined"
                                    onClick={handleAddAssignment}
                                    disabled={loading || !selectedPartyId}
                                    startIcon={<Add />}
                                    sx={{
                                        height: 40,
                                        borderColor: '#2e7d32',
                                        color: '#2e7d32',
                                        '&:hover': { borderColor: '#1b5e20', bgcolor: '#e8f5e9' }
                                    }}
                                >
                                    Add
                                </Button>
                            </Box>
                        </Paper>
                    ) : availableParties.length === 0 && (existingExternalSigners.length > 0 || existingInternalSigners.length > 0) ? (
                        <Paper
                            elevation={0}
                            sx={{
                                p: 2,
                                borderRadius: 2,
                                textAlign: 'center',
                                bgcolor: '#f6faf6',
                                border: '1px solid',
                                borderColor: 'grey.200',
                                mb: 2,
                            }}
                        >
                            <CheckCircle sx={{ fontSize: 36, color: 'primary.main', mb: 1 }} />
                            <Typography variant="body2" fontWeight={600}>
                                All parties have been assigned
                            </Typography>
                        </Paper>
                    ) : null}

                    {/* New Assignments List */}
                    {assignments.length > 0 && (
                        <Paper
                            elevation={0}
                            sx={{
                                p: 2,
                                borderRadius: 2,
                                bgcolor: '#fff',
                                border: '1px solid',
                                borderColor: 'primary.main',
                            }}
                        >
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'primary.main' }}>
                                    New Assignments
                                </Typography>
                                <Chip
                                    label={assignments.length}
                                    size="small"
                                    sx={{ bgcolor: 'primary.main', color: '#fff', fontWeight: 700, height: 20 }}
                                />
                                <Typography variant="caption" color="text.disabled" sx={{ ml: 'auto' }}>
                                    Drag to reorder
                                </Typography>
                            </Box>

                            <List dense disablePadding>
                                {assignments.map((assignment, index) => {
                                    const computedOrder = existingMaxOrder + index + 1;
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
                                                py: 1,
                                                cursor: 'grab',
                                                opacity: isDragging ? 0.35 : 1,
                                                borderTop: isOver ? '2px solid' : undefined,
                                                borderTopColor: isOver ? 'primary.main' : undefined,
                                                transition: 'opacity 0.15s',
                                            }}
                                        >
                                            <DragIndicator
                                                sx={{ color: 'grey.400', fontSize: 20, mr: 0.5, flexShrink: 0 }}
                                            />
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mr: 2 }}>
                                                <Chip
                                                    label={`#${computedOrder}`}
                                                    size="small"
                                                    sx={{ bgcolor: 'grey.700', color: '#fff', fontWeight: 700, height: 22, minWidth: 32 }}
                                                />
                                                <Chip
                                                    label={assignment.partyLabel}
                                                    size="small"
                                                    sx={{
                                                        bgcolor: getPartyColor(assignment.partyId),
                                                        color: '#fff',
                                                        fontWeight: 600,
                                                    }}
                                                />
                                            </Box>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mr: 1 }}>
                                                {assignment.type === 'internal' ? (
                                                    <Chip
                                                        icon={<Person sx={{ fontSize: 14 }} />}
                                                        label="Internal"
                                                        size="small"
                                                        sx={{ bgcolor: '#e3f2fd', color: '#1565c0', fontWeight: 500, height: 22 }}
                                                    />
                                                ) : (
                                                    <Chip
                                                        icon={<Email sx={{ fontSize: 14 }} />}
                                                        label="External"
                                                        size="small"
                                                        sx={{ bgcolor: '#fff3e0', color: '#e65100', fontWeight: 500, height: 22 }}
                                                    />
                                                )}
                                            </Box>
                                            <ListItemText
                                                primary={assignment.email}
                                                secondary={assignment.name || 'No name'}
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
                                                sx={{ color: 'error.light', '&:hover': { color: 'error.main' } }}
                                            >
                                                <Delete />
                                            </IconButton>
                                        </ListItem>
                                    );
                                })}
                            </List>
                        </Paper>
                    )}

                    {/* Empty State */}
                    {assignments.length === 0 && availableParties.length > 0 && (
                        <Paper
                            variant="outlined"
                            sx={{
                                p: 2,
                                textAlign: 'center',
                                bgcolor: '#fff',
                                borderStyle: 'dashed',
                                borderColor: 'grey.300',
                                borderRadius: 2,
                            }}
                        >
                            <Groups sx={{ fontSize: 44, color: 'grey.300', mb: 1 }} />
                            <Typography variant="body2" color="text.secondary" fontWeight={500}>
                                No assignments added yet
                            </Typography>
                            <Typography variant="caption" color="text.disabled">
                                Select a party and signer type to add assignments
                            </Typography>
                        </Paper>
                    )}
                </Box>
            )}
        </BaseDialog>
    );
};

export default MultiPartySignatureDialog;

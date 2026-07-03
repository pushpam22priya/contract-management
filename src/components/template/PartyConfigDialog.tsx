'use client';

import { useState, useEffect } from 'react';
import {
    TextField,
    Box,
    Typography,
    IconButton,
    List,
    ListItem,
    ListItemText,
    Chip,
    Tooltip,
    Paper,
    ToggleButtonGroup,
    ToggleButton,
} from '@mui/material';
import {
    Add,
    Delete,
    Edit,
    ColorLens,
} from '@mui/icons-material';
import { PartyConfiguration } from '@/types/template';
import BaseDialog from '@/components/common/BaseDialog';
import AppButton from '@/components/common/AppButton';

// Debug logging
const LOG_PREFIX = '[PARTY-CONFIG]';

interface PartyConfigDialogProps {
    open: boolean;
    onClose: () => void;
    onSave: (parties: PartyConfiguration[]) => void;
    initialParties?: PartyConfiguration[];
}

// Predefined color palette for party selection
const COLOR_PALETTE = [
    '#4CAF50', // Green
    '#2196F3', // Blue
    '#FF9800', // Orange
    '#9C27B0', // Purple
    '#E91E63', // Pink
    '#00BCD4', // Cyan
    '#FF5722', // Deep Orange
    '#795548', // Brown
    '#607D8B', // Blue Grey
    '#F44336', // Red
];

// Returns the first color in COLOR_PALETTE not already used by any party
function getNextAvailableColor(currentParties: PartyConfiguration[]): string {
    const usedColors = new Set(currentParties.map(p => p.color));
    return COLOR_PALETTE.find(c => !usedColors.has(c)) ?? COLOR_PALETTE[currentParties.length % COLOR_PALETTE.length];
}

export default function PartyConfigDialog({
    open,
    onClose,
    onSave,
    initialParties,
}: PartyConfigDialogProps) {
    const [parties, setParties] = useState<PartyConfiguration[]>([]);
    const [editingParty, setEditingParty] = useState<PartyConfiguration | null>(null);
    const [newPartyLabel, setNewPartyLabel] = useState('');
    const [newPartyColor, setNewPartyColor] = useState(COLOR_PALETTE[0]);
    const [newPartyType, setNewPartyType] = useState<'INTERNAL' | 'EXTERNAL'>('INTERNAL');
    const [showColorPicker, setShowColorPicker] = useState<string | null>(null);

    // Initialize parties from props
    useEffect(() => {
        if (open) {
            if (initialParties && initialParties.length > 0) {
                console.log(`${LOG_PREFIX} Initializing with ${initialParties.length} parties`);
                setParties([...initialParties]);
                setNewPartyColor(getNextAvailableColor(initialParties));
            } else {
                setNewPartyColor(COLOR_PALETTE[0]);
            }
            setNewPartyType('INTERNAL');
        }
    }, [open, initialParties]);

    // Add a new party
    const handleAddParty = () => {
        if (!newPartyLabel.trim()) return;

        // Find the highest existing party number to avoid duplicate IDs
        const existingNumbers = parties.map(p => {
            const match = p.id.match(/party_(\d+)/);
            return match ? parseInt(match[1], 10) : 0;
        });
        const maxNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) : 0;
        const newPartyId = `party_${maxNumber + 1}`;
        const newOrder = parties.length + 1;

        const newParty: PartyConfiguration = {
            id: newPartyId,
            label: newPartyLabel.trim(),
            color: newPartyColor,
            order: newOrder,
            type: newPartyType,
        };

        console.log(`${LOG_PREFIX} Adding party:`, newParty);
        const updatedParties = [...parties, newParty];
        setParties(updatedParties);
        setNewPartyLabel('');
        // Auto-pick next available color for the next new party
        setNewPartyColor(getNextAvailableColor(updatedParties));
    };

    // Remove a party
    const handleRemoveParty = (partyId: string) => {
        console.log(`${LOG_PREFIX} Removing party: ${partyId}`);
        const updatedParties = parties
            .filter(p => p.id !== partyId)
            .map((p, idx) => ({ ...p, order: idx + 1 }));
        setParties(updatedParties);
        // Recalculate next available color after removal
        setNewPartyColor(getNextAvailableColor(updatedParties));
    };

    // Update party label
    const handleUpdatePartyLabel = (partyId: string, newLabel: string) => {
        console.log(`${LOG_PREFIX} Updating party ${partyId} label to: ${newLabel}`);
        setParties(parties.map(p =>
            p.id === partyId ? { ...p, label: newLabel } : p
        ));
        setEditingParty(null);
    };

    // Update party color
    const handleUpdatePartyColor = (partyId: string, newColor: string) => {
        console.log(`${LOG_PREFIX} Updating party ${partyId} color to: ${newColor}`);
        const updatedParties = parties.map(p =>
            p.id === partyId ? { ...p, color: newColor } : p
        );
        setParties(updatedParties);
        setShowColorPicker(null);
        // Recalculate next available color after color change
        setNewPartyColor(getNextAvailableColor(updatedParties));
    };

    // Toggle party type between INTERNAL and EXTERNAL
    const handleUpdatePartyType = (partyId: string, newType: 'INTERNAL' | 'EXTERNAL') => {
        console.log(`${LOG_PREFIX} Updating party ${partyId} type to: ${newType}`);
        setParties(parties.map(p =>
            p.id === partyId ? { ...p, type: newType } : p
        ));
    };

    // Save and close
    const handleSave = () => {
        console.log(`${LOG_PREFIX} Saving ${parties.length} parties:`, parties);
        onSave(parties);
        onClose();
    };

    const dialogActions = (
        <>
            <AppButton variant="outlined" onClick={onClose}>Cancel</AppButton>
            <AppButton
                variant="contained"
                onClick={handleSave}
                disabled={parties.length === 0}
            >
                Save Parties
            </AppButton>
        </>
    );

    return (
        <BaseDialog
            open={open}
            onClose={onClose}
            title="Configure Parties"
            maxWidth="sm"
            actions={dialogActions}
        >
            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                You can assign fields after saving parties.
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
                <strong>Internal</strong> — org-owned; any participant can edit these fields.&nbsp;
                <strong>External</strong> — client-owned; org participants cannot edit these fields.
            </Typography>

            {/* Party List */}
            <Paper variant="outlined" sx={{ mb: 3, maxHeight: 300, overflow: 'auto' }}>
                {parties.length > 0 && <List dense>
                    {parties.map((party) => (
                        <ListItem
                            key={party.id}
                            secondaryAction={
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                    {/* Color picker */}
                                    <Tooltip title="Change color">
                                        <IconButton
                                            size="small"
                                            onClick={() => setShowColorPicker(showColorPicker === party.id ? null : party.id)}
                                        >
                                            <ColorLens sx={{ color: party.color }} />
                                        </IconButton>
                                    </Tooltip>

                                    {/* Edit button */}
                                    <Tooltip title="Edit label">
                                        <IconButton
                                            size="small"
                                            onClick={() => setEditingParty(party)}
                                        >
                                            <Edit fontSize="small" />
                                        </IconButton>
                                    </Tooltip>

                                    {/* Delete button */}
                                    <Tooltip title="Remove party">
                                        <span>
                                            <IconButton
                                                size="small"
                                                onClick={() => handleRemoveParty(party.id)}
                                                disabled={parties.length <= 1}
                                            >
                                                <Delete fontSize="small" />
                                            </IconButton>
                                        </span>
                                    </Tooltip>
                                </Box>
                            }
                            sx={{
                                borderLeft: `4px solid ${party.color}`,
                                '&:hover': { bgcolor: 'action.hover' },
                                pr: 14,
                            }}
                        >
                            <Chip
                                label={party.order}
                                size="small"
                                sx={{
                                    mr: 1,
                                    minWidth: 28,
                                    bgcolor: party.color,
                                    color: 'white',
                                    fontWeight: 'bold',
                                    flexShrink: 0,
                                }}
                            />

                            {editingParty?.id === party.id ? (
                                <TextField
                                    size="small"
                                    value={editingParty.label}
                                    onChange={(e) => setEditingParty({ ...editingParty, label: e.target.value })}
                                    onBlur={() => handleUpdatePartyLabel(party.id, editingParty.label)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            handleUpdatePartyLabel(party.id, editingParty.label);
                                        }
                                    }}
                                    autoFocus
                                    sx={{ flex: 1, mr: 1 }}
                                />
                            ) : (
                                <ListItemText
                                    primary={party.label}
                                    sx={{ mr: 1 }}
                                />
                            )}

                            {/* Party type toggle */}
                            <ToggleButtonGroup
                                value={party.type === 'EXTERNAL' ? 'EXTERNAL' : 'INTERNAL'}
                                exclusive
                                onChange={(_, val) => val && handleUpdatePartyType(party.id, val)}
                                size="small"
                                sx={{ flexShrink: 0 }}
                            >
                                <ToggleButton
                                    value="INTERNAL"
                                    sx={{
                                        fontSize: '0.65rem',
                                        px: 1,
                                        py: 0.25,
                                        lineHeight: 1.4,
                                        '&.Mui-selected': { bgcolor: 'success.main', color: 'white', '&:hover': { bgcolor: 'success.dark' } },
                                    }}
                                >
                                    Internal
                                </ToggleButton>
                                <ToggleButton
                                    value="EXTERNAL"
                                    sx={{
                                        fontSize: '0.65rem',
                                        px: 1,
                                        py: 0.25,
                                        lineHeight: 1.4,
                                        '&.Mui-selected': { bgcolor: 'warning.main', color: 'white', '&:hover': { bgcolor: 'warning.dark' } },
                                    }}
                                >
                                    External
                                </ToggleButton>
                            </ToggleButtonGroup>
                        </ListItem>
                    ))}
                </List>}
            </Paper>

            {/* Color picker popover */}
            {showColorPicker && (
                <Paper
                    elevation={4}
                    sx={{
                        p: 2,
                        mb: 2,
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 1,
                        justifyContent: 'center',
                    }}
                >
                    <Typography variant="body2" sx={{ width: '100%', mb: 1, textAlign: 'center' }}>
                        Select a color:
                    </Typography>
                    {COLOR_PALETTE.map((color) => {
                        const isUsedByOther = parties.some(
                            p => p.id !== showColorPicker && p.color === color
                        );
                        return (
                            <Tooltip key={color} title={isUsedByOther ? 'Already used by another party' : ''}>
                                <Box
                                    onClick={() => !isUsedByOther && handleUpdatePartyColor(showColorPicker, color)}
                                    sx={{
                                        width: 32,
                                        height: 32,
                                        bgcolor: color,
                                        borderRadius: 1,
                                        cursor: isUsedByOther ? 'not-allowed' : 'pointer',
                                        border: '2px solid',
                                        borderColor: parties.find(p => p.id === showColorPicker)?.color === color
                                            ? 'primary.main'
                                            : 'transparent',
                                        opacity: isUsedByOther ? 0.35 : 1,
                                        '&:hover': {
                                            transform: isUsedByOther ? 'none' : 'scale(1.1)',
                                        },
                                    }}
                                />
                            </Tooltip>
                        );
                    })}
                </Paper>
            )}

            {/* Add new party */}
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <Box
                    sx={{
                        width: 40,
                        height: 40,
                        bgcolor: newPartyColor,
                        borderRadius: 1,
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    <ColorLens sx={{ color: 'white' }} />
                </Box>

                <TextField
                    size="small"
                    label="New Party Name"
                    placeholder="e.g., Witness, Guarantor"
                    value={newPartyLabel}
                    onChange={(e) => setNewPartyLabel(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            handleAddParty();
                        }
                    }}
                    sx={{ flex: 1, minWidth: 140 }}
                />

                <ToggleButtonGroup
                    value={newPartyType}
                    exclusive
                    onChange={(_, val) => val && setNewPartyType(val)}
                    size="small"
                    sx={{ flexShrink: 0, height: 40 }}
                >
                    <ToggleButton
                        value="INTERNAL"
                        sx={{
                            fontSize: '0.72rem',
                            px: 1.5,
                            '&.Mui-selected': { bgcolor: 'success.main', color: 'white', '&:hover': { bgcolor: 'success.dark' } },
                        }}
                    >
                        Internal
                    </ToggleButton>
                    <ToggleButton
                        value="EXTERNAL"
                        sx={{
                            fontSize: '0.72rem',
                            px: 1.5,
                            '&.Mui-selected': { bgcolor: 'warning.main', color: 'white', '&:hover': { bgcolor: 'warning.dark' } },
                        }}
                    >
                        External
                    </ToggleButton>
                </ToggleButtonGroup>

                <AppButton
                    variant="contained"
                    onClick={handleAddParty}
                    disabled={!newPartyLabel.trim()}
                    startIcon={<Add />}
                    sx={{ flexShrink: 0, height: 40 }}
                >
                    Add
                </AppButton>
            </Box>
        </BaseDialog>
    );
}

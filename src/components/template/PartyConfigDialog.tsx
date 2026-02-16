'use client';

import { useState, useEffect } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    TextField,
    Box,
    Typography,
    IconButton,
    List,
    ListItem,
    ListItemText,
    ListItemSecondaryAction,
    Chip,
    Tooltip,
    Paper,
} from '@mui/material';
import {
    Add,
    Delete,
    Edit,
    DragIndicator,
    ColorLens,
    ArrowUpward,
    ArrowDownward,
} from '@mui/icons-material';
import { PartyConfiguration } from '@/types/template';
import { DEFAULT_PARTY_COLORS, getPartyColor } from '@/utils/partyValidation';

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
    const [showColorPicker, setShowColorPicker] = useState<string | null>(null);

    // Initialize parties from props
    useEffect(() => {
        if (open) {
            if (initialParties && initialParties.length > 0) {
                console.log(`${LOG_PREFIX} Initializing with ${initialParties.length} parties`);
                setParties([...initialParties]);
            }
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
        };

        console.log(`${LOG_PREFIX} Adding party:`, newParty);
        setParties([...parties, newParty]);
        setNewPartyLabel('');
        setNewPartyColor(COLOR_PALETTE[parties.length % COLOR_PALETTE.length]);
    };

    // Remove a party
    const handleRemoveParty = (partyId: string) => {
        console.log(`${LOG_PREFIX} Removing party: ${partyId}`);
        const updatedParties = parties
            .filter(p => p.id !== partyId)
            .map((p, idx) => ({ ...p, order: idx + 1 }));
        setParties(updatedParties);
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
        setParties(parties.map(p =>
            p.id === partyId ? { ...p, color: newColor } : p
        ));
        setShowColorPicker(null);
    };

    // Move party up in order
    const handleMoveUp = (index: number) => {
        if (index === 0) return;
        const newParties = [...parties];
        const temp = newParties[index];
        newParties[index] = { ...newParties[index - 1], order: index + 1 };
        newParties[index - 1] = { ...temp, order: index };
        setParties(newParties);
    };

    // Move party down in order
    const handleMoveDown = (index: number) => {
        if (index === parties.length - 1) return;
        const newParties = [...parties];
        const temp = newParties[index];
        newParties[index] = { ...newParties[index + 1], order: index + 1 };
        newParties[index + 1] = { ...temp, order: index + 2 };
        setParties(newParties);
    };

    // Save and close
    const handleSave = () => {
        console.log(`${LOG_PREFIX} Saving ${parties.length} parties:`, parties);
        onSave(parties);
        onClose();
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    Configure Parties
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    Define the parties who will fill and sign fields in this template.
                    The order determines the signing sequence.
                </Typography>
            </DialogTitle>

            <DialogContent>
                {/* Party List */}
                <Paper variant="outlined" sx={{ mb: 3, maxHeight: 300, overflow: 'auto' }}>
                    {parties.length > 0 && <List dense>
                        {parties.map((party, index) => (
                            <ListItem
                                key={party.id}
                                sx={{
                                    borderLeft: `4px solid ${party.color}`,
                                    '&:hover': { bgcolor: 'action.hover' },
                                }}
                            >
                                <DragIndicator sx={{ mr: 1, color: 'text.disabled' }} />

                                <Chip
                                    label={party.order}
                                    size="small"
                                    sx={{
                                        mr: 1,
                                        minWidth: 28,
                                        bgcolor: party.color,
                                        color: 'white',
                                        fontWeight: 'bold',
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
                                        sx={{ flex: 1 }}
                                    />
                                ) : (
                                    <ListItemText
                                        primary={party.label}
                                        secondary={`Fields assigned to ${party.label} will be filled in order ${party.order}`}
                                    />
                                )}

                                <ListItemSecondaryAction>
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

                                    {/* Move up */}
                                    <Tooltip title="Move up">
                                        <span>
                                            <IconButton
                                                size="small"
                                                onClick={() => handleMoveUp(index)}
                                                disabled={index === 0}
                                            >
                                                <ArrowUpward fontSize="small" />
                                            </IconButton>
                                        </span>
                                    </Tooltip>

                                    {/* Move down */}
                                    <Tooltip title="Move down">
                                        <span>
                                            <IconButton
                                                size="small"
                                                onClick={() => handleMoveDown(index)}
                                                disabled={index === parties.length - 1}
                                            >
                                                <ArrowDownward fontSize="small" />
                                            </IconButton>
                                        </span>
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
                                </ListItemSecondaryAction>
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
                        {COLOR_PALETTE.map((color) => (
                            <Box
                                key={color}
                                onClick={() => handleUpdatePartyColor(showColorPicker, color)}
                                sx={{
                                    width: 32,
                                    height: 32,
                                    bgcolor: color,
                                    borderRadius: 1,
                                    cursor: 'pointer',
                                    border: '2px solid',
                                    borderColor: parties.find(p => p.id === showColorPicker)?.color === color
                                        ? 'primary.main'
                                        : 'transparent',
                                    '&:hover': {
                                        transform: 'scale(1.1)',
                                    },
                                }}
                            />
                        ))}
                    </Paper>
                )}

                {/* Add new party */}
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                    <Box
                        onClick={() => {
                            const currentIndex = COLOR_PALETTE.indexOf(newPartyColor);
                            const nextIndex = (currentIndex + 1) % COLOR_PALETTE.length;
                            setNewPartyColor(COLOR_PALETTE[nextIndex]);
                        }}
                        sx={{
                            width: 40,
                            height: 40,
                            bgcolor: newPartyColor,
                            borderRadius: 1,
                            cursor: 'pointer',
                            flexShrink: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            '&:hover': {
                                opacity: 0.8,
                            },
                        }}
                    >
                        <ColorLens sx={{ color: 'white' }} />
                    </Box>

                    <TextField
                        fullWidth
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
                    />

                    <Button
                        variant="contained"
                        onClick={handleAddParty}
                        disabled={!newPartyLabel.trim()}
                        startIcon={<Add />}
                        sx={{ flexShrink: 0 }}
                    >
                        Add
                    </Button>
                </Box>

                {/* Info */}
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
                    After saving, you can assign fields to each party by selecting a field and choosing a party.
                </Typography>
            </DialogContent>

            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button
                    variant="contained"
                    onClick={handleSave}
                    disabled={parties.length === 0}
                >
                    Save Parties
                </Button>
            </DialogActions>
        </Dialog>
    );
}

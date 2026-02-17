'use client';

import { useState } from 'react';
import {
    Box,
    Typography,
    Paper,
    Button,
    Chip,
    List,
    ListItem,
    ListItemText,
    ListItemIcon,
    Divider,
    Tooltip,
    Badge,
    IconButton,
    Collapse,
    Alert,
} from '@mui/material';
import {
    Person,
    TextFields,
    Draw,
    CheckBox,
    RadioButtonChecked,
    ArrowDropDown,
    CalendarToday,
    ExpandMore,
    ExpandLess,
    Settings,
    Warning,
} from '@mui/icons-material';
import { PartyConfiguration, FormFieldDefinition } from '@/types/template';
import { groupFieldsByParty } from '@/utils/partyValidation';

// Debug logging
const LOG_PREFIX = '[PARTY-PANEL]';

interface PartyAssignmentPanelProps {
    parties: PartyConfiguration[];
    formFields: FormFieldDefinition[];
    selectedFieldName: string | null;
    onPartySelected: (partyId: string) => void;
    onFieldSelected: (fieldName: string) => void;  // NEW: Allow selecting field from panel
    onConfigureParties: () => void;
    onHighlightParty: (partyId: string | null) => void;
}

// Get icon for field type
const getFieldTypeIcon = (type: string) => {
    switch (type) {
        case 'signature':
            return <Draw fontSize="small" />;
        case 'checkbox':
            return <CheckBox fontSize="small" />;
        case 'radio':
            return <RadioButtonChecked fontSize="small" />;
        case 'dropdown':
            return <ArrowDropDown fontSize="small" />;
        case 'date':
            return <CalendarToday fontSize="small" />;
        default:
            return <TextFields fontSize="small" />;
    }
};

export default function PartyAssignmentPanel({
    parties,
    formFields,
    selectedFieldName,
    onPartySelected,
    onFieldSelected,
    onConfigureParties,
    onHighlightParty,
}: PartyAssignmentPanelProps) {
    const [expandedParty, setExpandedParty] = useState<string | null>('unassigned'); // Start with unassigned expanded
    const [hoveredParty, setHoveredParty] = useState<string | null>(null);

    // Group fields by party
    const fieldsByParty = groupFieldsByParty(formFields);

    // Get unassigned field count
    const unassignedFields = fieldsByParty['unassigned'] || [];
    const hasUnassignedFields = unassignedFields.length > 0;

    // Handle party hover for highlighting
    const handlePartyHover = (partyId: string | null) => {
        setHoveredParty(partyId);
        onHighlightParty(partyId);
    };

    // Handle party selection for field assignment
    const handleAssignToParty = (partyId: string) => {
        if (!selectedFieldName) return;
        console.log(`${LOG_PREFIX} Assigning selected field to party: ${partyId}`);
        onPartySelected(partyId);
    };

    return (
        <Paper
            elevation={2}
            sx={{
                width: 280,
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                border: '1px solid #e0e0e0',
            }}
        >
            {/* Header */}
            <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Typography variant="subtitle1" fontWeight="bold">
                        Party Assignment
                    </Typography>
                    <Tooltip title="Configure parties">
                        <IconButton size="small" onClick={onConfigureParties}>
                            <Settings fontSize="small" />
                        </IconButton>
                    </Tooltip>
                </Box>

                {selectedFieldName ? (
                    <Alert severity="info" sx={{ mt: 1, py: 0 }}>
                        <Typography variant="body2">
                            Select a party to assign: <strong>{selectedFieldName}</strong>
                        </Typography>
                    </Alert>
                ) : (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                        Click a field in the PDF, then select a party to assign it.
                    </Typography>
                )}
            </Box>

            {/* Unassigned warning */}
            {hasUnassignedFields && (
                <Alert
                    severity="warning"
                    icon={<Warning fontSize="small" />}
                    sx={{ mx: 2, mt: 1, py: 0.5 }}
                >
                    <Typography variant="body2">
                        {unassignedFields.length} unassigned field(s)
                    </Typography>
                </Alert>
            )}

            {/* Party List */}
            <Box sx={{ flex: 1, overflow: 'auto', p: 1 }}>
                <List dense disablePadding>
                    {parties.map((party) => {
                        const partyFields = fieldsByParty[party.id] || [];
                        const isExpanded = expandedParty === party.id;

                        return (
                            <Box key={party.id}>
                                <ListItem
                                    sx={{
                                        borderRadius: 1,
                                        mb: 0.5,
                                        bgcolor: hoveredParty === party.id ? 'action.hover' : 'transparent',
                                        border: selectedFieldName ? '2px dashed' : '2px solid transparent',
                                        borderColor: selectedFieldName ? party.color : 'transparent',
                                        cursor: selectedFieldName ? 'pointer' : 'default',
                                        transition: 'all 0.2s',
                                        '&:hover': {
                                            bgcolor: 'action.hover',
                                        },
                                    }}
                                    onClick={() => selectedFieldName && handleAssignToParty(party.id)}
                                    onMouseEnter={() => handlePartyHover(party.id)}
                                    onMouseLeave={() => handlePartyHover(null)}
                                >
                                    <ListItemIcon sx={{ minWidth: 36 }}>
                                        <Badge
                                            badgeContent={partyFields.length}
                                            color="primary"
                                            sx={{
                                                '& .MuiBadge-badge': {
                                                    bgcolor: party.color,
                                                    color: 'white',
                                                },
                                            }}
                                        >
                                            <Person sx={{ color: party.color }} />
                                        </Badge>
                                    </ListItemIcon>

                                    <ListItemText
                                        primary={
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <Typography variant="body2" fontWeight="medium">
                                                    {party.label}
                                                </Typography>
                                                <Chip
                                                    label={`Order ${party.order}`}
                                                    size="small"
                                                    sx={{
                                                        height: 18,
                                                        fontSize: '0.65rem',
                                                        bgcolor: party.color,
                                                        color: 'white',
                                                    }}
                                                />
                                            </Box>
                                        }
                                        secondary={`${partyFields.length} field(s)`}
                                    />

                                    {partyFields.length > 0 && (
                                        <IconButton
                                            size="small"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setExpandedParty(isExpanded ? null : party.id);
                                            }}
                                        >
                                            {isExpanded ? <ExpandLess /> : <ExpandMore />}
                                        </IconButton>
                                    )}
                                </ListItem>

                                {/* Expanded field list */}
                                <Collapse in={isExpanded}>
                                    <Box sx={{ pl: 4, pr: 1, pb: 1 }}>
                                        {partyFields.map((field) => (
                                            <Box
                                                key={field.name}
                                                sx={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 1,
                                                    py: 0.5,
                                                    px: 1,
                                                    borderRadius: 0.5,
                                                    bgcolor: 'background.default',
                                                    mb: 0.5,
                                                }}
                                            >
                                                {getFieldTypeIcon(field.type)}
                                                <Typography variant="caption" noWrap sx={{ flex: 1 }}>
                                                    {field.label || field.name}
                                                </Typography>
                                                <Chip
                                                    label={field.type}
                                                    size="small"
                                                    sx={{ height: 16, fontSize: '0.6rem' }}
                                                />
                                            </Box>
                                        ))}
                                    </Box>
                                </Collapse>
                            </Box>
                        );
                    })}

                    {/* Unassigned fields section */}
                    {hasUnassignedFields && (
                        <>
                            <Divider sx={{ my: 1 }} />
                            <ListItem
                                sx={{
                                    borderRadius: 1,
                                    bgcolor: hoveredParty === 'unassigned' ? 'action.hover' : 'transparent',
                                }}
                                onMouseEnter={() => handlePartyHover('unassigned')}
                                onMouseLeave={() => handlePartyHover(null)}
                            >
                                <ListItemIcon sx={{ minWidth: 36 }}>
                                    <Badge badgeContent={unassignedFields.length} color="warning">
                                        <Warning color="warning" />
                                    </Badge>
                                </ListItemIcon>
                                <ListItemText
                                    primary="Unassigned"
                                    secondary={`${unassignedFields.length} field(s) need assignment`}
                                />
                                <IconButton
                                    size="small"
                                    onClick={() => setExpandedParty(expandedParty === 'unassigned' ? null : 'unassigned')}
                                >
                                    {expandedParty === 'unassigned' ? <ExpandLess /> : <ExpandMore />}
                                </IconButton>
                            </ListItem>

                            <Collapse in={expandedParty === 'unassigned'}>
                                <Box sx={{ pl: 2, pr: 1, pb: 1 }}>
                                    <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                                        Click a field, then click a party to assign:
                                    </Typography>
                                    {unassignedFields.map((field) => (
                                        <Box
                                            key={field.name}
                                            onClick={() => {
                                                console.log(`${LOG_PREFIX} Field selected from panel: ${field.name}`);
                                                onFieldSelected(field.name);
                                            }}
                                            sx={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 1,
                                                py: 0.75,
                                                px: 1.5,
                                                borderRadius: 1,
                                                bgcolor: selectedFieldName === field.name ? 'primary.main' : 'warning.light',
                                                color: selectedFieldName === field.name ? 'white' : 'inherit',
                                                mb: 0.5,
                                                cursor: 'pointer',
                                                border: selectedFieldName === field.name ? '2px solid' : '2px solid transparent',
                                                borderColor: selectedFieldName === field.name ? 'primary.dark' : 'transparent',
                                                transition: 'all 0.2s',
                                                '&:hover': {
                                                    bgcolor: selectedFieldName === field.name ? 'primary.dark' : 'warning.main',
                                                    transform: 'scale(1.02)',
                                                },
                                            }}
                                        >
                                            {getFieldTypeIcon(field.type)}
                                            <Typography variant="body2" fontWeight={selectedFieldName === field.name ? 'bold' : 'normal'} noWrap sx={{ flex: 1 }}>
                                                {field.label || field.name}
                                            </Typography>
                                            {selectedFieldName === field.name && (
                                                <Chip
                                                    label="Selected"
                                                    size="small"
                                                    sx={{
                                                        height: 20,
                                                        fontSize: '0.65rem',
                                                        bgcolor: 'white',
                                                        color: 'primary.main',
                                                    }}
                                                />
                                            )}
                                        </Box>
                                    ))}
                                </Box>
                            </Collapse>
                        </>
                    )}
                </List>
            </Box>
        </Paper>
    );
}

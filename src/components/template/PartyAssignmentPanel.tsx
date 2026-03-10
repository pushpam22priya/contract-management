'use client';

import { useState, useEffect } from 'react';
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
    Checkbox,
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
    Close,
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
    onFieldSelected: (fieldName: string | null) => void;  // Allow null to clear selection
    onConfigureParties: () => void;
    onHighlightParty: (partyId: string | null) => void;
    onMultipleFieldsAssign?: (fieldNames: string[], partyId: string) => void;
    onFieldUnassigned?: (fieldName: string) => void;
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
    onMultipleFieldsAssign,
    onFieldUnassigned,
}: PartyAssignmentPanelProps) {
    const [expandedParty, setExpandedParty] = useState<string | null>('unassigned'); // Start with unassigned expanded
    const [partiesSectionExpanded, setPartiesSectionExpanded] = useState(true);
    const [hoveredParty, setHoveredParty] = useState<string | null>(null);
    const [selectedFieldIds, setSelectedFieldIds] = useState<string[]>([]);
    const [manuallyUncheckedIds, setManuallyUncheckedIds] = useState<string[]>([]);
    const [dragOverParty, setDragOverParty] = useState<string | null>(null);

    // Auto-add each newly selected field (from PDF click) into selectedFieldIds
    // so multiple fields accumulate as checked without replacing the previous one.
    // Also clear it from manuallyUncheckedIds so highlighting is restored.
    useEffect(() => {
        if (selectedFieldName) {
            setManuallyUncheckedIds(prev => prev.filter(f => f !== selectedFieldName));
            setSelectedFieldIds(prev =>
                prev.includes(selectedFieldName) ? prev : [...prev, selectedFieldName]
            );
        }
    }, [selectedFieldName]);

    // Group fields by party
    const fieldsByParty = groupFieldsByParty(formFields);

    // Get unassigned field count
    const unassignedFields = fieldsByParty['unassigned'] || [];
    const hasUnassignedFields = unassignedFields.length > 0;

    // Multi-select checkbox handlers
    const handleCheckboxToggle = (fieldName: string) => {
        const isCurrentlyChecked = selectedFieldIds.includes(fieldName);

        if (isCurrentlyChecked) {
            // User explicitly unchecked — remember this so isSelected styling is suppressed
            setManuallyUncheckedIds(mu => [...mu, fieldName]);
            setSelectedFieldIds(prev => prev.filter(f => f !== fieldName));

            // If the unchecked field was the highlighted one, clear highlighting
            if (selectedFieldName === fieldName) {
                console.log(`${LOG_PREFIX} Unchecked active field: ${fieldName} -> clearing highlight`);
                onFieldSelected(null);
            }
        } else {
            // User re-checked — clear from manually unchecked
            setManuallyUncheckedIds(mu => mu.filter(f => f !== fieldName));
            setSelectedFieldIds(prev => prev.includes(fieldName) ? prev : [...prev, fieldName]);

            // Also highlight it in PDF
            onFieldSelected(fieldName);
        }
    };

    const handleSelectAll = () => {
        if (selectedFieldIds.length === unassignedFields.length) {
            // Uncheck all
            setSelectedFieldIds([]);
            setManuallyUncheckedIds(unassignedFields.map(f => f.name));
            onFieldSelected(null);
            console.log(`${LOG_PREFIX} Unchecked all -> clearing highlights`);
        } else {
            // Check all
            const allFieldNames = unassignedFields.map(f => f.name);
            setSelectedFieldIds(allFieldNames);
            setManuallyUncheckedIds([]);
        }
    };

    // Handle party hover for highlighting
    const handlePartyHover = (partyId: string | null) => {
        setHoveredParty(partyId);
        onHighlightParty(partyId);
    };

    // Handle party selection for field assignment
    const handleAssignToParty = (partyId: string) => {
        // Multi-select mode: assign all selected fields
        if (selectedFieldIds.length > 0 && onMultipleFieldsAssign) {
            console.log(`${LOG_PREFIX} Assigning ${selectedFieldIds.length} fields to party: ${partyId}`);
            onMultipleFieldsAssign(selectedFieldIds, partyId);
            setSelectedFieldIds([]);
            return;
        }
        // Single-field mode
        if (!selectedFieldName) return;
        console.log(`${LOG_PREFIX} Assigning selected field to party: ${partyId}`);
        onPartySelected(partyId);
    };

    // Handle unassign field from party
    const handleUnassignField = (fieldName: string) => {
        console.log(`${LOG_PREFIX} Unassigning field: ${fieldName}`);
        setSelectedFieldIds(prev => prev.filter(f => f !== fieldName));
        onFieldUnassigned?.(fieldName);
    };

    // Drag-and-drop handlers
    const handleDragStart = (e: React.DragEvent, fieldName: string) => {
        // If the dragged field is part of a multi-select, drag all selected
        const fieldsToDrag = selectedFieldIds.includes(fieldName) && selectedFieldIds.length > 1
            ? selectedFieldIds
            : [fieldName];
        e.dataTransfer.setData('application/field-names', JSON.stringify(fieldsToDrag));
        e.dataTransfer.effectAllowed = 'move';
        console.log(`${LOG_PREFIX} Drag started: ${fieldsToDrag.join(', ')}`);
    };

    const handleDragOver = (e: React.DragEvent, partyId: string) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDragOverParty(partyId);
    };

    const handleDragLeave = () => {
        setDragOverParty(null);
    };

    const handleDrop = (e: React.DragEvent, partyId: string) => {
        e.preventDefault();
        setDragOverParty(null);
        const data = e.dataTransfer.getData('application/field-names');
        if (!data) return;

        try {
            const fieldNames: string[] = JSON.parse(data);
            console.log(`${LOG_PREFIX} Dropped ${fieldNames.length} field(s) on party: ${partyId}`);
            if (fieldNames.length > 1 && onMultipleFieldsAssign) {
                onMultipleFieldsAssign(fieldNames, partyId);
                setSelectedFieldIds([]);
            } else if (fieldNames.length === 1) {
                // Use single-field assign by temporarily selecting and assigning
                onFieldSelected(fieldNames[0]);
                // Directly call onPartySelected after setting the field
                // We need to use onMultipleFieldsAssign for reliability
                if (onMultipleFieldsAssign) {
                    onMultipleFieldsAssign(fieldNames, partyId);
                }
                setSelectedFieldIds(prev => prev.filter(f => f !== fieldNames[0]));
            }
        } catch (err) {
            console.error(`${LOG_PREFIX} Drop parse error:`, err);
        }
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
            <Box sx={{ p: 0.6, borderBottom: 1, borderColor: 'divider' }}>
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

                {selectedFieldIds.length > 0 ? (
                    <Alert severity="info" sx={{ py: 0 }}>
                        <Typography variant="body2">
                            {selectedFieldIds.length} field(s) selected. Click a party to assign.
                        </Typography>
                    </Alert>
                ) : selectedFieldName ? (
                    <Alert severity="info" sx={{ py: 0 }}>
                        <Typography variant="body2">

                        </Typography>
                    </Alert>
                ) : (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                        Click a field in the PDF, then select a party to assign it.
                    </Typography>
                )}
            </Box>

            {/* Party List */}
            <Box>
                {/* Parties header */}
                <ListItem
                    sx={{
                        borderRadius: 1,
                        bgcolor: 'transparent',
                        padding: 1
                    }}
                >
                    <ListItemIcon sx={{ minWidth: 36 }}>
                        <Badge badgeContent={parties.length} color="primary">
                            <Person color="action" />
                        </Badge>
                    </ListItemIcon>
                    <ListItemText
                        sx={{ paddingTop: 0, paddingBottom: 0 }}
                        primary="Parties"
                    />
                    <IconButton
                        size="small"
                        onClick={() => setPartiesSectionExpanded(prev => !prev)}
                    >
                        {partiesSectionExpanded ? <ExpandLess /> : <ExpandMore />}
                    </IconButton>
                </ListItem>

                <Collapse in={partiesSectionExpanded}>
                    {/* Party scroll container */}
                    <Box sx={{
                        maxHeight: 160,
                        overflowY: 'auto',
                        overflowX: 'hidden',
                        padding: 0.2
                    }}>
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
                                                px: 0.5,
                                                py: 0.2,
                                                bgcolor: dragOverParty === party.id
                                                    ? `${party.color}20`
                                                    : hoveredParty === party.id ? 'action.hover' : 'transparent',
                                                border: dragOverParty === party.id
                                                    ? `2px solid ${party.color}`
                                                    : (selectedFieldName || selectedFieldIds.length > 0) ? '2px dashed' : '2px solid transparent',
                                                borderColor: dragOverParty === party.id
                                                    ? party.color
                                                    : (selectedFieldName || selectedFieldIds.length > 0) ? party.color : 'transparent',
                                                cursor: (selectedFieldName || selectedFieldIds.length > 0) ? 'pointer' : 'default',
                                                transition: 'all 0.2s',
                                                transform: dragOverParty === party.id ? 'scale(1.02)' : 'scale(1)',
                                                '&:hover': {
                                                    bgcolor: 'action.hover',
                                                },
                                            }}
                                            onClick={() => (selectedFieldName || selectedFieldIds.length > 0) && handleAssignToParty(party.id)}
                                            onMouseEnter={() => handlePartyHover(party.id)}
                                            onMouseLeave={() => handlePartyHover(null)}
                                            onDragOver={(e) => handleDragOver(e, party.id)}
                                            onDragLeave={handleDragLeave}
                                            onDrop={(e) => handleDrop(e, party.id)}
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
                                                        {onFieldUnassigned && (
                                                            <Tooltip title="Remove from Party">
                                                                <IconButton
                                                                    size="small"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleUnassignField(field.name);
                                                                    }}
                                                                    sx={{
                                                                        p: 0.25,
                                                                        color: 'text.secondary',
                                                                        '&:hover': { color: 'error.main' },
                                                                    }}
                                                                >
                                                                    <Close sx={{ fontSize: 14 }} />
                                                                </IconButton>
                                                            </Tooltip>
                                                        )}
                                                    </Box>
                                                ))}
                                            </Box>
                                        </Collapse>
                                    </Box>
                                );
                            })}
                        </List>
                    </Box>
                </Collapse>

                {/* Unassigned fields section */}
                {hasUnassignedFields && (
                    <>
                        <Divider sx={{ my: 1 }} />
                        <ListItem
                            sx={{
                                borderRadius: 1,
                                p: 1,
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
                                sx={{ paddingTop: 0, paddingBottom: 0 }}
                                primary="Unassigned"
                            // secondary={`${unassignedFields.length} field(s) need assignment`}
                            />
                            <IconButton
                                size="small"
                                onClick={() => setExpandedParty(expandedParty === 'unassigned' ? null : 'unassigned')}
                            >
                                {expandedParty === 'unassigned' ? <ExpandLess /> : <ExpandMore />}
                            </IconButton>
                        </ListItem>

                        <Collapse in={expandedParty === 'unassigned'}>
                            <Box sx={{
                                maxHeight: 160,
                                overflowY: 'auto',
                                overflowX: 'hidden',
                                pl: 2,
                                pr: 1,
                                pb: 1,
                            }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                                    <Checkbox
                                        size="small"
                                        checked={unassignedFields.length > 0 && selectedFieldIds.length === unassignedFields.length}
                                        indeterminate={selectedFieldIds.length > 0 && selectedFieldIds.length < unassignedFields.length}
                                        onChange={handleSelectAll}
                                        sx={{ p: 0.25, mr: 0.5 }}
                                    />
                                    <Typography variant="caption" color="text.secondary">
                                        {selectedFieldIds.length > 0
                                            ? `${selectedFieldIds.length} selected — click a party to assign`
                                            : 'Select All'}
                                    </Typography>
                                </Box>
                                {unassignedFields.map((field) => {
                                    const isChecked = selectedFieldIds.includes(field.name);
                                    // isSelected is suppressed if the user explicitly unchecked this field
                                    const isSelected = selectedFieldName === field.name && !manuallyUncheckedIds.includes(field.name);
                                    return (
                                        <Box
                                            key={field.name}
                                            draggable
                                            onDragStart={(e) => handleDragStart(e, field.name)}
                                            sx={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 0.5,
                                                py: 0.75,
                                                px: 1,
                                                borderRadius: 1,
                                                bgcolor: isChecked ? 'primary.light' : isSelected ? 'primary.main' : 'warning.light',
                                                color: (isChecked || isSelected) ? 'white' : 'inherit',
                                                mb: 0.5,
                                                cursor: 'grab',
                                                border: (isChecked || isSelected) ? '2px solid' : '2px solid transparent',
                                                borderColor: isChecked ? 'primary.main' : isSelected ? 'primary.dark' : 'transparent',
                                                transition: 'all 0.2s',
                                                userSelect: 'none',
                                                '&:hover': {
                                                    bgcolor: isChecked ? 'primary.main' : isSelected ? 'primary.dark' : 'warning.main',
                                                    transform: 'scale(1.02)',
                                                },
                                                '&:active': {
                                                    cursor: 'grabbing',
                                                },
                                            }}
                                            onClick={() => {
                                                console.log(`${LOG_PREFIX} Card clicked: ${field.name}, current state: isChecked=${isChecked}`);
                                                handleCheckboxToggle(field.name);
                                            }}
                                        >
                                            <Checkbox
                                                size="small"
                                                checked={isChecked}
                                                onChange={(e) => {
                                                    e.stopPropagation();
                                                    handleCheckboxToggle(field.name);
                                                }}
                                                onClick={(e) => e.stopPropagation()}
                                                sx={{
                                                    p: 0.25,
                                                    color: (isChecked || isSelected) ? 'white' : 'inherit',
                                                    '&.Mui-checked': { color: 'white' },
                                                }}
                                            />
                                            <Box
                                                sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, overflow: 'hidden' }}
                                            >
                                                {getFieldTypeIcon(field.type)}
                                                <Typography variant="body2" fontWeight={(isChecked || isSelected) ? 'bold' : 'normal'} noWrap sx={{ flex: 1 }}>
                                                    {field.label || field.name}
                                                </Typography>
                                            </Box>
                                            {isSelected && !isChecked && (
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
                                    );
                                })}
                            </Box>
                        </Collapse>
                    </>
                )}
            </Box>
        </Paper>
    );
}

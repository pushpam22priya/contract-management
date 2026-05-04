'use client';

import { useState, useEffect } from 'react';
import {
    Box,
    Typography,
    Chip,
    MenuItem,
    Select,
    FormControl,
    useMediaQuery,
    useTheme,
    Divider,
    Paper,
} from '@mui/material';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import BaseDialog from '@/components/common/BaseDialog';
import AppButton from '@/components/common/AppButton';
import { FormFieldDefinition, PartyConfiguration } from '@/types/template';
import { ProfileKeyOption } from '@/utils/profileKeyOptions';

interface ProfileFieldMappingDialogProps {
    open: boolean;
    onClose: () => void;
    onSave: (updatedFields: FormFieldDefinition[]) => void;
    formFields: FormFieldDefinition[];
    parties: PartyConfiguration[];
    profileKeyOptions: ProfileKeyOption[];
}

export default function ProfileFieldMappingDialog({
    open,
    onClose,
    onSave,
    formFields,
    parties,
    profileKeyOptions,
}: ProfileFieldMappingDialogProps) {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

    // fieldName → profileKey ('' means none / unassigned)
    const [mappings, setMappings] = useState<Record<string, string>>({});

    // Reset mappings when dialog opens, seeding from existing profileKey values
    useEffect(() => {
        if (!open) return;
        const initial: Record<string, string> = {};
        formFields.forEach((f) => {
            if (f.type !== 'signature') {
                initial[f.name] = f.profileKey ?? '';
            }
        });
        setMappings(initial);
    }, [open, formFields]);

    // Only text-type fields are mappable (exclude signature fields)
    const mappableFields = formFields.filter(
        (f) => f.type !== 'signature'
    );

    // Group fields by party
    const partyGroups: { party: PartyConfiguration | null; fields: FormFieldDefinition[] }[] = [];

    parties.forEach((party) => {
        const fields = mappableFields.filter((f) => f.assignedParty === party.id);
        if (fields.length > 0) partyGroups.push({ party, fields });
    });

    const unassignedFields = mappableFields.filter(
        (f) => !f.assignedParty || f.assignedParty === 'unassigned' || !parties.find((p) => p.id === f.assignedParty)
    );
    if (unassignedFields.length > 0) partyGroups.push({ party: null, fields: unassignedFields });

    const handleChange = (fieldName: string, value: string) => {
        setMappings((prev) => ({ ...prev, [fieldName]: value }));
    };

    const handleSave = () => {
        const updated = formFields.map((f) => {
            if (f.type === 'signature') return f;
            const key = mappings[f.name];
            return { ...f, profileKey: key || null };
        });
        onSave(updated);
    };

    const renderFieldRow = (field: FormFieldDefinition, party: PartyConfiguration | null) => {
        const currentMapping = mappings[field.name] ?? '';

        if (isMobile) {
            return (
                <Paper
                    key={field.name}
                    variant="outlined"
                    sx={{ p: 1.5, mb: 1, borderRadius: 2 }}
                >
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                        <Typography variant="body2" sx={{ fontWeight: 500, wordBreak: 'break-all' }}>
                            {field.label || field.name}
                        </Typography>
                        {party && (
                            <Chip
                                label={party.label}
                                size="small"
                                sx={{ bgcolor: party.color, color: '#fff', fontWeight: 600, fontSize: '0.65rem', ml: 1, flexShrink: 0 }}
                            />
                        )}
                    </Box>
                    <FormControl fullWidth size="small">
                        <Select
                            value={currentMapping}
                            onChange={(e) => handleChange(field.name, e.target.value)}
                            displayEmpty
                            sx={{ fontSize: '0.8rem' }}
                        >
                            <MenuItem value="">
                                <Typography variant="body2" sx={{ color: 'text.disabled', fontStyle: 'italic' }}>
                                    — None —
                                </Typography>
                            </MenuItem>
                            {profileKeyOptions.map((opt) => (
                                <MenuItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </Paper>
            );
        }

        // Desktop row
        return (
            <Box
                key={field.name}
                sx={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 120px 180px',
                    gap: 2,
                    alignItems: 'center',
                    py: 0.75,
                    px: 1,
                    borderRadius: 1,
                    '&:hover': { bgcolor: 'action.hover' },
                }}
            >
                <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>
                    {field.label || field.name}
                </Typography>
                <Box>
                    {party ? (
                        <Chip
                            label={party.label}
                            size="small"
                            sx={{ bgcolor: party.color, color: '#fff', fontWeight: 600, fontSize: '0.65rem' }}
                        />
                    ) : (
                        <Typography variant="body2" sx={{ color: 'text.disabled', fontStyle: 'italic' }}>
                            Unassigned
                        </Typography>
                    )}
                </Box>
                <FormControl fullWidth size="small">
                    <Select
                        value={currentMapping}
                        onChange={(e) => handleChange(field.name, e.target.value)}
                        displayEmpty
                        sx={{ fontSize: '0.8rem' }}
                    >
                        <MenuItem value="">
                            <Typography variant="body2" sx={{ color: 'text.disabled', fontStyle: 'italic' }}>
                                — None —
                            </Typography>
                        </MenuItem>
                        {profileKeyOptions.map((opt) => (
                            <MenuItem key={opt.value} value={opt.value}>
                                {opt.label}
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>
            </Box>
        );
    };

    return (
        <BaseDialog
            open={open}
            onClose={onClose}
            title="Map Fields to Profile"
            maxWidth="md"
            actions={
                <>
                    <AppButton variant="outlined" onClick={onClose} size="small">
                        Cancel
                    </AppButton>
                    <AppButton
                        variant="contained"
                        onClick={handleSave}
                        size="small"
                        startIcon={<AccountCircleIcon sx={{ fontSize: 16 }} />}
                    >
                        Save Mappings
                    </AppButton>
                </>
            }
        >
            <Box sx={{ pt: 1 }}>
                <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
                    Map each field to a user profile key. When a signer autofills, the matching profile value is inserted automatically.
                </Typography>

                {mappableFields.length === 0 ? (
                    <Typography variant="body2" sx={{ color: 'warning.main', textAlign: 'center', py: 3 }}>
                        No mappable fields found in this template.
                    </Typography>
                ) : (
                    <>
                        {/* Desktop column headers */}
                        {!isMobile && (
                            <Box
                                sx={{
                                    display: 'grid',
                                    gridTemplateColumns: '1fr 120px 180px',
                                    gap: 2,
                                    px: 1,
                                    mb: 0.5,
                                }}
                            >
                                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                    Field
                                </Typography>
                                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                    Party
                                </Typography>
                                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                    Profile Key
                                </Typography>
                            </Box>
                        )}

                        {partyGroups.map(({ party, fields }, idx) => (
                            <Box key={party?.id ?? 'unassigned'} sx={{ mb: 1 }}>
                                {partyGroups.length > 1 && (
                                    <>
                                        {idx > 0 && <Divider sx={{ my: 1 }} />}
                                        <Typography
                                            variant="caption"
                                            sx={{
                                                display: 'block',
                                                fontWeight: 700,
                                                color: party ? party.color : 'text.secondary',
                                                mb: 0.5,
                                                px: isMobile ? 0 : 1,
                                                textTransform: 'uppercase',
                                                letterSpacing: 0.5,
                                            }}
                                        >
                                            {party ? party.label : 'Unassigned'}
                                        </Typography>
                                    </>
                                )}
                                {fields.map((f) => renderFieldRow(f, party))}
                            </Box>
                        ))}
                    </>
                )}
            </Box>
        </BaseDialog>
    );
}

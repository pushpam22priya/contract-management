'use client';

import { useState, useEffect } from 'react';
import {
    Box,
    Typography,
    MenuItem,
    Select,
    FormControl,
    useMediaQuery,
    useTheme,
    Autocomplete,
    TextField,
    Chip,
} from '@mui/material';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import TodayIcon from '@mui/icons-material/Today';
import BaseDialog from '@/components/common/BaseDialog';
import AppButton from '@/components/common/AppButton';
import { FormFieldDefinition, PartyConfiguration } from '@/types/template';
import { ProfileKeyOption, DATE_TODAY_KEY } from '@/utils/profileKeyOptions';

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
    // Field names mapped to today's date
    const [dateMappedFields, setDateMappedFields] = useState<string[]>([]);

    // Reset both mapping states when dialog opens
    useEffect(() => {
        if (!open) return;
        const initial: Record<string, string> = {};
        const dateFields: string[] = [];
        formFields.forEach((f) => {
            if (f.type !== 'signature' && (f.type as string) !== 'Sig') {
                if (f.profileKey === DATE_TODAY_KEY) {
                    initial[f.name] = ''; // keep profile dropdown empty for date-mapped fields
                    dateFields.push(f.name);
                } else {
                    initial[f.name] = f.profileKey ?? '';
                }
            }
        });
        setMappings(initial);
        setDateMappedFields(dateFields);
    }, [open, formFields]);

    // Only text-type fields are mappable (exclude signature fields)
    const mappableFields = formFields.filter(
        (f) => f.type !== 'signature' && (f.type as string) !== 'Sig'
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
        // Setting a profile key removes the field from date mapping (mutual exclusivity)
        if (value) {
            setDateMappedFields((prev) => prev.filter((n) => n !== fieldName));
        }
    };

    const handleDateMappingChange = (_: React.SyntheticEvent, newValue: FormFieldDefinition[]) => {
        const newNames = newValue.map((f) => f.name);
        setDateMappedFields(newNames);
        // Clear any profile key for newly date-mapped fields (mutual exclusivity)
        setMappings((prev) => {
            const next = { ...prev };
            newNames.forEach((name) => { next[name] = ''; });
            return next;
        });
    };

    const handleSave = () => {
        const updated = formFields.map((f) => {
            if (f.type === 'signature' || (f.type as string) === 'Sig') return f;
            if (dateMappedFields.includes(f.name)) {
                return { ...f, profileKey: DATE_TODAY_KEY };
            }
            const key = mappings[f.name];
            return { ...f, profileKey: key || null };
        });
        onSave(updated);
    };

    // Fields available for date mapping: mappable fields that have no profile key set
    const dateAvailableOptions = mappableFields.filter((f) => !mappings[f.name]);
    // Current selection for the Autocomplete (field objects for the selected names)
    const dateMappedFieldObjects = dateMappedFields
        .map((name) => mappableFields.find((f) => f.name === name))
        .filter((f): f is FormFieldDefinition => !!f);

    const renderFieldRow = (field: FormFieldDefinition) => {
        const currentMapping = mappings[field.name] ?? '';

        return (
            <Box
                key={field.name}
                sx={{
                    display: 'grid',
                    gridTemplateColumns: isMobile ? '1fr' : '1fr 180px',
                    gap: isMobile ? 0.5 : 2,
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
            maxWidth="sm"
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
                        {/* Column headers */}
                        {!isMobile && (
                            <Box
                                sx={{
                                    display: 'grid',
                                    gridTemplateColumns: '1fr 180px',
                                    gap: 2,
                                    px: 1,
                                    mb: 1,
                                }}
                            >
                                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                    Field
                                </Typography>
                                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                    Profile Key
                                </Typography>
                            </Box>
                        )}

                        {/* Profile key mapping — per-party groups */}
                        {partyGroups.map(({ party, fields }) => (
                            <Box
                                key={party?.id ?? 'unassigned'}
                                component="fieldset"
                                sx={{
                                    border: '1px solid',
                                    borderColor: party ? party.color : 'divider',
                                    borderRadius: 2,
                                    mb: 2,
                                    px: 0.5,
                                    pb: 0.5,
                                    pt: 0,
                                    margin: '0 0 16px 0',
                                    minWidth: 0,
                                }}
                            >
                                <Box
                                    component="legend"
                                    sx={{
                                        px: 0.75,
                                        ml: 0.5,
                                        color: party ? party.color : 'text.secondary',
                                        fontWeight: 700,
                                        fontSize: '0.7rem',
                                        textTransform: 'uppercase',
                                        letterSpacing: 0.5,
                                        lineHeight: 1.4,
                                    }}
                                >
                                    {party ? party.label : 'Unassigned'}
                                </Box>

                                {fields.map((f) => renderFieldRow(f))}
                            </Box>
                        ))}

                        {/* Today's date mapping section */}
                        <Box
                            component="fieldset"
                            sx={{
                                border: '1px solid',
                                borderColor: 'warning.main',
                                borderRadius: 2,
                                mt: 1,
                                px: 1,
                                pb: 1.5,
                                pt: 0,
                                margin: '8px 0 0 0',
                                minWidth: 0,
                            }}
                        >
                            <Box
                                component="legend"
                                sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 0.5,
                                    px: 0.75,
                                    ml: 0.5,
                                    color: 'warning.dark',
                                    fontWeight: 700,
                                    fontSize: '0.7rem',
                                    textTransform: 'uppercase',
                                    letterSpacing: 0.5,
                                    lineHeight: 1.4,
                                }}
                            >
                                <TodayIcon sx={{ fontSize: 11 }} />
                                Map to Today&apos;s Date
                            </Box>

                            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1.5, mt: 0.5, lineHeight: 1.5 }}>
                                Selected fields will be automatically filled with the current date (DD/MM/YYYY) when autofill runs. Only fields without a profile key mapping are available.
                            </Typography>

                            <Autocomplete
                                multiple
                                options={dateAvailableOptions}
                                value={dateMappedFieldObjects}
                                onChange={handleDateMappingChange}
                                getOptionLabel={(f) => f.label || f.name}
                                isOptionEqualToValue={(opt, val) => opt.name === val.name}
                                disableCloseOnSelect
                                size="small"
                                noOptionsText="All fields are already mapped to a profile key"
                                renderOption={(props, option) => {
                                    const { key, ...rest } = props as any;
                                    const partyColor = parties.find((p) => p.id === option.assignedParty)?.color;
                                    const partyLabel = parties.find((p) => p.id === option.assignedParty)?.label;
                                    return (
                                        <Box component="li" key={key} {...rest} sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: '0.82rem' }}>
                                            {partyLabel && (
                                                <Box
                                                    sx={{
                                                        width: 8, height: 8, borderRadius: '50%',
                                                        bgcolor: partyColor || 'text.disabled',
                                                        flexShrink: 0,
                                                    }}
                                                />
                                            )}
                                            <span>{option.label || option.name}</span>
                                            {partyLabel && (
                                                <Typography variant="caption" sx={{ color: 'text.disabled', ml: 'auto' }}>
                                                    {partyLabel}
                                                </Typography>
                                            )}
                                        </Box>
                                    );
                                }}
                                renderTags={(value, getTagProps) =>
                                    value.map((option, index) => {
                                        const { key, ...tagProps } = getTagProps({ index });
                                        return (
                                            <Chip
                                                key={key}
                                                label={option.label || option.name}
                                                size="small"
                                                {...tagProps}
                                                sx={{ fontSize: '0.72rem', height: 22 }}
                                            />
                                        );
                                    })
                                }
                                renderInput={(params) => (
                                    <TextField
                                        {...params}
                                        placeholder={dateMappedFieldObjects.length === 0 ? 'Select fields to fill with today\'s date…' : ''}
                                        size="small"
                                        sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                                    />
                                )}
                            />
                        </Box>
                    </>
                )}
            </Box>
        </BaseDialog>
    );
}

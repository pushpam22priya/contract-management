'use client';

import { useState } from 'react';
import {
    Box,
    Typography,
    RadioGroup,
    FormControlLabel,
    Radio,
    Chip,
} from '@mui/material';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import BaseDialog from '@/components/common/BaseDialog';
import AppButton from '@/components/common/AppButton';
import { PartyConfiguration } from '@/types/template';

interface AutofillPartyDialogProps {
    open: boolean;
    onClose: () => void;
    onConfirm: (partyId: string) => void;
    parties: PartyConfiguration[];
    formFields: any[];
}

export default function AutofillPartyDialog({
    open,
    onClose,
    onConfirm,
    parties,
    formFields,
}: AutofillPartyDialogProps) {
    const [selectedPartyId, setSelectedPartyId] = useState<string>('');

    const handleClose = () => {
        setSelectedPartyId('');
        onClose();
    };

    const handleConfirm = () => {
        if (!selectedPartyId) return;
        const id = selectedPartyId;
        setSelectedPartyId('');
        onConfirm(id);
    };

    // Count text (non-signature) fields per party
    const getTextFieldCount = (partyId: string) =>
        formFields.filter(
            (f) => f.assignedParty === partyId && f.type !== 'Sig' && f.type !== 'signature'
        ).length;

    const partiesWithFields = parties.filter((p) => getTextFieldCount(p.id) > 0);

    const selectedPartyHasNoFields =
        !!selectedPartyId && getTextFieldCount(selectedPartyId) === 0;

    return (
        <BaseDialog
            open={open}
            onClose={handleClose}
            title="Select Your Party"
            maxWidth="xs"
            actions={
                <>
                    <AppButton variant="outlined" onClick={handleClose} size="small">
                        Cancel
                    </AppButton>
                    <AppButton
                        variant="contained"
                        onClick={handleConfirm}
                        disabled={!selectedPartyId || selectedPartyHasNoFields}
                        size="small"
                        startIcon={<AutoFixHighIcon sx={{ fontSize: 16 }} />}
                    >
                        Autofill
                    </AppButton>
                </>
            }
        >
            <Box sx={{ pt: 1 }}>
                <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
                    Choose the party you represent to autofill your profile data into matching fields.
                </Typography>

                {partiesWithFields.length === 0 ? (
                    <Typography variant="body2" sx={{ color: 'warning.main', textAlign: 'center', py: 2 }}>
                        No fillable text fields found in this document.
                    </Typography>
                ) : (
                    <RadioGroup
                        value={selectedPartyId}
                        onChange={(e) => setSelectedPartyId(e.target.value)}
                    >
                        {partiesWithFields.map((party) => {
                            const count = getTextFieldCount(party.id);
                            return (
                                <FormControlLabel
                                    key={party.id}
                                    value={party.id}
                                    control={<Radio size="small" sx={{ color: party.color, '&.Mui-checked': { color: party.color } }} />}
                                    label={
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}>
                                            <Typography variant="body2" sx={{ fontWeight: selectedPartyId === party.id ? 600 : 400 }}>
                                                {party.label}
                                            </Typography>
                                            <Chip
                                                label={`${count} field${count !== 1 ? 's' : ''}`}
                                                size="small"
                                                sx={{
                                                    height: 20,
                                                    fontSize: '0.68rem',
                                                    bgcolor: selectedPartyId === party.id ? party.color : 'action.hover',
                                                    color: selectedPartyId === party.id ? '#fff' : 'text.secondary',
                                                    fontWeight: 500,
                                                }}
                                            />
                                        </Box>
                                    }
                                    sx={{
                                        mx: 0,
                                        px: 1.5,
                                        py: 0.25,
                                        borderRadius: 2,
                                        border: '1px solid',
                                        borderColor: selectedPartyId === party.id ? party.color : 'divider',
                                        mb: 1,
                                        transition: 'all 0.15s',
                                        bgcolor: selectedPartyId === party.id ? `${party.color}10` : 'transparent',
                                    }}
                                />
                            );
                        })}
                    </RadioGroup>
                )}
            </Box>
        </BaseDialog>
    );
}

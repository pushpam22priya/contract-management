/**
* Party Validation Utilities
*
* Utilities for validating multi-party field completion in templates and contracts.
* Used during contract creation and external signing to ensure all party fields are filled.
*/
 
import { FormFieldDefinition, PartyConfiguration } from '@/types/template';
import { PartyFilledStatus } from '@/types/contract';
 
// Debug logging prefix
const LOG_PREFIX = '[PARTY-VALIDATION]';
 
/**
* Result of validating a party's fields
*/
export interface PartyValidationResult {
    isComplete: boolean;           // All required fields for this party are filled
    filledCount: number;           // Number of fields filled
    totalCount: number;            // Total fields assigned to this party
    requiredCount: number;         // Number of required fields
    requiredFilledCount: number;   // Number of required fields that are filled
    missingFields: string[];       // Names of required fields that are not filled
    missingFieldLabels: string[];  // Human-readable labels of missing fields
}
 
/**
* Default party colors for visual distinction
*/
export const DEFAULT_PARTY_COLORS: Record<string, string> = {
    'party_1': '#4CAF50',  // Green
    'party_2': '#2196F3',  // Blue
    'party_3': '#FF9800',  // Orange
    'party_4': '#9C27B0',  // Purple
    'party_5': '#E91E63',  // Pink
    'unassigned': '#9E9E9E', // Grey
};
 
/**
* Get a color for a party by index or ID
*/
export const getPartyColor = (partyId: string, index?: number): string => {
    if (DEFAULT_PARTY_COLORS[partyId]) {
        return DEFAULT_PARTY_COLORS[partyId];
    }
    // Generate a color based on index if provided
    const colors = Object.values(DEFAULT_PARTY_COLORS).filter(c => c !== '#9E9E9E');
    if (index !== undefined) {
        return colors[index % colors.length];
    }
    return DEFAULT_PARTY_COLORS['unassigned'];
};
 
/**
* Group form fields by their assigned party
*/
export const groupFieldsByParty = (
    formFields: FormFieldDefinition[]
): Record<string, FormFieldDefinition[]> => {
    console.log(`${LOG_PREFIX} Grouping ${formFields?.length || 0} fields by party`);
 
    if (!formFields || formFields.length === 0) {
        return {};
    }
 
    const grouped = formFields.reduce((acc, field) => {
        const party = field.assignedParty || 'unassigned';
        if (!acc[party]) {
            acc[party] = [];
        }
        acc[party].push(field);
        return acc;
    }, {} as Record<string, FormFieldDefinition[]>);
 
    // Log the grouping
    Object.entries(grouped).forEach(([party, fields]) => {
        console.log(`${LOG_PREFIX} Party "${party}": ${fields.length} fields`);
    });
 
    return grouped;
};
 
/**
* Validate if all fields for a specific party are filled
*/
export const validatePartyFields = (
    partyId: string,
    formFields: FormFieldDefinition[],
    fieldValues: Record<string, string>,
    signatureStatus?: Record<string, boolean>
): PartyValidationResult => {
    console.log(`${LOG_PREFIX} Validating party "${partyId}"`);
    console.log(`${LOG_PREFIX} Field values:`, fieldValues);
    console.log(`${LOG_PREFIX} Signature status:`, signatureStatus);
 
    // Get fields for this party
    const partyFields = formFields.filter(f => f.assignedParty === partyId);
    console.log(`${LOG_PREFIX} Found ${partyFields.length} fields for party "${partyId}"`);
 
    const missingFields: string[] = [];
    const missingFieldLabels: string[] = [];
    let filledCount = 0;
    let requiredCount = 0;
    let requiredFilledCount = 0;
 
    for (const field of partyFields) {
        const isRequired = field.required !== false; // Default to required
        if (isRequired) {
            requiredCount++;
        }
 
        let isFilled = false;
 
        if (field.type === 'signature' || (field.type as string) === 'Sig') {
            // Check signature status map or fieldValues for signature data
            isFilled = !!(signatureStatus?.[field.name] || fieldValues[field.name]);
            console.log(`${LOG_PREFIX} Signature field "${field.name}": filled=${isFilled}`);
        } else {
            // Check text/other field values
            const value = fieldValues[field.name];
            isFilled = !!(value && value.toString().trim() !== '');
            console.log(`${LOG_PREFIX} Field "${field.name}": value="${value}", filled=${isFilled}`);
        }
 
        if (isFilled) {
            filledCount++;
            if (isRequired) {
                requiredFilledCount++;
            }
        } else if (isRequired) {
            missingFields.push(field.name);
            missingFieldLabels.push(field.label || field.name);
        }
    }
 
    const result: PartyValidationResult = {
        isComplete: missingFields.length === 0,
        filledCount,
        totalCount: partyFields.length,
        requiredCount,
        requiredFilledCount,
        missingFields,
        missingFieldLabels,
    };
 
    console.log(`${LOG_PREFIX} Validation result for "${partyId}":`, result);
    return result;
};
 
/**
* Check if any fields for a party have been filled (partial fill detection)
*/
export const hasPartiallyFilledParty = (
    partyId: string,
    formFields: FormFieldDefinition[],
    fieldValues: Record<string, string>,
    signatureStatus?: Record<string, boolean>
): boolean => {
    const result = validatePartyFields(partyId, formFields, fieldValues, signatureStatus);
    const hasPartial = result.filledCount > 0 && !result.isComplete;
    console.log(`${LOG_PREFIX} Party "${partyId}" partial fill: ${hasPartial} (${result.filledCount}/${result.totalCount})`);
    return hasPartial;
};
 
/**
* Get all parties that have any filled fields
*/
export const getPartiesWithFilledFields = (
    formFields: FormFieldDefinition[],
    fieldValues: Record<string, string>,
    signatureStatus?: Record<string, boolean>
): string[] => {
    const fieldsByParty = groupFieldsByParty(formFields);
    const partiesWithFields: string[] = [];
 
    for (const partyId of Object.keys(fieldsByParty)) {
        const result = validatePartyFields(partyId, formFields, fieldValues, signatureStatus);
        if (result.filledCount > 0) {
            partiesWithFields.push(partyId);
        }
    }
 
    console.log(`${LOG_PREFIX} Parties with filled fields:`, partiesWithFields);
    return partiesWithFields;
};
 
/**
* Generate PartyFilledStatus for a party
*/
export const generatePartyFilledStatus = (
    partyId: string,
    formFields: FormFieldDefinition[],
    fieldValues: Record<string, string>,
    signatureStatus?: Record<string, boolean>,
    filledBy?: string,
    filledByName?: string
): PartyFilledStatus => {
    const result = validatePartyFields(partyId, formFields, fieldValues, signatureStatus);
 
    return {
        partyId,
        filledBy: result.filledCount > 0 ? filledBy : undefined,
        filledByName: result.filledCount > 0 ? filledByName : undefined,
        filledAt: result.filledCount > 0 ? new Date().toISOString() : undefined,
        isComplete: result.isComplete,
        fieldCount: result.totalCount,
        filledCount: result.filledCount,
    };
};
 
/**
* Generate PartyFilledStatus for all parties
*/
export const generateAllPartyFilledStatus = (
    parties: PartyConfiguration[],
    formFields: FormFieldDefinition[],
    fieldValues: Record<string, string>,
    signatureStatus?: Record<string, boolean>,
    currentFillerEmail?: string,
    currentFillerName?: string,
    currentFillingParty?: string
): Record<string, PartyFilledStatus> => {
    console.log(`${LOG_PREFIX} Generating filled status for ${parties.length} parties`);
 
    const statusMap: Record<string, PartyFilledStatus> = {};
 
    for (const party of parties) {
        // Only attribute to current filler if they're filling this party
        const isCurrentParty = currentFillingParty === party.id;
        statusMap[party.id] = generatePartyFilledStatus(
            party.id,
            formFields,
            fieldValues,
            signatureStatus,
            isCurrentParty ? currentFillerEmail : undefined,
            isCurrentParty ? currentFillerName : undefined
        );
    }
 
    console.log(`${LOG_PREFIX} Generated status map:`, statusMap);
    return statusMap;
};
 
/**
* Get the next party in the signing sequence that needs to be filled
*/
export const getNextPartyToSign = (
    parties: PartyConfiguration[],
    partyFilledStatus: Record<string, PartyFilledStatus>
): PartyConfiguration | null => {
    // Sort parties by order
    const sortedParties = [...parties].sort((a, b) => a.order - b.order);
 
    for (const party of sortedParties) {
        const status = partyFilledStatus[party.id];
        if (!status?.isComplete) {
            console.log(`${LOG_PREFIX} Next party to sign: ${party.id} (${party.label})`);
            return party;
        }
    }
 
    console.log(`${LOG_PREFIX} All parties have completed signing`);
    return null;
};
 
/**
* Check if all parties have completed their fields
*/
export const areAllPartiesComplete = (
    parties: PartyConfiguration[],
    partyFilledStatus: Record<string, PartyFilledStatus>
): boolean => {
    for (const party of parties) {
        const status = partyFilledStatus[party.id];
        if (!status?.isComplete) {
            console.log(`${LOG_PREFIX} Party "${party.id}" is not complete`);
            return false;
        }
    }
    console.log(`${LOG_PREFIX} All parties are complete`);
    return true;
};
 
/**
* Create default party configurations
*/
export const createDefaultParties = (count: number = 3): PartyConfiguration[] => {
    const defaultLabels = ['Contractor', 'Client', 'Witness', 'Guarantor', 'Observer'];
    const parties: PartyConfiguration[] = [];
 
    for (let i = 0; i < count; i++) {
        const partyId = `party_${i + 1}`;
        parties.push({
            id: partyId,
            label: defaultLabels[i] || `Party ${i + 1}`,
            color: getPartyColor(partyId, i),
            order: i + 1,
        });
    }
 
    console.log(`${LOG_PREFIX} Created ${count} default parties:`, parties);
    return parties;
};
 
/**
* Validate that all assigned parties exist in the party configuration
*/
export const validatePartyAssignments = (
    formFields: FormFieldDefinition[],
    parties: PartyConfiguration[]
): { valid: boolean; orphanedFields: FormFieldDefinition[] } => {
    const partyIds = new Set(parties.map(p => p.id));
    partyIds.add('unassigned'); // Always valid
 
    const orphanedFields = formFields.filter(field => {
        const assignedParty = field.assignedParty;
        return assignedParty && !partyIds.has(assignedParty);
    });
 
    const valid = orphanedFields.length === 0;
    console.log(`${LOG_PREFIX} Party assignment validation: valid=${valid}, orphaned=${orphanedFields.length}`);
 
    return { valid, orphanedFields };
};
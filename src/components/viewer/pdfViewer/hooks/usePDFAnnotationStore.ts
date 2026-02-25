import { useRef } from 'react';

/**
 * Hook to manage internal PDF annotation metadata and persistence state.
 * Groups all Map and state refs used for signature protection, field mapping, and auto-save tracking.
 */
export const usePDFAnnotationStore = () => {
    // Lifecycle and Global Flags
    const isInitializingRef = useRef(false);
    const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const hasUnsavedChanges = useRef(false);
    const isApplyingSignAllRef = useRef(false);

    // Metadata and Persistence Maps
    const fieldMetadataStoreRef = useRef<Map<string, any>>(new Map());
    const capturedSignatureAnnotationsRef = useRef<Map<string, any>>(new Map());
    const capturedFieldValuesRef = useRef<Map<string, string>>(new Map());
    const signatureAnnotationPartyRef = useRef<Map<string, string>>(new Map());
    const fieldPartyAssignmentsRef = useRef<Map<string, { partyId: string; partyLabel: string; partyColor: string }>>(new Map());
    const signatureAnnotationToFieldRef = useRef<Map<string, string>>(new Map());

    // Protection and Restoration Data
    const prefilledSignaturePositionsRef = useRef<Map<string, { X: number; Y: number; Width: number; Height: number; PageNumber: number }>>(new Map());
    const prefilledSignatureDataRef = useRef<Map<string, { xfdf: string; annotType: string }>>(new Map());

    return {
        isInitializingRef,
        autoSaveTimeoutRef,
        hasUnsavedChanges,
        isApplyingSignAllRef,
        fieldMetadataStoreRef,
        capturedSignatureAnnotationsRef,
        capturedFieldValuesRef,
        signatureAnnotationPartyRef,
        fieldPartyAssignmentsRef,
        signatureAnnotationToFieldRef,
        prefilledSignaturePositionsRef,
        prefilledSignatureDataRef
    };
};

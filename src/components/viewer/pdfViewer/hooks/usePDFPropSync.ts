import { useRef, useEffect } from 'react';

interface PropSyncData {
    protectedPartyIds?: string[];
    formFields?: any[];
    onSignatureApplied?: (data: { emptySignatureFieldCount: number }) => void;
    onFieldChange?: (fieldName: string, value: any) => void;
}

/**
 * Hook to synchronize external component props with internal refs.
 * This prevents stale closure issues in PDF event listeners and callbacks.
 */
export const usePDFPropSync = (props: PropSyncData) => {
    const protectedPartyIdsRef = useRef<string[]>([]);
    const formFieldsRef = useRef<any[]>([]);
    const onSignatureAppliedRef = useRef<((data: { emptySignatureFieldCount: number }) => void) | undefined>(undefined);
    const onFieldChangeRef = useRef<((fieldName: string, value: any) => void) | undefined>(undefined);

    useEffect(() => {
        protectedPartyIdsRef.current = props.protectedPartyIds || [];
        formFieldsRef.current = props.formFields || [];
        onSignatureAppliedRef.current = props.onSignatureApplied;
        onFieldChangeRef.current = props.onFieldChange;
    }, [props.protectedPartyIds, props.formFields, props.onSignatureApplied, props.onFieldChange]);

    return {
        protectedPartyIdsRef,
        formFieldsRef,
        onSignatureAppliedRef,
        onFieldChangeRef
    };
};

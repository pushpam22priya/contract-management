'use client';

import React, { useState, useEffect } from 'react';
import { Box } from '@mui/material';

/**
 * Helper: get form field annotations (filtered by party/role if needed)
 * Exported so it can be used for debugging or other features if needed
 */
export const getFormFieldAnnotations = (Core: any, allowedParties?: string[], role?: string) => {
    if (!Core?.annotationManager) return [];

    const annotationManager = Core.annotationManager;
    const allAnnotations = annotationManager.getAnnotationsList();

    // Filter for widget annotations (form fields)
    let formAnnotations = allAnnotations.filter((annot: any) => annot instanceof Core.Annotations.WidgetAnnotation);

    // Filter to specified parties when allowedParties is provided.
    // Works for both external clients (their party IDs) and internal users
    // (internal party IDs + 'unassigned') so the nav button only cycles
    // through the fields that belong to the current user's party.
    if (allowedParties && allowedParties.length > 0) {
        console.log(`🔍 [NAV] Filtering annotations for parties: [${allowedParties.join(', ')}]`);
        formAnnotations = formAnnotations.filter((annot: any) => {
            // Treat empty/null assignedParty as 'unassigned' so unassigned fields
            // are included when allowedParties contains 'unassigned'.
            const assignedParty = annot.getCustomData('assignedParty') || 'unassigned';
            return allowedParties.includes(assignedParty);
        });
        console.log(`🔍 [NAV] Filtered down to ${formAnnotations.length} fields for parties [${allowedParties.join(', ')}]`);
    }

    // Sort by page then position
    formAnnotations.sort((a: any, b: any) => {
        // Sort by page number first
        if (a.PageNumber !== b.PageNumber) {
            return a.PageNumber - b.PageNumber;
        }
        // Then by Y position (top to bottom)
        return a.Y - b.Y;
    });

    return formAnnotations;
};

/**
 * Helper: Flash a temporary highlight around a target annotation
 * Exported so it can be used for debugging or other features if needed
 */
export const flashHighlight = (Core: any, targetAnnot: any) => {
    if (!targetAnnot || !Core) return;
    try {
        const annotationManager = Core.annotationManager;

        // 1. Programmatically focus the field if possible
        try {
            const field = targetAnnot.getField?.();
            if (field && typeof field.setFocus === 'function') {
                field.setFocus();
            }
        } catch (e) { /* ignore focus errors */ }

        // 2. Create an EXTERNAL highlight border
        const rect = targetAnnot.getRect();
        const offset = 4; // 4px offset to ensure it's clearly outside

        const highlight = new Core.Annotations.RectangleAnnotation();
        highlight.PageNumber = targetAnnot.PageNumber;
        highlight.X = rect.x1 - offset;
        highlight.Y = rect.y1 - offset;
        highlight.Width = (rect.x2 - rect.x1) + (offset * 2);
        highlight.Height = (rect.y2 - rect.y1) + (offset * 2);

        // Style: Hollow box with prominent blue border
        highlight.FillColor = new Core.Annotations.Color(255, 255, 255, 0); // Transparent fill
        highlight.StrokeColor = new Core.Annotations.Color(15, 76, 71, 1); // Solid blue border
        highlight.StrokeThickness = 2;
        highlight.Opacity = 1;

        // Meta properties
        highlight.Listable = false; // Don't show in comments panel
        highlight.setCustomData('isTempHighlight', 'true');
        highlight.NoZoom = false;

        // Add to document
        annotationManager.addAnnotation(highlight);
        annotationManager.redrawAnnotation(highlight);

        // Automatically remove after 600ms
        setTimeout(() => {
            try {
                annotationManager.deleteAnnotation(highlight, { force: true });
            } catch (e) { /* ignore */ }
        }, 600);
    } catch (err) {
        console.warn('⚠️ [NAV] Highlight flash failed:', err);
    }
};

interface PDFNavigationButtonProps {
    viewerInstance: any;
    showAnnotationNavigation: boolean;
    effectiveReadOnly: boolean;
    loading: boolean;
    editableParties?: string[];
    currentUserRole?: string;
}

const PDFNavigationButton: React.FC<PDFNavigationButtonProps> = ({
    viewerInstance,
    showAnnotationNavigation,
    effectiveReadOnly,
    loading,
    editableParties,
    currentUserRole
}) => {
    const [annotations, setAnnotations] = useState<any[]>([]);
    const [currentAnnotationIndex, setCurrentAnnotationIndex] = useState(0);
    const [showNavButton, setShowNavButton] = useState(false);
    const [navStarted, setNavStarted] = useState(false);

    useEffect(() => {
        const initNavigation = () => {
            if (!viewerInstance.current) {
                setShowNavButton(false);
                return;
            }

            const { Core } = viewerInstance.current;
            if (!Core) return;

            if (showAnnotationNavigation && !effectiveReadOnly) {
                console.log('🔍 [PDFNavigationButton] Initializing navigation...');
                const formAnnotations = getFormFieldAnnotations(Core, editableParties, currentUserRole);
                setAnnotations(formAnnotations);
                setCurrentAnnotationIndex(0);
                setNavStarted(false);
                setShowNavButton(formAnnotations.length > 0);
            } else {
                setShowNavButton(false);
                setAnnotations([]);
            }
        };

        // Initialize
        initNavigation();

        // If loading just completed but initial check found 0 annotations, retry after
        // PDFTron's async widget rebuild has had time to complete (~800ms).
        let retryTimer: ReturnType<typeof setTimeout> | null = null;
        if (!loading && showAnnotationNavigation && !effectiveReadOnly) {
            retryTimer = setTimeout(() => {
                initNavigation();
            }, 800);
        }

        // Re-initialize when document is loaded or dependencies change
        if (viewerInstance.current && viewerInstance.current.Core) {
            const { Core } = viewerInstance.current;
            const handleDocumentLoaded = () => {
                console.log('🔍 [PDFNavigationButton] Document loaded, re-initializing...');
                initNavigation();
                // Retry after widget rebuild settles
                setTimeout(initNavigation, 800);
            };

            Core.documentViewer.addEventListener('documentLoaded', handleDocumentLoaded);
            return () => {
                if (retryTimer) clearTimeout(retryTimer);
                Core.documentViewer.removeEventListener('documentLoaded', handleDocumentLoaded);
            };
        }

        return () => {
            if (retryTimer) clearTimeout(retryTimer);
        };
    }, [viewerInstance, showAnnotationNavigation, effectiveReadOnly, loading, editableParties, currentUserRole]);

    if (!showNavButton || !showAnnotationNavigation || annotations.length === 0) {
        return null;
    }

    return (
        <Box
            sx={{
                position: 'absolute',
                left: 0,
                top: '50%',
                transform: 'translateY(-50%)',
                zIndex: 1000,
                display: 'flex',
                alignItems: 'center',
            }}
        >
            {/* Arrow-shaped button */}
            <Box
                onClick={async () => {
                    const currentViewer = viewerInstance.current;
                    if (!currentViewer) return;

                    const { Core } = currentViewer;
                    const { documentViewer, annotationManager } = Core;

                    // Re-fetch annotations to ensure we have the latest state (e.g. if fields were added/deleted)
                    const formAnnotations = getFormFieldAnnotations(Core, editableParties, currentUserRole);
                    if (formAnnotations.length === 0) return;

                    // If not started yet, go to first annotation
                    if (!navStarted) {
                        setNavStarted(true);
                        const firstAnnotation = formAnnotations[0];
                        console.log(`🔍 [NAV] Starting navigation - jumping to first annotation`);

                        try {
                            const scrollContainer = documentViewer.getScrollViewElement();
                            if (scrollContainer) scrollContainer.style.scrollBehavior = 'smooth';
                            annotationManager.deselectAllAnnotations();

                            const currentPage = documentViewer.getCurrentPage();
                            if (currentPage !== firstAnnotation.PageNumber) {
                                documentViewer.setCurrentPage(firstAnnotation.PageNumber);
                                await new Promise(resolve => setTimeout(resolve, 250));
                            }

                            annotationManager.selectAnnotation(firstAnnotation);
                            await new Promise(resolve => setTimeout(resolve, 50));
                            annotationManager.jumpToAnnotation(firstAnnotation);

                            // ✅ FLASH HIGHLIGHT
                            flashHighlight(Core, firstAnnotation);

                            setTimeout(() => {
                                if (scrollContainer) scrollContainer.style.scrollBehavior = 'auto';
                            }, 600);
                        } catch (error) {
                            console.error('🔍 [NAV] Error during start navigation:', error);
                            try {
                                annotationManager.selectAnnotation(firstAnnotation);
                                annotationManager.jumpToAnnotation(firstAnnotation);
                            } catch (e) { console.error('🔍 [NAV] Fallback failed:', e); }
                        }

                        setCurrentAnnotationIndex(0);
                        return;
                    }

                    // If at the last annotation, scroll to top and reset
                    if (currentAnnotationIndex === formAnnotations.length - 1) {
                        console.log('🔄 [NAV] Move to top - resetting navigation');
                        try {
                            annotationManager.deselectAllAnnotations();
                            const scrollContainer = documentViewer.getScrollViewElement();
                            if (scrollContainer) {
                                scrollContainer.style.scrollBehavior = 'smooth';
                                scrollContainer.scrollTop = 0;
                                setTimeout(() => {
                                    scrollContainer.style.scrollBehavior = 'auto';
                                }, 600);
                            }
                            documentViewer.setCurrentPage(1);
                        } catch (error) {
                            console.error('🔍 [NAV] Error scrolling to top:', error);
                        }
                        setCurrentAnnotationIndex(0);
                        setNavStarted(false);
                        return;
                    }

                    // Navigate to next annotation
                    const nextIndex = currentAnnotationIndex + 1;
                    const nextAnnotation = formAnnotations[nextIndex];

                    console.log(`🔍 [NAV] Jumping to annotation ${nextIndex + 1}/${formAnnotations.length}`);

                    try {
                        const currentPage = documentViewer.getCurrentPage();
                        const scrollContainer = documentViewer.getScrollViewElement();
                        if (scrollContainer) scrollContainer.style.scrollBehavior = 'smooth';

                        annotationManager.deselectAllAnnotations();

                        if (currentPage !== nextAnnotation.PageNumber) {
                            documentViewer.setCurrentPage(nextAnnotation.PageNumber);
                            await new Promise(resolve => setTimeout(resolve, 250));
                        }

                        annotationManager.selectAnnotation(nextAnnotation);
                        await new Promise(resolve => setTimeout(resolve, 50));
                        annotationManager.jumpToAnnotation(nextAnnotation);

                        // ✅ FLASH HIGHLIGHT
                        flashHighlight(Core, nextAnnotation);

                        setTimeout(() => {
                            if (scrollContainer) scrollContainer.style.scrollBehavior = 'auto';
                        }, 600);
                    } catch (error) {
                        console.error('🔍 [NAV] Error during navigation:', error);
                        try {
                            annotationManager.selectAnnotation(nextAnnotation);
                            annotationManager.jumpToAnnotation(nextAnnotation);
                        } catch (e) { console.error('🔍 [NAV] Fallback failed:', e); }
                    }

                    setCurrentAnnotationIndex(nextIndex);
                }}
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: '#0F4C47',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: '13px',
                    letterSpacing: '0.5px',
                    padding: '10px 28px 10px 16px',
                    cursor: 'pointer',
                    clipPath: 'polygon(0% 0%, calc(100% - 18px) 0%, 100% 50%, calc(100% - 18px) 100%, 0% 100%)',
                    userSelect: 'none',
                    transition: 'background-color 0.2s ease, transform 0.15s ease',
                    whiteSpace: 'nowrap',
                    boxShadow: '2px 2px 8px rgba(0,0,0,0.3)',
                    '&:hover': {
                        backgroundColor: '#0F4C47',
                        transform: 'scale(1.03)',
                    },
                    '&:active': {
                        backgroundColor: '#0F4C47',
                        transform: 'scale(0.98)',
                    },
                }}
            >
                {!navStarted
                    ? 'CLICK TO START'
                    : currentAnnotationIndex === annotations.length - 1
                        ? 'MOVE TO TOP'
                        : 'NEXT'
                }
            </Box>

            {/* Dotted line extending from arrow */}
            <Box
                sx={{
                    width: '60px',
                    borderTop: '2px dotted #0F4C47',
                    marginLeft: '-2px',
                }}
            />
        </Box>
    );
};

export default PDFNavigationButton;

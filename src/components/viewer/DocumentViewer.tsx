'use client';

import { useEffect, useRef } from 'react';
import WebViewer from '@pdftron/webviewer';

interface DocumentViewerProps {
    fileUrl: string;
    fileName?: string;
}

export default function DocumentViewer({ fileUrl, fileName }: DocumentViewerProps) {
    const viewerDiv = useRef<HTMLDivElement>(null);
    const instance = useRef<any>(null);

    useEffect(() => {
        if (!viewerDiv.current) return;

        // Initialize WebViewer
        WebViewer(
            {
                path: '/webviewer',
                initialDoc: fileUrl,
                // licenseKey: 'your-license-key', // Add your license key or use demo mode
                filename: fileName || 'document',
            },
            viewerDiv.current
        ).then((webViewerInstance) => {
            instance.current = webViewerInstance;

            const { UI, Core } = webViewerInstance;

            // Customize UI
            UI.setTheme(UI.Theme.LIGHT);

            // Disable certain features if needed
            UI.disableElements([
                'toolsHeader',
                'pageNavOverlay',
            ]);

            // Enable features
            UI.enableFeatures([UI.Feature.Download]);

            // Listen for document load
            Core.documentViewer.addEventListener('documentLoaded', () => {
                console.log('Document loaded successfully');
            });
        });

        // Cleanup
        return () => {
            if (instance.current) {
                instance.current = null;
            }
        };
    }, [fileUrl, fileName]);

    return (
        <div
            ref={viewerDiv}
            style={{
                width: '100%',
                height: '100%',
                minHeight: '600px',
            }}
        />
    );
}

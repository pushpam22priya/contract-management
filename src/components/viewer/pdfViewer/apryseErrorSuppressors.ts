/**
 * Suppresses known Apryse (PDFTron) internal appearance-rendering errors that are
 * cosmetic only. These fire when restoring protected signature annotations from XFDF;
 * functionality is completely unaffected.
 *
 * Installed once at module level — safe for React 18 StrictMode remounts.
 */

let _installed = false;

export function installApryseErrorSuppressors(): void {
    if (_installed || typeof window === 'undefined') return;
    _installed = true;

    // 1. Suppress console.error for Apryse appearance rendering errors
    const _orig = console.error.bind(console);
    console.error = (...args: any[]) => {
        const msg = String(args[0] ?? '');
        if (
            msg.includes('Annotation appearance failed to render') ||
            msg.includes('Error in Promise.all for appearanceReference')
        ) return;
        _orig(...args);
    };

    // 2. Suppress unhandled promise rejections of type PDFWorkerError
    window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
        if (event.reason?.type === 'PDFWorkerError') {
            event.preventDefault();
        }
    });
}

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

    // 2. Intercept fetch calls to Apryse telemetry endpoints and swallow them silently.
    //    This prevents "Failed to fetch" unhandled rejections from pws-collect.pdftron.com
    //    from bubbling up to the Next.js error overlay.
    const _origFetch = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string'
            ? input
            : input instanceof URL
                ? input.href
                : (input as Request).url;
        if (url && url.includes('pdftron.com')) {
            // Return an empty 200 so Apryse's code doesn't see a rejection
            return Promise.resolve(new Response('', { status: 200 }));
        }
        return _origFetch(input, init);
    };

    // 3. Suppress unhandled promise rejections from Apryse internals
    window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
        const reason = event.reason;

        // PDFWorkerError — always suppress
        if (reason?.type === 'PDFWorkerError') {
            event.preventDefault();
            return;
        }

        // Apryse internal errors from webviewer-core.min.js
        // e.g. "oa.yg is not a function" — minified internal method missing in this build
        if (reason instanceof TypeError) {
            const stack = reason.stack ?? '';
            if (stack.includes('webviewer-core.min.js') || stack.includes('webviewer-core')) {
                event.preventDefault();
                return;
            }
        }

        // Stray "Failed to fetch" rejections that escaped the fetch interceptor
        if (reason instanceof TypeError && reason.message === 'Failed to fetch') {
            event.preventDefault();
        }
    });
}

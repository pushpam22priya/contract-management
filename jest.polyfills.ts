/**
 * jest.polyfills.ts — runs via `setupFiles`, before any test module is imported.
 *
 * fetch / Request / Response / Headers are already copied from Node 22's built-in
 * globals into the jsdom window by jest.environment.js (the custom TestEnvironment).
 * This file only handles the remaining browser APIs that jsdom doesn't include and
 * that aren't available via a Node module import.
 */

// ── WHATWG Streams ──────────────────────────────────────────────────────────
// Available as a named require in Node 18+ even inside jsdom environments.
// Aliased to avoid colliding with TypeScript's built-in lib declarations.
const streams: any = require('node:stream/web');

if (typeof (global as any).ReadableStream === 'undefined') {
    (global as any).ReadableStream = streams.ReadableStream;
}
if (typeof (global as any).WritableStream === 'undefined') {
    (global as any).WritableStream = streams.WritableStream;
}
if (typeof (global as any).TransformStream === 'undefined') {
    (global as any).TransformStream = streams.TransformStream;
}

// ── BroadcastChannel ────────────────────────────────────────────────────────
// Used by MSW's WebSocket module at load time. jsdom doesn't include it.
if (typeof (global as any).BroadcastChannel === 'undefined') {
    (global as any).BroadcastChannel = class BroadcastChannel {
        name: string;
        onmessage: any = null;
        onmessageerror: any = null;

        constructor(name: string) { this.name = name; }
        postMessage(_message: any) {}
        close() {}
        addEventListener(_type: string, _listener: any) {}
        removeEventListener(_type: string, _listener: any) {}
        dispatchEvent(_event: any) { return true; }
    };
}

/**
 * jest.environment.js — custom Jest test environment
 *
 * Extends jest-environment-jsdom to copy Node 22's built-in Fetch API globals
 * (fetch, Request, Response, Headers) into the jsdom window before any test
 * code runs.
 *
 * WHY NOT just polyfill in setupFiles:
 * setupFiles run inside the jsdom context where globalThis is already the jsdom
 * window — Node 22's fetch globals are gone. This environment file runs in the
 * outer Node.js process where globalThis.fetch IS Node 22's real fetch, so we
 * can copy it into the jsdom window. MSW's node interceptors then wrap the real
 * fetch and can properly intercept network calls made by the component under test.
 */

const { TestEnvironment } = require('jest-environment-jsdom');

class CustomJSDOMEnvironment extends TestEnvironment {
    async setup() {
        await super.setup();

        // globalThis here is the Node.js process global (not jsdom window).
        // In Node 22 these are real Fetch API implementations from undici.
        if (typeof globalThis.fetch !== 'undefined') {
            this.global.fetch = globalThis.fetch;
        }
        if (typeof globalThis.Request !== 'undefined') {
            this.global.Request = globalThis.Request;
        }
        if (typeof globalThis.Response !== 'undefined') {
            this.global.Response = globalThis.Response;
        }
        if (typeof globalThis.Headers !== 'undefined') {
            this.global.Headers = globalThis.Headers;
        }
        if (typeof globalThis.FormData !== 'undefined') {
            this.global.FormData = globalThis.FormData;
        }
    }
}

module.exports = CustomJSDOMEnvironment;

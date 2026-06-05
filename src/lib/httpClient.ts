// Route all Spring Boot calls through the Next.js rewrite proxy (/api/backend/*).
// The browser calls localhost:3000/api/backend/... (same origin, no CORS).
// Next.js rewrites forward the request to the Spring Boot server server-to-server.
// This eliminates all CORS issues regardless of Spring Boot's allowed-origins config.
const BACKEND_URL = '/api/backend';
const SESSION_KEY = 'cms_current_user';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ApiResponse<T = unknown> {
    data: T | null;
    ok: boolean;
    status: number;
    message: string;
}

interface RequestOptions {
    skipAuth?: boolean;
    headers?: Record<string, string>;
}

function getToken(): string | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = sessionStorage.getItem(SESSION_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed.token ?? null;
    } catch {
        return null;
    }
}

function handleUnauthorized(): void {
    if (typeof window === 'undefined') return;
    sessionStorage.removeItem(SESSION_KEY);
    window.location.href = '/login';
}

async function request<T>(
    method: HttpMethod,
    path: string,
    body?: unknown,
    options: RequestOptions = {}
): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...options.headers,
    };

    if (!options.skipAuth) {
        const token = getToken();
        if (token) headers['Authorization'] = `Bearer ${token}`;
    }

    const config: RequestInit = {
        method,
        headers,
        ...(body !== undefined && { body: JSON.stringify(body) }),
    };

    try {
        const res = await fetch(`${BACKEND_URL}${path}`, config);

        // Parse body first — stream can only be read once
        let data: any = null;
        const contentType = res.headers.get('content-type');
        if (contentType?.includes('application/json')) {
            data = await res.json();
        }

        const errorMessage = data?.message || data?.error || `Request failed with status ${res.status}`;

        if (res.status === 401) {
            // skipAuth = public endpoint (e.g. login) → bad credentials, do NOT redirect
            // authenticated endpoint → session expired, redirect to login
            if (!options.skipAuth) {
                handleUnauthorized();
            }
            return { data: null, ok: false, status: 401, message: data?.message || data?.error || 'Invalid credentials.' };
        }

        if (!res.ok) {
            return { data: null, ok: false, status: res.status, message: errorMessage };
        }

        return {
            data: data as T,
            ok: true,
            status: res.status,
            message: data?.message || 'Success',
        };
    } catch (error) {
        return {
            data: null,
            ok: false,
            status: 0,
            message: error instanceof Error ? error.message : 'Network error. Please check your connection.',
        };
    }
}

export const httpClient = {
    get: <T>(path: string, options?: RequestOptions) =>
        request<T>('GET', path, undefined, options),

    post: <T>(path: string, body: unknown, options?: RequestOptions) =>
        request<T>('POST', path, body, options),

    put: <T>(path: string, body: unknown, options?: RequestOptions) =>
        request<T>('PUT', path, body, options),

    patch: <T>(path: string, body: unknown, options?: RequestOptions) =>
        request<T>('PATCH', path, body, options),

    delete: <T>(path: string, options?: RequestOptions) =>
        request<T>('DELETE', path, undefined, options),

    /**
     * Upload raw binary (File | Blob) with JWT auth.
     * Cannot use request() because it always JSON.stringifies the body.
     */
    putFile: async (path: string, file: Blob | File, contentType = 'application/pdf'): Promise<ApiResponse<unknown>> => {
        console.log(`[httpClient.putFile] PUT ${path} | size=${file.size} | type=${contentType}`);
        const headers: Record<string, string> = { 'Content-Type': contentType };
        const token = getToken();
        if (token) headers['Authorization'] = `Bearer ${token}`;
        try {
            const res = await fetch(`${BACKEND_URL}${path}`, { method: 'PUT', headers, body: file });
            let data: any = null;
            if (res.headers.get('content-type')?.includes('application/json')) data = await res.json();
            if (res.status === 401) {
                console.warn(`[httpClient.putFile] 401 on ${path} — redirecting to login`);
                handleUnauthorized();
                return { data: null, ok: false, status: 401, message: data?.message || 'Unauthorized' };
            }
            if (!res.ok) {
                console.error(`[httpClient.putFile] ✗ ${res.status} on ${path}:`, data?.message);
                return { data: null, ok: false, status: res.status, message: data?.message || `Request failed with status ${res.status}` };
            }
            console.log(`[httpClient.putFile] ✓ ${res.status} on ${path}`);
            return { data, ok: true, status: res.status, message: data?.message || 'Success' };
        } catch (e) {
            console.error(`[httpClient.putFile] Network error on ${path}:`, e);
            return { data: null, ok: false, status: 0, message: e instanceof Error ? e.message : 'Network error' };
        }
    },

    /**
     * Upload a file as multipart/form-data with JWT auth.
     * Spring Boot controllers annotated with @RequestParam MultipartFile expect this format.
     * IMPORTANT: Do NOT set Content-Type manually — the browser must set it to include the
     * multipart boundary (e.g. "multipart/form-data; boundary=----abc123").
     * Setting it manually breaks the boundary and causes the backend to fail parsing.
     */
    putFormData: async (path: string, formData: FormData): Promise<ApiResponse<unknown>> => {
        console.log(`[httpClient.putFormData] PUT ${path} (multipart/form-data)`);
        // Auth header only — NO Content-Type, browser sets it with the boundary
        const headers: Record<string, string> = {};
        const token = getToken();
        if (token) headers['Authorization'] = `Bearer ${token}`;
        try {
            const res = await fetch(`${BACKEND_URL}${path}`, { method: 'PUT', headers, body: formData });
            let data: any = null;
            if (res.headers.get('content-type')?.includes('application/json')) data = await res.json();
            if (res.status === 401) {
                console.warn(`[httpClient.putFormData] 401 on ${path} — redirecting to login`);
                handleUnauthorized();
                return { data: null, ok: false, status: 401, message: data?.message || 'Unauthorized' };
            }
            if (!res.ok) {
                console.error(`[httpClient.putFormData] ✗ ${res.status} on ${path}:`, data?.message || data);
                return { data: null, ok: false, status: res.status, message: data?.message || `Request failed with status ${res.status}` };
            }
            console.log(`[httpClient.putFormData] ✓ ${res.status} on ${path}`);
            return { data, ok: true, status: res.status, message: data?.message || 'Success' };
        } catch (e) {
            console.error(`[httpClient.putFormData] Network error on ${path}:`, e);
            return { data: null, ok: false, status: 0, message: e instanceof Error ? e.message : 'Network error' };
        }
    },

    /**
     * Fetch a resource with JWT auth and return the raw Response (for .blob() / .arrayBuffer()).
     * Cannot use request() because it always parses JSON.
     */
    getRaw: async (path: string): Promise<Response | null> => {
        console.log(`[httpClient.getRaw] GET ${path}`);
        const headers: Record<string, string> = {};
        const token = getToken();
        if (token) headers['Authorization'] = `Bearer ${token}`;
        try {
            const res = await fetch(`${BACKEND_URL}${path}`, { method: 'GET', headers });
            if (res.status === 401) {
                console.warn(`[httpClient.getRaw] 401 on ${path} — redirecting to login`);
                handleUnauthorized();
                return null;
            }
            if (!res.ok) {
                console.error(`[httpClient.getRaw] ✗ ${res.status} on ${path}`);
                return null;
            }
            console.log(`[httpClient.getRaw] ✓ ${res.status} on ${path}`);
            return res;
        } catch (e) {
            console.error(`[httpClient.getRaw] Network error on ${path}:`, e);
            return null;
        }
    },
};

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8080';
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
};

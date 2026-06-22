/**
 * INTEGRATION TESTS — Login Page (src/app/login/page.tsx)
 *
 * Renders the real LoginPage component with:
 *   - authService mocked at the service boundary (not MSW) so tests are
 *     fast and isolated to UI behaviour
 *   - useTheme mocked to supply the custom `theme.login` token set that the
 *     page destructures from the MUI theme
 *   - useTranslations mocked to return the same strings as translations/en.json
 *   - useRouter mocked to let us assert push('/overview')
 *
 * Scenarios covered:
 *  1.  Renders "Welcome Back" heading and "Sign In" button
 *  2.  Renders the Email Address and Password fields
 *  3.  Empty email on submit → "Email is required" field error
 *  4.  Invalid email format → "Please enter a valid email address" field error
 *  5.  Empty password on submit → "Password is required" field error
 *  6.  Successful login → success Alert rendered, router.push('/overview') called
 *  7.  Regular-user login → success (role: USER → isAdmin: false)
 *  8.  Admin login → success (role: ADMIN → isAdmin: true)
 *  9.  Backend 401 → error Alert with backend message, no redirect
 * 10.  authService throws (network error) → "An unexpected error occurred" Alert
 * 11.  Loading state: button text becomes "Signing In..." while request is in-flight
 * 12.  Loading state: button is disabled while request is in-flight
 * 13.  Loading state: email and password fields are disabled while request is in-flight
 * 14.  Error cleared when user re-submits after a previous failure
 * 15.  Success Alert is not visible on initial render
 * 16.  Error Alert is not visible on initial render
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ─── authService mock ─────────────────────────────────────────────────────────
// Define the mock BEFORE the import so jest.mock hoisting works.

const mockLogin = jest.fn();

jest.mock('@/services/authService', () => ({
    authService: {
        login:          (...args: any[]) => mockLogin(...args),
        getCurrentUser: jest.fn().mockReturnValue(null),
        isAuthenticated: jest.fn().mockReturnValue(false),
    },
}));

// ─── Routing mock ─────────────────────────────────────────────────────────────

const mockRouterPush = jest.fn();
const mockRouterBack = jest.fn();

jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: mockRouterPush, back: mockRouterBack }),
}));

// ─── next-intl mock ───────────────────────────────────────────────────────────
// Mirror the exact strings from translations/en.json so tests are stable against
// translation typos and the component is rendered with realistic text.

jest.mock('next-intl', () => ({
    useTranslations: (namespace: string) => {
        const map: Record<string, Record<string, string>> = {
            login: {
                title:                'Contract Management',
                welcomeBack:          'Welcome Back',
                pleaseEnterDetails:   'Please enter your details to sign in.',
                emailAddress:         'Email Address',
                password:             'Password',
                signIn:               'Sign In',
                signingIn:            'Signing In...',
                unexpectedError:      'An unexpected error occurred. Please try again.',
                errorEmailRequired:   'Email is required',
                errorEmailInvalid:    'Please enter a valid email address',
                errorPasswordRequired:'Password is required',
                description:          'Streamline your\ncontract management workflow',
            },
        };
        return (key: string) => map[namespace]?.[key] ?? key;
    },
}));

// ─── MUI useTheme mock ────────────────────────────────────────────────────────
// LoginPage destructures `theme.login` (a custom token set) and `theme.palette.mode`.
// Providing a minimal stub avoids importing the full app theme in tests.

jest.mock('@mui/material', () => {
    const actual = jest.requireActual('@mui/material');
    return {
        ...actual,
        useTheme: () => ({
            login: {
                rightPanelText:       '#1a1a2e',
                leftPanelBackground:  'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
                rightPanelBackground: '#ffffff',
                buttonBackground:     '#2563eb',
                buttonHover:          '#1d4ed8',
                buttonDisabled:       '#94a3b8',
                pageBackground:       'linear-gradient(135deg, #f0f4ff 0%, #e8ecff 100%)',
            },
            palette: { mode: 'light' },
        }),
    };
});

// ─── ContractIcon mock ────────────────────────────────────────────────────────
// Avoids loading an SVG / complex icon component.

jest.mock('@/components/ContractIcon', () => ({
    __esModule: true,
    default: () => <svg data-testid="contract-icon" aria-hidden="true" />,
}));

// ─── Component under test ─────────────────────────────────────────────────────

import LoginPage from '@/app/login/page';

// ─── Shared response fixtures ─────────────────────────────────────────────────

const SUCCESS_RESPONSE = {
    success: true,
    message: 'Login successful',
    user: { email: 'alice@example.com', isAdmin: false, lastLogin: new Date().toISOString() },
};

const ADMIN_SUCCESS_RESPONSE = {
    success: true,
    message: 'Login successful',
    user: { email: 'admin@example.com', isAdmin: true, lastLogin: new Date().toISOString() },
};

const FAILURE_RESPONSE = {
    success: false,
    message: 'Invalid email or password',
};

// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
    jest.clearAllMocks();
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function renderPage() {
    return render(<LoginPage />);
}

/** Returns the email field, password field, and submit button by accessible role. */
function getFormElements() {
    const emailField    = screen.getByRole('textbox', { name: /email address/i });
    const passwordField = screen.getByLabelText(/password/i);
    const submitButton  = screen.getByRole('button', { name: /sign in/i });
    return { emailField, passwordField, submitButton };
}

// =============================================================================
// 1. Rendering
// =============================================================================

describe('LoginPage — initial render', () => {

    it('renders the "Welcome Back" heading', () => {
        renderPage();
        expect(screen.getByText('Welcome Back')).toBeInTheDocument();
    });

    it('renders the email and password fields', () => {
        renderPage();
        expect(screen.getByRole('textbox', { name: /email address/i })).toBeInTheDocument();
        expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    });

    it('renders the "Sign In" submit button', () => {
        renderPage();
        expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    });

    it('does not show a success alert on mount', () => {
        renderPage();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('does not show an error alert on mount', () => {
        renderPage();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
});

// =============================================================================
// 2. Form validation
// =============================================================================

describe('LoginPage — form validation', () => {

    it('shows "Email is required" when form is submitted with an empty email', async () => {
        const user = userEvent.setup();
        renderPage();

        const { passwordField, submitButton } = getFormElements();

        // Only fill password — leave email empty
        await user.type(passwordField, 'secret123');
        await user.click(submitButton);

        expect(await screen.findByText('Email is required')).toBeInTheDocument();
        expect(mockLogin).not.toHaveBeenCalled();
    });

    it('shows "Please enter a valid email address" for an invalid email format', async () => {
        const user = userEvent.setup();
        renderPage();

        const { emailField, passwordField, submitButton } = getFormElements();

        await user.type(emailField, 'not-an-email');
        await user.type(passwordField, 'secret123');
        await user.click(submitButton);

        expect(await screen.findByText('Please enter a valid email address')).toBeInTheDocument();
        expect(mockLogin).not.toHaveBeenCalled();
    });

    it('shows "Password is required" when form is submitted with an empty password', async () => {
        const user = userEvent.setup();
        renderPage();

        const { emailField, submitButton } = getFormElements();

        // Only fill email — leave password empty
        await user.type(emailField, 'alice@example.com');
        await user.click(submitButton);

        expect(await screen.findByText('Password is required')).toBeInTheDocument();
        expect(mockLogin).not.toHaveBeenCalled();
    });
});

// =============================================================================
// 3. Successful login
// =============================================================================

describe('LoginPage — successful login', () => {

    it('shows a success alert and redirects to /overview after login', async () => {
        mockLogin.mockResolvedValueOnce(SUCCESS_RESPONSE);

        const user = userEvent.setup();
        renderPage();

        const { emailField, passwordField, submitButton } = getFormElements();

        await user.type(emailField, 'alice@example.com');
        await user.type(passwordField, 'secret123');
        await user.click(submitButton);

        // Success alert appears
        expect(await screen.findByText('Login successful')).toBeInTheDocument();

        // Redirect fires after 500 ms — wait for it
        await waitFor(
            () => expect(mockRouterPush).toHaveBeenCalledWith('/overview'),
            { timeout: 1500 }
        );
    });

    it('passes the correct credentials to authService.login', async () => {
        mockLogin.mockResolvedValueOnce(SUCCESS_RESPONSE);

        const user = userEvent.setup();
        renderPage();

        const { emailField, passwordField, submitButton } = getFormElements();

        await user.type(emailField, 'alice@example.com');
        await user.type(passwordField, 'secret123');
        await user.click(submitButton);

        await screen.findByText('Login successful');

        expect(mockLogin).toHaveBeenCalledWith({
            email:    'alice@example.com',
            password: 'secret123',
        });

        // Drain the pending 500ms redirect timer so it doesn't fire during later tests
        await waitFor(() => expect(mockRouterPush).toHaveBeenCalledWith('/overview'), { timeout: 1500 });
    });

    it('handles a regular-user login (isAdmin: false) without error', async () => {
        mockLogin.mockResolvedValueOnce(SUCCESS_RESPONSE); // isAdmin: false

        const user = userEvent.setup();
        renderPage();

        const { emailField, passwordField, submitButton } = getFormElements();

        await user.type(emailField, 'alice@example.com');
        await user.type(passwordField, 'password');
        await user.click(submitButton);

        // Only a success alert — no error alert
        expect(await screen.findByText('Login successful')).toBeInTheDocument();
        const alerts = screen.getAllByRole('alert');
        expect(alerts).toHaveLength(1);
        expect(alerts[0]).toHaveTextContent('Login successful');

        // Wait for redirect so the 500ms timer is consumed before the next test
        await waitFor(() => expect(mockRouterPush).toHaveBeenCalledWith('/overview'), { timeout: 1500 });
    });

    it('handles an admin login (isAdmin: true) without error', async () => {
        mockLogin.mockResolvedValueOnce(ADMIN_SUCCESS_RESPONSE); // isAdmin: true

        const user = userEvent.setup();
        renderPage();

        const { emailField, passwordField, submitButton } = getFormElements();

        await user.type(emailField, 'admin@example.com');
        await user.type(passwordField, 'adminpass');
        await user.click(submitButton);

        // Success — auth service called with admin credentials
        expect(await screen.findByText('Login successful')).toBeInTheDocument();
        expect(mockLogin).toHaveBeenCalledWith({
            email:    'admin@example.com',
            password: 'adminpass',
        });

        // Consume the pending 500ms timer so it doesn't leak into subsequent tests
        await waitFor(() => expect(mockRouterPush).toHaveBeenCalledWith('/overview'), { timeout: 1500 });
    });
});

// =============================================================================
// 4. Login failure
// =============================================================================

describe('LoginPage — login failure', () => {

    it('shows the backend error message when login returns success:false', async () => {
        mockLogin.mockResolvedValueOnce(FAILURE_RESPONSE);

        const user = userEvent.setup();
        renderPage();

        const { emailField, passwordField, submitButton } = getFormElements();

        await user.type(emailField, 'wrong@example.com');
        await user.type(passwordField, 'wrongpass');
        await user.click(submitButton);

        expect(await screen.findByText('Invalid email or password')).toBeInTheDocument();
        expect(mockRouterPush).not.toHaveBeenCalled();
    });

    it('shows "An unexpected error occurred" when authService.login throws', async () => {
        mockLogin.mockRejectedValueOnce(new Error('Network timeout'));

        const user = userEvent.setup();
        renderPage();

        const { emailField, passwordField, submitButton } = getFormElements();

        await user.type(emailField, 'alice@example.com');
        await user.type(passwordField, 'secret123');
        await user.click(submitButton);

        expect(
            await screen.findByText('An unexpected error occurred. Please try again.')
        ).toBeInTheDocument();
        expect(mockRouterPush).not.toHaveBeenCalled();
    });

    it('clears the previous error when a new submission starts', async () => {
        // First attempt fails
        mockLogin.mockResolvedValueOnce(FAILURE_RESPONSE);
        // Second attempt succeeds
        mockLogin.mockResolvedValueOnce(SUCCESS_RESPONSE);

        const user = userEvent.setup();
        renderPage();

        const { emailField, passwordField, submitButton } = getFormElements();

        // ── First submit: expect error ─
        await user.type(emailField, 'wrong@example.com');
        await user.type(passwordField, 'wrongpass');
        await user.click(submitButton);
        expect(await screen.findByText('Invalid email or password')).toBeInTheDocument();

        // ── Clear fields and try again ─
        await user.clear(emailField);
        await user.clear(passwordField);
        await user.type(emailField, 'alice@example.com');
        await user.type(passwordField, 'secret123');
        await user.click(submitButton);

        // Error must be gone; success must appear
        await waitFor(() => {
            expect(screen.queryByText('Invalid email or password')).not.toBeInTheDocument();
        });
        expect(await screen.findByText('Login successful')).toBeInTheDocument();
    });
});

// =============================================================================
// 5. Loading state
// =============================================================================

describe('LoginPage — loading state', () => {

    it('changes the button label to "Signing In..." while the request is in-flight', async () => {
        // Never resolving promise simulates a long in-flight request
        mockLogin.mockReturnValueOnce(new Promise(() => {}));

        const user = userEvent.setup();
        renderPage();

        const { emailField, passwordField } = getFormElements();

        await user.type(emailField, 'alice@example.com');
        await user.type(passwordField, 'secret123');

        const submitButton = screen.getByRole('button', { name: /sign in/i });
        await user.click(submitButton);

        // After click, button label must change to "Signing In..."
        expect(await screen.findByRole('button', { name: /signing in/i })).toBeInTheDocument();

        // Original "Sign In" button is gone (same button, different text)
        expect(screen.queryByRole('button', { name: /^sign in$/i })).not.toBeInTheDocument();
    });

    it('disables the submit button while the request is in-flight', async () => {
        mockLogin.mockReturnValueOnce(new Promise(() => {}));

        const user = userEvent.setup();
        renderPage();

        const { emailField, passwordField } = getFormElements();

        await user.type(emailField, 'alice@example.com');
        await user.type(passwordField, 'secret123');
        await user.click(screen.getByRole('button', { name: /sign in/i }));

        // AppButton sets disabled={loading} — button must be disabled
        const button = await screen.findByRole('button', { name: /signing in/i });
        expect(button).toBeDisabled();
    });

    it('disables the email field while the request is in-flight', async () => {
        mockLogin.mockReturnValueOnce(new Promise(() => {}));

        const user = userEvent.setup();
        renderPage();

        const { emailField, passwordField } = getFormElements();

        await user.type(emailField, 'alice@example.com');
        await user.type(passwordField, 'secret123');
        await user.click(screen.getByRole('button', { name: /sign in/i }));

        await screen.findByRole('button', { name: /signing in/i }); // wait for loading state

        // TextField disabled={loading} is set by the controller
        expect(screen.getByRole('textbox', { name: /email address/i })).toBeDisabled();
    });

    it('disables the password field while the request is in-flight', async () => {
        mockLogin.mockReturnValueOnce(new Promise(() => {}));

        const user = userEvent.setup();
        renderPage();

        const { emailField, passwordField } = getFormElements();

        await user.type(emailField, 'alice@example.com');
        await user.type(passwordField, 'secret123');
        await user.click(screen.getByRole('button', { name: /sign in/i }));

        await screen.findByRole('button', { name: /signing in/i }); // wait for loading state

        expect(screen.getByLabelText(/password/i)).toBeDisabled();
    });

    it('re-enables controls and clears loading state after a failed request', async () => {
        mockLogin.mockResolvedValueOnce(FAILURE_RESPONSE);

        const user = userEvent.setup();
        renderPage();

        const { emailField, passwordField } = getFormElements();

        await user.type(emailField, 'wrong@example.com');
        await user.type(passwordField, 'wrong');
        await user.click(screen.getByRole('button', { name: /sign in/i }));

        // Wait for error alert to appear (request finished)
        await screen.findByText('Invalid email or password');

        // Button label is back to "Sign In" and enabled
        const btn = screen.getByRole('button', { name: /sign in/i });
        expect(btn).not.toBeDisabled();
        expect(screen.getByRole('textbox', { name: /email address/i })).not.toBeDisabled();
    });
});

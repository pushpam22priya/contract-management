// Adds custom matchers to expect():
//   toBeInTheDocument(), toBeDisabled(), toHaveTextContent(), etc.
import '@testing-library/jest-dom';

// MSW v2 uses the Fetch API internally which requires TextEncoder/TextDecoder.
// jsdom doesn't provide these by default, so we polyfill them from Node's 'util'.
import { TextEncoder, TextDecoder } from 'util';
Object.assign(global, { TextEncoder, TextDecoder });

import type { Config } from 'jest';
import nextJest from 'next/jest.js';

const createJestConfig = nextJest({ dir: './' });

const customConfig: Config = {
    testEnvironment: '<rootDir>/jest.environment.js',
    setupFiles: ['<rootDir>/jest.polyfills.ts'],
    setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
    testMatch: [
        '<rootDir>/src/__tests__/**/*.test.ts',
        '<rootDir>/src/__tests__/**/*.test.tsx',
    ],
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
    },
};

// Export an async function so we can override transformIgnorePatterns AFTER
// createJestConfig applies its own defaults. If we set it inside customConfig,
// next/jest overwrites it. Merging after the fact is the correct pattern.
//
// MSW v2 and its dependency "rettime" ship as ES Modules (.mjs).
// Jest runs in CommonJS mode and cannot parse ESM without transformation.
// This pattern tells Jest: "transform everything except packages NOT in this list."
export default async () => {
    const nextConfig = await createJestConfig(customConfig)();
    return {
        ...nextConfig,
        transformIgnorePatterns: [
            'node_modules/(?!(msw|@mswjs|rettime|@open-draft|until-async|outvariant|strict-event-emitter|bson|mongodb)/)',
        ],
    };
};

/**
 * @claude-flow/testing - Testing Module
 * TDD London School framework and test utilities for V3 Claude-Flow
 *
 * Based on ADR-008 (Vitest over Jest)
 *
 * @example
 * // Basic test setup
 * import {
 *   setupV3Tests,
 *   createMockApplication,
 *   agentConfigs,
 *   swarmConfigs,
 * } from '@claude-flow/testing';
 *
 * setupV3Tests();
 *
 * describe('MyModule', () => {
 *   const app = createMockApplication();
 *
 *   it('should work', async () => {
 *     const agent = await app.agentLifecycle.spawn(agentConfigs.queenCoordinator);
 *     expect(agent.success).toBe(true);
 *   });
 * });
 */

// Test setup - Global configuration and custom matchers
export * from './setup.js';

// Helpers - Mock factories, utilities, and assertions
export * from './helpers/index.js';

// Fixtures - Pre-defined test data
export * from './fixtures/index.js';

// Mocks - Service mock implementations
export * from './mocks/index.js';

// Re-export commonly used Vitest utilities
export { vi, expect, describe, it, test, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';

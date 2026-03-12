/**
 * Session Start Hook Integration
 *
 * Auto-starts workers when Claude Code session begins.
 * Supports both Claude Code and OpenCode environments.
 */

import { WorkerManager, createWorkerManager } from './index.js';
import * as path from 'path';

// OpenCode environment detection
const isOpenCode = process.env.OPENCODE_SESSION_ID !== undefined || 
                   process.env.OPENCORE_SESSION_ID !== undefined;

// ============================================================================
// Types
// ============================================================================

export interface SessionHookConfig {
  projectRoot?: string;
  autoStart?: boolean;
  runInitialScan?: boolean;
  workers?: string[];
}

export interface SessionHookResult {
  success: boolean;
  manager: WorkerManager;
  initialResults?: Record<string, unknown>;
  error?: string;
}

// ============================================================================
// Session Hook Functions
// ============================================================================

/**
 * Initialize workers on session start
 *
 * Call this from your SessionStart hook to auto-start the worker system.
 */
export async function onSessionStart(config: SessionHookConfig = {}): Promise<SessionHookResult> {
  const {
    projectRoot = process.cwd(),
    autoStart = true,
    runInitialScan = true,
    workers = ['health', 'security', 'git'],
  } = config;

  try {
    // Create and initialize manager
    const manager = createWorkerManager(projectRoot);
    await manager.initialize();

    let initialResults: Record<string, unknown> | undefined;

    // Run initial scan of critical workers
    if (runInitialScan && workers.length > 0) {
      initialResults = {};

      for (const workerName of workers) {
        try {
          const result = await manager.runWorker(workerName);
          initialResults[workerName] = {
            success: result.success,
            data: result.data,
            alerts: result.alerts,
          };
        } catch {
          initialResults[workerName] = { success: false, error: 'Worker failed' };
        }
      }
    }

    // Start scheduled workers
    if (autoStart) {
      await manager.start({
        autoSave: true,
        statuslineUpdate: true,
      });
    }

    return {
      success: true,
      manager,
      initialResults,
    };
  } catch (error) {
    return {
      success: false,
      manager: createWorkerManager(projectRoot),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Clean up workers on session end
 */
export async function onSessionEnd(manager: WorkerManager): Promise<void> {
  await manager.stop();
}

/**
 * Generate session start output for Claude Code hooks
 *
 * Returns formatted output suitable for Claude Code SessionStart hook.
 */
export function formatSessionStartOutput(result: SessionHookResult): string {
  const lines: string[] = [];

  if (result.success) {
    lines.push('[Workers] System initialized');

    if (result.initialResults) {
      const healthResult = result.initialResults.health as { data?: { status?: string } } | undefined;
      const securityResult = result.initialResults.security as { data?: { status?: string; totalIssues?: number } } | undefined;
      const gitResult = result.initialResults.git as { data?: { branch?: string; uncommitted?: number } } | undefined;

      if (healthResult?.data) {
        const status = healthResult.data.status || 'unknown';
        const icon = status === 'healthy' ? '✓' : status === 'warning' ? '⚠' : '✗';
        lines.push(`  ${icon} Health: ${status}`);
      }

      if (securityResult?.data) {
        const status = securityResult.data.status || 'unknown';
        const issues = securityResult.data.totalIssues || 0;
        const icon = status === 'clean' ? '✓' : status === 'warning' ? '⚠' : '✗';
        lines.push(`  ${icon} Security: ${status} (${issues} issues)`);
      }

      if (gitResult?.data) {
        const branch = gitResult.data.branch || 'unknown';
        const uncommitted = gitResult.data.uncommitted || 0;
        lines.push(`  ├─ Branch: ${branch}`);
        lines.push(`  └─ Uncommitted: ${uncommitted}`);
      }
    }

    lines.push('[Workers] Background scheduling started');
  } else {
    lines.push(`[Workers] Failed to initialize: ${result.error}`);
  }

  return lines.join('\n');
}

// ============================================================================
// Shell Script Generator
// ============================================================================

/**
 * Generate a shell hook script for integration with .claude/settings.json
 */
export function generateShellHook(projectRoot: string): string {
  const hookPath = path.join(projectRoot, 'v3', '@claude-flow', 'hooks');

  return `#!/bin/bash
# Claude Flow V3 Workers - Session Start Hook
# Auto-generated - do not edit manually

set -euo pipefail

PROJECT_ROOT="${projectRoot}"
HOOKS_PATH="${hookPath}"

# Run worker initialization via Node.js
node --experimental-specifier-resolution=node -e "
const { onSessionStart, formatSessionStartOutput } = require('\${HOOKS_PATH}/dist/workers/session-hook.js');

async function main() {
  const result = await onSessionStart({
    projectRoot: '\${PROJECT_ROOT}',
    autoStart: true,
    runInitialScan: true,
    workers: ['health', 'security', 'git'],
  });

  console.log(formatSessionStartOutput(result));
}

main().catch(err => {
  console.error('[Workers] Error:', err.message);
  process.exit(1);
});
"
`;
}

// ============================================================================
// Integration Helper
// ============================================================================

/**
 * Create a global worker manager instance for the session
 */
let globalManager: WorkerManager | null = null;

export function getGlobalManager(): WorkerManager | null {
  return globalManager;
}

export function setGlobalManager(manager: WorkerManager): void {
  globalManager = manager;
}

export async function initializeGlobalManager(projectRoot?: string): Promise<WorkerManager> {
  if (globalManager) {
    return globalManager;
  }

  const result = await onSessionStart({
    projectRoot,
    autoStart: true,
    runInitialScan: true,
  });

  if (!result.success) {
    throw new Error(result.error || 'Failed to initialize worker manager');
  }

  globalManager = result.manager;
  return globalManager;
}

// ============================================================================
// OpenCode Session Hooks
// ============================================================================

/**
 * OpenCode session hooks configuration interface
 */
export interface OpenCodeSessionConfig {
  projectRoot?: string;
  autoStartWorkers?: boolean;
  runInitialScan?: boolean;
  workers?: string[];
  opencodeMode?: boolean;
}

/**
 * OpenCode session hook result
 */
export interface OpenCodeSessionHookResult {
  success: boolean;
  sessionId?: string;
  workingDirectory?: string;
  manager?: WorkerManager;
  initialResults?: Record<string, unknown>;
  error?: string;
  isOpenCode?: boolean;
}

/**
 * Detect if running in OpenCode environment
 */
export function detectOpenCodeEnvironment(): boolean {
  return isOpenCode || 
         process.env.OPENCODE_HOOK_EVENT !== undefined ||
         process.env.OPENCORE_HOOK_EVENT !== undefined;
}

/**
 * Get OpenCode session configuration from environment
 */
export function getOpenCodeSessionConfig(): OpenCodeSessionConfig | null {
  if (!detectOpenCodeEnvironment()) {
    return null;
  }

  return {
    projectRoot: process.env.OPENCODE_WORKING_DIR || process.cwd(),
    autoStartWorkers: process.env.OPENCODE_AUTO_START_WORKERS !== 'false',
    runInitialScan: process.env.OPENCODE_RUN_INITIAL_SCAN !== 'false',
    workers: process.env.OPENCODE_WORKERS 
      ? process.env.OPENCODE_WORKERS.split(',') 
      : ['health', 'security', 'git'],
    opencodeMode: true,
  };
}

/**
 * Initialize workers for OpenCode session
 */
export async function onOpenCodeSessionStart(
  config: OpenCodeSessionConfig = {}
): Promise<OpenCodeSessionHookResult> {
  const opencodeConfig = getOpenCodeSessionConfig();
  
  const mergedConfig = {
    projectRoot: opencodeConfig?.projectRoot || config.projectRoot || process.cwd(),
    autoStart: opencodeConfig?.autoStartWorkers ?? config.autoStartWorkers ?? true,
    runInitialScan: opencodeConfig?.runInitialScan ?? config.runInitialScan ?? true,
    workers: opencodeConfig?.workers || config.workers || ['health', 'security', 'git'],
  };

  const sessionId = process.env.OPENCODE_SESSION_ID || 
                   process.env.OPENCORE_SESSION_ID || 
                   `opencode-${Date.now()}`;

  try {
    const manager = createWorkerManager(mergedConfig.projectRoot);
    await manager.initialize();

    let initialResults: Record<string, unknown> | undefined;

    if (mergedConfig.runInitialScan && mergedConfig.workers.length > 0) {
      initialResults = {};

      for (const workerName of mergedConfig.workers) {
        try {
          const result = await manager.runWorker(workerName);
          initialResults[workerName] = {
            success: result.success,
            data: result.data,
            alerts: result.alerts,
          };
        } catch {
          initialResults[workerName] = { success: false, error: 'Worker failed' };
        }
      }
    }

    if (mergedConfig.autoStart) {
      await manager.start({
        autoSave: true,
        statuslineUpdate: true,
      });
    }

    return {
      success: true,
      sessionId,
      workingDirectory: mergedConfig.projectRoot,
      manager,
      initialResults,
      isOpenCode: true,
    };
  } catch (error) {
    return {
      success: false,
      sessionId,
      workingDirectory: mergedConfig.projectRoot,
      error: error instanceof Error ? error.message : String(error),
      isOpenCode: true,
    };
  }
}

/**
 * Clean up workers on OpenCode session end
 */
export async function onOpenCodeSessionEnd(
  manager?: WorkerManager
): Promise<{ success: boolean; error?: string }> {
  try {
    if (manager) {
      await manager.stop();
    } else if (globalManager) {
      await globalManager.stop();
    }
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Format session start output for OpenCode
 */
export function formatOpenCodeSessionOutput(
  result: OpenCodeSessionHookResult
): string {
  if (!result.isOpenCode) {
    return formatSessionStartOutput(result as SessionHookResult);
  }

  const lines: string[] = [];

  if (result.success) {
    lines.push(`[OpenCode Workers] Session ${result.sessionId} initialized`);

    if (result.initialResults) {
      for (const [workerName, workerResult] of Object.entries(result.initialResults)) {
        const wr = workerResult as { success: boolean; data?: unknown; error?: string };
        const icon = wr.success ? '✓' : '✗';
        lines.push(`  ${icon} ${workerName}: ${wr.success ? 'OK' : wr.error || 'failed'}`);
      }
    }

    lines.push('[OpenCode Workers] Background scheduling active');
  } else {
    lines.push(`[OpenCode Workers] Error: ${result.error}`);
  }

  return lines.join('\n');
}

/**
 * Detect environment and call appropriate session start handler
 */
export async function onSessionAuto(
  config: SessionHookConfig = {}
): Promise<SessionHookResult | OpenCodeSessionHookResult> {
  if (detectOpenCodeEnvironment()) {
    return onOpenCodeSessionStart(config as OpenCodeSessionConfig);
  }
  return onSessionStart(config);
}

/**
 * Detect environment and call appropriate session end handler
 */
export async function onSessionEndAuto(
  manager?: WorkerManager
): Promise<void | { success: boolean; error?: string }> {
  if (detectOpenCodeEnvironment()) {
    return onOpenCodeSessionEnd(manager);
  }
  if (manager || globalManager) {
    await onSessionEnd(manager || globalManager!);
  }
}

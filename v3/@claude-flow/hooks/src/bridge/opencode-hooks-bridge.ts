/**
 * OpenCode Hooks Bridge
 *
 * Maps V3 internal hook events to OpenCode hook events.
 * This bridge enables seamless integration between claude-flow's
 * internal hook system and the OpenCode orchestration platform.
 *
 * @module v3/hooks/bridge/opencode-hooks-bridge
 */

import { HookEvent, HookPriority, type HookHandler, type HookContext, type HookResult } from '../types.js';

/**
 * OpenCode hook event types
 * Based on OpenCode's event system for orchestration
 */
export type OpenCodeHookEvent =
  | 'pre_task'
  | 'post_task'
  | 'task_progress'
  | 'session_start'
  | 'session_end'
  | 'session_restore'
  | 'pre_tool'
  | 'post_tool'
  | 'pre_edit'
  | 'post_edit'
  | 'pre_read'
  | 'post_read'
  | 'pre_command'
  | 'post_command'
  | 'agent_spawn'
  | 'agent_terminate'
  | 'pre_route'
  | 'post_route'
  | 'notification';

/**
 * OpenCode hook input structure
 */
export interface OpenCodeHookInput {
  session_id: string;
  working_directory: string;
  hook_event_name: OpenCodeHookEvent;

  // Tool-specific fields
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_output?: unknown;
  tool_success?: boolean;
  tool_exit_code?: number;

  // Task-specific fields
  task_id?: string;
  task_description?: string;
  task_status?: 'pending' | 'in_progress' | 'completed' | 'failed';

  // Agent-specific fields
  agent_id?: string;
  agent_type?: string;
  agent_status?: string;

  // Prompt-specific fields
  prompt?: string;

  // Notification-specific fields
  notification_message?: string;
  notification_level?: 'info' | 'warning' | 'error';
}

/**
 * OpenCode hook output structure
 */
export interface OpenCodeHookOutput {
  /** Decision for flow control */
  decision?: 'allow' | 'deny' | 'block' | 'continue';

  /** Reason for the decision */
  reason?: string;

  /** Whether to continue processing */
  continue?: boolean;

  /** Modified tool input */
  updated_input?: Record<string, unknown>;

  /** Additional context for the agent */
  context?: Record<string, unknown>;

  /** Suggestions for the agent */
  suggestions?: string[];
}

/**
 * Mapping from V3 HookEvent to OpenCode hook events
 */
export const V3_TO_OPENCODE_HOOK_MAP: Record<HookEvent, OpenCodeHookEvent | null> = {
  // Direct mappings
  [HookEvent.PreToolUse]: 'pre_tool',
  [HookEvent.PostToolUse]: 'post_tool',

  // File operations
  [HookEvent.PreEdit]: 'pre_edit',
  [HookEvent.PostEdit]: 'post_edit',
  [HookEvent.PreRead]: 'pre_read',
  [HookEvent.PostRead]: 'post_read',

  // Command operations
  [HookEvent.PreCommand]: 'pre_command',
  [HookEvent.PostCommand]: 'post_command',

  // Task operations
  [HookEvent.PreTask]: 'pre_task',
  [HookEvent.PostTask]: 'post_task',
  [HookEvent.TaskProgress]: 'task_progress',

  // Session operations
  [HookEvent.SessionStart]: 'session_start',
  [HookEvent.SessionEnd]: 'session_end',
  [HookEvent.SessionRestore]: 'session_restore',

  // Agent operations
  [HookEvent.AgentSpawn]: 'agent_spawn',
  [HookEvent.AgentTerminate]: 'agent_terminate',

  // Routing
  [HookEvent.PreRoute]: 'pre_route',
  [HookEvent.PostRoute]: 'post_route',

  // Learning (internal - no external mapping)
  [HookEvent.PatternLearned]: null,
  [HookEvent.PatternConsolidated]: null,
};

/**
 * Mapping from OpenCode events to V3 HookEvent
 */
export const OPENCODE_TO_V3_HOOK_MAP: Record<OpenCodeHookEvent, HookEvent> = {
  // Task operations
  pre_task: HookEvent.PreTask,
  post_task: HookEvent.PostTask,
  task_progress: HookEvent.TaskProgress,

  // Session operations
  session_start: HookEvent.SessionStart,
  session_end: HookEvent.SessionEnd,
  session_restore: HookEvent.SessionRestore,

  // Tool operations
  pre_tool: HookEvent.PreToolUse,
  post_tool: HookEvent.PostToolUse,

  // File operations
  pre_edit: HookEvent.PreEdit,
  post_edit: HookEvent.PostEdit,
  pre_read: HookEvent.PreRead,
  post_read: HookEvent.PostRead,

  // Command operations
  pre_command: HookEvent.PreCommand,
  post_command: HookEvent.PostCommand,

  // Agent operations
  agent_spawn: HookEvent.AgentSpawn,
  agent_terminate: HookEvent.AgentTerminate,

  // Routing
  pre_route: HookEvent.PreRoute,
  post_route: HookEvent.PostRoute,

  // Notifications
  notification: HookEvent.PostTask, // Map to closest V3 event
};

/**
 * OpenCode tool matchers (similar to Claude Code)
 */
export const OPENCODE_TOOL_MATCHERS: Partial<Record<OpenCodeHookEvent, string>> = {
  pre_edit: '^(Write|Edit|MultiEdit|edit|write)$',
  post_edit: '^(Write|Edit|MultiEdit|edit|write)$',
  pre_read: '^(Read|read|Bat|bat)$',
  post_read: '^(Read|read|Bat|bat)$',
  pre_command: '^(Bash|bash|Shell|shell)$',
  post_command: '^(Bash|bash|Shell|shell)$',
  pre_task: '^(Task|task|BackgroundTask|background_task)$',
  post_task: '^(Task|task|BackgroundTask|background_task)$',
  agent_spawn: '^(Task|task|SpawnTask|spawn_task)$',
};

/**
 * Bridge class for converting between V3 and OpenCode hooks
 */
export class OpenCodeHooksBridge {
  /**
   * Convert OpenCode hook input to V3 HookContext
   */
  static toV3Context(input: OpenCodeHookInput): HookContext {
    const event = OPENCODE_TO_V3_HOOK_MAP[input.hook_event_name] || HookEvent.PreToolUse;

    const context: HookContext = {
      event,
      timestamp: new Date(),
      metadata: {
        session_id: input.session_id,
        working_directory: input.working_directory,
        opencode_event: input.hook_event_name,
      },
    };

    // Add tool information
    if (input.tool_name) {
      context.tool = {
        name: input.tool_name,
        parameters: input.tool_input ?? {},
      };
    }

    // Add file information for file operations
    if (input.tool_name && ['Write', 'Edit', 'MultiEdit', 'write', 'edit', 'Read', 'read'].includes(input.tool_name)) {
      context.file = {
        path: (input.tool_input?.file_path as string) ?? (input.tool_input?.filePath as string) ?? '',
        operation: ['Read', 'read'].includes(input.tool_name) ? 'read' : 'modify',
      };
    }

    // Add command information for shell commands
    if (input.tool_name && ['Bash', 'bash', 'Shell', 'shell'].includes(input.tool_name)) {
      context.command = {
        raw: (input.tool_input?.command as string) ?? '',
        workingDirectory: input.working_directory,
        exitCode: input.tool_exit_code,
        output: typeof input.tool_output === 'string' ? input.tool_output : undefined,
      };
    }

    // Add task information
    if (input.task_id || input.task_description) {
      context.task = {
        id: input.task_id ?? `task-${Date.now()}`,
        description: input.task_description ?? '',
        agent: input.agent_type,
        status: input.task_status,
      };
    }

    // Add agent information
    if (input.agent_id || input.agent_type) {
      context.agent = {
        id: input.agent_id ?? `agent-${Date.now()}`,
        type: input.agent_type ?? 'unknown',
        status: input.agent_status,
      };
    }

    // Add session information
    context.session = {
      id: input.session_id,
      startedAt: new Date(),
    };

    // Add prompt for routing
    if (input.prompt) {
      context.routing = {
        task: input.prompt,
      };
    }

    return context;
  }

  /**
   * Convert V3 HookResult to OpenCode hook output
   */
  static toOpenCodeOutput(result: HookResult, event: OpenCodeHookEvent): OpenCodeHookOutput {
    const output: OpenCodeHookOutput = {};

    // Map abort to decision
    if (result.abort) {
      output.decision = 'block';
      output.continue = false;
    } else if (result.success) {
      output.decision = 'allow';
      output.continue = true;
    }

    // Add reason
    if (result.error) {
      output.reason = result.error;
    } else if (result.message) {
      output.reason = result.message;
    }

    // Pass through updated input if present
    if (result.data?.updatedInput) {
      output.updated_input = result.data.updatedInput as Record<string, unknown>;
    }

    // Add context from result data
    if (result.data) {
      output.context = result.data as Record<string, unknown>;
    }

    // Add suggestions if present
    if (result.data?.suggestions) {
      output.suggestions = result.data.suggestions as string[];
    }

    return output;
  }

  /**
   * Convert V3 HookEvent to OpenCode hook event
   */
  static v3ToOpenCodeEvent(event: HookEvent): OpenCodeHookEvent | null {
    return V3_TO_OPENCODE_HOOK_MAP[event] ?? null;
  }

  /**
   * Get tool matcher for an OpenCode event
   */
  static getToolMatcher(event: OpenCodeHookEvent): string | null {
    return OPENCODE_TOOL_MATCHERS[event] ?? null;
  }

  /**
   * Check if V3 event maps to an OpenCode hook
   */
  static hasOpenCodeMapping(event: HookEvent): boolean {
    return V3_TO_OPENCODE_HOOK_MAP[event] !== null;
  }

  /**
   * Create an OpenCode-compatible hook handler
   */
  static createOpenCodeHandler(
    v3Handler: HookHandler,
    openCodeEvent: OpenCodeHookEvent
  ): (input: OpenCodeHookInput) => Promise<OpenCodeHookOutput> {
    return async (input: OpenCodeHookInput): Promise<OpenCodeHookOutput> => {
      const context = this.toV3Context(input);
      const result = await v3Handler(context);
      return this.toOpenCodeOutput(result, openCodeEvent);
    };
  }

  /**
   * Generate shell hook commands for OpenCode integration
   */
  static createShellHookCommand(event: HookEvent, handler: string): string {
    const baseCommand = 'npx claude-flow@alpha hooks';

    switch (event) {
      case HookEvent.PreEdit:
        return `${baseCommand} pre-edit --file "$TOOL_INPUT_file_path"`;
      case HookEvent.PostEdit:
        return `${baseCommand} post-edit --file "$TOOL_INPUT_file_path" --success "$TOOL_SUCCESS" --train-patterns`;
      case HookEvent.PreCommand:
        return `${baseCommand} pre-command --command "$TOOL_INPUT_command"`;
      case HookEvent.PostCommand:
        return `${baseCommand} post-command --command "$TOOL_INPUT_command" --success "$TOOL_SUCCESS"`;
      case HookEvent.PreTask:
        return `${baseCommand} pre-task --description "$PROMPT"`;
      case HookEvent.PostTask:
        return `${baseCommand} post-task --task-id "$TOOL_RESULT_task_id" --analyze-performance`;
      case HookEvent.SessionStart:
        return `${baseCommand} session-start --session-id "$SESSION_ID" --load-context`;
      case HookEvent.SessionEnd:
        return `${baseCommand} session-end --session-id "$SESSION_ID" --export-metrics`;
      default:
        return `${baseCommand} ${handler}`;
    }
  }
}

/**
 * Process OpenCode hook input from environment or stdin
 */
export async function processOpenCodeHookInput(): Promise<OpenCodeHookInput | null> {
  // Try to read from environment variables first (OpenCode pattern)
  const eventName = process.env.OPENCODE_HOOK_EVENT;
  
  if (eventName) {
    return {
      session_id: process.env.OPENCODE_SESSION_ID || 'unknown',
      working_directory: process.env.OPENCODE_WORKING_DIR || process.cwd(),
      hook_event_name: eventName as OpenCodeHookEvent,
      tool_name: process.env.OPENCODE_TOOL_NAME,
      tool_input: process.env.OPENCODE_TOOL_INPUT 
        ? JSON.parse(process.env.OPENCODE_TOOL_INPUT) 
        : undefined,
      tool_success: process.env.OPENCODE_TOOL_SUCCESS === 'true',
      task_id: process.env.OPENCODE_TASK_ID,
      task_description: process.env.OPENCODE_TASK_DESCRIPTION,
      task_status: process.env.OPENCODE_TASK_STATUS as any,
      agent_id: process.env.OPENCODE_AGENT_ID,
      agent_type: process.env.OPENCODE_AGENT_TYPE,
      prompt: process.env.OPENCODE_PROMPT,
    };
  }

  // Fall back to stdin (JSON format)
  return new Promise((resolve) => {
    let data = '';

    process.stdin.setEncoding('utf8');
    process.stdin.on('readable', () => {
      let chunk;
      while ((chunk = process.stdin.read()) !== null) {
        data += chunk;
      }
    });

    process.stdin.on('end', () => {
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve(null);
      }
    });

    // Handle case where no stdin
    setTimeout(() => {
      if (!data) {
        resolve(null);
      }
    }, 100);
  });
}

/**
 * Output result to OpenCode hook system
 */
export function outputOpenCodeHookResult(output: OpenCodeHookOutput): void {
  console.log(JSON.stringify(output));
}

/**
 * Execute a V3 handler and bridge to OpenCode output
 */
export async function executeWithOpenCodeBridge(
  input: OpenCodeHookInput,
  handler: HookHandler
): Promise<OpenCodeHookOutput> {
  const context = OpenCodeHooksBridge.toV3Context(input);
  const result = await handler(context);
  return OpenCodeHooksBridge.toOpenCodeOutput(result, input.hook_event_name);
}

/**
 * OpenCode-specific session hooks configuration
 */
export interface OpenCodeSessionHooksConfig {
  projectRoot?: string;
  autoStartWorkers?: boolean;
  runInitialScan?: boolean;
  workers?: string[];
  notifyOnStart?: boolean;
  notifyOnEnd?: boolean;
}

/**
 * Default OpenCode session hooks configuration
 */
export const OPENCODE_DEFAULT_SESSION_CONFIG: OpenCodeSessionHooksConfig = {
  projectRoot: process.cwd(),
  autoStartWorkers: true,
  runInitialScan: true,
  workers: ['health', 'security', 'git'],
  notifyOnStart: true,
  notifyOnEnd: true,
};

/**
 * Generate OpenCode-compatible session start output
 */
export function formatOpenCodeSessionStartOutput(
  result: { success: boolean; initialResults?: Record<string, unknown>; error?: string },
  config: OpenCodeSessionHooksConfig = OPENCODE_DEFAULT_SESSION_CONFIG
): OpenCodeHookOutput {
  const output: OpenCodeHookOutput = {
    decision: result.success ? 'allow' : 'block',
    continue: result.success,
    context: {},
  };

  if (result.success) {
    output.reason = 'Session hooks initialized successfully';
    output.context = {
      workers_initialized: true,
      initial_scan_results: result.initialResults,
      auto_start: config.autoStartWorkers,
    };
    
    if (config.notifyOnStart && result.initialResults) {
      const messages: string[] = [];
      
      if (result.initialResults.health) {
        messages.push(`Health check: ${(result.initialResults.health as any).success ? 'OK' : 'FAILED'}`);
      }
      if (result.initialResults.security) {
        messages.push(`Security check: ${(result.initialResults.security as any).success ? 'OK' : 'FAILED'}`);
      }
      if (result.initialResults.git) {
        messages.push(`Git status: OK`);
      }
      
      output.suggestions = messages;
    }
  } else {
    output.reason = result.error || 'Failed to initialize session hooks';
  }

  return output;
}

/**
 * Generate OpenCode-compatible session end output
 */
export function formatOpenCodeSessionEndOutput(
  result: { success: boolean; metrics?: Record<string, unknown>; error?: string },
  config: OpenCodeSessionHooksConfig = OPENCODE_DEFAULT_SESSION_CONFIG
): OpenCodeHookOutput {
  const output: OpenCodeHookOutput = {
    decision: 'allow',
    continue: true,
    context: {},
  };

  if (result.success) {
    output.reason = 'Session ended successfully';
    output.context = {
      session_ended: true,
      metrics_exported: !!result.metrics,
      metrics: result.metrics,
    };
  } else {
    output.reason = result.error || 'Error during session end';
    output.context = {
      session_ended: false,
      error: result.error,
    };
  }

  return output;
}

/**
 * Task event mappings for OpenCode
 */
export const OPENCODETaskEvents = {
  PRE_TASK: 'pre_task' as OpenCodeHookEvent,
  POST_TASK: 'post_task' as OpenCodeHookEvent,
  TASK_PROGRESS: 'task_progress' as OpenCodeHookEvent,
};

/**
 * Session event mappings for OpenCode
 */
export const OPENCODESessionEvents = {
  SESSION_START: 'session_start' as OpenCodeHookEvent,
  SESSION_END: 'session_end' as OpenCodeHookEvent,
  SESSION_RESTORE: 'session_restore' as OpenCodeHookEvent,
};

/**
 * Tool event mappings for OpenCode
 */
export const OPENCODEToolEvents = {
  PRE_TOOL: 'pre_tool' as OpenCodeHookEvent,
  POST_TOOL: 'post_tool' as OpenCodeHookEvent,
  PRE_EDIT: 'pre_edit' as OpenCodeHookEvent,
  POST_EDIT: 'post_edit' as OpenCodeHookEvent,
  PRE_READ: 'pre_read' as OpenCodeHookEvent,
  POST_READ: 'post_read' as OpenCodeHookEvent,
  PRE_COMMAND: 'pre_command' as OpenCodeHookEvent,
  POST_COMMAND: 'post_command' as OpenCodeHookEvent,
};

export default OpenCodeHooksBridge;

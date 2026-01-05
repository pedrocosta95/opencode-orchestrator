# V3 Hooks System Implementation

## Overview

The V3 Hooks System provides a comprehensive event-driven architecture for intercepting, modifying, and recording operations throughout the claude-flow lifecycle. It integrates with the **ReasoningBank** neural learning system to enable self-improving agent behaviors.

## Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                        Hooks System                                 │
├─────────────────┬─────────────────┬─────────────────┬──────────────┤
│   Hook Registry │  Hook Executor  │  MCP Tools      │ CLI Commands │
│   (registration)│  (execution)    │  (API access)   │ (user access)│
└────────┬────────┴────────┬────────┴────────┬────────┴──────┬───────┘
         │                 │                 │               │
         └────────────────┬┴─────────────────┴───────────────┘
                          │
                  ┌───────▼───────┐
                  │ ReasoningBank │
                  │   (learning)  │
                  └───────────────┘
```

## Components

### 1. Hook Registry (`@claude-flow/shared/src/hooks/registry.ts`)

Manages hook registration, priority ordering, and lifecycle.

```typescript
import { createHookRegistry, HookEvent, HookPriority } from '@claude-flow/shared';

const registry = createHookRegistry();

// Register a hook
const hookId = registry.register(
  HookEvent.PreToolUse,
  async (context) => {
    console.log(`Tool ${context.tool?.name} about to be called`);
    return { success: true };
  },
  HookPriority.High
);

// Disable/enable hooks
registry.disable(hookId);
registry.enable(hookId);

// Get statistics
const stats = registry.getStats();
```

### 2. Hook Executor (`@claude-flow/shared/src/hooks/executor.ts`)

Executes registered hooks in priority order with error handling.

```typescript
import { createHookExecutor, HookContext } from '@claude-flow/shared';

const executor = createHookExecutor(registry, eventBus);

const context: HookContext = {
  event: HookEvent.PreToolUse,
  timestamp: new Date(),
  tool: { name: 'Read', parameters: { path: 'file.ts' } },
};

// Execute hooks
const result = await executor.execute(HookEvent.PreToolUse, context, {
  continueOnError: true,  // Don't abort on individual hook failures
});

// Execute with timeout
const timedResult = await executor.executeWithTimeout(
  HookEvent.PreToolUse,
  context,
  5000  // 5 second timeout
);
```

### 3. MCP Tools (`v3/mcp/tools/hooks-tools.ts`)

MCP-accessible tools for hooks system operations.

| Tool Name | Description |
|-----------|-------------|
| `hooks/pre-edit` | Get context and suggestions before file edits |
| `hooks/post-edit` | Record edit outcomes for learning |
| `hooks/pre-command` | Risk assessment before command execution |
| `hooks/post-command` | Record command outcomes |
| `hooks/route` | Route task to optimal agent |
| `hooks/explain` | Explain routing decision with transparency |
| `hooks/pretrain` | Bootstrap intelligence from repository |
| `hooks/metrics` | Get learning metrics and statistics |
| `hooks/list` | List registered hooks |

### 4. CLI Commands (`@claude-flow/cli/src/commands/hooks.ts`)

User-accessible CLI for hooks operations.

```bash
# Pre/Post Edit Hooks
npx claude-flow hooks pre-edit <filePath> [--operation modify]
npx claude-flow hooks post-edit <filePath> --success true

# Pre/Post Command Hooks
npx claude-flow hooks pre-command "npm test"
npx claude-flow hooks post-command "npm test" --success true --exit-code 0

# Task Routing
npx claude-flow hooks route "Implement user authentication"
npx claude-flow hooks explain "Implement user authentication" --verbose

# Intelligence Bootstrap
npx claude-flow hooks pretrain [--include-git --include-deps]
npx claude-flow hooks build-agents [--focus security]

# Metrics & Management
npx claude-flow hooks metrics [--category routing]
npx claude-flow hooks list [--category pre-edit]
npx claude-flow hooks transfer <sourceProject>
```

## Hook Events

### Supported Events

| Event | Description | Trigger Point |
|-------|-------------|---------------|
| `PreToolUse` | Before any tool is called | Before Read, Write, Edit, Bash, etc. |
| `PostToolUse` | After tool completes | After tool returns result |
| `PreEdit` | Before file edit | Before Edit/Write operations |
| `PostEdit` | After file edit | After Edit/Write completes |
| `PreCommand` | Before bash command | Before Bash tool execution |
| `PostCommand` | After bash command | After Bash returns |
| `PreTask` | Before task starts | Task assignment |
| `PostTask` | After task completes | Task completion/failure |
| `SessionStart` | Session begins | MCP session initialization |
| `SessionEnd` | Session ends | MCP session shutdown |

### Priority Levels

```typescript
enum HookPriority {
  Critical = 1000,  // Security, validation
  High = 100,       // Pre-processing
  Normal = 50,      // Standard hooks
  Low = 10,         // Logging, metrics
  Background = 1,   // Async operations
}
```

## ReasoningBank Integration

The hooks system integrates with **ReasoningBank** for adaptive learning:

### 4-Step Learning Pipeline

1. **RETRIEVE** - Top-k memory injection with MMR diversity
2. **JUDGE** - LLM-as-judge trajectory evaluation
3. **DISTILL** - Extract strategy memories from trajectories
4. **CONSOLIDATE** - Dedup, detect contradictions, prune patterns

### Trajectory Storage

```typescript
// Post-edit hook creates trajectory
const trajectory = createTrajectory(
  `modify file: ${filePath}`,
  'code',
  'edit',
  success ? 0.9 : 0.3  // Quality score
);

reasoningBank.storeTrajectory(trajectory);

// Successful operations are distilled into memories
if (success) {
  const memory = await reasoningBank.distill(trajectory);
}
```

### Pattern Retrieval

```typescript
// Pre-edit hook retrieves similar patterns
const queryEmbedding = generateSimpleEmbedding(filePath);
const patterns = await reasoningBank.retrieve(queryEmbedding, 5);

// Patterns inform suggestions
patterns.forEach(p => {
  console.log(`Similar pattern: ${p.memory.strategy}`);
  console.log(`Confidence: ${p.relevanceScore}`);
});
```

## V2 Compatibility

V3 maintains full backward compatibility with V2 hooks:

### V2 CLI Syntax (Supported)

```bash
# V2 syntax still works
npx claude-flow hooks pre-task --description "task"
npx claude-flow hooks session-restore --session-id "swarm-123"
npx claude-flow hooks post-edit --file "file.ts" --memory-key "swarm/agent/step"
npx claude-flow hooks notify --message "completed"
npx claude-flow hooks session-end --export-metrics true
```

### V2 MCP Tools (Deprecated but Functional)

The V2 underscore-based tool names are available via the compatibility layer:

| V2 Tool | V3 Equivalent |
|---------|---------------|
| `swarm_init` | `swarm/init` |
| `agent_spawn` | `agent/spawn` |
| `task_orchestrate` | `tasks/create` |
| `memory_usage` | `memory/store`, `memory/search` |
| `neural_status` | `system/status` |
| `neural_train` | `hooks/pretrain` |

## Configuration

### Hook Registry Options

```typescript
const registry = createHookRegistry({
  maxHooksPerEvent: 50,       // Limit hooks per event type
  defaultTimeout: 5000,       // Default execution timeout
  enableMetrics: true,        // Track execution statistics
  logLevel: 'info',           // Logging verbosity
});
```

### ReasoningBank Configuration

```typescript
const reasoningBank = createReasoningBank({
  maxTrajectories: 5000,        // Max stored trajectories
  distillationThreshold: 0.6,   // Min quality for distillation
  retrievalK: 5,                // Top-k retrieval
  mmrLambda: 0.7,               // Diversity vs relevance
  enableAgentDB: true,          // Use AgentDB for persistence
  namespace: 'hooks-learning',  // Storage namespace
});
```

## Performance Targets

| Metric | Target | Current |
|--------|--------|---------|
| Hook execution overhead | <10ms | ~5ms |
| ReasoningBank retrieval | <50ms | ~30ms |
| Pattern distillation | <100ms | ~75ms |
| Metrics calculation | <5ms | ~2ms |

## Files

```
v3/
├── @claude-flow/shared/src/hooks/
│   ├── types.ts           # Hook type definitions
│   ├── registry.ts        # Hook registration
│   ├── executor.ts        # Hook execution engine
│   ├── hooks.test.ts      # Unit tests
│   └── index.ts           # Module exports
├── @claude-flow/cli/src/commands/
│   └── hooks.ts           # CLI hook commands
├── mcp/tools/
│   ├── hooks-tools.ts     # MCP hook tools
│   └── v2-compat-tools.ts # V2 compatibility layer
└── implementation/hooks/
    └── README.md          # This documentation
```

## Usage Examples

### Example 1: Security Validation Hook

```typescript
registry.register(
  HookEvent.PreCommand,
  async (context) => {
    const command = context.command?.raw || '';

    // Block dangerous commands
    if (/rm -rf|format|drop database/i.test(command)) {
      return {
        success: false,
        abort: true,
        message: 'Command blocked by security hook',
      };
    }

    return { success: true };
  },
  HookPriority.Critical
);
```

### Example 2: Metrics Collection Hook

```typescript
registry.register(
  HookEvent.PostToolUse,
  async (context) => {
    const toolName = context.tool?.name;
    const duration = context.duration;

    await metricsCollector.record({
      tool: toolName,
      duration,
      timestamp: context.timestamp,
    });

    return { success: true };
  },
  HookPriority.Background
);
```

### Example 3: Intelligent Routing

```typescript
// Route task to optimal agent
const result = await executor.execute(HookEvent.PreTask, {
  event: HookEvent.PreTask,
  timestamp: new Date(),
  task: { description: 'Implement OAuth2 authentication' },
});

// Result contains routing recommendation
console.log(result.data?.recommendedAgent);  // 'security-auditor'
console.log(result.data?.confidence);        // 0.92
```

## Testing

```bash
# Run hooks tests
cd v3/@claude-flow/shared
npm test -- hooks.test.ts

# Run with coverage
npm test -- --coverage hooks/
```

## ADR References

- **ADR-005**: MCP-First API Design - Hooks exposed as MCP tools
- **ADR-006**: Unified Memory Service - ReasoningBank integration
- **ADR-007**: Event Sourcing - Hook events as audit trail

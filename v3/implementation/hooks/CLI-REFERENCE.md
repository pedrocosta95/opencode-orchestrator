# V3 Hooks CLI Reference

## Overview

The V3 hooks CLI provides command-line access to the hooks system for shell scripts, automation, and direct user interaction.

## Installation

```bash
# Hooks are available through the main claude-flow CLI
npm install -g @claude-flow/cli

# Or via npx
npx claude-flow hooks --help
```

## Commands

### File Edit Hooks

#### pre-edit

Get context and suggestions before editing a file.

```bash
npx claude-flow hooks pre-edit <filePath> [options]

Options:
  --operation, -o    Edit operation type (create|modify|delete) [default: modify]
  --no-context       Skip context retrieval
  --no-suggestions   Skip agent suggestions
  --format           Output format (json|text) [default: text]

Examples:
  npx claude-flow hooks pre-edit src/auth.ts
  npx claude-flow hooks pre-edit src/new-file.ts --operation create
  npx claude-flow hooks pre-edit src/legacy.ts --no-suggestions --format json
```

#### post-edit

Record edit outcome for learning.

```bash
npx claude-flow hooks post-edit <filePath> [options]

Options:
  --success, -s      Whether edit was successful [required]
  --operation, -o    Edit operation type [default: modify]
  --outcome          Description of outcome
  --file, -f         Alias for filePath (V2 compatibility)
  --memory-key       Memory storage key (V2 compatibility)

Examples:
  npx claude-flow hooks post-edit src/auth.ts --success true
  npx claude-flow hooks post-edit src/auth.ts --success false --outcome "Type error on line 42"

  # V2 compatibility
  npx claude-flow hooks post-edit --file src/auth.ts --success true --memory-key "swarm/coder/edit1"
```

---

### Command Hooks

#### pre-command

Assess risk before executing a command.

```bash
npx claude-flow hooks pre-command "<command>" [options]

Options:
  --working-dir, -d  Working directory for command
  --no-risk          Skip risk assessment
  --no-suggestions   Skip safety suggestions
  --format           Output format (json|text) [default: text]

Examples:
  npx claude-flow hooks pre-command "npm test"
  npx claude-flow hooks pre-command "rm -rf ./dist" --working-dir /project
  npx claude-flow hooks pre-command "docker compose up" --format json
```

#### post-command

Record command execution outcome.

```bash
npx claude-flow hooks post-command "<command>" [options]

Options:
  --success, -s      Whether command was successful [required]
  --exit-code, -e    Command exit code [default: 0]
  --output           Command output (truncated)
  --error            Error message if failed
  --time             Execution time in milliseconds

Examples:
  npx claude-flow hooks post-command "npm test" --success true --time 5230
  npx claude-flow hooks post-command "npm build" --success false --exit-code 1 --error "Module not found"
```

---

### Task Lifecycle Hooks

#### pre-task

Record task start for coordination.

```bash
npx claude-flow hooks pre-task [options]

Options:
  --description, -d  Task description [required]
  --task-id          Task identifier
  --agent            Assigned agent type

Examples:
  npx claude-flow hooks pre-task --description "Implement OAuth2 flow"
  npx claude-flow hooks pre-task -d "Fix login bug" --agent debugger --task-id task-123
```

#### post-task

Record task completion.

```bash
npx claude-flow hooks post-task [options]

Options:
  --task-id          Task identifier [required]
  --success, -s      Whether task completed successfully
  --result           Task result summary
  --metrics          Include task metrics

Examples:
  npx claude-flow hooks post-task --task-id task-123 --success true
  npx claude-flow hooks post-task --task-id task-123 --success false --result "Blocked by dependency"
```

---

### Session Hooks

#### session-restore

Restore previous session context.

```bash
npx claude-flow hooks session-restore [options]

Options:
  --session-id       Session identifier to restore [required]
  --include-memory   Restore memory state [default: true]
  --include-agents   Restore agent states [default: true]

Examples:
  npx claude-flow hooks session-restore --session-id swarm-abc123
  npx claude-flow hooks session-restore --session-id previous --include-memory false
```

#### session-end

End session and persist state.

```bash
npx claude-flow hooks session-end [options]

Options:
  --export-metrics   Export session metrics [default: true]
  --persist-memory   Persist memory to storage [default: true]
  --summary          Generate session summary

Examples:
  npx claude-flow hooks session-end
  npx claude-flow hooks session-end --export-metrics true --summary
```

---

### Task Routing

#### route

Route a task to the optimal agent.

```bash
npx claude-flow hooks route "<task>" [options]

Options:
  --context, -c      Additional context
  --prefer           Preferred agents (comma-separated)
  --no-explanation   Skip explanation
  --format           Output format (json|text) [default: text]

Examples:
  npx claude-flow hooks route "Implement user authentication"
  npx claude-flow hooks route "Fix CSS bug" --prefer "coder,reviewer"
  npx claude-flow hooks route "Research API options" --context "REST vs GraphQL" --format json
```

#### explain

Explain routing decision with transparency.

```bash
npx claude-flow hooks explain "<task>" [options]

Options:
  --context, -c      Additional context
  --verbose, -v      Include detailed reasoning
  --format           Output format (json|text) [default: text]

Examples:
  npx claude-flow hooks explain "Implement OAuth2 authentication"
  npx claude-flow hooks explain "Security audit" --verbose
```

---

### Intelligence & Learning

#### pretrain

Bootstrap intelligence from repository analysis.

```bash
npx claude-flow hooks pretrain [options]

Options:
  --path, -p         Repository path [default: current directory]
  --include-git      Include git history analysis [default: true]
  --include-deps     Include dependency analysis [default: true]
  --max-patterns     Maximum patterns to extract [default: 1000]
  --force            Force retraining even if data exists

Examples:
  npx claude-flow hooks pretrain
  npx claude-flow hooks pretrain --path /project --max-patterns 5000
  npx claude-flow hooks pretrain --force --no-include-git
```

#### build-agents

Generate optimized agent configurations from pretrain data.

```bash
npx claude-flow hooks build-agents [options]

Options:
  --focus            Focus area (all|security|performance|testing) [default: all]
  --output, -o       Output configuration file
  --v3-mode          Use V3 agent definitions

Examples:
  npx claude-flow hooks build-agents --focus security
  npx claude-flow hooks build-agents --output agents.json
  npx claude-flow hooks build-agents --v3-mode --focus performance
```

#### transfer

Transfer learned patterns from another project.

```bash
npx claude-flow hooks transfer <sourceProject> [options]

Options:
  --filter           Pattern filter (glob pattern)
  --merge            Merge with existing patterns [default: true]
  --dry-run          Show what would be transferred

Examples:
  npx claude-flow hooks transfer /other-project
  npx claude-flow hooks transfer ../shared-project --filter "security/*"
  npx claude-flow hooks transfer /template --dry-run
```

---

### Metrics & Management

#### metrics

View learning metrics dashboard.

```bash
npx claude-flow hooks metrics [options]

Options:
  --category, -c     Category (all|routing|edits|commands|patterns) [default: all]
  --time-range, -t   Time range (hour|day|week|month|all) [default: all]
  --detailed         Include detailed statistics
  --format           Output format (json|text|table) [default: table]
  --v3-dashboard     Use V3 metrics dashboard

Examples:
  npx claude-flow hooks metrics
  npx claude-flow hooks metrics --category routing --time-range week
  npx claude-flow hooks metrics --detailed --format json
  npx claude-flow hooks metrics --v3-dashboard
```

#### list

List registered hooks.

```bash
npx claude-flow hooks list [options]

Options:
  --category, -c     Filter by category
  --include-disabled Show disabled hooks
  --no-metadata      Hide hook metadata
  --format           Output format (json|text|table) [default: table]

Examples:
  npx claude-flow hooks list
  npx claude-flow hooks list --category routing
  npx claude-flow hooks list --include-disabled --format json
```

---

### Notifications

#### notify

Send notification message (V2 compatibility).

```bash
npx claude-flow hooks notify [options]

Options:
  --message, -m      Notification message [required]
  --level            Severity level (info|warn|error) [default: info]
  --channel          Notification channel

Examples:
  npx claude-flow hooks notify --message "Task completed successfully"
  npx claude-flow hooks notify -m "Build failed" --level error
```

---

## Environment Variables

```bash
# Hook execution timeout (milliseconds)
CLAUDE_FLOW_HOOK_TIMEOUT=5000

# Enable/disable ReasoningBank integration
CLAUDE_FLOW_REASONINGBANK_ENABLED=true

# Learning namespace
CLAUDE_FLOW_HOOKS_NAMESPACE=hooks-learning

# Logging level
CLAUDE_FLOW_HOOKS_LOG_LEVEL=info
```

## V2 Compatibility

All V2 hook commands are supported for backward compatibility:

```bash
# V2 syntax (still works)
npx claude-flow hooks pre-task --description "[task]"
npx claude-flow hooks session-restore --session-id "swarm-[id]"
npx claude-flow hooks post-edit --file "[file]" --memory-key "swarm/[agent]/[step]"
npx claude-flow hooks notify --message "[what was done]"
npx claude-flow hooks post-task --task-id "[task]"
npx claude-flow hooks session-end --export-metrics true
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Invalid arguments |
| 3 | Hook execution failed |
| 4 | Timeout exceeded |
| 5 | Risk assessment blocked |

## Output Examples

### Text Format (Default)

```
$ npx claude-flow hooks route "Implement authentication"

Task Routing Result
==================
Task: Implement authentication
Recommended Agent: security-auditor
Confidence: 92%

Explanation:
Based on task analysis and 15 similar historical tasks,
'security-auditor' is recommended with 92% confidence.

Alternative Agents:
  - coder (78%)
  - backend-dev (75%)
```

### JSON Format

```bash
$ npx claude-flow hooks route "Implement authentication" --format json
```

```json
{
  "task": "Implement authentication",
  "recommendedAgent": "security-auditor",
  "confidence": 0.92,
  "alternativeAgents": [
    { "agent": "coder", "confidence": 0.78 },
    { "agent": "backend-dev", "confidence": 0.75 }
  ],
  "explanation": "Based on task analysis..."
}
```

### Table Format

```
$ npx claude-flow hooks metrics --format table

Hooks Learning Metrics
======================
Category    Total    Success Rate    Patterns
─────────────────────────────────────────────
routing      423        84%           156
edits        756        93%            89
commands     368        82%            34
─────────────────────────────────────────────
Total       1547        89%           279
```

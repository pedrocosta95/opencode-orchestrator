# Migration Guide: Claude Code to OpenCode

This guide helps users migrate from Claude Code to OpenCode while continuing to use OpenCode Orchestrator for multi-agent coordination.

## Overview

OpenCode Orchestrator supports both Claude Code and OpenCode. This migration guide covers:

1. **Installing OpenCode** - Replace Claude Code with OpenCode
2. **Updating MCP Configuration** - Use `opencode.json` for auto-discovery
3. **Migrating Skills** - Skills have moved from `.claude/skills` to `.opencode/skills`
4. **Migrating Agents** - Agent definitions are now in `.opencode/agents`
5. **Command Changes** - CLI commands now use `opencode-orchestrator` instead of `claude-flow`

## Step 1: Install OpenCode

Replace Claude Code with OpenCode:

```bash
# Uninstall Claude Code (optional)
npm uninstall -g @anthropic-ai/claude-code

# Install OpenCode
npm install -g opencode-ai

# Verify installation
opencode --version
```

## Step 2: Project Configuration

OpenCode Orchestrator projects now use `opencode.json` for configuration:

```json
{
  "$schema": "https://opencode.dev/schema.json",
  "version": "1.0.0",
  "name": "opencode-orchestrator",
  "description": "OpenCode Orchestrator - Multi-agent coordination system",
  "mcp": {
    "servers": {
      "opencode-orchestrator": {
        "command": "npx",
        "args": ["opencode-orchestrator@latest", "mcp", "start"],
        "description": "OpenCode Orchestrator MCP server for memory, neural, and intelligence features"
      }
    }
  },
  "skills": {
    "directories": [
      ".opencode/skills",
      ".claude/skills",
      ".agents/skills"
    ]
  },
  "agents": {
    "directory": ".opencode/agents"
  }
}
```

## Step 3: Migrate Skills

Skills have moved locations:

| Old Location | New Location |
|-------------|---------------|
| `.claude/skills/` | `.opencode/skills/` |
| `.claude/commands/` | Migrated to skills format |
| `.claude/agents/` | `.opencode/agents/` |

The project automatically checks all three directories:
- `.opencode/skills` - New OpenCode-native skills
- `.claude/skills` - Legacy skills (for backwards compatibility)
- `.agents/skills` - Agent definitions

## Step 4: Update CLI Commands

Most CLI commands remain the same, but replace `claude` with `opencode`:

| Old Command | New Command |
|-------------|--------------|
| `claude mcp add ruflo ...` | `opencode mcp add opencode-orchestrator ...` |
| `claude mcp list` | `opencode mcp list` |
| `npx claude-flow@v3alpha ...` | `npx opencode-orchestrator@latest ...` |

The underlying OpenCode Orchestrator CLI commands haven't changed:
```bash
# These still work the same
npx opencode-orchestrator@latest init
npx opencode-orchestrator@latest mcp start
npx opencode-orchestrator@latest swarm init
```

## Step 5: Environment Variables

Some environment variables have been updated:

| Old Variable | New Variable |
|--------------|--------------|
| `CLAUDE_CODE_SESSION_ID` | `OPENCODE_SESSION_ID` |
| `CLAUDE_CODE_HOOK_EVENT` | `OPENCODE_HOOK_EVENT` |
| `CLAUDE_FLOW_*` | Still valid (orchestrator-specific) |

## Hooks System

OpenCode Orchestrator provides a hooks bridge for OpenCode:

```typescript
// The hooks system automatically detects OpenCode environment
import { detectOpenCodeEnvironment, onOpenCodeSessionStart } from 'opencode-orchestrator';

// Check if running in OpenCode
if (detectOpenCodeEnvironment()) {
  // OpenCode-specific handling
}
```

## File Structure Changes

```
# Old Structure (Claude Code)
.claude/
  skills/
  commands/
  agents/
  settings.json
  mcp.json

# New Structure (OpenCode)
opencode.json          # Main config (new)
.opencode/
  skills/              # Native OpenCode skills
  agents/              # Agent definitions
.claude/               # Legacy (still supported)
  skills/
```

## Verification

Verify your setup is working:

```bash
# Check OpenCode is installed
opencode --version

# Check MCP servers (should auto-load from opencode.json)
opencode mcp list

# Verify skills are loaded
opencode skills list

# Test OpenCode Orchestrator integration
npx opencode-orchestrator@latest doctor
```

## Common Issues

### MCP Server Not Starting

If MCP servers don't start automatically, manually add them:

```bash
opencode mcp add opencode-orchestrator -- npx -y opencode-orchestrator@latest mcp start
```

### Skills Not Loading

Check that `opencode.json` has the correct skills directories configured:

```json
{
  "skills": {
    "directories": [".opencode/skills", ".claude/skills"]
  }
}
```

## Support

- Issues: https://github.com/ruvnet/claude-flow/issues
- Documentation: https://github.com/ruvnet/claude-flow#readme

/**
 * OpenCode Configuration Generator
 * Creates opencode.json for OpenCode integration
 */

import type { InitOptions } from './types.js';

/**
 * OpenCode configuration schema
 */
export interface OpenCodeConfig {
  $schema: string;
  mcp: Record<string, MCPConfig>;
  agent: Record<string, AgentConfig>;
  permission: Record<string, string>;
}

export interface MCPConfig {
  type: 'local' | 'remote';
  command?: string[];
  url?: string;
  enabled: boolean;
}

export interface AgentConfig {
  description: string;
  model: string;
  mode: 'primary' | 'specialist';
}

/**
 * Generate OpenCode configuration
 */
export function generateOpenCodeConfig(options: InitOptions): OpenCodeConfig {
  const config: OpenCodeConfig = {
    $schema: 'https://opencode.ai/config.json',
    mcp: {},
    agent: {},
    permission: getDefaultPermissions(),
  };

  // Add MCP servers if enabled
  if (options.components.mcp) {
    config.mcp = getMCPConfig(options);
  }

  // Add default agent configuration
  config.agent.orchestrator = {
    description: 'AI coding orchestrator that delegates tasks to specialist agents',
    model: 'opencode-go/glm-5',
    mode: 'primary',
  };

  return config;
}

/**
 * Get MCP server configurations
 */
function getMCPConfig(options: InitOptions): Record<string, MCPConfig> {
  const mcpConfig: Record<string, MCPConfig> = {};

  // Claude Flow MCP server
  mcpConfig['claude-flow'] = {
    type: 'local',
    command: ['npx', '-y', '@cloudpftc/opencode-orchestrator@latest', 'mcp', 'start'],
    enabled: true,
  };

  // Optional: ruv-swarm MCP server
  if (options.runtime.swarm) {
    mcpConfig['ruv-swarm'] = {
      type: 'local',
      command: ['npx', '-y', 'ruv-swarm', 'mcp', 'start'],
      enabled: true,
    };
  }

  // Optional: flow-nexus MCP server
  if (options.runtime.flowNexus) {
    mcpConfig['flow-nexus'] = {
      type: 'local',
      command: ['npx', '-y', 'flow-nexus@latest', 'mcp', 'start'],
      enabled: true,
    };
  }

  return mcpConfig;
}

/**
 * Get default permissions for OpenCode
 */
function getDefaultPermissions(): Record<string, string> {
  return {
    edit: 'allow',
    bash: 'allow',
    webfetch: 'allow',
    read: 'allow',
    grep: 'allow',
    glob: 'allow',
    list: 'allow',
    skill: 'allow',
    todowrite: 'allow',
    todoread: 'allow',
    websearch: 'allow',
    question: 'allow',
  };
}

/**
 * Generate minimal OpenCode configuration
 */
export function generateMinimalOpenCodeConfig(): OpenCodeConfig {
  return {
    $schema: 'https://opencode.ai/config.json',
    mcp: {
      'claude-flow': {
        type: 'local',
        command: ['npx', '-y', '@cloudpftc/opencode-orchestrator@latest', 'mcp', 'start'],
        enabled: true,
      },
    },
    agent: {
      orchestrator: {
        description: 'AI coding orchestrator',
        model: 'opencode-go/glm-5',
        mode: 'primary',
      },
    },
    permission: getDefaultPermissions(),
  };
}

/**
 * OpenCode configuration templates
 */
export const OPENCODE_CONFIG_TEMPLATES: Array<{ name: string; description: string }> = [
  { name: 'minimal', description: 'Minimal configuration with essential MCP servers' },
  { name: 'standard', description: 'Standard configuration with all MCP servers and hooks' },
  { name: 'full', description: 'Full configuration with all features enabled' },
];

export default generateOpenCodeConfig;
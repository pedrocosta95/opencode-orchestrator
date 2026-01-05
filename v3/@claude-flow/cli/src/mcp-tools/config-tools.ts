/**
 * Config MCP Tools for CLI
 *
 * Tool definitions for configuration management.
 */

import type { MCPTool } from './types.js';

export const configTools: MCPTool[] = [
  {
    name: 'config/get',
    description: 'Get configuration value',
    category: 'config',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Configuration key' },
        scope: { type: 'string', description: 'Configuration scope' },
      },
      required: ['key'],
    },
    handler: async (input) => {
      return {
        key: input.key,
        value: null,
        scope: input.scope || 'default',
      };
    },
  },
  {
    name: 'config/set',
    description: 'Set configuration value',
    category: 'config',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Configuration key' },
        value: { description: 'Configuration value' },
        scope: { type: 'string', description: 'Configuration scope' },
      },
      required: ['key', 'value'],
    },
    handler: async (input) => {
      return {
        success: true,
        key: input.key,
        scope: input.scope || 'default',
      };
    },
  },
  {
    name: 'config/list',
    description: 'List configuration values',
    category: 'config',
    inputSchema: {
      type: 'object',
      properties: {
        scope: { type: 'string', description: 'Configuration scope' },
        prefix: { type: 'string', description: 'Key prefix filter' },
      },
    },
    handler: async (input) => {
      return {
        configs: [],
        scope: input.scope || 'default',
      };
    },
  },
  {
    name: 'config/reset',
    description: 'Reset configuration to defaults',
    category: 'config',
    inputSchema: {
      type: 'object',
      properties: {
        scope: { type: 'string', description: 'Configuration scope' },
        key: { type: 'string', description: 'Specific key to reset' },
      },
    },
    handler: async (input) => {
      return {
        success: true,
        scope: input.scope || 'default',
        reset: input.key || 'all',
      };
    },
  },
];

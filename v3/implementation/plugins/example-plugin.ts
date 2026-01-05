/**
 * Example Plugin for Claude-Flow V3
 *
 * This example demonstrates how to create a complete plugin
 * with all extension points and lifecycle management.
 */

import type {
  ClaudeFlowPlugin,
  PluginContext,
  AgentTypeDefinition,
  TaskTypeDefinition,
  MCPToolDefinition,
  CLICommandDefinition,
  MemoryBackendFactory,
  ILogger,
} from '@claude-flow/shared';

/**
 * Example plugin configuration
 */
interface ExamplePluginConfig {
  enableFeatureA: boolean;
  featureATimeout: number;
  apiKey?: string;
}

/**
 * Example Plugin Implementation
 *
 * Demonstrates all extension points available in the V3 plugin system.
 */
export class ExamplePlugin implements ClaudeFlowPlugin {
  // Required: Unique plugin identifier
  readonly name = 'example-plugin';

  // Required: Semantic version
  readonly version = '1.0.0';

  // Optional: Plugin dependencies (loaded first)
  readonly dependencies = [];

  // Optional: Human-readable description
  readonly description = 'Example plugin demonstrating V3 plugin architecture';

  // Optional: Plugin author
  readonly author = 'Claude-Flow Team';

  // Plugin state
  private config: ExamplePluginConfig | null = null;
  private logger: ILogger | null = null;
  private isHealthy = true;

  /**
   * Initialize the plugin
   *
   * Called after all dependencies are loaded.
   * Use this to:
   * - Validate configuration
   * - Set up connections
   * - Initialize internal state
   */
  async initialize(context: PluginContext): Promise<void> {
    this.logger = context.logger;
    this.logger.info('[ExamplePlugin] Initializing...');

    // Parse and validate configuration
    this.config = this.parseConfig(context.config);

    // Register for events (optional)
    context.eventBus.on('agent:spawned', (event) => {
      this.logger?.debug('[ExamplePlugin] Agent spawned:', event.payload);
    });

    // Register services in DI container (optional)
    context.services.register('exampleService', {
      greet: (name: string) => `Hello, ${name}!`,
    });

    this.logger.info('[ExamplePlugin] Initialized successfully');
  }

  /**
   * Shutdown the plugin
   *
   * Called during system shutdown.
   * Use this to:
   * - Close connections
   * - Flush buffers
   * - Clean up resources
   */
  async shutdown(): Promise<void> {
    this.logger?.info('[ExamplePlugin] Shutting down...');

    // Clean up resources
    this.config = null;

    this.logger?.info('[ExamplePlugin] Shutdown complete');
  }

  /**
   * Register custom agent types
   *
   * @returns Array of agent type definitions
   */
  registerAgentTypes(): AgentTypeDefinition[] {
    return [
      {
        type: 'example-specialist',
        name: 'Example Specialist Agent',
        description: 'Agent specialized in example tasks',
        defaultConfig: {
          model: 'claude-3-opus',
          maxTokens: 4096,
          temperature: 0.7,
        },
        requiredCapabilities: ['analysis', 'synthesis'],
        metadata: {
          category: 'specialist',
          version: '1.0.0',
        },
      },
      {
        type: 'example-coordinator',
        name: 'Example Coordinator Agent',
        description: 'Agent for coordinating example workflows',
        defaultConfig: {
          model: 'claude-3-sonnet',
          maxTokens: 2048,
        },
        requiredCapabilities: ['coordination'],
      },
    ];
  }

  /**
   * Register custom task types
   *
   * @returns Array of task type definitions
   */
  registerTaskTypes(): TaskTypeDefinition[] {
    return [
      {
        type: 'example-analysis',
        name: 'Example Analysis Task',
        description: 'Perform example analysis on input data',
        defaultPriority: 50,
        defaultTimeout: 120000, // 2 minutes
        requiredCapabilities: ['analysis'],
        inputSchema: {
          type: 'object',
          properties: {
            data: { type: 'string' },
            depth: { type: 'number' },
            options: {
              type: 'object',
              properties: {
                detailed: { type: 'boolean' },
              },
            },
          },
          required: ['data'],
        },
        metadata: {
          category: 'analysis',
        },
      },
    ];
  }

  /**
   * Register MCP tools
   *
   * @returns Array of MCP tool definitions
   */
  registerMCPTools(): MCPToolDefinition[] {
    return [
      {
        name: 'example_analyze',
        description: 'Analyze data using the example plugin',
        inputSchema: {
          type: 'object',
          properties: {
            input: {
              type: 'string',
              description: 'Data to analyze',
            },
            format: {
              type: 'string',
              enum: ['json', 'text', 'markdown'],
              description: 'Output format',
            },
          },
          required: ['input'],
        },
        handler: async (input: Record<string, unknown>) => {
          const data = input.input as string;
          const format = (input.format as string) || 'json';

          // Perform analysis
          const result = {
            analyzed: true,
            input: data,
            length: data.length,
            words: data.split(/\s+/).length,
          };

          if (format === 'json') {
            return result;
          } else if (format === 'markdown') {
            return `## Analysis Result\n- Length: ${result.length}\n- Words: ${result.words}`;
          } else {
            return `Analyzed: length=${result.length}, words=${result.words}`;
          }
        },
        version: '1.0.0',
        metadata: {
          category: 'analysis',
        },
      },
      {
        name: 'example_transform',
        description: 'Transform data using the example plugin',
        inputSchema: {
          type: 'object',
          properties: {
            data: { type: 'string', description: 'Data to transform' },
            operation: {
              type: 'string',
              enum: ['uppercase', 'lowercase', 'reverse'],
              description: 'Transformation operation',
            },
          },
          required: ['data', 'operation'],
        },
        handler: async (input: Record<string, unknown>) => {
          const data = input.data as string;
          const operation = input.operation as string;

          switch (operation) {
            case 'uppercase':
              return { result: data.toUpperCase() };
            case 'lowercase':
              return { result: data.toLowerCase() };
            case 'reverse':
              return { result: data.split('').reverse().join('') };
            default:
              return { error: `Unknown operation: ${operation}` };
          }
        },
      },
    ];
  }

  /**
   * Register CLI commands
   *
   * @returns Array of CLI command definitions
   */
  registerCLICommands(): CLICommandDefinition[] {
    return [
      {
        name: 'example',
        description: 'Run example plugin commands',
        aliases: ['ex'],
        options: [
          {
            name: 'verbose',
            short: 'v',
            description: 'Enable verbose output',
            type: 'boolean',
            default: false,
          },
          {
            name: 'format',
            short: 'f',
            description: 'Output format',
            type: 'string',
            default: 'text',
          },
        ],
        arguments: [
          {
            name: 'action',
            description: 'Action to perform',
            required: true,
            choices: ['status', 'analyze', 'info'],
          },
        ],
        handler: async (args) => {
          const action = args._[0];
          const verbose = args.verbose as boolean;

          switch (action) {
            case 'status':
              console.log('Example plugin status: OK');
              if (verbose) {
                console.log('  Version:', this.version);
                console.log('  Healthy:', this.isHealthy);
              }
              break;

            case 'info':
              console.log('Example Plugin v' + this.version);
              console.log(this.description);
              break;

            case 'analyze':
              console.log('Running analysis...');
              break;
          }
        },
      },
    ];
  }

  /**
   * Register memory backends
   *
   * @returns Array of memory backend factories
   */
  registerMemoryBackends(): MemoryBackendFactory[] {
    return [
      {
        name: 'example-memory',
        description: 'Example in-memory backend for demonstration',
        capabilities: {
          supportsVectorSearch: false,
          supportsFullText: true,
          supportsTransactions: false,
          supportsPersistence: false,
        },
        create: async (config) => {
          return new ExampleMemoryBackend(config);
        },
        metadata: {
          type: 'in-memory',
          maxEntries: 10000,
        },
      },
    ];
  }

  /**
   * Health check
   *
   * Called periodically when health checks are enabled.
   * @returns true if healthy, false otherwise
   */
  async healthCheck(): Promise<boolean> {
    // Perform health checks
    // - Check connections
    // - Verify resources
    // - Test dependencies

    return this.isHealthy;
  }

  /**
   * Parse and validate plugin configuration
   */
  private parseConfig(config: Record<string, unknown>): ExamplePluginConfig {
    return {
      enableFeatureA: (config.enableFeatureA as boolean) ?? true,
      featureATimeout: (config.featureATimeout as number) ?? 5000,
      apiKey: config.apiKey as string | undefined,
    };
  }
}

/**
 * Example Memory Backend Implementation
 */
class ExampleMemoryBackend {
  private store = new Map<string, { value: unknown; metadata?: Record<string, unknown> }>();

  constructor(private config: Record<string, unknown>) {}

  async initialize(): Promise<void> {
    // Initialize backend
  }

  async shutdown(): Promise<void> {
    this.store.clear();
  }

  async store(key: string, value: unknown, metadata?: Record<string, unknown>): Promise<void> {
    this.store.set(key, { value, metadata });
  }

  async retrieve(key: string): Promise<unknown | null> {
    return this.store.get(key)?.value ?? null;
  }

  async delete(key: string): Promise<boolean> {
    return this.store.delete(key);
  }

  async search(query: string, options?: Record<string, unknown>): Promise<Array<{ key: string; value: unknown; score: number }>> {
    const results: Array<{ key: string; value: unknown; score: number }> = [];

    for (const [key, entry] of this.store.entries()) {
      const valueStr = JSON.stringify(entry.value).toLowerCase();
      if (valueStr.includes(query.toLowerCase())) {
        results.push({
          key,
          value: entry.value,
          score: 1.0,
        });
      }
    }

    return results;
  }

  async clear(): Promise<void> {
    this.store.clear();
  }

  async getStats(): Promise<{ entryCount: number; sizeBytes: number; memoryUsageBytes: number }> {
    return {
      entryCount: this.store.size,
      sizeBytes: 0,
      memoryUsageBytes: 0,
    };
  }
}

/**
 * Plugin factory function
 *
 * Common pattern for creating plugin instances
 */
export function createExamplePlugin(): ClaudeFlowPlugin {
  return new ExamplePlugin();
}

// Default export for dynamic loading
export default ExamplePlugin;

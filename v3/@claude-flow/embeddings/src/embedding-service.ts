/**
 * V3 Embedding Service Implementation
 *
 * Production embedding service aligned with agentic-flow@alpha:
 * - OpenAI provider (text-embedding-3-small/large)
 * - Transformers.js provider (local ONNX models)
 * - Mock provider (development/testing)
 *
 * Performance Targets:
 * - Single embedding: <100ms (API), <50ms (local)
 * - Batch embedding: <500ms for 10 items
 * - Cache hit: <1ms
 */

import { EventEmitter } from 'events';
import type {
  EmbeddingProvider,
  EmbeddingConfig,
  OpenAIEmbeddingConfig,
  TransformersEmbeddingConfig,
  MockEmbeddingConfig,
  EmbeddingResult,
  BatchEmbeddingResult,
  IEmbeddingService,
  EmbeddingEvent,
  EmbeddingEventListener,
  SimilarityMetric,
  SimilarityResult,
} from './types.js';

// ============================================================================
// LRU Cache Implementation
// ============================================================================

class LRUCache<K, V> {
  private cache: Map<K, V> = new Map();
  private hits = 0;
  private misses = 0;

  constructor(private readonly maxSize: number) {}

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
      this.hits++;
      return value;
    }
    this.misses++;
    return undefined;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Remove oldest (first) entry
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }

  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  get size(): number {
    return this.cache.size;
  }

  get hitRate(): number {
    const total = this.hits + this.misses;
    return total > 0 ? this.hits / total : 0;
  }

  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      hitRate: this.hitRate,
    };
  }
}

// ============================================================================
// Base Embedding Service
// ============================================================================

abstract class BaseEmbeddingService extends EventEmitter implements IEmbeddingService {
  abstract readonly provider: EmbeddingProvider;
  protected cache: LRUCache<string, Float32Array>;
  protected embeddingListeners: Set<EmbeddingEventListener> = new Set();

  constructor(protected readonly config: EmbeddingConfig) {
    super();
    this.cache = new LRUCache(config.cacheSize ?? 1000);
  }

  abstract embed(text: string): Promise<EmbeddingResult>;
  abstract embedBatch(texts: string[]): Promise<BatchEmbeddingResult>;

  protected emitEvent(event: EmbeddingEvent): void {
    for (const listener of this.embeddingListeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('Error in embedding event listener:', error);
      }
    }
    this.emit(event.type, event);
  }

  addEventListener(listener: EmbeddingEventListener): void {
    this.embeddingListeners.add(listener);
  }

  removeEventListener(listener: EmbeddingEventListener): void {
    this.embeddingListeners.delete(listener);
  }

  clearCache(): void {
    const size = this.cache.size;
    this.cache.clear();
    this.emitEvent({ type: 'cache_eviction', size });
  }

  getCacheStats() {
    const stats = this.cache.getStats();
    return {
      size: stats.size,
      maxSize: stats.maxSize,
      hitRate: stats.hitRate,
    };
  }

  async shutdown(): Promise<void> {
    this.clearCache();
    this.embeddingListeners.clear();
  }
}

// ============================================================================
// OpenAI Embedding Service
// ============================================================================

export class OpenAIEmbeddingService extends BaseEmbeddingService {
  readonly provider: EmbeddingProvider = 'openai';
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseURL: string;
  private readonly timeout: number;
  private readonly maxRetries: number;

  constructor(config: OpenAIEmbeddingConfig) {
    super(config);
    this.apiKey = config.apiKey;
    this.model = config.model ?? 'text-embedding-3-small';
    this.baseURL = config.baseURL ?? 'https://api.openai.com/v1/embeddings';
    this.timeout = config.timeout ?? 30000;
    this.maxRetries = config.maxRetries ?? 3;
  }

  async embed(text: string): Promise<EmbeddingResult> {
    // Check cache
    const cached = this.cache.get(text);
    if (cached) {
      this.emitEvent({ type: 'cache_hit', text });
      return {
        embedding: cached,
        latencyMs: 0,
        cached: true,
      };
    }

    this.emitEvent({ type: 'embed_start', text });
    const startTime = performance.now();

    try {
      const response = await this.callOpenAI([text]);
      const embedding = new Float32Array(response.data[0].embedding);

      // Cache result
      this.cache.set(text, embedding);

      const latencyMs = performance.now() - startTime;
      this.emitEvent({ type: 'embed_complete', text, latencyMs });

      return {
        embedding,
        latencyMs,
        usage: {
          promptTokens: response.usage?.prompt_tokens ?? 0,
          totalTokens: response.usage?.total_tokens ?? 0,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.emitEvent({ type: 'embed_error', text, error: message });
      throw new Error(`OpenAI embedding failed: ${message}`);
    }
  }

  async embedBatch(texts: string[]): Promise<BatchEmbeddingResult> {
    this.emitEvent({ type: 'batch_start', count: texts.length });
    const startTime = performance.now();

    // Check cache for each text
    const cached: Array<{ index: number; embedding: Float32Array }> = [];
    const uncached: Array<{ index: number; text: string }> = [];

    texts.forEach((text, index) => {
      const cachedEmbedding = this.cache.get(text);
      if (cachedEmbedding) {
        cached.push({ index, embedding: cachedEmbedding });
        this.emitEvent({ type: 'cache_hit', text });
      } else {
        uncached.push({ index, text });
      }
    });

    // Fetch uncached embeddings
    let apiEmbeddings: Float32Array[] = [];
    let usage = { promptTokens: 0, totalTokens: 0 };

    if (uncached.length > 0) {
      const response = await this.callOpenAI(uncached.map(u => u.text));
      apiEmbeddings = response.data.map(d => new Float32Array(d.embedding));

      // Cache results
      uncached.forEach((item, i) => {
        this.cache.set(item.text, apiEmbeddings[i]);
      });

      usage = {
        promptTokens: response.usage?.prompt_tokens ?? 0,
        totalTokens: response.usage?.total_tokens ?? 0,
      };
    }

    // Reconstruct result array in original order
    const embeddings: Array<Float32Array> = new Array(texts.length);
    cached.forEach(c => {
      embeddings[c.index] = c.embedding;
    });
    uncached.forEach((u, i) => {
      embeddings[u.index] = apiEmbeddings[i];
    });

    const totalLatencyMs = performance.now() - startTime;
    this.emitEvent({ type: 'batch_complete', count: texts.length, latencyMs: totalLatencyMs });

    return {
      embeddings,
      totalLatencyMs,
      avgLatencyMs: totalLatencyMs / texts.length,
      usage,
      cacheStats: {
        hits: cached.length,
        misses: uncached.length,
      },
    };
  }

  private async callOpenAI(texts: string[]): Promise<{
    data: Array<{ embedding: number[] }>;
    usage?: { prompt_tokens: number; total_tokens: number };
  }> {
    const config = this.config as OpenAIEmbeddingConfig;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        const response = await fetch(this.baseURL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: this.model,
            input: texts,
            dimensions: config.dimensions,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`OpenAI API error: ${response.status} - ${error}`);
        }

        return await response.json() as {
          data: Array<{ embedding: number[] }>;
          usage?: { prompt_tokens: number; total_tokens: number };
        };
      } catch (error) {
        if (attempt === this.maxRetries - 1) {
          throw error;
        }
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
      }
    }

    throw new Error('Max retries exceeded');
  }
}

// ============================================================================
// Transformers.js Embedding Service
// ============================================================================

export class TransformersEmbeddingService extends BaseEmbeddingService {
  readonly provider: EmbeddingProvider = 'transformers';
  private pipeline: any = null;
  private readonly modelName: string;
  private initialized = false;

  constructor(config: TransformersEmbeddingConfig) {
    super(config);
    this.modelName = config.model ?? 'Xenova/all-MiniLM-L6-v2';
  }

  private async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const { pipeline } = await import('@xenova/transformers');
      this.pipeline = await pipeline('feature-extraction', this.modelName);
      this.initialized = true;
    } catch (error) {
      throw new Error(`Failed to initialize transformers.js: ${error}`);
    }
  }

  async embed(text: string): Promise<EmbeddingResult> {
    await this.initialize();

    // Check cache
    const cached = this.cache.get(text);
    if (cached) {
      this.emitEvent({ type: 'cache_hit', text });
      return {
        embedding: cached,
        latencyMs: 0,
        cached: true,
      };
    }

    this.emitEvent({ type: 'embed_start', text });
    const startTime = performance.now();

    try {
      const output = await this.pipeline(text, { pooling: 'mean', normalize: true });
      const embedding = new Float32Array(output.data);

      // Cache result
      this.cache.set(text, embedding);

      const latencyMs = performance.now() - startTime;
      this.emitEvent({ type: 'embed_complete', text, latencyMs });

      return {
        embedding,
        latencyMs,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.emitEvent({ type: 'embed_error', text, error: message });
      throw new Error(`Transformers.js embedding failed: ${message}`);
    }
  }

  async embedBatch(texts: string[]): Promise<BatchEmbeddingResult> {
    await this.initialize();

    this.emitEvent({ type: 'batch_start', count: texts.length });
    const startTime = performance.now();

    const embeddings: Float32Array[] = [];
    let cacheHits = 0;

    for (const text of texts) {
      const cached = this.cache.get(text);
      if (cached) {
        embeddings.push(cached);
        cacheHits++;
        this.emitEvent({ type: 'cache_hit', text });
      } else {
        const output = await this.pipeline(text, { pooling: 'mean', normalize: true });
        const embedding = new Float32Array(output.data);
        this.cache.set(text, embedding);
        embeddings.push(embedding);
      }
    }

    const totalLatencyMs = performance.now() - startTime;
    this.emitEvent({ type: 'batch_complete', count: texts.length, latencyMs: totalLatencyMs });

    return {
      embeddings,
      totalLatencyMs,
      avgLatencyMs: totalLatencyMs / texts.length,
      cacheStats: {
        hits: cacheHits,
        misses: texts.length - cacheHits,
      },
    };
  }
}

// ============================================================================
// Mock Embedding Service
// ============================================================================

export class MockEmbeddingService extends BaseEmbeddingService {
  readonly provider: EmbeddingProvider = 'mock';
  private readonly dimensions: number;
  private readonly simulatedLatency: number;

  constructor(config: MockEmbeddingConfig) {
    super(config);
    this.dimensions = config.dimensions ?? 384;
    this.simulatedLatency = config.simulatedLatency ?? 0;
  }

  async embed(text: string): Promise<EmbeddingResult> {
    // Check cache
    const cached = this.cache.get(text);
    if (cached) {
      this.emitEvent({ type: 'cache_hit', text });
      return {
        embedding: cached,
        latencyMs: 0,
        cached: true,
      };
    }

    this.emitEvent({ type: 'embed_start', text });
    const startTime = performance.now();

    // Simulate latency
    if (this.simulatedLatency > 0) {
      await new Promise(resolve => setTimeout(resolve, this.simulatedLatency));
    }

    const embedding = this.hashEmbedding(text);
    this.cache.set(text, embedding);

    const latencyMs = performance.now() - startTime;
    this.emitEvent({ type: 'embed_complete', text, latencyMs });

    return {
      embedding,
      latencyMs,
    };
  }

  async embedBatch(texts: string[]): Promise<BatchEmbeddingResult> {
    this.emitEvent({ type: 'batch_start', count: texts.length });
    const startTime = performance.now();

    const embeddings: Float32Array[] = [];
    let cacheHits = 0;

    for (const text of texts) {
      const cached = this.cache.get(text);
      if (cached) {
        embeddings.push(cached);
        cacheHits++;
      } else {
        const embedding = this.hashEmbedding(text);
        this.cache.set(text, embedding);
        embeddings.push(embedding);
      }
    }

    const totalLatencyMs = performance.now() - startTime;
    this.emitEvent({ type: 'batch_complete', count: texts.length, latencyMs: totalLatencyMs });

    return {
      embeddings,
      totalLatencyMs,
      avgLatencyMs: totalLatencyMs / texts.length,
      cacheStats: {
        hits: cacheHits,
        misses: texts.length - cacheHits,
      },
    };
  }

  /**
   * Generate deterministic hash-based embedding
   */
  private hashEmbedding(text: string): Float32Array {
    const embedding = new Float32Array(this.dimensions);

    // Seed with text hash
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = (hash << 5) - hash + text.charCodeAt(i);
      hash = hash & hash;
    }

    // Generate pseudo-random embedding
    for (let i = 0; i < this.dimensions; i++) {
      const seed = hash + i * 2654435761;
      const x = Math.sin(seed) * 10000;
      embedding[i] = x - Math.floor(x);
    }

    // Normalize to unit vector
    const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
    for (let i = 0; i < this.dimensions; i++) {
      embedding[i] /= norm;
    }

    return embedding;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create embedding service based on configuration
 */
export function createEmbeddingService(config: EmbeddingConfig): IEmbeddingService {
  switch (config.provider) {
    case 'openai':
      return new OpenAIEmbeddingService(config as OpenAIEmbeddingConfig);
    case 'transformers':
      return new TransformersEmbeddingService(config as TransformersEmbeddingConfig);
    case 'mock':
      return new MockEmbeddingService(config as MockEmbeddingConfig);
    default:
      console.warn(`Unknown provider, using mock`);
      return new MockEmbeddingService({ provider: 'mock', dimensions: 384 });
  }
}

/**
 * Convenience function for quick embeddings
 */
export async function getEmbedding(
  text: string,
  config?: Partial<EmbeddingConfig>
): Promise<Float32Array | number[]> {
  const service = createEmbeddingService({
    provider: 'mock',
    dimensions: 384,
    ...config,
  } as EmbeddingConfig);

  try {
    const result = await service.embed(text);
    return result.embedding;
  } finally {
    await service.shutdown();
  }
}

// ============================================================================
// Similarity Functions
// ============================================================================

/**
 * Compute cosine similarity between two embeddings
 */
export function cosineSimilarity(
  a: Float32Array | number[],
  b: Float32Array | number[]
): number {
  if (a.length !== b.length) {
    throw new Error('Embedding dimensions must match');
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dot / denom : 0;
}

/**
 * Compute Euclidean distance between two embeddings
 */
export function euclideanDistance(
  a: Float32Array | number[],
  b: Float32Array | number[]
): number {
  if (a.length !== b.length) {
    throw new Error('Embedding dimensions must match');
  }

  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }

  return Math.sqrt(sum);
}

/**
 * Compute dot product between two embeddings
 */
export function dotProduct(
  a: Float32Array | number[],
  b: Float32Array | number[]
): number {
  if (a.length !== b.length) {
    throw new Error('Embedding dimensions must match');
  }

  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }

  return dot;
}

/**
 * Compute similarity using specified metric
 */
export function computeSimilarity(
  a: Float32Array | number[],
  b: Float32Array | number[],
  metric: SimilarityMetric = 'cosine'
): SimilarityResult {
  switch (metric) {
    case 'cosine':
      return { score: cosineSimilarity(a, b), metric };
    case 'euclidean':
      // Convert distance to similarity (closer = higher score)
      return { score: 1 / (1 + euclideanDistance(a, b)), metric };
    case 'dot':
      return { score: dotProduct(a, b), metric };
    default:
      return { score: cosineSimilarity(a, b), metric: 'cosine' };
  }
}

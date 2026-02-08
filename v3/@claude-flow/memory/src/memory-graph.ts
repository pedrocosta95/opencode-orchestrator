/**
 * Knowledge Graph Module for @claude-flow/memory
 *
 * Builds a graph from MemoryEntry.references, computes PageRank,
 * detects communities via label propagation, and provides
 * graph-aware ranking for search results.
 *
 * Pure TypeScript implementation - no external graph libraries.
 *
 * @module v3/memory/memory-graph
 */

import { EventEmitter } from 'node:events';
import type { IMemoryBackend, MemoryEntry, SearchResult } from './types.js';

// ===== Types =====

export type EdgeType = 'reference' | 'similar' | 'temporal' | 'co-accessed' | 'causal';

export interface MemoryGraphConfig {
  /** Auto-edge similarity threshold (default: 0.8) */
  similarityThreshold?: number;
  /** PageRank damping factor (default: 0.85) */
  pageRankDamping?: number;
  /** Maximum PageRank iterations (default: 50) */
  pageRankIterations?: number;
  /** PageRank convergence threshold (default: 1e-6) */
  pageRankConvergence?: number;
  /** Maximum graph node count (default: 5000) */
  maxNodes?: number;
  /** Auto-create edges from similarity search (default: true) */
  enableAutoEdges?: boolean;
  /** Community detection algorithm (default: 'label-propagation') */
  communityAlgorithm?: 'louvain' | 'label-propagation';
}

export interface GraphNode {
  id: string;
  category: string;
  confidence: number;
  accessCount: number;
  createdAt: number;
}

export interface GraphEdge {
  targetId: string;
  type: EdgeType;
  weight: number;
}

export interface RankedResult {
  entry: MemoryEntry;
  score: number;
  pageRank: number;
  combinedScore: number;
  community?: string;
}

export interface GraphStats {
  nodeCount: number;
  edgeCount: number;
  avgDegree: number;
  communityCount: number;
  pageRankComputed: boolean;
  maxPageRank: number;
  minPageRank: number;
}

// ===== Default Configuration =====

const DEFAULT_CONFIG: Required<MemoryGraphConfig> = {
  similarityThreshold: 0.8,
  pageRankDamping: 0.85,
  pageRankIterations: 50,
  pageRankConvergence: 1e-6,
  maxNodes: 5000,
  enableAutoEdges: true,
  communityAlgorithm: 'label-propagation',
};

// ===== MemoryGraph Class =====

/**
 * Knowledge graph built from memory entry references.
 *
 * Supports PageRank computation, community detection via label propagation,
 * and graph-aware result ranking that blends vector similarity with
 * structural importance.
 */
export class MemoryGraph extends EventEmitter {
  private nodes: Map<string, GraphNode> = new Map();
  private edges: Map<string, GraphEdge[]> = new Map();
  private reverseEdges: Map<string, Set<string>> = new Map();
  private pageRanks: Map<string, number> = new Map();
  private communities: Map<string, string> = new Map();
  private config: Required<MemoryGraphConfig>;
  private dirty: boolean = true;

  constructor(config?: MemoryGraphConfig) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ===== Graph Construction =====

  /**
   * Build the graph from all entries in a backend.
   * Queries entries up to maxNodes, creates nodes and reference edges.
   */
  async buildFromBackend(backend: IMemoryBackend, namespace?: string): Promise<void> {
    const entries = await backend.query({
      type: namespace ? 'hybrid' : 'hybrid',
      namespace,
      limit: this.config.maxNodes,
    });

    for (const entry of entries) {
      this.addNode(entry);
    }

    for (const entry of entries) {
      for (const refId of entry.references) {
        this.addEdge(entry.id, refId, 'reference');
      }
    }

    this.dirty = true;
    this.emit('graph:built', { nodeCount: this.nodes.size });
  }

  /**
   * Add a node to the graph from a MemoryEntry.
   * Silently skips if the graph has reached maxNodes capacity.
   */
  addNode(entry: MemoryEntry): void {
    if (this.nodes.size >= this.config.maxNodes && !this.nodes.has(entry.id)) {
      return;
    }

    const node: GraphNode = {
      id: entry.id,
      category: (entry.metadata?.category as string) || 'general',
      confidence: (entry.metadata?.confidence as number) || 0.5,
      accessCount: entry.accessCount,
      createdAt: entry.createdAt,
    };

    this.nodes.set(entry.id, node);

    if (!this.edges.has(entry.id)) {
      this.edges.set(entry.id, []);
    }
    if (!this.reverseEdges.has(entry.id)) {
      this.reverseEdges.set(entry.id, new Set());
    }

    this.dirty = true;
  }

  /**
   * Add a directed edge between two existing nodes.
   * Silently skips if either node is missing from the graph.
   * Updates weight to the maximum if an edge already exists.
   */
  addEdge(sourceId: string, targetId: string, type: EdgeType, weight: number = 1.0): void {
    if (!this.nodes.has(sourceId) || !this.nodes.has(targetId)) {
      return;
    }

    const edgeList = this.edges.get(sourceId) || [];
    if (!this.edges.has(sourceId)) {
      this.edges.set(sourceId, edgeList);
    }

    const existing = edgeList.find((e) => e.targetId === targetId);
    if (existing) {
      existing.weight = Math.max(existing.weight, weight);
    } else {
      edgeList.push({ targetId, type, weight });
    }

    // Update reverse edge index
    if (!this.reverseEdges.has(targetId)) {
      this.reverseEdges.set(targetId, new Set());
    }
    this.reverseEdges.get(targetId)!.add(sourceId);

    this.dirty = true;
  }

  /**
   * Remove a node and all its associated edges from the graph.
   */
  removeNode(id: string): void {
    if (!this.nodes.has(id)) {
      return;
    }

    // Remove outgoing edges and their reverse entries
    const outgoing = this.edges.get(id) || [];
    for (const edge of outgoing) {
      const revSet = this.reverseEdges.get(edge.targetId);
      if (revSet) {
        revSet.delete(id);
      }
    }
    this.edges.delete(id);

    // Remove incoming edges (where this node is a target)
    const incoming = this.reverseEdges.get(id);
    if (incoming) {
      for (const sourceId of incoming) {
        const sourceEdges = this.edges.get(sourceId);
        if (sourceEdges) {
          const filtered = sourceEdges.filter((e) => e.targetId !== id);
          this.edges.set(sourceId, filtered);
        }
      }
    }
    this.reverseEdges.delete(id);

    this.nodes.delete(id);
    this.pageRanks.delete(id);
    this.communities.delete(id);

    this.dirty = true;
  }

  // ===== Similarity Edges =====

  /**
   * Add similarity edges for an entry by searching the backend for similar entries.
   * Returns the number of edges added.
   */
  async addSimilarityEdges(backend: IMemoryBackend, entryId: string): Promise<number> {
    const entry = await backend.get(entryId);
    if (!entry || !entry.embedding) {
      return 0;
    }

    const results = await backend.search(entry.embedding, {
      k: 20,
      threshold: this.config.similarityThreshold,
    });

    let added = 0;
    for (const result of results) {
      if (result.entry.id === entryId) {
        continue;
      }
      if (result.score >= this.config.similarityThreshold) {
        const hadEdge = this.hasEdge(entryId, result.entry.id);
        this.addEdge(entryId, result.entry.id, 'similar', result.score);
        if (!hadEdge) {
          added++;
        }
      }
    }

    return added;
  }

  // ===== PageRank =====

  /**
   * Compute PageRank scores using the power iteration method.
   * Returns a map of node ID to PageRank score.
   */
  computePageRank(): Map<string, number> {
    const N = this.nodes.size;
    if (N === 0) {
      this.dirty = false;
      this.emit('pagerank:computed', { iterations: 0 });
      return new Map();
    }

    const d = this.config.pageRankDamping;
    const initialRank = 1 / N;

    // Initialize ranks
    for (const nodeId of this.nodes.keys()) {
      this.pageRanks.set(nodeId, initialRank);
    }

    let iterations = 0;
    for (let iter = 0; iter < this.config.pageRankIterations; iter++) {
      let maxDelta = 0;
      const newRanks = new Map<string, number>();

      for (const nodeId of this.nodes.keys()) {
        let sum = 0;
        const incoming = this.reverseEdges.get(nodeId);
        if (incoming) {
          for (const sourceId of incoming) {
            const outDegree = this.edges.get(sourceId)?.length || 1;
            sum += (this.pageRanks.get(sourceId) || 0) / outDegree;
          }
        }

        const newRank = (1 - d) / N + d * sum;
        newRanks.set(nodeId, newRank);
        maxDelta = Math.max(maxDelta, Math.abs(newRank - (this.pageRanks.get(nodeId) || 0)));
      }

      this.pageRanks = newRanks;
      iterations = iter + 1;

      if (maxDelta < this.config.pageRankConvergence) {
        break;
      }
    }

    this.dirty = false;
    this.emit('pagerank:computed', { iterations });
    return new Map(this.pageRanks);
  }

  // ===== Community Detection =====

  /**
   * Detect communities using the label propagation algorithm.
   * Returns a map of node ID to community label.
   */
  detectCommunities(): Map<string, string> {
    const labels = new Map<string, string>();

    // Initialize: each node is its own community
    for (const nodeId of this.nodes.keys()) {
      labels.set(nodeId, nodeId);
    }

    const MAX_ITERATIONS = 20;

    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      let changed = false;
      const nodeIds = this.shuffleArray([...this.nodes.keys()]);

      for (const nodeId of nodeIds) {
        const labelCounts = new Map<string, number>();

        // Count labels from outgoing neighbors
        const outEdges = this.edges.get(nodeId) || [];
        for (const edge of outEdges) {
          const neighborLabel = labels.get(edge.targetId);
          if (neighborLabel !== undefined) {
            labelCounts.set(neighborLabel, (labelCounts.get(neighborLabel) || 0) + edge.weight);
          }
        }

        // Count labels from incoming neighbors
        const incoming = this.reverseEdges.get(nodeId);
        if (incoming) {
          for (const sourceId of incoming) {
            const neighborLabel = labels.get(sourceId);
            if (neighborLabel !== undefined) {
              labelCounts.set(neighborLabel, (labelCounts.get(neighborLabel) || 0) + 1);
            }
          }
        }

        if (labelCounts.size > 0) {
          let maxLabel = labels.get(nodeId)!;
          let maxCount = 0;
          for (const [label, count] of labelCounts) {
            if (count > maxCount) {
              maxCount = count;
              maxLabel = label;
            }
          }

          if (maxLabel !== labels.get(nodeId)) {
            labels.set(nodeId, maxLabel);
            changed = true;
          }
        }
      }

      if (!changed) {
        break;
      }
    }

    this.communities = labels;
    this.emit('communities:detected', {
      communityCount: new Set(labels.values()).size,
    });
    return new Map(this.communities);
  }

  // ===== Graph-Aware Ranking =====

  /**
   * Rank search results using a blend of vector similarity and PageRank.
   *
   * @param searchResults - Original vector search results
   * @param alpha - Weight for vector score (default 0.7). PageRank weight is (1 - alpha).
   * @returns Ranked results with combined scores
   */
  rankWithGraph(searchResults: SearchResult[], alpha: number = 0.7): RankedResult[] {
    if (this.dirty) {
      this.computePageRank();
    }

    const N = this.nodes.size || 1;

    return searchResults
      .map((result) => {
        const pageRank = this.pageRanks.get(result.entry.id) || 0;
        const combinedScore = alpha * result.score + (1 - alpha) * (pageRank * N);
        const community = this.communities.get(result.entry.id);

        return {
          entry: result.entry,
          score: result.score,
          pageRank,
          combinedScore,
          community,
        };
      })
      .sort((a, b) => b.combinedScore - a.combinedScore);
  }

  // ===== Query Methods =====

  /**
   * Get the top N nodes by PageRank score.
   */
  getTopNodes(n: number): Array<{ id: string; pageRank: number; community: string }> {
    if (this.dirty) {
      this.computePageRank();
    }

    return [...this.pageRanks.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([id, pageRank]) => ({
        id,
        pageRank,
        community: this.communities.get(id) || id,
      }));
  }

  /**
   * Get all neighbors reachable from a node up to the given depth via BFS.
   *
   * @param id - Starting node ID
   * @param depth - Maximum traversal depth (default: 1)
   * @returns Set of reachable node IDs (excluding the start node)
   */
  getNeighbors(id: string, depth: number = 1): Set<string> {
    const visited = new Set<string>();
    let frontier = new Set<string>([id]);

    for (let d = 0; d < depth; d++) {
      const nextFrontier = new Set<string>();
      for (const nodeId of frontier) {
        const outEdges = this.edges.get(nodeId) || [];
        for (const edge of outEdges) {
          if (!visited.has(edge.targetId) && edge.targetId !== id) {
            visited.add(edge.targetId);
            nextFrontier.add(edge.targetId);
          }
        }
      }
      frontier = nextFrontier;
      if (frontier.size === 0) {
        break;
      }
    }

    return visited;
  }

  /**
   * Get statistics about the current graph state.
   */
  getStats(): GraphStats {
    let totalEdges = 0;
    for (const edgeList of this.edges.values()) {
      totalEdges += edgeList.length;
    }

    const nodeCount = this.nodes.size;
    const uniqueCommunities = new Set(this.communities.values());

    let maxPageRank = 0;
    let minPageRank = Infinity;
    if (this.pageRanks.size > 0) {
      for (const rank of this.pageRanks.values()) {
        if (rank > maxPageRank) maxPageRank = rank;
        if (rank < minPageRank) minPageRank = rank;
      }
    } else {
      minPageRank = 0;
    }

    return {
      nodeCount,
      edgeCount: totalEdges,
      avgDegree: nodeCount > 0 ? totalEdges / nodeCount : 0,
      communityCount: uniqueCommunities.size,
      pageRankComputed: !this.dirty,
      maxPageRank,
      minPageRank,
    };
  }

  // ===== Internal Helpers =====

  /**
   * Check whether a directed edge exists between two nodes.
   */
  private hasEdge(sourceId: string, targetId: string): boolean {
    const edgeList = this.edges.get(sourceId);
    if (!edgeList) return false;
    return edgeList.some((e) => e.targetId === targetId);
  }

  /**
   * Fisher-Yates shuffle for randomized iteration order.
   */
  private shuffleArray<T>(arr: T[]): T[] {
    const shuffled = [...arr];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }
}

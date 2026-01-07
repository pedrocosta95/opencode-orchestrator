/**
 * RuVector Integration Module for Claude Flow CLI
 *
 * Provides integration with @ruvector packages for:
 * - Q-Learning based task routing
 * - AST code analysis
 * - Diff classification
 * - Coverage-based routing
 * - Graph boundary analysis
 *
 * @module @claude-flow/cli/ruvector
 */

export { QLearningRouter, createQLearningRouter, type QLearningRouterConfig, type RouteDecision } from './q-learning-router.js';
export { ASTAnalyzer, createASTAnalyzer, type ASTAnalysis, type ASTNode, type ASTAnalyzerConfig } from './ast-analyzer.js';
export {
  DiffClassifier,
  createDiffClassifier,
  // MCP tool exports
  analyzeDiff,
  analyzeDiffSync,
  assessFileRisk,
  assessOverallRisk,
  classifyDiff,
  suggestReviewers,
  getGitDiffNumstat,
  getGitDiffNumstatAsync,
  // Cache control
  clearDiffCache,
  clearAllDiffCaches,
  // Types
  type DiffClassification,
  type DiffHunk,
  type DiffChange,
  type FileDiff,
  type DiffAnalysis,
  type DiffClassifierConfig,
  type DiffFile,
  type RiskLevel,
  type FileRisk,
  type OverallRisk,
  type DiffAnalysisResult,
} from './diff-classifier.js';
export {
  CoverageRouter,
  createCoverageRouter,
  // MCP tool exports
  coverageRoute,
  coverageSuggest,
  coverageGaps,
  // Types
  type CoverageRouterConfig,
  type FileCoverage,
  type CoverageReport,
  type CoverageRouteResult,
  type CoverageSuggestResult,
  type CoverageGapsResult,
  type CoverageRouteOptions,
  type CoverageSuggestOptions,
  type CoverageGapsOptions,
} from './coverage-router.js';
export { coverageRouterTools, hooksCoverageRoute, hooksCoverageSuggest, hooksCoverageGaps } from './coverage-tools.js';
export {
  buildDependencyGraph,
  analyzeGraph,
  analyzeMinCutBoundaries,
  analyzeModuleCommunities,
  detectCircularDependencies,
  exportToDot,
  loadRuVector,
  fallbackMinCut,
  fallbackLouvain,
  // Cache utilities (NEW)
  clearGraphCaches,
  getGraphCacheStats,
  type GraphNode,
  type GraphEdge,
  type DependencyGraph,
  type MinCutBoundary,
  type ModuleCommunity,
  type CircularDependency,
  type GraphAnalysisResult,
} from './graph-analyzer.js';

/**
 * Check if ruvector packages are available
 */
export async function isRuvectorAvailable(): Promise<boolean> {
  try {
    await import('@ruvector/core');
    return true;
  } catch {
    return false;
  }
}

/**
 * Get ruvector version if available
 */
export async function getRuvectorVersion(): Promise<string | null> {
  try {
    const ruvector = await import('@ruvector/core');
    return (ruvector as any).version || '1.0.0';
  } catch {
    return null;
  }
}

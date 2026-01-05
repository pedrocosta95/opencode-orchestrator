/**
 * Re-export shared events from @claude-flow/shared
 * This enables local relative imports from '../shared/events'
 */
export {
  EventBus,
} from '@claude-flow/shared';

export type {
  IEventBus,
  EventFilter,
} from '@claude-flow/shared';

import type { SwarmEvent, EventType } from './types';

// Helper function to generate event IDs
function generateEventId(): string {
  return `evt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Helper function to create a base SwarmEvent
function createSwarmEvent<T>(
  type: EventType,
  source: string,
  payload: T
): SwarmEvent<T> {
  return {
    id: generateEventId(),
    type,
    timestamp: Date.now(),
    source,
    payload,
  };
}

// Agent events
export function agentSpawnedEvent(agentId: string, state: unknown): SwarmEvent<{ agentId: string; state: unknown }> {
  return createSwarmEvent('agent:spawned', agentId, { agentId, state });
}

export function agentStatusChangedEvent(
  agentId: string,
  previousStatus: string,
  newStatus: string
): SwarmEvent<{ agentId: string; previousStatus: string; newStatus: string }> {
  return createSwarmEvent('agent:status-changed', agentId, { agentId, previousStatus, newStatus });
}

export function agentErrorEvent(
  agentId: string,
  error: Error | string
): SwarmEvent<{ agentId: string; error: string; stack?: string }> {
  return createSwarmEvent('agent:error', agentId, {
    agentId,
    error: error instanceof Error ? error.message : error,
    stack: error instanceof Error ? error.stack : undefined,
  });
}

// Task events
export function taskCreatedEvent(taskId: string, taskData: unknown): SwarmEvent<{ taskId: string; data: unknown }> {
  return createSwarmEvent('task:created', 'swarm', { taskId, data: taskData });
}

export function taskQueuedEvent(taskId: string, queuePosition: number): SwarmEvent<{ taskId: string; queuePosition: number }> {
  return createSwarmEvent('task:queued', 'swarm', { taskId, queuePosition });
}

export function taskStartedEvent(taskId: string, agentId: string): SwarmEvent<{ taskId: string; agentId: string }> {
  return createSwarmEvent('task:started', agentId, { taskId, agentId });
}

export function taskAssignedEvent(taskId: string, agentId: string): SwarmEvent<{ taskId: string; agentId: string }> {
  return createSwarmEvent('task:assigned', 'swarm', { taskId, agentId });
}

export function taskCompletedEvent(taskId: string, result: unknown): SwarmEvent<{ taskId: string; result: unknown }> {
  return createSwarmEvent('task:completed', 'swarm', { taskId, result });
}

export function taskFailedEvent(
  taskId: string,
  error: Error | string
): SwarmEvent<{ taskId: string; error: string; stack?: string }> {
  return createSwarmEvent('task:failed', 'swarm', {
    taskId,
    error: error instanceof Error ? error.message : error,
    stack: error instanceof Error ? error.stack : undefined,
  });
}

export function taskBlockedEvent(
  taskId: string,
  reason: string,
  blockedBy?: string
): SwarmEvent<{ taskId: string; reason: string; blockedBy?: string }> {
  return createSwarmEvent('task:blocked', 'swarm', { taskId, reason, blockedBy });
}

// Swarm lifecycle events
export function swarmInitializedEvent(
  swarmId: string,
  config: unknown
): SwarmEvent<{ swarmId: string; config: unknown }> {
  return createSwarmEvent('swarm:initialized', 'swarm', { swarmId, config });
}

export function swarmPhaseChangedEvent(
  swarmId: string,
  previousPhase: string,
  newPhase: string
): SwarmEvent<{ swarmId: string; previousPhase: string; newPhase: string }> {
  return createSwarmEvent('swarm:phase-changed', 'swarm', { swarmId, previousPhase, newPhase });
}

export function swarmMilestoneReachedEvent(
  swarmId: string,
  milestone: string,
  data: unknown = {}
): SwarmEvent<{ swarmId: string; milestone: string; data: unknown }> {
  return createSwarmEvent('swarm:milestone-reached', 'swarm', { swarmId, milestone, data });
}

export function swarmErrorEvent(
  swarmId: string,
  error: Error | string
): SwarmEvent<{ swarmId: string; error: string; stack?: string }> {
  return createSwarmEvent('swarm:error', 'swarm', {
    swarmId,
    error: error instanceof Error ? error.message : error,
    stack: error instanceof Error ? error.stack : undefined,
  });
}

/**
 * Tests for FederationHub
 */
import { describe, it, expect } from 'vitest';
import {
  FederationHub,
  createFederationHub,
  compareVectorClocks,
  mergeVectorClocks,
  incrementVectorClock,
} from '../index.js';
import type { VectorClock } from '../types.js';

describe('Vector Clock Operations', () => {
  describe('compareVectorClocks', () => {
    it('should return equal for identical clocks', () => {
      const clock1: VectorClock = { a: 1, b: 2 };
      const clock2: VectorClock = { a: 1, b: 2 };

      expect(compareVectorClocks(clock1, clock2)).toBe('equal');
    });

    it('should return before when first is older', () => {
      const clock1: VectorClock = { a: 1, b: 1 };
      const clock2: VectorClock = { a: 1, b: 2 };

      expect(compareVectorClocks(clock1, clock2)).toBe('before');
    });

    it('should return after when first is newer', () => {
      const clock1: VectorClock = { a: 2, b: 2 };
      const clock2: VectorClock = { a: 1, b: 2 };

      expect(compareVectorClocks(clock1, clock2)).toBe('after');
    });

    it('should return concurrent for conflicting clocks', () => {
      const clock1: VectorClock = { a: 2, b: 1 };
      const clock2: VectorClock = { a: 1, b: 2 };

      expect(compareVectorClocks(clock1, clock2)).toBe('concurrent');
    });

    it('should handle missing keys', () => {
      const clock1: VectorClock = { a: 1 };
      const clock2: VectorClock = { b: 1 };

      expect(compareVectorClocks(clock1, clock2)).toBe('concurrent');
    });

    it('should handle empty clocks', () => {
      const clock1: VectorClock = {};
      const clock2: VectorClock = {};

      expect(compareVectorClocks(clock1, clock2)).toBe('equal');
    });
  });

  describe('mergeVectorClocks', () => {
    it('should take max of each component', () => {
      const clock1: VectorClock = { a: 2, b: 1 };
      const clock2: VectorClock = { a: 1, b: 3 };

      const merged = mergeVectorClocks(clock1, clock2);

      expect(merged.a).toBe(2);
      expect(merged.b).toBe(3);
    });

    it('should include keys from both clocks', () => {
      const clock1: VectorClock = { a: 1, c: 3 };
      const clock2: VectorClock = { b: 2, d: 4 };

      const merged = mergeVectorClocks(clock1, clock2);

      expect(merged).toEqual({ a: 1, b: 2, c: 3, d: 4 });
    });

    it('should handle empty clocks', () => {
      const clock1: VectorClock = {};
      const clock2: VectorClock = { a: 1 };

      const merged = mergeVectorClocks(clock1, clock2);

      expect(merged).toEqual({ a: 1 });
    });
  });

  describe('incrementVectorClock', () => {
    it('should increment specified node', () => {
      const clock: VectorClock = { a: 1, b: 2 };
      const updated = incrementVectorClock(clock, 'a');

      expect(updated.a).toBe(2);
      expect(updated.b).toBe(2);
    });

    it('should add new node if not present', () => {
      const clock: VectorClock = { a: 1 };
      const updated = incrementVectorClock(clock, 'b');

      expect(updated.a).toBe(1);
      expect(updated.b).toBe(1);
    });

    it('should not mutate original clock', () => {
      const clock: VectorClock = { a: 1 };
      const updated = incrementVectorClock(clock, 'a');

      expect(clock.a).toBe(1);
      expect(updated.a).toBe(2);
    });
  });
});

describe('FederationHub', () => {
  describe('Creation', () => {
    it('should create hub with config', () => {
      const hub = createFederationHub({
        endpoint: 'quic://localhost:4433',
        agentId: 'test-agent',
        tenantId: 'test-tenant',
        token: 'test-token',
      });

      expect(hub).toBeInstanceOf(FederationHub);
    });

    it('should accept optional config options', () => {
      const hub = createFederationHub({
        endpoint: 'quic://localhost:4433',
        agentId: 'test-agent',
        tenantId: 'test-tenant',
        token: 'test-token',
        syncInterval: 5000,
        conflictResolution: 'last-write-wins',
      });

      expect(hub).toBeDefined();
    });
  });

  describe('Event Emission', () => {
    it('should be an EventEmitter', () => {
      const hub = createFederationHub({
        endpoint: 'quic://localhost:4433',
        agentId: 'test-agent',
        tenantId: 'test-tenant',
        token: 'test-token',
      });

      expect(typeof hub.on).toBe('function');
      expect(typeof hub.emit).toBe('function');
      expect(typeof hub.off).toBe('function');
    });
  });
});

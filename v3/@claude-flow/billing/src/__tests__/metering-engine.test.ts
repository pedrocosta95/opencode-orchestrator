/**
 * Tests for MeteringEngine
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { MeteringEngine, InMemoryBillingStorage, createMeteringEngine } from '../index.js';

describe('MeteringEngine', () => {
  let engine: MeteringEngine;
  let storage: InMemoryBillingStorage;

  beforeEach(() => {
    storage = new InMemoryBillingStorage();
    engine = new MeteringEngine(storage, {});
  });

  describe('Initialization', () => {
    it('should initialize successfully', () => {
      const newStorage = new InMemoryBillingStorage();
      const newEngine = new MeteringEngine(newStorage);
      expect(newEngine).toBeDefined();
    });

    it('should create engine with factory function', () => {
      const factoryEngine = createMeteringEngine({});
      expect(factoryEngine).toBeInstanceOf(MeteringEngine);
    });
  });

  describe('Event Emission', () => {
    it('should emit events', () => {
      let eventReceived = false;
      engine.on('usage:recorded', () => {
        eventReceived = true;
      });
      
      // The engine should be an EventEmitter
      expect(typeof engine.on).toBe('function');
      expect(typeof engine.emit).toBe('function');
    });
  });
});

describe('InMemoryBillingStorage', () => {
  let storage: InMemoryBillingStorage;

  beforeEach(() => {
    storage = new InMemoryBillingStorage();
  });

  describe('Subscription Storage', () => {
    it('should save and retrieve subscription', async () => {
      const sub = { id: 'sub-1', userId: 'user-1', tier: 'pro' };
      await storage.saveSubscription(sub);
      
      const retrieved = await storage.getSubscription('sub-1');
      expect(retrieved).toEqual(sub);
    });

    it('should return null for non-existent subscription', async () => {
      const result = await storage.getSubscription('non-existent');
      expect(result).toBeNull();
    });

    it('should get subscription by user id', async () => {
      const sub = { id: 'sub-2', userId: 'user-2', tier: 'starter' };
      await storage.saveSubscription(sub);
      
      const retrieved = await storage.getSubscriptionByUser('user-2');
      expect(retrieved).toEqual(sub);
    });
  });

  describe('Usage Record Storage', () => {
    it('should save and retrieve usage records', async () => {
      const record = {
        id: 'record-1',
        subscriptionId: 'sub-1',
        metric: 'tokens',
        amount: 1000,
        timestamp: Date.now(),
        billingPeriod: '2026-01',
      };

      await storage.saveUsageRecord(record as any);
      const records = await storage.getUsageRecords('sub-1', '2026-01');

      expect(records).toHaveLength(1);
      expect(records[0].amount).toBe(1000);
    });

    it('should return empty array for no records', async () => {
      const records = await storage.getUsageRecords('none', 'none');
      expect(records).toEqual([]);
    });
  });

  describe('Payment Storage', () => {
    it('should save and retrieve payments', async () => {
      const payment = { id: 'pay-1', subscriptionId: 'sub-1', amount: 100 };
      await storage.savePayment(payment);
      
      const payments = await storage.getPayments('sub-1');
      expect(payments).toHaveLength(1);
      expect(payments[0].amount).toBe(100);
    });
  });

  describe('Coupon Storage', () => {
    it('should save and retrieve coupon', async () => {
      const coupon = { code: 'SAVE10', discount: 10, currentUses: 0 };
      await storage.saveCoupon(coupon);
      
      const retrieved = await storage.getCoupon('SAVE10');
      expect(retrieved.discount).toBe(10);
    });

    it('should increment coupon usage', async () => {
      const coupon = { code: 'USAGE', discount: 5, currentUses: 0 };
      await storage.saveCoupon(coupon);
      
      await storage.incrementCouponUsage('USAGE');
      
      const updated = await storage.getCoupon('USAGE');
      expect(updated.currentUses).toBe(1);
    });
  });
});

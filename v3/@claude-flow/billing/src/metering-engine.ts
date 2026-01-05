/**
 * V3 Metering Engine Implementation
 *
 * Usage tracking and metering aligned with agentic-flow@alpha:
 * - Real-time usage tracking
 * - Buffered writes for performance
 * - Quota checking and enforcement
 * - Usage aggregation
 *
 * Performance Targets:
 * - Record usage: <5ms
 * - Check quota: <10ms
 * - Aggregate stats: <50ms
 */

import { EventEmitter } from 'events';
import {
  UsageMetric,
  BillingEventType,
} from './types.js';
import type {
  MeteringConfig,
  IMeteringEngine,
  IBillingStorage,
  UsageRecord,
  ResourceLimits,
  QuotaCheckResult,
  UsageSummary,
  BillingEvent,
  BillingEventListener,
} from './types.js';

// ============================================================================
// In-Memory Storage (for development/testing)
// ============================================================================

export class InMemoryBillingStorage implements IBillingStorage {
  private subscriptions = new Map<string, any>();
  private usageRecords = new Map<string, UsageRecord[]>();
  private payments = new Map<string, any[]>();
  private coupons = new Map<string, any>();

  async saveSubscription(subscription: any): Promise<void> {
    this.subscriptions.set(subscription.id, subscription);
  }

  async getSubscription(subscriptionId: string): Promise<any> {
    return this.subscriptions.get(subscriptionId) || null;
  }

  async getSubscriptionByUser(userId: string): Promise<any> {
    for (const sub of this.subscriptions.values()) {
      if (sub.userId === userId) {
        return sub;
      }
    }
    return null;
  }

  async saveUsageRecord(record: UsageRecord): Promise<void> {
    const key = `${record.subscriptionId}:${record.billingPeriod}`;
    const records = this.usageRecords.get(key) || [];
    records.push(record);
    this.usageRecords.set(key, records);
  }

  async getUsageRecords(subscriptionId: string, period: string): Promise<UsageRecord[]> {
    const key = `${subscriptionId}:${period}`;
    return this.usageRecords.get(key) || [];
  }

  async savePayment(payment: any): Promise<void> {
    const payments = this.payments.get(payment.subscriptionId) || [];
    payments.push(payment);
    this.payments.set(payment.subscriptionId, payments);
  }

  async getPayments(subscriptionId: string): Promise<any[]> {
    return this.payments.get(subscriptionId) || [];
  }

  async saveCoupon(coupon: any): Promise<void> {
    this.coupons.set(coupon.code, coupon);
  }

  async getCoupon(code: string): Promise<any> {
    return this.coupons.get(code) || null;
  }

  async incrementCouponUsage(code: string): Promise<void> {
    const coupon = this.coupons.get(code);
    if (coupon) {
      coupon.currentUses++;
    }
  }
}

// ============================================================================
// Metering Engine Implementation
// ============================================================================

export class MeteringEngine extends EventEmitter implements IMeteringEngine {
  private readonly config: Required<MeteringConfig>;
  private readonly storage: IBillingStorage;
  private buffer: UsageRecord[] = [];
  private flushTimer?: NodeJS.Timeout;
  private usageCache: Map<string, Map<UsageMetric, number>> = new Map();
  private billingListeners: Set<BillingEventListener> = new Set();

  constructor(storage: IBillingStorage, config?: Partial<MeteringConfig>) {
    super();
    this.storage = storage;
    this.config = {
      enabled: config?.enabled ?? true,
      bufferSize: config?.bufferSize ?? 100,
      flushInterval: config?.flushInterval ?? 5000,
      softLimitPercent: config?.softLimitPercent ?? 80,
      hardLimitPercent: config?.hardLimitPercent ?? 100,
    };

    if (this.config.enabled) {
      this.startFlushTimer();
    }
  }

  async recordUsage(
    record: Omit<UsageRecord, 'id' | 'timestamp' | 'billingPeriod'>
  ): Promise<void> {
    if (!this.config.enabled) return;

    const fullRecord: UsageRecord = {
      ...record,
      id: this.generateId(),
      timestamp: new Date(),
      billingPeriod: this.getCurrentBillingPeriod(),
    };

    // Update cache
    const userMetrics = this.usageCache.get(record.subscriptionId) || new Map();
    const current = userMetrics.get(record.metric) || 0;
    userMetrics.set(record.metric, current + record.amount);
    this.usageCache.set(record.subscriptionId, userMetrics);

    // Buffer the record
    this.buffer.push(fullRecord);

    // Emit event
    this.emitEvent({
      type: BillingEventType.UsageRecorded,
      timestamp: new Date(),
      subscriptionId: record.subscriptionId,
      data: { metric: record.metric, amount: record.amount },
    });

    // Flush if buffer is full
    if (this.buffer.length >= this.config.bufferSize) {
      await this.flush();
    }
  }

  async checkQuota(
    subscriptionId: string,
    metric: UsageMetric,
    limits: ResourceLimits
  ): Promise<QuotaCheckResult> {
    const current = await this.getCurrentUsage(subscriptionId, metric);
    const limit = this.getLimitForMetric(metric, limits);

    // Unlimited
    if (limit === -1) {
      return {
        allowed: true,
        metric,
        current,
        limit,
        percentUsed: 0,
        remaining: Infinity,
        overage: 0,
      };
    }

    const percentUsed = (current / limit) * 100;
    const remaining = Math.max(0, limit - current);
    const overage = Math.max(0, current - limit);

    // Check soft limit (warning)
    if (percentUsed >= this.config.softLimitPercent && percentUsed < this.config.hardLimitPercent) {
      this.emitEvent({
        type: BillingEventType.QuotaWarning,
        timestamp: new Date(),
        subscriptionId,
        data: { metric, percentUsed, current, limit },
      });
    }

    // Check hard limit (block)
    if (percentUsed >= this.config.hardLimitPercent) {
      this.emitEvent({
        type: BillingEventType.QuotaExceeded,
        timestamp: new Date(),
        subscriptionId,
        data: { metric, current, limit, overage },
      });

      return {
        allowed: false,
        metric,
        current,
        limit,
        percentUsed,
        remaining,
        overage,
        warning: `Quota exceeded for ${metric}. Current: ${current}, Limit: ${limit}`,
      };
    }

    return {
      allowed: true,
      metric,
      current,
      limit,
      percentUsed,
      remaining,
      overage,
    };
  }

  async getUsageSummary(subscriptionId: string, limits: ResourceLimits): Promise<UsageSummary> {
    const period = this.getCurrentBillingPeriod();
    const metrics = new Map<UsageMetric, number>();
    const percentUsed = new Map<UsageMetric, number>();
    const overages = new Map<UsageMetric, number>();

    // Get all metrics
    const allMetrics = Object.values(UsageMetric);

    for (const metric of allMetrics) {
      const current = await this.getCurrentUsage(subscriptionId, metric);
      const limit = this.getLimitForMetric(metric, limits);

      metrics.set(metric, current);

      if (limit !== -1) {
        const percent = (current / limit) * 100;
        percentUsed.set(metric, percent);

        if (current > limit) {
          overages.set(metric, current - limit);
        }
      }
    }

    const estimatedCost = this.calculateOverageCost(overages);

    return {
      subscriptionId,
      userId: '',
      period,
      metrics,
      limits,
      percentUsed,
      overages,
      estimatedCost,
    };
  }

  async getCurrentUsage(subscriptionId: string, metric: UsageMetric): Promise<number> {
    // Check cache first
    const cached = this.usageCache.get(subscriptionId)?.get(metric);
    if (cached !== undefined) {
      return cached;
    }

    // Query storage
    const period = this.getCurrentBillingPeriod();
    const records = await this.storage.getUsageRecords(subscriptionId, period);
    const total = records
      .filter(r => r.metric === metric)
      .reduce((sum, r) => sum + r.amount, 0);

    // Update cache
    const userMetrics = this.usageCache.get(subscriptionId) || new Map();
    userMetrics.set(metric, total);
    this.usageCache.set(subscriptionId, userMetrics);

    return total;
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const records = [...this.buffer];
    this.buffer = [];

    try {
      await Promise.all(records.map(r => this.storage.saveUsageRecord(r)));
    } catch (error) {
      console.error('Failed to flush usage records:', error);
      // Re-add to buffer on error
      this.buffer.unshift(...records);
    }
  }

  async stop(): Promise<void> {
    this.stopFlushTimer();
    await this.flush();
    this.billingListeners.clear();
  }

  clearCache(subscriptionId?: string): void {
    if (subscriptionId) {
      this.usageCache.delete(subscriptionId);
    } else {
      this.usageCache.clear();
    }
  }

  addEventListener(listener: BillingEventListener): void {
    this.billingListeners.add(listener);
  }

  removeEventListener(listener: BillingEventListener): void {
    this.billingListeners.delete(listener);
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.config.flushInterval);
  }

  private stopFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
  }

  private getLimitForMetric(metric: UsageMetric, limits: ResourceLimits): number {
    const metricToLimitMap: Record<UsageMetric, keyof ResourceLimits> = {
      [UsageMetric.AgentHours]: 'maxAgentHours',
      [UsageMetric.Deployments]: 'maxDeployments',
      [UsageMetric.APIRequests]: 'maxAPIRequests',
      [UsageMetric.StorageGB]: 'maxStorageGB',
      [UsageMetric.SwarmSize]: 'maxSwarmSize',
      [UsageMetric.GPUHours]: 'maxGPUHours',
      [UsageMetric.BandwidthGB]: 'maxBandwidthGB',
      [UsageMetric.ConcurrentJobs]: 'maxConcurrentJobs',
      [UsageMetric.TeamMembers]: 'maxTeamMembers',
      [UsageMetric.CustomDomains]: 'maxCustomDomains',
    };

    return limits[metricToLimitMap[metric]] as number;
  }

  private calculateOverageCost(overages: Map<UsageMetric, number>): number {
    // Overage rates per unit
    const rates: Record<UsageMetric, number> = {
      [UsageMetric.AgentHours]: 0.50,
      [UsageMetric.Deployments]: 5.00,
      [UsageMetric.APIRequests]: 0.0001,
      [UsageMetric.StorageGB]: 0.10,
      [UsageMetric.SwarmSize]: 10.00,
      [UsageMetric.GPUHours]: 2.00,
      [UsageMetric.BandwidthGB]: 0.05,
      [UsageMetric.ConcurrentJobs]: 5.00,
      [UsageMetric.TeamMembers]: 15.00,
      [UsageMetric.CustomDomains]: 10.00,
    };

    let total = 0;
    overages.forEach((amount, metric) => {
      total += amount * (rates[metric] || 0);
    });

    return total;
  }

  private getCurrentBillingPeriod(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  private generateId(): string {
    return `usage_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private emitEvent(event: BillingEvent): void {
    for (const listener of this.billingListeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('Error in billing event listener:', error);
      }
    }
    this.emit(event.type, event);
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create metering engine with in-memory storage
 */
export function createMeteringEngine(config?: Partial<MeteringConfig>): MeteringEngine {
  return new MeteringEngine(new InMemoryBillingStorage(), config);
}

/**
 * Create metering engine with custom storage
 */
export function createMeteringEngineWithStorage(
  storage: IBillingStorage,
  config?: Partial<MeteringConfig>
): MeteringEngine {
  return new MeteringEngine(storage, config);
}

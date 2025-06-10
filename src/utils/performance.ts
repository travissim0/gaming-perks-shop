// Performance monitoring utilities for the gaming perks shop
import { ReactElement } from 'react';

interface PerformanceMetric {
  name: string;
  duration: number;
  timestamp: number;
  type: 'query' | 'render' | 'api' | 'cache';
  success: boolean;
  metadata?: Record<string, any>;
}

class PerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private maxMetrics = 100; // Keep only last 100 metrics

  startTimer(name: string, type: PerformanceMetric['type'] = 'query') {
    const startTime = performance.now();
    
    return {
      end: (success = true, metadata?: Record<string, any>) => {
        const duration = performance.now() - startTime;
        this.addMetric({
          name,
          duration,
          timestamp: Date.now(),
          type,
          success,
          metadata
        });
        return duration;
      }
    };
  }

  private addMetric(metric: PerformanceMetric) {
    this.metrics.push(metric);
    
    // Keep only the most recent metrics
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }

    // Log slow operations in development
    if (process.env.NODE_ENV === 'development' && metric.duration > 1000) {
      console.warn(`🐌 Slow ${metric.type} detected:`, {
        name: metric.name,
        duration: `${metric.duration.toFixed(2)}ms`,
        success: metric.success,
        metadata: metric.metadata
      });
    }
  }

  getMetrics(filter?: { type?: PerformanceMetric['type']; since?: number }) {
    let filtered = this.metrics;

    if (filter?.type) {
      filtered = filtered.filter(m => m.type === filter.type);
    }

    if (filter && typeof filter.since === 'number') {
      filtered = filtered.filter(m => m.timestamp >= filter.since!);
    }

    return filtered;
  }

  getAverageTime(name: string, timeWindow = 300000) { // 5 minutes default
    const since = Date.now() - timeWindow;
    const relevantMetrics = this.metrics.filter(
      m => m.name === name && m.timestamp >= since && m.success
    );

    if (relevantMetrics.length === 0) return null;

    const total = relevantMetrics.reduce((sum, m) => sum + m.duration, 0);
    return total / relevantMetrics.length;
  }

  getSlowestQueries(limit = 10) {
    return [...this.metrics]
      .filter(m => m.type === 'query')
      .sort((a, b) => b.duration - a.duration)
      .slice(0, limit);
  }

  getStats() {
    const now = Date.now();
    const fiveMinutesAgo = now - 300000;
    const recentMetrics = this.metrics.filter(m => m.timestamp >= fiveMinutesAgo);

    const byType = recentMetrics.reduce((acc, metric) => {
      if (!acc[metric.type]) {
        acc[metric.type] = { count: 0, totalTime: 0, errors: 0 };
      }
      acc[metric.type].count++;
      acc[metric.type].totalTime += metric.duration;
      if (!metric.success) acc[metric.type].errors++;
      return acc;
    }, {} as Record<string, { count: number; totalTime: number; errors: number }>);

    return {
      totalRequests: recentMetrics.length,
      timeWindow: '5 minutes',
      byType: Object.entries(byType).map(([type, stats]) => ({
        type,
        count: stats.count,
        averageTime: stats.totalTime / stats.count,
        errorRate: (stats.errors / stats.count) * 100
      }))
    };
  }

  clear() {
    this.metrics = [];
  }
}

// Global performance monitor instance
export const performanceMonitor = new PerformanceMonitor();

// Wrapper for timed database queries
export async function timedQuery<T>(
  name: string,
  queryFn: () => Promise<T>,
  metadata?: Record<string, any>
): Promise<T> {
  const timer = performanceMonitor.startTimer(name, 'query');
  
  try {
    const result = await queryFn();
    timer.end(true, metadata);
    return result;
  } catch (error) {
    timer.end(false, { ...metadata, error: error instanceof Error ? error.message : 'Unknown error' });
    throw error;
  }
}

// Wrapper for timed API calls
export async function timedApiCall<T>(
  name: string,
  apiFn: () => Promise<T>,
  metadata?: Record<string, any>
): Promise<T> {
  const timer = performanceMonitor.startTimer(name, 'api');
  
  try {
    const result = await apiFn();
    timer.end(true, metadata);
    return result;
  } catch (error) {
    timer.end(false, { ...metadata, error: error instanceof Error ? error.message : 'Unknown error' });
    throw error;
  }
}

// React component performance wrapper
export function timedRender(componentName: string, renderFn: () => ReactElement): ReactElement {
  const timer = performanceMonitor.startTimer(componentName, 'render');
  
  try {
    const result = renderFn();
    timer.end(true);
    return result;
  } catch (error) {
    timer.end(false, { error: error instanceof Error ? error.message : 'Unknown error' });
    throw error;
  }
}

// Cache performance tracking
export function trackCacheHit(key: string, duration: number) {
  performanceMonitor.startTimer(`cache-hit-${key}`, 'cache').end(true, { cacheKey: key });
}

export function trackCacheMiss(key: string, duration: number) {
  performanceMonitor.startTimer(`cache-miss-${key}`, 'cache').end(true, { cacheKey: key });
}

// Performance reporting for development
export function logPerformanceReport() {
  if (process.env.NODE_ENV !== 'development') return;

  const stats = performanceMonitor.getStats();
  const slowQueries = performanceMonitor.getSlowestQueries(5);

  console.group('📊 Performance Report');
  console.log('Overall Stats:', stats);
  console.log('Slowest Queries:', slowQueries);
  console.groupEnd();
}

// Export types for use in other files
export type { PerformanceMetric }; 
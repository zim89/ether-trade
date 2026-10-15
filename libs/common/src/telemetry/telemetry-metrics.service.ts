import { Injectable, OnModuleInit } from '@nestjs/common';
import { metrics, Counter, Histogram, UpDownCounter, Meter, Attributes } from '@opentelemetry/api';

/**
 * Centralized OpenTelemetry Metrics Service for Ether-Trade ecosystem.
 * Encapsulates Counters, Histograms, and UpDownCounters conforming to OTel semantic standards.
 */
@Injectable()
export class TelemetryMetricsService implements OnModuleInit {
  private meter: Meter;

  // Trading & Orders
  public ordersCreatedTotal: Counter;
  public orderPlacementLatencyMs: Histogram;
  public matchingEngineDurationMs: Histogram;

  // Valkey GLIDE & Distributed Locks
  public valkeyCommandDurationSeconds: Histogram;
  public lockAcquisitionDurationMs: Histogram;

  // Outbox & Kafka
  public outboxUnprocessedRecordsCount: UpDownCounter;
  public kafkaConsumerLag: Histogram;

  // Copy Trading
  public copyTradeEventsReceivedTotal: Counter;
  public copyTradeExecutionLatencyMs: Histogram;
  public copyTradeSlippageBps: Histogram;

  // WebSockets Gateway
  public wsActiveConnections: UpDownCounter;
  public wsMessagesBroadcastRate: Counter;

  onModuleInit(): void {
    this.meter = metrics.getMeter('ether-trade-metrics');

    // 1. Trading & Orders Metrics
    this.ordersCreatedTotal = this.meter.createCounter('orders_created_total', {
      description: 'Total number of orders created in the platform',
      unit: '{order}',
    });

    this.orderPlacementLatencyMs = this.meter.createHistogram('order_placement_latency_ms', {
      description: 'Latency of order creation from validation to DB persistence and matching',
      unit: 'ms',
    });

    this.matchingEngineDurationMs = this.meter.createHistogram('matching_engine_duration_ms', {
      description: 'Execution duration of matching engine per order crossing attempt',
      unit: 'ms',
    });

    // 2. Valkey GLIDE & Distributed Lock Metrics
    this.valkeyCommandDurationSeconds = this.meter.createHistogram(
      'valkey_command_duration_seconds',
      {
        description: 'Duration of Valkey GLIDE commands in seconds',
        unit: 's',
      },
    );

    this.lockAcquisitionDurationMs = this.meter.createHistogram('lock_acquisition_duration_ms', {
      description: 'Time spent waiting to acquire or verify a distributed Redis lock',
      unit: 'ms',
    });

    // 3. Outbox & Kafka Metrics
    this.outboxUnprocessedRecordsCount = this.meter.createUpDownCounter(
      'outbox_unprocessed_records_count',
      {
        description: 'Current number of pending unprocessed records in outbox',
        unit: '{record}',
      },
    );

    this.kafkaConsumerLag = this.meter.createHistogram('kafka_consumer_lag', {
      description: 'Offset lag between high watermark and processed offset in Kafka consumer',
      unit: '{offset}',
    });

    // 4. Copy Trading Metrics
    this.copyTradeEventsReceivedTotal = this.meter.createCounter(
      'copy_trade_events_received_total',
      {
        description: 'Total master trade execution events received by copy-trading service',
        unit: '{event}',
      },
    );

    this.copyTradeExecutionLatencyMs = this.meter.createHistogram(
      'copy_trade_execution_latency_ms',
      {
        description: 'End-to-end latency of replicating a master trade to a follower',
        unit: 'ms',
      },
    );

    this.copyTradeSlippageBps = this.meter.createHistogram('copy_trade_slippage_bps', {
      description: 'Slippage in basis points between master trade price and replicated order price',
      unit: 'bps',
    });

    // 5. WebSocket Gateway Metrics
    this.wsActiveConnections = this.meter.createUpDownCounter('ws_active_connections', {
      description: 'Current number of active WebSocket connections',
      unit: '{connection}',
    });

    this.wsMessagesBroadcastRate = this.meter.createCounter('ws_messages_broadcast_rate', {
      description: 'Total number of WebSocket broadcast messages sent to clients',
      unit: '{message}',
    });
  }

  /**
   * Helper to measure async execution time and record in a histogram.
   */
  async measureAsync<T>(
    histogram: Histogram,
    fn: () => Promise<T>,
    attributes?: Attributes,
    unit: 'ms' | 's' = 'ms',
  ): Promise<T> {
    const start = process.hrtime.bigint();
    try {
      return await fn();
    } finally {
      const durationNs = Number(process.hrtime.bigint() - start);
      const duration = unit === 'ms' ? durationNs / 1_000_000 : durationNs / 1_000_000_000;
      histogram.record(duration, attributes);
    }
  }

  /**
   * Helper to measure sync execution time and record in a histogram.
   */
  measureSync<T>(
    histogram: Histogram,
    fn: () => T,
    attributes?: Attributes,
    unit: 'ms' | 's' = 'ms',
  ): T {
    const start = process.hrtime.bigint();
    try {
      return fn();
    } finally {
      const durationNs = Number(process.hrtime.bigint() - start);
      const duration = unit === 'ms' ? durationNs / 1_000_000 : durationNs / 1_000_000_000;
      histogram.record(duration, attributes);
    }
  }
}

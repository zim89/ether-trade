import { TelemetryMetricsService } from './telemetry-metrics.service';

describe('TelemetryMetricsService (Unit)', () => {
  let service: TelemetryMetricsService;

  beforeEach(() => {
    service = new TelemetryMetricsService();
    service.onModuleInit();
  });

  it('should initialize all platform counters, histograms and upDownCounters', () => {
    // Trading
    expect(service.ordersCreatedTotal).toBeDefined();
    expect(service.orderPlacementLatencyMs).toBeDefined();
    expect(service.matchingEngineDurationMs).toBeDefined();

    // Valkey / Locks
    expect(service.valkeyCommandDurationSeconds).toBeDefined();
    expect(service.lockAcquisitionDurationMs).toBeDefined();

    // Outbox & Kafka
    expect(service.outboxUnprocessedRecordsCount).toBeDefined();
    expect(service.kafkaConsumerLag).toBeDefined();

    // Copy trading
    expect(service.copyTradeEventsReceivedTotal).toBeDefined();
    expect(service.copyTradeExecutionLatencyMs).toBeDefined();
    expect(service.copyTradeSlippageBps).toBeDefined();

    // WebSockets
    expect(service.wsActiveConnections).toBeDefined();
    expect(service.wsMessagesBroadcastRate).toBeDefined();
  });

  it('should record execution durations via measureAsync and measureSync', async () => {
    const recordSpy = jest.spyOn(service.orderPlacementLatencyMs, 'record');

    const result = await service.measureAsync(
      service.orderPlacementLatencyMs,
      async () => {
        await Promise.resolve();
        return 'done-async';
      },
      { pair: 'ETH_USDT' },
      'ms',
    );

    expect(result).toBe('done-async');
    expect(recordSpy).toHaveBeenCalledWith(
      expect.any(Number),
      expect.objectContaining({ pair: 'ETH_USDT' }),
    );

    const syncResult = service.measureSync(
      service.orderPlacementLatencyMs,
      () => {
        return 'done-sync';
      },
      { pair: 'BTC_USDT' },
      'ms',
    );

    expect(syncResult).toBe('done-sync');
    expect(recordSpy).toHaveBeenCalledWith(
      expect.any(Number),
      expect.objectContaining({ pair: 'BTC_USDT' }),
    );
  });
});

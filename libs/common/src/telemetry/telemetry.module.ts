import { Global, Module } from '@nestjs/common';
import { PinoLoggerService } from './pino-logger.service';
import { TelemetryMetricsService } from './telemetry-metrics.service';
import { TelemetryShutdownService } from './telemetry-shutdown.service';

@Global()
@Module({
  providers: [PinoLoggerService, TelemetryShutdownService, TelemetryMetricsService],
  exports: [PinoLoggerService, TelemetryShutdownService, TelemetryMetricsService],
})
export class TelemetryModule {}

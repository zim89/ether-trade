import { Global, Module } from '@nestjs/common';
import { PinoLoggerService } from './pino-logger.service';
import { TelemetryShutdownService } from './telemetry-shutdown.service';

@Global()
@Module({
  providers: [PinoLoggerService, TelemetryShutdownService],
  exports: [PinoLoggerService, TelemetryShutdownService],
})
export class TelemetryModule {}

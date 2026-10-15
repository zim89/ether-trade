import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { shutdownTracer } from './tracer';

@Injectable()
export class TelemetryShutdownService implements OnApplicationShutdown {
  async onApplicationShutdown(): Promise<void> {
    await shutdownTracer();
  }
}

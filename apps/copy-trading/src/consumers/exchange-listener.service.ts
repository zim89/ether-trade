import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';

export interface ExternalSignal {
  source: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  price: string;
  quantity: string;
  timestamp: number;
}

@Injectable()
export class ExchangeListenerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExchangeListenerService.name);
  private readonly signals$ = new Subject<ExternalSignal>();
  private isListening = false;

  onModuleInit(): void {
    this.logger.log('ExchangeListenerService initialized in sandbox/passive mode');
  }

  /**
   * Returns observable stream of ingested external signals.
   */
  getSignals(): Observable<ExternalSignal> {
    return this.signals$.asObservable();
  }

  /**
   * Ingests a signal from external exchange WebSocket/sandbox simulator.
   */
  ingestSignal(signal: ExternalSignal): void {
    this.logger.debug(
      `Ingested external signal from ${signal.source}: ${signal.side} ${signal.quantity} ${signal.symbol} @ ${signal.price}`,
    );
    this.signals$.next(signal);
  }

  /**
   * Simulates/starts listening to an external market stream.
   */
  startListening(source = 'sandbox-simulator'): void {
    this.isListening = true;
    this.logger.log(`Started listening to external exchange stream: ${source}`);
  }

  /**
   * Stops listening to external exchange stream.
   */
  stopListening(): void {
    this.isListening = false;
    this.logger.log('Stopped listening to external exchange stream');
  }

  onModuleDestroy(): void {
    this.stopListening();
    this.signals$.complete();
  }
}

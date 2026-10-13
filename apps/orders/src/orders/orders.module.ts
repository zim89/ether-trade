import { Module } from '@nestjs/common';
import { OutboxModule } from '../outbox/outbox.module';
import { IdempotencyRepository } from './idempotency.repository';
import { MatchingEngineService } from './matching-engine.service';
import { OrderbookService } from './orderbook.service';
import { OrdersController } from './orders.controller';
import { OrdersRepository } from './orders.repository';
import { OrdersService } from './orders.service';

@Module({
  imports: [OutboxModule],
  controllers: [OrdersController],

  providers: [
    OrdersService,
    OrdersRepository,
    IdempotencyRepository,
    OrderbookService,
    MatchingEngineService,
  ],
  exports: [OrdersService, OrderbookService],
})
export class OrdersModule {}

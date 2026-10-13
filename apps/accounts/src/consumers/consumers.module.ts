import { Module } from '@nestjs/common';
import { KafkaModule } from '@app/common/kafka/kafka.module';
import { BalancesModule } from '../balances/balances.module';
import { ProcessedEventsRetentionService } from './processed-events-retention.service';
import { ProcessedEventsRepository } from './processed-events.repository';
import { TradesSettlementConsumer } from './trades-settlement.consumer';

@Module({
  imports: [KafkaModule, BalancesModule],
  providers: [ProcessedEventsRepository, ProcessedEventsRetentionService, TradesSettlementConsumer],
  exports: [ProcessedEventsRepository],
})
export class ConsumersModule {}

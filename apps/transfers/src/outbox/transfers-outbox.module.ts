import { Module } from '@nestjs/common';
import { KafkaModule } from '@app/common/kafka/kafka.module';
import { TransfersOutboxRelayService } from './transfers-outbox-relay.service';
import { TransfersOutboxRetentionService } from './transfers-outbox-retention.service';
import { TransfersOutboxRepository } from './transfers-outbox.repository';

@Module({
  imports: [KafkaModule],
  providers: [
    TransfersOutboxRepository,
    TransfersOutboxRelayService,
    TransfersOutboxRetentionService,
  ],
  exports: [TransfersOutboxRepository],
})
export class TransfersOutboxModule {}

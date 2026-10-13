import { Module } from '@nestjs/common';
import { KafkaModule } from '@app/common/kafka/kafka.module';
import { OutboxRelayService } from './outbox-relay.service';
import { OutboxRetentionService } from './outbox-retention.service';
import { OutboxRepository } from './outbox.repository';

@Module({
  imports: [KafkaModule],
  providers: [OutboxRepository, OutboxRelayService, OutboxRetentionService],
  exports: [OutboxRepository],
})
export class OutboxModule {}

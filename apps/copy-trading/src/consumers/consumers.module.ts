import { Module } from '@nestjs/common';
import { KafkaModule } from '@app/common/kafka/kafka.module';
import { ExchangeListenerService } from './exchange-listener.service';
import { MasterTradeReplicationConsumer } from './master-trade-replication.consumer';

@Module({
  imports: [KafkaModule],
  providers: [MasterTradeReplicationConsumer, ExchangeListenerService],
  exports: [MasterTradeReplicationConsumer, ExchangeListenerService],
})
export class ConsumersModule {}

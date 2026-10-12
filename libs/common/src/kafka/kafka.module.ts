import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { KafkaProducerService } from './kafka-producer.service';
import { kafkaConfig } from './kafka.config';

@Global()
@Module({
  imports: [ConfigModule.forFeature(kafkaConfig)],
  providers: [KafkaProducerService],
  exports: [KafkaProducerService],
})
export class KafkaModule {}

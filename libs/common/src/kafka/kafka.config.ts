import { registerAs } from '@nestjs/config';
import { CONFIG_NAMESPACES, SHARED_ENV_DEFAULTS } from '../constants';

export interface KafkaConfig {
  brokers: string[];
  clientId: string;
  appEnv: string;
}

export const kafkaConfig = registerAs(CONFIG_NAMESPACES.kafka, (): KafkaConfig => {
  const rawBrokers = process.env.KAFKA_BROKERS || SHARED_ENV_DEFAULTS.kafkaBrokers;
  const brokers: string[] = [];

  for (const item of rawBrokers.split(',')) {
    const trimmed = item.trim();

    if (trimmed) {
      brokers.push(trimmed);
    }
  }

  return {
    brokers,
    clientId: process.env.KAFKA_CLIENT_ID || SHARED_ENV_DEFAULTS.kafkaClientId,
    appEnv: process.env.APP_ENV || SHARED_ENV_DEFAULTS.appEnv,
  };
});

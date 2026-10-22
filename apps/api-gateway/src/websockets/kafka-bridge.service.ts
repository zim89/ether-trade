import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { trace } from '@opentelemetry/api';
import { BaseKafkaConsumer } from '@app/common/kafka/kafka-consumer.abstract';
import { KafkaProducerService } from '@app/common/kafka/kafka-producer.service';
import {
  getKafkaTopicName,
  KAFKA_CONSUMER_GROUPS,
  KAFKA_DOMAINS,
  KAFKA_HEADERS,
} from '@app/common/kafka/kafka.constants';
import { KafkaBatchConsumerPayload } from '@app/common/kafka/kafka.types';
import {
  DepositConfirmedEvent,
  DepositStatus,
  DOMAIN_EVENT_TYPES,
  DomainEventEnvelope,
  MATCHING_ACTIONS,
  ORDER_ACTIONS,
  OrderCancelledEvent,
  OrderFilledEvent,
  OrderPlacedEvent,
  OrderSide,
  OrderStatus,
  TradeExecutedEvent,
  TRANSFERS_ACTIONS,
  WithdrawalCompletedEvent,
  WithdrawalFailedEvent,
  WithdrawalStatus,
  WsOrderBookType,
  WsOrderBookUpdateMessage,
  WsTradeMessage,
  WsTransferType,
  WsUserOrderUpdateMessage,
  WsUserTransferUpdateMessage,
} from '@app/contracts';
import { ValkeyPubSubService } from './valkey-pubsub.service';

/**
 * Bridges domain events consumed from Apache Kafka topics to Valkey GLIDE Pub/Sub channels.
 * Enables zero-allocation fan-out across horizontally scaled API Gateway nodes.
 */
@Injectable()
export class KafkaToWebSocketBridgeService extends BaseKafkaConsumer {
  protected override readonly logger = new Logger(KafkaToWebSocketBridgeService.name);

  constructor(
    configService: ConfigService,
    producerService: KafkaProducerService,
    private readonly valkeyPubSub: ValkeyPubSubService,
  ) {
    const appEnv = (configService.get<string>('appEnv') || 'dev').toLowerCase();

    const topics = [
      getKafkaTopicName(appEnv, KAFKA_DOMAINS.matching),
      getKafkaTopicName(appEnv, KAFKA_DOMAINS.orders),
      getKafkaTopicName(appEnv, KAFKA_DOMAINS.transfers),
    ];

    super(configService, producerService, {
      groupId: KAFKA_CONSUMER_GROUPS.apiGatewayWs,
      topics,
      fromBeginning: false,
    });
  }

  /**
   * Handles incoming Kafka batch message and publishes to corresponding Valkey channels.
   */
  async handleMessage(payload: KafkaBatchConsumerPayload): Promise<void> {
    const envelope = payload.value as DomainEventEnvelope<unknown>;
    if (!envelope || !envelope.payload) {
      return;
    }

    const action = envelope.action || payload.headers[KAFKA_HEADERS.action];
    const eventType = envelope.eventType;

    if (
      action === MATCHING_ACTIONS.tradeExecuted ||
      eventType === DOMAIN_EVENT_TYPES.tradeExecuted
    ) {
      await this.handleTradeExecuted(envelope.payload as TradeExecutedEvent);
      return;
    }

    if (action === ORDER_ACTIONS.placed || eventType === DOMAIN_EVENT_TYPES.orderPlaced) {
      await this.handleOrderPlaced(envelope.payload as OrderPlacedEvent);
      return;
    }

    if (action === ORDER_ACTIONS.cancelled || eventType === DOMAIN_EVENT_TYPES.orderCancelled) {
      await this.handleOrderCancelled(envelope.payload as OrderCancelledEvent);
      return;
    }

    if (action === ORDER_ACTIONS.filled || eventType === DOMAIN_EVENT_TYPES.orderFilled) {
      await this.handleOrderFilled(envelope.payload as OrderFilledEvent);
      return;
    }

    if (
      action === TRANSFERS_ACTIONS.depositConfirmed ||
      eventType === DOMAIN_EVENT_TYPES.depositConfirmed
    ) {
      await this.handleDepositConfirmed(envelope.payload as DepositConfirmedEvent);
      return;
    }

    if (
      action === TRANSFERS_ACTIONS.withdrawalCompleted ||
      eventType === DOMAIN_EVENT_TYPES.withdrawalCompleted
    ) {
      await this.handleWithdrawalCompleted(envelope.payload as WithdrawalCompletedEvent);
      return;
    }

    if (
      action === TRANSFERS_ACTIONS.withdrawalFailed ||
      eventType === DOMAIN_EVENT_TYPES.withdrawalFailed
    ) {
      await this.handleWithdrawalFailed(envelope.payload as WithdrawalFailedEvent);
      return;
    }

    this.logger.debug(
      `Unhandled action/eventType in WebSocket bridge: action=${String(action)}, eventType=${String(eventType)}`,
    );
  }

  private getActiveTraceId(): string | undefined {
    const activeSpan = trace.getActiveSpan();
    if (!activeSpan) return undefined;
    const spanContext = activeSpan.spanContext();
    return trace.isSpanContextValid(spanContext) ? spanContext.traceId : undefined;
  }

  private async handleTradeExecuted(event: TradeExecutedEvent): Promise<void> {
    const traceId = this.getActiveTraceId();

    // 1. Broadcast to public trades feed: trades:<symbol>
    const tradeMsg: WsTradeMessage = {
      channel: `trades:${event.symbol}`,
      tradeId: event.tradeId,
      symbol: event.symbol,
      price: event.price,
      quantity: event.quantity,
      timestamp: event.timestamp,
      ...(traceId && { traceId }),
    };
    await this.valkeyPubSub.publish(`trades:${event.symbol}`, JSON.stringify(tradeMsg));

    // 2. Private notifications for buyer & seller
    const buyerOrderMsg: WsUserOrderUpdateMessage = {
      channel: 'user:orders',
      orderId: event.buyOrderId,
      symbol: event.symbol,
      side: OrderSide.BUY,
      status: OrderStatus.PARTIALLY_FILLED,
      filledQuantity: event.quantity,
      remainingQuantity: '0',
      timestamp: event.timestamp,
      ...(traceId && { traceId }),
    };
    await this.valkeyPubSub.publish(
      `user:${event.buyerUserId}:orders`,
      JSON.stringify(buyerOrderMsg),
    );

    const sellerOrderMsg: WsUserOrderUpdateMessage = {
      channel: 'user:orders',
      orderId: event.sellOrderId,
      symbol: event.symbol,
      side: OrderSide.SELL,
      status: OrderStatus.PARTIALLY_FILLED,
      filledQuantity: event.quantity,
      remainingQuantity: '0',
      timestamp: event.timestamp,
      ...(traceId && { traceId }),
    };
    await this.valkeyPubSub.publish(
      `user:${event.sellerUserId}:orders`,
      JSON.stringify(sellerOrderMsg),
    );
  }

  private async handleOrderPlaced(event: OrderPlacedEvent): Promise<void> {
    const traceId = this.getActiveTraceId();

    // 1. Broadcast orderbook level delta: orderbook:<symbol>
    const deltaMsg: WsOrderBookUpdateMessage = {
      channel: `orderbook:${event.symbol}`,
      type: WsOrderBookType.DELTA,
      sequenceId: event.sequenceId,
      side: event.side,
      price: event.price,
      quantity: event.levelTotalQuantity,
      timestamp: event.timestamp,
    };
    await this.valkeyPubSub.publish(`orderbook:${event.symbol}`, JSON.stringify(deltaMsg));

    // 2. Private notification for order owner: user:<userId>:orders
    const userMsg: WsUserOrderUpdateMessage = {
      channel: 'user:orders',
      orderId: event.orderId,
      symbol: event.symbol,
      side: event.side,
      status: OrderStatus.OPEN,
      filledQuantity: '0',
      remainingQuantity: event.quantity,
      timestamp: event.timestamp,
      ...(traceId && { traceId }),
    };
    await this.valkeyPubSub.publish(`user:${event.userId}:orders`, JSON.stringify(userMsg));
  }

  private async handleOrderCancelled(event: OrderCancelledEvent): Promise<void> {
    const traceId = this.getActiveTraceId();

    // 1. Broadcast orderbook level delta: orderbook:<symbol>
    const deltaMsg: WsOrderBookUpdateMessage = {
      channel: `orderbook:${event.symbol}`,
      type: WsOrderBookType.DELTA,
      sequenceId: event.sequenceId,
      side: event.side,
      price: event.price,
      quantity: event.levelTotalQuantity, // "0" if level became empty
      timestamp: event.timestamp,
    };
    await this.valkeyPubSub.publish(`orderbook:${event.symbol}`, JSON.stringify(deltaMsg));

    // 2. Private notification for user
    const userMsg: WsUserOrderUpdateMessage = {
      channel: 'user:orders',
      orderId: event.orderId,
      symbol: event.symbol,
      side: event.side,
      status: OrderStatus.CANCELLED,
      filledQuantity: '0',
      remainingQuantity: event.remainingQuantity,
      timestamp: event.timestamp,
      ...(traceId && { traceId }),
    };
    await this.valkeyPubSub.publish(`user:${event.userId}:orders`, JSON.stringify(userMsg));
  }

  private async handleOrderFilled(event: OrderFilledEvent): Promise<void> {
    const traceId = this.getActiveTraceId();
    const userMsg: WsUserOrderUpdateMessage = {
      channel: 'user:orders',
      orderId: event.orderId,
      symbol: event.symbol,
      status: OrderStatus.FILLED,
      filledQuantity: event.filledQuantity,
      remainingQuantity: event.remainingQuantity,
      timestamp: event.timestamp,
      ...(traceId && { traceId }),
    };
    await this.valkeyPubSub.publish(`user:${event.userId}:orders`, JSON.stringify(userMsg));
  }

  private async handleDepositConfirmed(event: DepositConfirmedEvent): Promise<void> {
    const traceId = this.getActiveTraceId();
    const transferMsg: WsUserTransferUpdateMessage = {
      channel: 'user:transfers',
      transferId: event.depositId,
      type: WsTransferType.DEPOSIT,
      currency: event.currency,
      amount: event.amount,
      status: DepositStatus.CREDITED,
      txHash: event.txHash,
      timestamp: event.timestamp,
      ...(traceId && { traceId }),
    };
    await this.valkeyPubSub.publish(`user:${event.userId}:transfers`, JSON.stringify(transferMsg));
  }

  private async handleWithdrawalCompleted(event: WithdrawalCompletedEvent): Promise<void> {
    const traceId = this.getActiveTraceId();
    const transferMsg: WsUserTransferUpdateMessage = {
      channel: 'user:transfers',
      transferId: event.withdrawalId,
      type: WsTransferType.WITHDRAWAL,
      currency: event.currency,
      amount: event.amount,
      status: WithdrawalStatus.COMPLETED,
      txHash: event.txHash,
      timestamp: event.timestamp,
      ...(traceId && { traceId }),
    };
    await this.valkeyPubSub.publish(`user:${event.userId}:transfers`, JSON.stringify(transferMsg));
  }

  private async handleWithdrawalFailed(event: WithdrawalFailedEvent): Promise<void> {
    const traceId = this.getActiveTraceId();
    const transferMsg: WsUserTransferUpdateMessage = {
      channel: 'user:transfers',
      transferId: event.withdrawalId,
      type: WsTransferType.WITHDRAWAL,
      currency: event.currency,
      amount: event.amount,
      status: WithdrawalStatus.FAILED,
      txHash: event.txHash,
      timestamp: event.timestamp,
      ...(traceId && { traceId }),
    };
    await this.valkeyPubSub.publish(`user:${event.userId}:transfers`, JSON.stringify(transferMsg));
  }
}

import { Inject, Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CONFIG_NAMESPACES } from '@app/common/constants';
import { type OrdersServiceClient, PROTO_SERVICES, OrderItem } from '@app/contracts';
import { createGatewayGrpcMetadata } from '../common/constants/grpc.constants';
import { getCorrelationId } from '../common/utils/correlation-context';
import { grpcUnaryCall } from '../common/utils/grpc-call.util';
import type { GatewayConfig } from '../config/config.types';
import {
  CreateOrderDto,
  GetOrderBookQueryDto,
  GetOrdersQueryDto,
  OrderBookResponseDto,
  OrderResponseDto,
  OrdersListResponseDto,
} from './dto';

@Injectable()
export class OrdersService {
  private readonly grpcDeadlineMs: number;

  constructor(
    @Inject(PROTO_SERVICES.orders)
    private readonly ordersGrpcClient: OrdersServiceClient,
    private readonly configService: ConfigService,
  ) {
    this.grpcDeadlineMs =
      this.configService.get<GatewayConfig>(CONFIG_NAMESPACES.gateway)?.ordersGrpcDeadlineMs ??
      2000;
  }

  async createOrder(
    userId: string,
    dto: CreateOrderDto,
    idempotencyKey?: string,
  ): Promise<OrderResponseDto> {
    if (!idempotencyKey) {
      throw new BadRequestException('Header "x-idempotency-key" is required to place an order');
    }

    const metadata = createGatewayGrpcMetadata(getCorrelationId() ?? 'unknown', userId);
    const response = await grpcUnaryCall(
      this.ordersGrpcClient.createOrder(
        {
          userId,
          pair: dto.pair,
          side: dto.side,
          type: dto.type,
          price: dto.price,
          amount: dto.amount,
          idempotencyKey,
        },
        metadata,
      ),
      this.grpcDeadlineMs,
    );

    if (!response.order) {
      throw new BadRequestException('Failed to create order');
    }

    return this.mapOrderItemToDto(response.order);
  }

  async cancelOrder(
    userId: string,
    orderId: string,
    idempotencyKey?: string,
  ): Promise<OrderResponseDto> {
    if (!idempotencyKey) {
      throw new BadRequestException('Header "x-idempotency-key" is required to cancel an order');
    }

    const metadata = createGatewayGrpcMetadata(getCorrelationId() ?? 'unknown', userId);
    const response = await grpcUnaryCall(
      this.ordersGrpcClient.cancelOrder(
        {
          orderId,
          userId,
          idempotencyKey,
        },
        metadata,
      ),
      this.grpcDeadlineMs,
    );

    if (!response.order) {
      throw new BadRequestException('Failed to cancel order');
    }

    return this.mapOrderItemToDto(response.order);
  }

  async getOrder(userId: string, orderId: string): Promise<OrderResponseDto> {
    const metadata = createGatewayGrpcMetadata(getCorrelationId() ?? 'unknown', userId);
    const response = await grpcUnaryCall(
      this.ordersGrpcClient.getOrder(
        {
          orderId,
          userId,
        },
        metadata,
      ),
      this.grpcDeadlineMs,
    );

    if (!response.order) {
      throw new BadRequestException(`Order not found: ${orderId}`);
    }

    return this.mapOrderItemToDto(response.order);
  }

  async getOrders(userId: string, query: GetOrdersQueryDto): Promise<OrdersListResponseDto> {
    const metadata = createGatewayGrpcMetadata(getCorrelationId() ?? 'unknown', userId);
    const response = await grpcUnaryCall(
      this.ordersGrpcClient.getOrders(
        {
          userId,
          pair: query.pair,
          status: query.status,
          limit: query.limit,
          offset: query.offset,
        },
        metadata,
      ),
      this.grpcDeadlineMs,
    );

    return {
      orders: (response.orders ?? []).map((o) => this.mapOrderItemToDto(o)),
      total: response.total ?? 0,
    };
  }

  async getOrderBook(pair: string, query: GetOrderBookQueryDto): Promise<OrderBookResponseDto> {
    const metadata = createGatewayGrpcMetadata(getCorrelationId() ?? 'unknown');
    const response = await grpcUnaryCall(
      this.ordersGrpcClient.getOrderBook(
        {
          pair,
          depth: query.depth,
        },
        metadata,
      ),
      this.grpcDeadlineMs,
    );

    return {
      pair: response.pair,
      bids: response.bids ?? [],
      asks: response.asks ?? [],
      timestamp: Number(response.timestamp),
    };
  }

  private mapOrderItemToDto(item: OrderItem): OrderResponseDto {
    return {
      orderId: item.orderId,
      userId: item.userId,
      pair: item.pair,
      side: item.side,
      type: item.type,
      price: item.price,
      amount: item.amount,
      filledAmount: item.filledAmount,
      remainingAmount: item.remainingAmount,
      status: item.status,
      createdAt: Number(item.createdAt),
      updatedAt: Number(item.updatedAt),
    };
  }
}

import { applyDecorators } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { OrderBookResponseDto, OrderResponseDto, OrdersListResponseDto } from './dto';

export const OrdersDocs = {
  controller: () => applyDecorators(ApiTags('Orders')),

  createOrder: () =>
    applyDecorators(
      ApiBearerAuth('JWT-auth'),
      ApiOperation({
        summary: 'Create limit order',
        description:
          'Places a new limit order, reserves required funds in accounts-service, and attempts matching against the in-memory orderbook.',
      }),
      ApiHeader({
        name: 'x-idempotency-key',
        required: true,
        description: 'Unique client operation key (UUIDv7 or UUIDv4) for safe retries.',
      }),
      ApiCreatedResponse({
        type: OrderResponseDto,
        description: 'Order created or matched successfully.',
      }),
      ApiUnauthorizedResponse({
        description: 'Missing, expired, or invalid JWT access token.',
      }),
    ),

  cancelOrder: () =>
    applyDecorators(
      ApiBearerAuth('JWT-auth'),
      ApiOperation({
        summary: 'Cancel order',
        description:
          'Cancels an active or partially filled order, removes it from the orderbook, and releases remaining locked funds.',
      }),
      ApiHeader({
        name: 'x-idempotency-key',
        required: true,
        description: 'Unique client operation key for safe cancellation retries.',
      }),
      ApiOkResponse({
        type: OrderResponseDto,
        description: 'Order successfully cancelled.',
      }),
      ApiUnauthorizedResponse({
        description: 'Missing, expired, or invalid JWT access token.',
      }),
    ),

  getOrder: () =>
    applyDecorators(
      ApiBearerAuth('JWT-auth'),
      ApiOperation({
        summary: 'Get order details',
        description: 'Retrieves current status and execution details of a specific order.',
      }),
      ApiOkResponse({
        type: OrderResponseDto,
        description: 'Order details successfully retrieved.',
      }),
      ApiUnauthorizedResponse({
        description: 'Missing, expired, or invalid JWT access token.',
      }),
    ),

  getOrders: () =>
    applyDecorators(
      ApiBearerAuth('JWT-auth'),
      ApiOperation({
        summary: 'List user orders',
        description:
          'Retrieves user orders with optional filtering by trading pair, status, and pagination.',
      }),
      ApiOkResponse({
        type: OrdersListResponseDto,
        description: 'List of orders successfully retrieved.',
      }),
      ApiUnauthorizedResponse({
        description: 'Missing, expired, or invalid JWT access token.',
      }),
    ),

  getOrderBook: () =>
    applyDecorators(
      ApiOperation({
        summary: 'Get order book depth (public)',
        description:
          'Retrieves the public market orderbook snapshot (bids and asks price levels) for a trading pair.',
      }),
      ApiOkResponse({
        type: OrderBookResponseDto,
        description: 'Orderbook snapshot successfully retrieved.',
      }),
    ),
};

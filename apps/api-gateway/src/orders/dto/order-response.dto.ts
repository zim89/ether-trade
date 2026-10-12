import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

@Exclude()
export class OrderResponseDto {
  @ApiProperty({
    example: '0191ebc2-0000-7000-8000-000000000001',
    description: 'Unique order identifier (UUIDv7)',
  })
  @Expose()
  orderId: string;

  @ApiProperty({
    example: '0191ebc2-0000-7000-8000-000000000002',
    description: 'User identifier (UUIDv7)',
  })
  @Expose()
  userId: string;

  @ApiProperty({
    example: 'BTC_USDT',
    description: 'Trading pair identifier',
  })
  @Expose()
  pair: string;

  @ApiProperty({
    example: 'BUY',
    description: 'Order side (BUY or SELL)',
  })
  @Expose()
  side: string;

  @ApiProperty({
    example: 'LIMIT',
    description: 'Order type (LIMIT)',
  })
  @Expose()
  type: string;

  @ApiProperty({
    example: '60000.00000000',
    description: 'Unit price as decimal string',
  })
  @Expose()
  price: string;

  @ApiProperty({
    example: '0.10000000',
    description: 'Total requested amount as decimal string',
  })
  @Expose()
  amount: string;

  @ApiProperty({
    example: '0.00000000',
    description: 'Executed filled amount as decimal string',
  })
  @Expose()
  filledAmount: string;

  @ApiProperty({
    example: '0.10000000',
    description: 'Remaining unexecuted amount as decimal string',
  })
  @Expose()
  remainingAmount: string;

  @ApiProperty({
    example: 'OPEN',
    description: 'Current order status (OPEN, PARTIALLY_FILLED, FILLED, CANCELLED)',
  })
  @Expose()
  status: string;

  @ApiProperty({
    example: 1726588200,
    description: 'Unix timestamp in seconds when the order was created',
  })
  @Expose()
  createdAt: number;

  @ApiProperty({
    example: 1726588200,
    description: 'Unix timestamp in seconds when the order was last updated',
  })
  @Expose()
  updatedAt: number;
}

@Exclude()
export class OrdersListResponseDto {
  @ApiProperty({
    type: [OrderResponseDto],
    description: 'List of orders matching query filters',
  })
  @Expose()
  orders: OrderResponseDto[];

  @ApiProperty({
    example: 1,
    description: 'Total number of orders matching query filters',
  })
  @Expose()
  total: number;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class OrderBookLevelDto {
  @ApiProperty({
    example: '60000.00000000',
    description: 'Price level as decimal string',
  })
  price: string;

  @ApiProperty({
    example: '1.50000000',
    description: 'Aggregated total volume at this price level',
  })
  amount: string;

  @ApiProperty({
    example: 3,
    description: 'Number of individual orders queued at this price level',
  })
  orderCount: number;
}

export class OrderBookResponseDto {
  @ApiProperty({
    example: 'BTC_USDT',
    description: 'Trading pair identifier',
  })
  pair: string;

  @ApiProperty({
    type: [OrderBookLevelDto],
    description: 'Bids sorted descending by price (highest buy price first)',
  })
  bids: OrderBookLevelDto[];

  @ApiProperty({
    type: [OrderBookLevelDto],
    description: 'Asks sorted ascending by price (lowest sell price first)',
  })
  asks: OrderBookLevelDto[];

  @ApiProperty({
    example: 1726588200,
    description: 'Unix timestamp in seconds when the snapshot was generated',
  })
  timestamp: number;
}

export class GetOrderBookQueryDto {
  @ApiPropertyOptional({
    example: 50,
    default: 50,
    description: 'Maximum depth levels to retrieve for bids and asks (1-100)',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  depth?: number;
}

import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString, Matches } from 'class-validator';
import { OrderSide, OrderType } from '@app/contracts';

export class CreateOrderDto {
  @ApiProperty({
    example: 'BTC_USDT',
    description: 'Trading pair identifier',
  })
  @IsString()
  @IsNotEmpty()
  pair: string;

  @ApiProperty({
    example: 'BUY',
    enum: OrderSide,
    description: 'Order side (BUY or SELL)',
  })
  @IsEnum(OrderSide)
  side: OrderSide;

  @ApiProperty({
    example: 'LIMIT',
    enum: OrderType,
    description: 'Order type (LIMIT)',
  })
  @IsEnum(OrderType)
  type: OrderType;

  @ApiProperty({
    example: '60000.00000000',
    description: 'Order unit price as decimal string (positive)',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d+(\.\d{1,8})?$/, {
    message: 'price must be a valid positive decimal string with up to 8 decimal places',
  })
  price: string;

  @ApiProperty({
    example: '0.10000000',
    description: 'Order amount as decimal string (positive)',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d+(\.\d{1,8})?$/, {
    message: 'amount must be a valid positive decimal string with up to 8 decimal places',
  })
  amount: string;
}

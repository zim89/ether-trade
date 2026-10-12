import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class GetOrdersQueryDto {
  @ApiPropertyOptional({
    example: 'BTC_USDT',
    description: 'Filter orders by trading pair',
  })
  @IsString()
  @IsOptional()
  pair?: string;

  @ApiPropertyOptional({
    example: 'OPEN',
    description: 'Filter orders by status (OPEN, PARTIALLY_FILLED, FILLED, CANCELLED)',
  })
  @IsString()
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({
    example: 20,
    default: 20,
    description: 'Maximum number of orders to return (1-100)',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({
    example: 0,
    default: 0,
    description: 'Offset for pagination',
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  offset?: number;
}

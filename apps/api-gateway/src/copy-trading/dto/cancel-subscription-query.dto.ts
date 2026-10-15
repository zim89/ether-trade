import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

export class CancelSubscriptionQueryDto {
  @ApiPropertyOptional({
    example: false,
    description: 'Whether to close all active open positions for this master upon cancellation',
    default: false,
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  closePositions?: boolean;
}

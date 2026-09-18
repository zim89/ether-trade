import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { Currency, DEFAULT_CURRENCY } from '@app/common/constants';

/**
 * Query parameters for fetching account balance.
 */
export class GetBalanceQueryDto {
  @ApiPropertyOptional({
    enum: Currency,
    enumName: 'Currency',
    default: DEFAULT_CURRENCY,
    example: Currency.USDT,
    description: 'Target settlement currency symbol',
  })
  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency = DEFAULT_CURRENCY;
}

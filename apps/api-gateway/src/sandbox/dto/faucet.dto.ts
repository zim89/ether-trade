import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, Matches } from 'class-validator';
import { Currency, DEFAULT_CURRENCY } from '@app/common/constants';

/**
 * Request body for sandbox faucet deposit.
 */
export class FaucetDto {
  @ApiProperty({
    example: '1000.00000000',
    description: 'Positive decimal amount to credit to available balance',
  })
  @IsNotEmpty({ message: 'Amount is required.' })
  @IsString({ message: 'Amount must be a string representing decimal number.' })
  @Matches(/^\d+(\.\d{1,8})?$/, {
    message: 'Amount must be a positive decimal number with up to 8 decimal places.',
  })
  amount: string;

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

  @ApiPropertyOptional({
    example: '0191ebc2-0000-7000-8000-000000000001',
    description: 'Optional idempotency key to prevent double funding (auto-generated if omitted)',
  })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @ApiPropertyOptional({
    example: '0191ebc2-0000-7000-8000-000000000002',
    description: 'Target user ID (defaults to authenticated caller if omitted)',
  })
  @IsOptional()
  @IsUUID('all', { message: 'userId must be a valid UUIDv7.' })
  userId?: string;
}

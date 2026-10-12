import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString, Matches, IsEthereumAddress } from 'class-validator';
import { Currency } from '@app/common/constants';

export class RequestWithdrawalDto {
  @ApiProperty({
    example: 'ETH',
    enum: Currency,
    description: 'Cryptocurrency asset to withdraw (ETH, USDT)',
  })
  @IsEnum(Currency)
  currency: Currency;

  @ApiProperty({
    example: '0.50000000',
    description:
      'Amount to withdraw formatted as decimal string (positive, up to 8 decimal places)',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d+(\.\d{1,8})?$/, {
    message: 'amount must be a valid positive decimal string with up to 8 decimal places',
  })
  amount: string;

  @ApiProperty({
    example: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    description: 'Destination EVM recipient address (0x...)',
  })
  @IsEthereumAddress({
    message: 'destinationAddress must be a valid Ethereum address',
  })
  destinationAddress: string;
}

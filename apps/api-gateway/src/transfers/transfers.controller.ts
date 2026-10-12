import { Body, Controller, Get, Headers, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser, type CurrentUserData } from '../common/decorators';
import { JwtAuthGuard } from '../common/guards';
import {
  DepositAddressResponseDto,
  GetWithdrawalHistoryQueryDto,
  RequestWithdrawalDto,
  WithdrawalListResponseDto,
  WithdrawalResponseDto,
} from './dto';
import { TransfersService } from './transfers.service';
import { TransfersDocs } from './transfers.swagger';

@TransfersDocs.controller()
@Controller('transfers')
export class TransfersController {
  constructor(private readonly transfersService: TransfersService) {}

  @Get('deposit-address')
  @UseGuards(JwtAuthGuard)
  @TransfersDocs.getDepositAddress()
  async getDepositAddress(
    @CurrentUser() user: CurrentUserData,
  ): Promise<DepositAddressResponseDto> {
    return this.transfersService.getDepositAddress(user.userId);
  }

  @Post('withdraw')
  @UseGuards(JwtAuthGuard)
  @TransfersDocs.requestWithdrawal()
  async requestWithdrawal(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: RequestWithdrawalDto,
    @Headers('x-idempotency-key') idempotencyKey?: string,
  ): Promise<WithdrawalResponseDto> {
    return this.transfersService.requestWithdrawal(user.userId, dto, idempotencyKey);
  }

  @Get('withdrawals/:id')
  @UseGuards(JwtAuthGuard)
  @TransfersDocs.getWithdrawalById()
  async getWithdrawalById(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
  ): Promise<WithdrawalResponseDto> {
    return this.transfersService.getWithdrawalById(user.userId, id);
  }

  @Get('withdrawals')
  @UseGuards(JwtAuthGuard)
  @TransfersDocs.getWithdrawalHistory()
  async getWithdrawalHistory(
    @CurrentUser() user: CurrentUserData,
    @Query() query: GetWithdrawalHistoryQueryDto,
  ): Promise<WithdrawalListResponseDto> {
    return this.transfersService.getWithdrawalHistory(user.userId, query);
  }
}

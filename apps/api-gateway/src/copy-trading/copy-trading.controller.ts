import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser, type CurrentUserData } from '../common/decorators';
import { JwtAuthGuard } from '../common/guards';
import { CopyTradingService } from './copy-trading.service';
import { CopyTradingDocs } from './copy-trading.swagger';
import {
  CancelSubscriptionQueryDto,
  CopySubscriptionResponseDto,
  CopySubscriptionsListResponseDto,
  CreateSubscriptionDto,
  GetMasterTradersQueryDto,
  MasterTraderResponseDto,
  MasterTradersListResponseDto,
  RegisterMasterDto,
} from './dto';

@CopyTradingDocs.controller()
@Controller('copy-trading')
export class CopyTradingController {
  constructor(private readonly copyTradingService: CopyTradingService) {}

  @Post('masters')
  @UseGuards(JwtAuthGuard)
  @CopyTradingDocs.registerMaster()
  async registerMaster(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: RegisterMasterDto,
  ): Promise<MasterTraderResponseDto> {
    return this.copyTradingService.registerMaster(user.userId, dto);
  }

  @Get('masters')
  @CopyTradingDocs.getMasterTraders()
  async getMasterTraders(
    @Query() query: GetMasterTradersQueryDto,
  ): Promise<MasterTradersListResponseDto> {
    return this.copyTradingService.getMasterTraders(query);
  }

  @Post('subscribe')
  @UseGuards(JwtAuthGuard)
  @CopyTradingDocs.subscribe()
  async createSubscription(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: CreateSubscriptionDto,
    @Headers('x-idempotency-key') idempotencyKey?: string,
  ): Promise<CopySubscriptionResponseDto> {
    return this.copyTradingService.createSubscription(user.userId, dto, idempotencyKey);
  }

  @Delete('subscriptions/:subscriptionId')
  @UseGuards(JwtAuthGuard)
  @CopyTradingDocs.cancelSubscription()
  async cancelSubscription(
    @CurrentUser() user: CurrentUserData,
    @Param('subscriptionId') subscriptionId: string,
    @Query() query: CancelSubscriptionQueryDto,
  ): Promise<CopySubscriptionResponseDto> {
    return this.copyTradingService.cancelSubscription(user.userId, subscriptionId, query);
  }

  @Get('subscriptions')
  @UseGuards(JwtAuthGuard)
  @CopyTradingDocs.getSubscriptions()
  async getSubscriptions(
    @CurrentUser() user: CurrentUserData,
  ): Promise<CopySubscriptionsListResponseDto> {
    return this.copyTradingService.getSubscriptions(user.userId);
  }
}

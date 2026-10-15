import { Controller, UseFilters } from '@nestjs/common';
import { GrpcExceptionFilter } from '@app/common/filters';
import {
  CopyTradingServiceController,
  CopyTradingServiceControllerMethods,
  RegisterMasterRequest,
  RegisterMasterResponse,
  GetMasterTradersRequest,
  GetMasterTradersResponse,
  CreateSubscriptionRequest,
  CreateSubscriptionResponse,
  CancelSubscriptionRequest,
  CancelSubscriptionResponse,
  GetSubscriptionsRequest,
  GetSubscriptionsResponse,
} from '@app/contracts';
import { CopyTradingService } from './copy-trading.service';

@Controller()
@CopyTradingServiceControllerMethods()
@UseFilters(new GrpcExceptionFilter())
export class CopyTradingController implements CopyTradingServiceController {
  constructor(private readonly copyTradingService: CopyTradingService) {}

  async registerMaster(request: RegisterMasterRequest): Promise<RegisterMasterResponse> {
    const master = await this.copyTradingService.registerMaster(request);
    return { master };
  }

  async getMasterTraders(request: GetMasterTradersRequest): Promise<GetMasterTradersResponse> {
    return this.copyTradingService.getMasterTraders(request);
  }

  async createSubscription(
    request: CreateSubscriptionRequest,
  ): Promise<CreateSubscriptionResponse> {
    const subscription = await this.copyTradingService.createSubscription(request);
    return { subscription };
  }

  async cancelSubscription(
    request: CancelSubscriptionRequest,
  ): Promise<CancelSubscriptionResponse> {
    const subscription = await this.copyTradingService.cancelSubscription(request);
    return { subscription };
  }

  async getSubscriptions(request: GetSubscriptionsRequest): Promise<GetSubscriptionsResponse> {
    const items = await this.copyTradingService.getSubscriptions(request);
    return { items };
  }
}

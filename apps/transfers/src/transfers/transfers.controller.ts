import { Metadata } from '@grpc/grpc-js';
import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import type {
  GetDepositAddressRequest,
  GetDepositAddressResponse,
  GetWithdrawalByIdRequest,
  GetWithdrawalByIdResponse,
  GetWithdrawalHistoryRequest,
  GetWithdrawalHistoryResponse,
  RequestWithdrawalRequest,
  RequestWithdrawalResponse,
} from '@app/contracts';
import { TRANSFERS_SERVICE_NAME } from '@app/contracts';
import { TransfersService } from './transfers.service';

@Controller()
export class TransfersController {
  constructor(private readonly transfersService: TransfersService) {}

  @GrpcMethod(TRANSFERS_SERVICE_NAME, 'GetDepositAddress')
  getDepositAddress(data: GetDepositAddressRequest): GetDepositAddressResponse {
    return this.transfersService.getDepositAddress(data);
  }

  @GrpcMethod(TRANSFERS_SERVICE_NAME, 'RequestWithdrawal')
  async requestWithdrawal(
    data: RequestWithdrawalRequest,
    metadata: Metadata,
  ): Promise<RequestWithdrawalResponse> {
    return await this.transfersService.requestWithdrawal(data, metadata);
  }

  @GrpcMethod(TRANSFERS_SERVICE_NAME, 'GetWithdrawalById')
  async getWithdrawalById(data: GetWithdrawalByIdRequest): Promise<GetWithdrawalByIdResponse> {
    return await this.transfersService.getWithdrawalById(data);
  }

  @GrpcMethod(TRANSFERS_SERVICE_NAME, 'GetWithdrawalHistory')
  async getWithdrawalHistory(
    data: GetWithdrawalHistoryRequest,
  ): Promise<GetWithdrawalHistoryResponse> {
    return await this.transfersService.getWithdrawalHistory(data);
  }
}

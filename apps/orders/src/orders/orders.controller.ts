import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { ORDERS_SERVICE_NAME } from '@app/contracts';
import type {
  CancelOrderRequest,
  CancelOrderResponse,
  CreateOrderRequest,
  CreateOrderResponse,
  GetOrderBookRequest,
  GetOrderBookResponse,
  GetOrderRequest,
  GetOrderResponse,
  GetOrdersRequest,
  GetOrdersResponse,
} from '@app/contracts';
import { OrdersService } from './orders.service';

@Controller()
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @GrpcMethod(ORDERS_SERVICE_NAME, 'CreateOrder')
  async createOrder(data: CreateOrderRequest): Promise<CreateOrderResponse> {
    const order = await this.ordersService.createOrder(data);
    return { order };
  }

  @GrpcMethod(ORDERS_SERVICE_NAME, 'CancelOrder')
  async cancelOrder(data: CancelOrderRequest): Promise<CancelOrderResponse> {
    const order = await this.ordersService.cancelOrder(data);
    return { order };
  }

  @GrpcMethod(ORDERS_SERVICE_NAME, 'GetOrder')
  async getOrder(data: GetOrderRequest): Promise<GetOrderResponse> {
    const order = await this.ordersService.getOrder(data);
    return { order };
  }

  @GrpcMethod(ORDERS_SERVICE_NAME, 'GetOrders')
  async getOrders(data: GetOrdersRequest): Promise<GetOrdersResponse> {
    const result = await this.ordersService.getOrders(data);
    return result;
  }

  @GrpcMethod(ORDERS_SERVICE_NAME, 'GetOrderBook')
  async getOrderBook(data: GetOrderBookRequest): Promise<GetOrderBookResponse> {
    return this.ordersService.getOrderBook(data);
  }
}

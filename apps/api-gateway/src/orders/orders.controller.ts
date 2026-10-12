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
import {
  CreateOrderDto,
  GetOrderBookQueryDto,
  GetOrdersQueryDto,
  OrderBookResponseDto,
  OrderResponseDto,
  OrdersListResponseDto,
} from './dto';
import { OrdersService } from './orders.service';
import { OrdersDocs } from './orders.swagger';

@OrdersDocs.controller()
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @OrdersDocs.createOrder()
  async createOrder(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: CreateOrderDto,
    @Headers('x-idempotency-key') idempotencyKey?: string,
  ): Promise<OrderResponseDto> {
    return this.ordersService.createOrder(user.userId, dto, idempotencyKey);
  }

  @Delete(':orderId')
  @UseGuards(JwtAuthGuard)
  @OrdersDocs.cancelOrder()
  async cancelOrder(
    @CurrentUser() user: CurrentUserData,
    @Param('orderId') orderId: string,
    @Headers('x-idempotency-key') idempotencyKey?: string,
  ): Promise<OrderResponseDto> {
    return this.ordersService.cancelOrder(user.userId, orderId, idempotencyKey);
  }

  @Get('orderbook/:pair')
  @OrdersDocs.getOrderBook()
  async getOrderBook(
    @Param('pair') pair: string,
    @Query() query: GetOrderBookQueryDto,
  ): Promise<OrderBookResponseDto> {
    return this.ordersService.getOrderBook(pair, query);
  }

  @Get(':orderId')
  @UseGuards(JwtAuthGuard)
  @OrdersDocs.getOrder()
  async getOrder(
    @CurrentUser() user: CurrentUserData,
    @Param('orderId') orderId: string,
  ): Promise<OrderResponseDto> {
    return this.ordersService.getOrder(user.userId, orderId);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @OrdersDocs.getOrders()
  async getOrders(
    @CurrentUser() user: CurrentUserData,
    @Query() query: GetOrdersQueryDto,
  ): Promise<OrdersListResponseDto> {
    return this.ordersService.getOrders(user.userId, query);
  }
}

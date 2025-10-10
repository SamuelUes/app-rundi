import { Controller, Post, Body, Get, Param, Headers, RawBodyRequest, Req } from '@nestjs/common';
import { Request } from 'express';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('create-intent')
  createPaymentIntent(@Body() body: { rideId: string; tip?: number }) {
    return this.paymentsService.createPaymentIntent(body.rideId, body.tip || 0);
  }

  @Post('confirm')
  confirmPayment(@Body() body: { paymentId: string }) {
    return this.paymentsService.confirmPayment(body.paymentId);
  }

  @Post('cash')
  processCashPayment(@Body() body: { rideId: string; tip?: number }) {
    return this.paymentsService.processCashPayment(body.rideId, body.tip || 0);
  }

  @Post('capture')
  capturePayment(@Body() body: { rideId: string }) {
    return this.paymentsService.capturePayment(body.rideId);
  }

  @Post('cancel-authorization')
  cancelPaymentAuthorization(@Body() body: { rideId: string }) {
    return this.paymentsService.cancelPaymentAuthorization(body.rideId);
  }

  @Get(':id')
  getPaymentDetails(@Param('id') id: string) {
    return this.paymentsService.getPaymentDetails(id);
  }

  @Get(':id/receipt')
  generateReceipt(@Param('id') id: string) {
    return this.paymentsService.generateReceipt(id);
  }

  /**
   * Webhook de Stripe para confirmar pagos automáticamente
   */
  @Post('webhook')
  async handleStripeWebhook(
    @Headers('stripe-signature') signature: string,
    @Req() request: RawBodyRequest<Request>,
  ) {
    if (!request.rawBody) {
      throw new Error('Raw body is required for webhook verification');
    }
    return this.paymentsService.handleStripeWebhook(signature, request.rawBody);
  }
}

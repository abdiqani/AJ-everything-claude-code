import {
  Controller,
  Post,
  Body,
  Req,
  Headers,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { SkipThrottle } from '@nestjs/throttler';
import { BillingService } from './billing.service';
import { AuthGuard, AuthUser } from '../auth/auth.guard';

class CheckoutDto {
  @IsIn(['starter', 'pro', 'enterprise'])
  plan!: 'starter' | 'pro' | 'enterprise';
}

@ApiTags('billing')
@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Post('checkout')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a Stripe checkout session for plan upgrade' })
  checkout(@Req() req: { user: AuthUser }, @Body() dto: CheckoutDto) {
    const origin = process.env.FRONTEND_URL || 'http://localhost:3000';
    return this.billing.createCheckoutSession({
      orgId: req.user.orgId,
      userId: req.user.id,
      userEmail: req.user.email,
      plan: dto.plan,
      successUrl: `${origin}/dashboard/billing/success?plan=${dto.plan}`,
      cancelUrl: `${origin}/dashboard/upgrade`,
    });
  }

  /**
   * Stripe webhook receiver.
   * Must use raw body — do NOT parse as JSON before this handler.
   * Marked @SkipThrottle() since Stripe IP ranges are trusted.
   */
  @Post('webhook')
  @SkipThrottle()
  @ApiOperation({ summary: 'Stripe webhook endpoint (raw body required)' })
  async webhook(
    @Req() req: { rawBody?: Buffer | string },
    @Headers('stripe-signature') sig: string,
  ) {
    const rawBody = req.rawBody;
    if (!rawBody) {
      throw new BadRequestException('Missing raw body — ensure rawBody plugin is enabled');
    }
    await this.billing.handleWebhook(rawBody.toString(), sig);
    return { received: true };
  }
}

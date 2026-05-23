import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { SendGridHttpService } from './sendgrid-http.service';

@Module({
  providers: [
    // Use SendGrid HTTP API instead of SMTP (works on VPS where SMTP is blocked)
    {
      provide: EmailService,
      useClass: SendGridHttpService,
    },
  ],
  exports: [EmailService],
})
export class EmailModule {}


import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as sgMail from '@sendgrid/mail';

export interface EmailOptions {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer;
    contentType: string;
  }>;
}

@Injectable()
export class SendGridHttpService {
  private readonly logger = new Logger(SendGridHttpService.name);
  private isConfigured = false;

  constructor(private configService: ConfigService) {
    this.initialize();
  }

  private initialize() {
    const apiKey = this.configService.get('SENDGRID_API_KEY');
    
    if (!apiKey || apiKey.trim() === '') {
      this.logger.warn('No SendGrid API key found. Email functionality will be disabled.');
      this.logger.warn('Set SENDGRID_API_KEY in your .env file to enable emails.');
      return;
    }

    sgMail.setApiKey(apiKey);
    this.isConfigured = true;
    this.logger.log('✅ SendGrid HTTP API initialized successfully');
  }

  async sendEmail(options: EmailOptions): Promise<any> {
    if (!this.isConfigured) {
      this.logger.warn('SendGrid not configured. Skipping email send.');
      return {
        success: false,
        message: 'Email service not configured',
      };
    }

    try {
      const recipients = Array.isArray(options.to) ? options.to : [options.to];
      
      const msg: any = {
        to: recipients,
        from: this.configService.get('EMAIL_FROM') || 'info@mathisisplus.gr',
        subject: options.subject,
        text: options.text,
        html: options.html,
      };

      // Add attachments if provided
      if (options.attachments && options.attachments.length > 0) {
        msg.attachments = options.attachments.map(att => ({
          content: att.content.toString('base64'),
          filename: att.filename,
          type: att.contentType,
          disposition: 'attachment',
        }));
      }

      const response = await sgMail.send(msg);
      
      this.logger.log(`Email sent successfully to ${recipients.join(', ')}`);
      
      return {
        success: true,
        messageId: response[0].headers['x-message-id'],
      };
    } catch (error) {
      this.logger.error(`Failed to send email: ${error.message}`);
      if (error.response) {
        this.logger.error(`SendGrid error: ${JSON.stringify(error.response.body)}`);
      }
      throw error;
    }
  }

  async sendReportEmail(
    recipients: string[],
    reportType: string,
    reportBuffer: Buffer,
    format: string,
    subject?: string,
    message?: string,
  ) {
    const defaultSubject = `${reportType} Report - ${new Date().toLocaleDateString()}`;
    const defaultMessage = `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #4F46E5;">Supercurriculum Report</h2>
            <p>Please find attached your ${reportType.toLowerCase()} report.</p>
            ${message ? `<p>${message}</p>` : ''}
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
              <p style="color: #666; font-size: 12px;">
                This is an automated message from Supercurriculum. Please do not reply to this email.
              </p>
            </div>
          </div>
        </body>
      </html>
    `;

    const filename = `${reportType.toLowerCase()}_report_${new Date().toISOString().split('T')[0]}.${format.toLowerCase()}`;
    const contentType = this.getContentType(format);

    return this.sendEmail({
      to: recipients,
      subject: subject || defaultSubject,
      html: defaultMessage,
      attachments: [
        {
          filename,
          content: reportBuffer,
          contentType,
        },
      ],
    });
  }

  private getContentType(format: string): string {
    switch (format.toUpperCase()) {
      case 'PDF':
        return 'application/pdf';
      case 'CSV':
        return 'text/csv';
      case 'EXCEL':
        return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      default:
        return 'application/octet-stream';
    }
  }
}


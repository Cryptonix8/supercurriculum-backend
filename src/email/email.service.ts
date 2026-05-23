import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';

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
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private configService: ConfigService) {
    this.initializeTransporter();
  }

  /**
   * Initialize email transporter
   */
  private initializeTransporter() {
    const emailUser = this.configService.get('EMAIL_USER');
    const emailPass = this.configService.get('EMAIL_PASSWORD');
    
    // If no email configuration, use a test account (development only)
    if (!emailUser || !emailPass || emailUser.trim() === '' || emailPass.trim() === '') {
      this.logger.warn('No email configuration found. Email functionality will use test mode when needed.');
      // Don't create test account immediately - do it lazily when first email is sent
      return;
    }

    const emailConfig = {
      host: this.configService.get('EMAIL_HOST') || 'smtp.gmail.com',
      port: parseInt(this.configService.get('EMAIL_PORT') || '587'),
      secure: this.configService.get('EMAIL_SECURE') === 'true',
      auth: {
        user: emailUser,
        pass: emailPass,
      },
    };

    this.transporter = nodemailer.createTransport(emailConfig);
    
    // Verify connection asynchronously (don't block startup)
    this.transporter.verify()
      .then(() => {
        this.logger.log('✅ Email transporter is ready');
      })
      .catch((error) => {
        this.logger.warn(`Email transporter verification failed: ${error.message}`);
        this.logger.warn('Email functionality may not work. Please check your email configuration.');
      });
  }

  /**
   * Create test account for development
   */
  private async createTestAccount() {
    try {
      const testAccount = await nodemailer.createTestAccount();
      this.transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });
      this.logger.log(`Test email account created: ${testAccount.user}`);
    } catch (error) {
      this.logger.error('Failed to create test email account');
    }
  }

  /**
   * Send email
   */
  async sendEmail(options: EmailOptions): Promise<any> {
    try {
      // If transporter not initialized, try to create test account
      if (!this.transporter) {
        this.logger.warn('Transporter not initialized. Creating test account...');
        await this.createTestAccount();
        
        if (!this.transporter) {
          throw new Error('Email transporter could not be initialized');
        }
      }

      const recipients = Array.isArray(options.to) ? options.to.join(', ') : options.to;
      
      const mailOptions = {
        from: this.configService.get('EMAIL_FROM') || 'Supercurriculum <noreply@supercurriculum.com>',
        to: recipients,
        subject: options.subject,
        text: options.text,
        html: options.html,
        attachments: options.attachments,
      };

      const info = await this.transporter.sendMail(mailOptions);
      
      this.logger.log(`Email sent to ${recipients}: ${info.messageId}`);
      
      // If using test account, log preview URL
      if (nodemailer.getTestMessageUrl(info)) {
        this.logger.log(`Preview URL: ${nodemailer.getTestMessageUrl(info)}`);
      }

      return {
        success: true,
        messageId: info.messageId,
        previewUrl: nodemailer.getTestMessageUrl(info),
      };
    } catch (error) {
      this.logger.error(`Failed to send email: ${error.message}`);
      throw error;
    }
  }

  /**
   * Send report email
   */
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

  /**
   * Send parent-friendly report email
   */
  async sendParentReportEmail(
    parentEmail: string,
    studentName: string,
    reportBuffer: Buffer,
    teacherMessage?: string,
  ) {
    const subject = `${studentName}'s Progress Report`;
    const html = `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0;">
              <h1 style="margin: 0;">Progress Report</h1>
              <p style="margin: 10px 0 0 0; opacity: 0.9;">For ${studentName}</p>
            </div>
            
            <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px;">
              <p>Dear Parent/Guardian,</p>
              
              <p>We're pleased to share ${studentName}'s progress report with you. This report provides insights into their learning journey and achievements.</p>
              
              ${teacherMessage ? `
                <div style="background: white; padding: 20px; border-left: 4px solid #4F46E5; margin: 20px 0;">
                  <h3 style="margin-top: 0; color: #4F46E5;">Message from the Teacher</h3>
                  <p>${teacherMessage}</p>
                </div>
              ` : ''}
              
              <p>Please find the detailed report attached as a PDF.</p>
              
              <div style="margin-top: 30px; padding: 20px; background: #EEF2FF; border-radius: 8px;">
                <h4 style="margin-top: 0; color: #4F46E5;">📚 Supporting Learning at Home</h4>
                <ul style="margin: 10px 0;">
                  <li>Set aside 15-20 minutes daily for practice</li>
                  <li>Encourage completion of assigned activities</li>
                  <li>Celebrate progress and achievements</li>
                  <li>Maintain regular communication with teachers</li>
                </ul>
              </div>
              
              <p style="margin-top: 30px;">If you have any questions or would like to discuss your child's progress, please don't hesitate to contact us.</p>
              
              <p>Best regards,<br/>
              <strong>Supercurriculum Team</strong></p>
            </div>
            
            <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee; text-align: center;">
              <p style="color: #666; font-size: 12px;">
                This is an automated message from Supercurriculum.
              </p>
            </div>
          </div>
        </body>
      </html>
    `;

    return this.sendEmail({
      to: parentEmail,
      subject,
      html,
      attachments: [
        {
          filename: `${studentName.replace(/\s+/g, '_')}_progress_report.pdf`,
          content: reportBuffer,
          contentType: 'application/pdf',
        },
      ],
    });
  }

  /**
   * Send scheduled report notification
   */
  async sendScheduledReportNotification(
    recipients: string[],
    reportType: string,
    frequency: string,
  ) {
    const subject = `Scheduled Report: ${reportType}`;
    const html = `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #4F46E5;">Scheduled Report Confirmation</h2>
            <p>Your ${frequency.toLowerCase()} ${reportType.toLowerCase()} report has been scheduled successfully.</p>
            <p>You will receive reports automatically according to the schedule you set up.</p>
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
              <p style="color: #666; font-size: 12px;">
                To manage your scheduled reports, please log in to your Supercurriculum dashboard.
              </p>
            </div>
          </div>
        </body>
      </html>
    `;

    return this.sendEmail({
      to: recipients,
      subject,
      html,
    });
  }

  /**
   * Get content type for format
   */
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


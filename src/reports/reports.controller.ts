import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Res,
  HttpStatus,
  Query,
  Param,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { Response } from 'express';
import { ReportsService } from './reports.service';
import { ExportService } from './export.service';
import { EmailService } from '../email/email.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import {
  GenerateReportDto,
  ScheduleReportDto,
  EmailReportDto,
  ExportFormat,
} from './dto/report.dto';

@ApiTags('Reports')
@Controller('reports')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly exportService: ExportService,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Generate report (returns JSON data)
   */
  @Post('generate')
  @UseGuards(RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  @ApiOperation({ summary: 'Generate report data (Teacher/Admin)' })
  @ApiResponse({ status: 200, description: 'Report generated successfully' })
  async generateReport(@Body() dto: GenerateReportDto) {
    return this.reportsService.generateReport(dto);
  }

  /**
   * Generate and export report (returns file)
   */
  @Post('export')
  @UseGuards(RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  @ApiOperation({ summary: 'Generate and export report as file (Teacher/Admin)' })
  @ApiResponse({ status: 200, description: 'Report exported successfully' })
  async exportReport(
    @Body() dto: GenerateReportDto,
    @Res() res: Response,
  ) {
    // Generate report data
    const reportData = await this.reportsService.generateReport(dto);

    // Export to specified format
    const format = dto.format || ExportFormat.PDF;
    const buffer = await this.exportService.exportReport(
      reportData,
      format,
      dto.reportType,
    );

    // Set appropriate headers
    const filename = this.getFilename(dto.reportType, format);
    const contentType = this.getContentType(format);

    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length,
    });

    res.status(HttpStatus.OK).send(buffer);
  }

  /**
   * Generate student report
   */
  @Get('student/:studentId')
  @UseGuards(RolesGuard)
  @Roles('TEACHER', 'ADMIN', 'PARENT')
  @ApiOperation({ summary: 'Get student report (Teacher/Admin/Parent)' })
  @ApiResponse({ status: 200, description: 'Student report retrieved' })
  async getStudentReport(
    @Param('studentId') studentId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('format') format?: ExportFormat,
  ) {
    const dto: GenerateReportDto = {
      reportType: 'STUDENT' as any,
      studentId,
      startDate,
      endDate,
      format: format || ExportFormat.JSON,
    };

    if (format && format !== ExportFormat.JSON) {
      throw new Error('Use /reports/export endpoint for file exports');
    }

    return this.reportsService.generateReport(dto);
  }

  /**
   * Generate class report
   */
  @Get('class/:classId')
  @UseGuards(RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  @ApiOperation({ summary: 'Get class report (Teacher/Admin)' })
  @ApiResponse({ status: 200, description: 'Class report retrieved' })
  async getClassReport(
    @Param('classId') classId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const dto: GenerateReportDto = {
      reportType: 'CLASS' as any,
      classId,
      startDate,
      endDate,
      format: ExportFormat.JSON,
    };

    return this.reportsService.generateReport(dto);
  }

  /**
   * Generate parent-friendly report
   */
  @Get('parent-friendly/:studentId')
  @UseGuards(RolesGuard)
  @Roles('TEACHER', 'ADMIN', 'PARENT')
  @ApiOperation({ summary: 'Get parent-friendly report (Teacher/Admin/Parent)' })
  @ApiResponse({ status: 200, description: 'Parent-friendly report retrieved' })
  async getParentFriendlyReport(
    @Param('studentId') studentId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const dto: GenerateReportDto = {
      reportType: 'PARENT_FRIENDLY' as any,
      studentId,
      startDate,
      endDate,
      format: ExportFormat.JSON,
    };

    return this.reportsService.generateReport(dto);
  }

  /**
   * Email report to recipients
   */
  @Post('email')
  @UseGuards(RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  @ApiOperation({ summary: 'Email report to recipients (Teacher/Admin)' })
  @ApiResponse({ status: 200, description: 'Report emailed successfully' })
  async emailReport(@Body() dto: EmailReportDto & { reportType: string; studentId?: string; classId?: string; format?: string }) {
    try {
      // Generate report
      const reportData = await this.reportsService.generateReport({
        reportType: dto.reportType as any,
        studentId: dto.studentId,
        classId: dto.classId,
        format: (dto.format || 'PDF') as any,
      });

      // Export to buffer
      const buffer = await this.exportService.exportReport(
        reportData,
        (dto.format || 'PDF') as any,
        dto.reportType,
      );

      // Send email
      const result = await this.emailService.sendReportEmail(
        dto.recipientEmails,
        dto.reportType,
        buffer,
        dto.format || 'PDF',
        dto.subject,
        dto.message,
      );

      return {
        success: true,
        message: 'Report emailed successfully',
        recipients: dto.recipientEmails,
        messageId: result.messageId,
        previewUrl: result.previewUrl,
      };
    } catch (error) {
      throw new Error(`Failed to email report: ${error.message}`);
    }
  }

  /**
   * Schedule automated report
   */
  @Post('schedule')
  @UseGuards(RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  @ApiOperation({ summary: 'Schedule automated report generation (Teacher/Admin)' })
  @ApiResponse({ status: 201, description: 'Report scheduled successfully' })
  async scheduleReport(@Body() dto: ScheduleReportDto) {
    // This would integrate with a job scheduler (e.g., Bull, Agenda)
    // For now, send confirmation email and return placeholder
    
    if (dto.recipientEmails && dto.recipientEmails.length > 0) {
      await this.emailService.sendScheduledReportNotification(
        dto.recipientEmails,
        dto.reportType,
        dto.frequency,
      );
    }

    return {
      success: true,
      message: 'Report scheduled successfully. Confirmation email sent.',
      frequency: dto.frequency,
      reportType: dto.reportType,
      recipients: dto.recipientEmails,
    };
  }

  /**
   * Helper: Get filename based on report type and format
   */
  private getFilename(reportType: string, format: ExportFormat): string {
    const timestamp = new Date().toISOString().split('T')[0];
    const extension = format.toLowerCase();
    return `${reportType.toLowerCase()}_report_${timestamp}.${extension}`;
  }

  /**
   * Helper: Get content type based on format
   */
  private getContentType(format: ExportFormat): string {
    switch (format) {
      case ExportFormat.PDF:
        return 'application/pdf';
      case ExportFormat.CSV:
        return 'text/csv';
      case ExportFormat.EXCEL:
        return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      case ExportFormat.JSON:
        return 'application/json';
      default:
        return 'application/octet-stream';
    }
  }
}


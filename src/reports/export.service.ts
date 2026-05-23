import { Injectable, Logger } from '@nestjs/common';
import {
  StudentReportData,
  ClassReportData,
  ParentFriendlyReportData,
  ExportFormat,
} from './dto/report.dto';
import * as PDFDocument from 'pdfkit';
import { Writable } from 'stream';

@Injectable()
export class ExportService {
  private readonly logger = new Logger(ExportService.name);

  /**
   * Export report in specified format
   */
  async exportReport(
    reportData: any,
    format: ExportFormat,
    reportType: string,
  ): Promise<Buffer> {
    this.logger.log(`Exporting ${reportType} report as ${format}`);

    switch (format) {
      case ExportFormat.PDF:
        return this.exportToPDF(reportData, reportType);
      case ExportFormat.CSV:
        return this.exportToCSV(reportData, reportType);
      case ExportFormat.EXCEL:
        return this.exportToExcel(reportData, reportType);
      case ExportFormat.JSON:
        return Buffer.from(JSON.stringify(reportData, null, 2));
      default:
        throw new Error('Unsupported export format');
    }
  }

  /**
   * Export to PDF
   */
  private async exportToPDF(reportData: any, reportType: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const doc = new PDFDocument({ margin: 50 });

      // Collect PDF chunks
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Generate PDF based on report type
      if (reportType === 'STUDENT') {
        this.generateStudentPDF(doc, reportData as StudentReportData);
      } else if (reportType === 'CLASS') {
        this.generateClassPDF(doc, reportData as ClassReportData);
      } else if (reportType === 'PARENT_FRIENDLY') {
        this.generateParentFriendlyPDF(doc, reportData as ParentFriendlyReportData);
      } else {
        this.generateCustomPDF(doc, reportData);
      }

      doc.end();
    });
  }

  /**
   * Generate Student Report PDF
   */
  private generateStudentPDF(doc: typeof PDFDocument, data: StudentReportData) {
    // Header
    doc
      .fontSize(24)
      .text('Student Progress Report', { align: 'center' })
      .moveDown();

    doc
      .fontSize(16)
      .text(`${data.student.firstName} ${data.student.lastName}`)
      .fontSize(12)
      .text(`Year Group: ${data.student.yearGroup}`)
      .text(`Email: ${data.student.email}`)
      .moveDown();

    // Overall Progress Section
    doc
      .fontSize(18)
      .text('Overall Progress', { underline: true })
      .moveDown(0.5);

    doc
      .fontSize(12)
      .text(`Average Score: ${data.overallProgress.averageScore.toFixed(1)}%`)
      .text(`Completion Rate: ${data.overallProgress.completionRate.toFixed(1)}%`)
      .text(`Activities Completed: ${data.overallProgress.totalActivitiesCompleted}`)
      .text(`Week Streak: ${data.overallProgress.weekStreak} weeks`)
      .moveDown();

    // Subject Breakdown
    doc
      .fontSize(18)
      .text('Subject Breakdown', { underline: true })
      .moveDown(0.5);

    data.subjectBreakdown.forEach((subject) => {
      doc
        .fontSize(14)
        .text(subject.subjectName, { continued: true })
        .fontSize(12)
        .text(` - ${subject.averageScore.toFixed(1)}%`)
        .fontSize(10)
        .text(`  Mastery Level: ${subject.masteryLevel}`)
        .text(`  Activities: ${subject.activitiesCompleted}`)
        .text(`  Time Spent: ${subject.timeSpent} minutes`)
        .moveDown(0.5);
    });

    // Diagnostic Tests
    if (data.diagnosticTests.length > 0) {
      doc.addPage();
      doc
        .fontSize(18)
        .text('Diagnostic Test Results', { underline: true })
        .moveDown(0.5);

      data.diagnosticTests.forEach((test) => {
        doc
          .fontSize(14)
          .text(test.testName)
          .fontSize(12)
          .text(`Date: ${new Date(test.date).toLocaleDateString()}`)
          .text(`Score: ${test.score}%`)
          .moveDown(0.5);
      });
    }

    // Areas Needing Attention
    if (data.areasNeedingAttention.length > 0) {
      doc.addPage();
      doc
        .fontSize(18)
        .text('Areas Needing Attention', { underline: true })
        .moveDown(0.5);

      data.areasNeedingAttention.forEach((area) => {
        doc
          .fontSize(14)
          .text(`${area.subjectName} - ${area.skillName}`)
          .fontSize(12)
          .text(`Current Level: ${area.currentLevel}`)
          .text(`Recommendation: ${area.recommendation}`)
          .moveDown(0.5);
      });
    }

    // Engagement Metrics
    doc.addPage();
    doc
      .fontSize(18)
      .text('Engagement Metrics', { underline: true })
      .moveDown(0.5);

    doc
      .fontSize(12)
      .text(`Total Time Spent: ${data.engagement.totalTimeSpent} minutes`)
      .text(`Average Session: ${data.engagement.averageSessionDuration.toFixed(1)} minutes`)
      .text(`Last Active: ${new Date(data.engagement.lastActive).toLocaleDateString()}`)
      .text(`Login Frequency: ${data.engagement.loginFrequency} sessions`)
      .moveDown();

    // Teacher Comments
    if (data.teacherComments.length > 0) {
      doc.addPage();
      doc
        .fontSize(18)
        .text('Teacher Comments', { underline: true })
        .moveDown(0.5);

      data.teacherComments.forEach((comment) => {
        doc
          .fontSize(12)
          .text(`Date: ${new Date(comment.date).toLocaleDateString()}`)
          .fontSize(11)
          .text(`Category: ${comment.category}`)
          .text(comment.comment, { indent: 20 })
          .moveDown(0.5);
      });
    }

    // Achievements
    if (data.achievements.length > 0) {
      doc.addPage();
      doc
        .fontSize(18)
        .text('Achievements', { underline: true })
        .moveDown(0.5);

      data.achievements.forEach((achievement) => {
        doc
          .fontSize(12)
          .text(`🏆 ${achievement.badgeName}`)
          .fontSize(10)
          .text(`Earned: ${new Date(achievement.earnedAt).toLocaleDateString()}`)
          .text(achievement.description, { indent: 20 })
          .moveDown(0.5);
      });
    }

    // Footer
    doc
      .fontSize(10)
      .text(
        `Generated on ${new Date().toLocaleDateString()}`,
        50,
        doc.page.height - 50,
        { align: 'center' },
      );
  }

  /**
   * Generate Class Report PDF
   */
  private generateClassPDF(doc: typeof PDFDocument, data: ClassReportData) {
    // Header
    doc
      .fontSize(24)
      .text('Class Performance Report', { align: 'center' })
      .moveDown();

    doc
      .fontSize(16)
      .text(data.class.name)
      .fontSize(12)
      .text(`Year Group: ${data.class.yearGroup}`)
      .text(`Total Students: ${data.class.totalStudents}`)
      .moveDown();

    // Performance Overview
    doc
      .fontSize(18)
      .text('Performance Overview', { underline: true })
      .moveDown(0.5);

    doc
      .fontSize(12)
      .text(`Average Score: ${data.performanceOverview.averageScore.toFixed(1)}%`)
      .text(`Completion Rate: ${data.performanceOverview.averageCompletionRate.toFixed(1)}%`)
      .text(`Activities Completed: ${data.performanceOverview.totalActivitiesCompleted}`)
      .text(`Engagement Score: ${data.performanceOverview.averageEngagementScore.toFixed(1)}%`)
      .moveDown();

    // Subject Comparison
    doc
      .fontSize(18)
      .text('Subject Comparison', { underline: true })
      .moveDown(0.5);

    data.subjectComparison.forEach((subject) => {
      doc
        .fontSize(14)
        .text(subject.subjectName)
        .fontSize(12)
        .text(`Average: ${subject.averageScore.toFixed(1)}%`)
        .text(`Struggling: ${subject.studentsStruggling} students`)
        .text(`Excelling: ${subject.studentsExcelling} students`)
        .moveDown(0.5);
    });

    // Top Performers
    doc.addPage();
    doc
      .fontSize(18)
      .text('Top Performers', { underline: true })
      .moveDown(0.5);

    data.topPerformers.forEach((student, index) => {
      doc
        .fontSize(12)
        .text(`${index + 1}. ${student.studentName}`)
        .fontSize(10)
        .text(`   Score: ${student.averageScore.toFixed(1)}% | Completion: ${student.completionRate.toFixed(1)}%`)
        .moveDown(0.3);
    });

    // Students At Risk
    doc
      .fontSize(18)
      .text('Students Needing Support', { underline: true })
      .moveDown(0.5);

    data.studentsAtRisk.forEach((student) => {
      doc
        .fontSize(12)
        .text(student.studentName)
        .fontSize(10)
        .text(`   Score: ${student.averageScore.toFixed(1)}%`)
        .text(`   Concerns: ${student.areasOfConcern.join(', ')}`)
        .moveDown(0.3);
    });

    // Footer
    doc
      .fontSize(10)
      .text(
        `Generated on ${new Date().toLocaleDateString()}`,
        50,
        doc.page.height - 50,
        { align: 'center' },
      );
  }

  /**
   * Generate Parent-Friendly Report PDF
   */
  private generateParentFriendlyPDF(doc: typeof PDFDocument, data: ParentFriendlyReportData) {
    // Header with friendly design
    doc
      .fontSize(24)
      .fillColor('#4F46E5')
      .text('Student Progress Report', { align: 'center' })
      .fillColor('#000000')
      .moveDown();

    doc
      .fontSize(18)
      .text(`${data.student.firstName} ${data.student.lastName}`)
      .fontSize(12)
      .text(`Year Group: ${data.student.yearGroup}`)
      .moveDown();

    // Overall Status - Large and prominent
    const statusColor = data.overallStatus === 'Strong' ? '#10B981' : data.overallStatus === 'On Track' ? '#3B82F6' : '#F59E0B';
    doc
      .fontSize(20)
      .fillColor(statusColor)
      .text(`Overall Status: ${data.overallStatus}`, { align: 'center' })
      .fillColor('#000000')
      .moveDown();

    // Summary
    doc
      .fontSize(14)
      .text(data.summary, { align: 'justify' })
      .moveDown();

    // Subjects - Color-coded
    doc
      .fontSize(18)
      .text('Subject Progress', { underline: true })
      .moveDown(0.5);

    data.subjects.forEach((subject) => {
      const color = subject.status === 'Strong' ? '#10B981' : subject.status === 'On Track' ? '#3B82F6' : '#F59E0B';
      doc
        .fontSize(14)
        .text(`${subject.icon} ${subject.name}`, { continued: true })
        .fillColor(color)
        .text(` - ${subject.status}`)
        .fillColor('#000000')
        .fontSize(11)
        .text(subject.description, { indent: 20 })
        .moveDown(0.5);
    });

    // Key Achievements
    if (data.keyAchievements.length > 0) {
      doc.addPage();
      doc
        .fontSize(18)
        .fillColor('#10B981')
        .text('✨ Key Achievements', { underline: true })
        .fillColor('#000000')
        .moveDown(0.5);

      data.keyAchievements.forEach((achievement) => {
        doc
          .fontSize(12)
          .text(`• ${achievement}`)
          .moveDown(0.3);
      });
      doc.moveDown();
    }

    // Areas for Growth
    if (data.areasForGrowth.length > 0) {
      doc
        .fontSize(18)
        .fillColor('#F59E0B')
        .text('📈 Areas for Growth', { underline: true })
        .fillColor('#000000')
        .moveDown(0.5);

      data.areasForGrowth.forEach((area) => {
        doc
          .fontSize(12)
          .text(`• ${area.area}`)
          .fontSize(10)
          .text(area.suggestion, { indent: 20 })
          .moveDown(0.3);
      });
      doc.moveDown();
    }

    // What You Can Do at Home
    doc.addPage();
    doc
      .fontSize(18)
      .fillColor('#3B82F6')
      .text('🏠 What You Can Do at Home', { underline: true })
      .fillColor('#000000')
      .moveDown(0.5);

    doc.fontSize(14).text('Recommendations:', { underline: true }).moveDown(0.3);
    data.homeSupport.recommendations.forEach((rec) => {
      doc.fontSize(11).text(`• ${rec}`).moveDown(0.2);
    });
    doc.moveDown();

    doc.fontSize(14).text('Helpful Resources:', { underline: true }).moveDown(0.3);
    data.homeSupport.resources.forEach((resource) => {
      doc
        .fontSize(12)
        .text(resource.title, { underline: true })
        .fontSize(10)
        .text(resource.description, { indent: 20 })
        .moveDown(0.3);
    });
    doc.moveDown();

    // Next Steps
    doc
      .fontSize(18)
      .text('Next Steps', { underline: true })
      .moveDown(0.5);

    data.nextSteps.forEach((step) => {
      doc.fontSize(11).text(`• ${step}`).moveDown(0.2);
    });
    doc.moveDown();

    // Teacher Message
    doc.addPage();
    doc
      .fontSize(18)
      .text('Message from Your Teacher', { underline: true })
      .moveDown(0.5);

    doc
      .fontSize(12)
      .text(data.teacherMessage, { align: 'justify' })
      .moveDown();

    // Footer
    doc
      .fontSize(10)
      .fillColor('#666666')
      .text(
        `This report was generated on ${new Date().toLocaleDateString()}`,
        50,
        doc.page.height - 50,
        { align: 'center' },
      );
  }

  /**
   * Generate Custom Report PDF
   */
  private generateCustomPDF(doc: typeof PDFDocument, data: any) {
    doc
      .fontSize(24)
      .text('Custom Report', { align: 'center' })
      .moveDown();

    doc
      .fontSize(12)
      .text(JSON.stringify(data, null, 2))
      .moveDown();
  }

  /**
   * Export to CSV
   */
  private async exportToCSV(reportData: any, reportType: string): Promise<Buffer> {
    let csvContent = '';

    if (reportType === 'STUDENT') {
      const data = reportData as StudentReportData;
      csvContent = this.generateStudentCSV(data);
    } else if (reportType === 'CLASS') {
      const data = reportData as ClassReportData;
      csvContent = this.generateClassCSV(data);
    } else {
      csvContent = this.generateGenericCSV(reportData);
    }

    return Buffer.from(csvContent, 'utf-8');
  }

  private generateStudentCSV(data: StudentReportData): string {
    let csv = 'Student Report\n\n';
    csv += 'Student Name,Year Group,Email\n';
    csv += `"${data.student.firstName} ${data.student.lastName}","${data.student.yearGroup}","${data.student.email}"\n\n`;

    csv += 'Overall Progress\n';
    csv += 'Metric,Value\n';
    csv += `Average Score,${data.overallProgress.averageScore}\n`;
    csv += `Completion Rate,${data.overallProgress.completionRate}\n`;
    csv += `Activities Completed,${data.overallProgress.totalActivitiesCompleted}\n`;
    csv += `Week Streak,${data.overallProgress.weekStreak}\n\n`;

    csv += 'Subject Breakdown\n';
    csv += 'Subject,Average Score,Mastery Level,Activities,Time Spent\n';
    data.subjectBreakdown.forEach((subject) => {
      csv += `"${subject.subjectName}",${subject.averageScore},"${subject.masteryLevel}",${subject.activitiesCompleted},${subject.timeSpent}\n`;
    });

    return csv;
  }

  private generateClassCSV(data: ClassReportData): string {
    let csv = 'Class Report\n\n';
    csv += 'Class Name,Year Group,Total Students\n';
    csv += `"${data.class.name}","${data.class.yearGroup}",${data.class.totalStudents}\n\n`;

    csv += 'Performance Overview\n';
    csv += 'Metric,Value\n';
    csv += `Average Score,${data.performanceOverview.averageScore}\n`;
    csv += `Completion Rate,${data.performanceOverview.averageCompletionRate}\n`;
    csv += `Activities Completed,${data.performanceOverview.totalActivitiesCompleted}\n\n`;

    csv += 'Subject Comparison\n';
    csv += 'Subject,Average Score,Students Struggling,Students Excelling\n';
    data.subjectComparison.forEach((subject) => {
      csv += `"${subject.subjectName}",${subject.averageScore},${subject.studentsStruggling},${subject.studentsExcelling}\n`;
    });

    return csv;
  }

  private generateGenericCSV(data: any): string {
    return JSON.stringify(data, null, 2);
  }

  /**
   * Export to Excel (simplified - returns CSV for now, can be enhanced with xlsx library)
   */
  private async exportToExcel(reportData: any, reportType: string): Promise<Buffer> {
    // For now, return CSV format
    // In production, use 'xlsx' library to generate proper Excel files
    return this.exportToCSV(reportData, reportType);
  }
}


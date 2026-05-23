import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ExportService } from './export.service';
import { ReportsController } from './reports.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [PrismaModule, EmailModule],
  providers: [ReportsService, ExportService],
  controllers: [ReportsController],
  exports: [ReportsService, ExportService],
})
export class ReportsModule {}


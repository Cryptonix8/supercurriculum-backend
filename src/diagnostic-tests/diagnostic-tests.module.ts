import { Module } from '@nestjs/common';
import { DiagnosticTestsService } from './diagnostic-tests.service';
import { DiagnosticTestsController } from './diagnostic-tests.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [DiagnosticTestsService],
  controllers: [DiagnosticTestsController],
  exports: [DiagnosticTestsService],
})
export class DiagnosticTestsModule {}


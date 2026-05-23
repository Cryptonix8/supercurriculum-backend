import { Module } from '@nestjs/common';
import { AutoInitService } from './auto-init.service';
import { AutoInitController } from './auto-init.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { CurriculumPdfParserModule } from '../curriculum-parser/curriculum-pdf-parser.module';
import { ActivityGenerationModule } from '../activity-generation/activity-generation.module';

@Module({
  imports: [
    PrismaModule,
    CurriculumPdfParserModule,
    ActivityGenerationModule,
  ],
  controllers: [AutoInitController],
  providers: [AutoInitService],
  exports: [AutoInitService],
})
export class AutoInitModule {}

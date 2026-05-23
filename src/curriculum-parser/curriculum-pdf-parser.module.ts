import { Module } from '@nestjs/common';
import { CurriculumPdfParserService } from './curriculum-pdf-parser.service';
import { CurriculumPdfParserController } from './curriculum-pdf-parser.controller';
import { GreekCurriculumParserService } from './greek-curriculum-parser.service';
import { GreekCurriculumParserController } from './greek-curriculum-parser.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { ActivityGenerationModule } from '../activity-generation/activity-generation.module';

@Module({
  imports: [PrismaModule, ConfigModule, ActivityGenerationModule],
  controllers: [CurriculumPdfParserController, GreekCurriculumParserController],
  providers: [CurriculumPdfParserService, GreekCurriculumParserService],
  exports: [CurriculumPdfParserService, GreekCurriculumParserService],
})
export class CurriculumPdfParserModule {}


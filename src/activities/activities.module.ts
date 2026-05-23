import { Module } from '@nestjs/common';
import { ActivitiesService } from './activities.service';
import { ActivitiesController } from './activities.controller';
import { ActivityPdfParserService } from './activity-pdf-parser.service';
import { CleanupService } from './cleanup.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [ActivitiesService, ActivityPdfParserService, CleanupService],
  controllers: [ActivitiesController],
  exports: [ActivitiesService, ActivityPdfParserService, CleanupService],
})
export class ActivitiesModule {}


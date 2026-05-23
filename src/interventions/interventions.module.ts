import { Module } from '@nestjs/common';
import { InterventionsService } from './interventions.service';
import { InterventionsManagementService } from './interventions-management.service';
import { MiniAssessmentsService } from './mini-assessments.service';
import { InterventionsController } from './interventions.controller';
import { InterventionsManagementController } from './interventions-management.controller';

@Module({
  providers: [
    InterventionsService,
    InterventionsManagementService,
    MiniAssessmentsService,
  ],
  controllers: [InterventionsController, InterventionsManagementController],
  exports: [
    InterventionsService,
    InterventionsManagementService,
    MiniAssessmentsService,
  ],
})
export class InterventionsModule {}


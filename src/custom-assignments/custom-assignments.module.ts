import { Module } from '@nestjs/common';
import { CustomAssignmentsService } from './custom-assignments.service';
import { CustomAssignmentsController } from './custom-assignments.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [PrismaModule, AiModule],
  providers: [CustomAssignmentsService],
  controllers: [CustomAssignmentsController],
  exports: [CustomAssignmentsService],
})
export class CustomAssignmentsModule {}


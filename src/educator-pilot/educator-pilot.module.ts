import { Module } from '@nestjs/common';
import { EducatorPilotController } from './educator-pilot.controller';
import { EducatorPilotService } from './educator-pilot.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [EducatorPilotController],
  providers: [EducatorPilotService],
  exports: [EducatorPilotService],
})
export class EducatorPilotModule {}

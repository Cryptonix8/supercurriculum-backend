import { Module } from '@nestjs/common';
import { SupercurriculumService } from './supercurriculum.service';
import { SupercurriculumController } from './supercurriculum.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SupercurriculumController],
  providers: [SupercurriculumService],
  exports: [SupercurriculumService],
})
export class SupercurriculumModule {}


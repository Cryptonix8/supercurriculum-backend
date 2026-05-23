import { Module } from '@nestjs/common';
import { TeacherControlsService } from './teacher-controls.service';
import { TeacherControlsController } from './teacher-controls.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [TeacherControlsController],
  providers: [TeacherControlsService],
  exports: [TeacherControlsService],
})
export class TeacherControlsModule {}


import { Module, forwardRef } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { ClassesService } from './classes.service';
import { ClassesController } from './classes.controller';
import { StudentsService } from './students.service';
import { StudentsController } from './students.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { UploadsModule } from '../uploads/uploads.module';
import { ActivityGenerationModule } from '../activity-generation/activity-generation.module';
import { WeeklyPlansModule } from '../weekly-plans/weekly-plans.module';

@Module({
  imports: [
    PrismaModule, 
    UploadsModule, 
    forwardRef(() => ActivityGenerationModule),
    forwardRef(() => WeeklyPlansModule),
  ],
  providers: [UsersService, ClassesService, StudentsService],
  controllers: [UsersController, ClassesController, StudentsController],
  exports: [UsersService, ClassesService, StudentsService],
})
export class UsersModule {}


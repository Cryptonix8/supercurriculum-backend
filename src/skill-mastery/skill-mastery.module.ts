import { Module } from '@nestjs/common';
import { SkillMasteryService } from './skill-mastery.service';
import { SkillMasteryController } from './skill-mastery.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SkillMasteryController],
  providers: [SkillMasteryService],
  exports: [SkillMasteryService],
})
export class SkillMasteryModule {}


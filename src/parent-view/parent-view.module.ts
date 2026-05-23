import { Module } from '@nestjs/common';
import { ParentViewService } from './parent-view.service';
import { ParentViewController } from './parent-view.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ParentViewController],
  providers: [ParentViewService],
  exports: [ParentViewService],
})
export class ParentViewModule {}


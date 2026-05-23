import { Module } from '@nestjs/common';
import { YearsService } from './years.service';
import { YearsController } from './years.controller';

@Module({
  providers: [YearsService],
  controllers: [YearsController],
  exports: [YearsService],
})
export class YearsModule {}


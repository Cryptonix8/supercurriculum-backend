import { Module } from '@nestjs/common';
import { SystemInfoService } from './system-info.service';
import { SystemInfoController } from './system-info.controller';

@Module({
  providers: [SystemInfoService],
  controllers: [SystemInfoController],
  exports: [SystemInfoService],
})
export class SystemInfoModule {}


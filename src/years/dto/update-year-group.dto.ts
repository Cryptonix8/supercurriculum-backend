import { PartialType } from '@nestjs/swagger';
import { CreateYearGroupDto } from './create-year-group.dto';

export class UpdateYearGroupDto extends PartialType(CreateYearGroupDto) {}


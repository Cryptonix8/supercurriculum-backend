import { PartialType } from '@nestjs/swagger';
import { CreateInterventionDto } from './create-intervention.dto';

export class UpdateInterventionDto extends PartialType(CreateInterventionDto) {}


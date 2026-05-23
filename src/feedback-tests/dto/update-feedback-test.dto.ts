import { PartialType } from '@nestjs/swagger';
import { CreateFeedbackTestDto } from './create-feedback-test.dto';

export class UpdateFeedbackTestDto extends PartialType(CreateFeedbackTestDto) {}


import {
  Controller,
  Post,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
  UseGuards,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UploadsService } from './uploads.service';

@Controller('uploads')
@UseGuards(JwtAuthGuard)
export class UploadsController {
  constructor(private uploadsService: UploadsService) {}

  /**
   * Upload a single file
   * POST /api/uploads/single
   */
  @Post('single')
  @UseInterceptors(FileInterceptor('file'))
  async uploadSingle(
    @UploadedFile() file: Express.Multer.File,
    @Req() req,
  ) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    const url = await this.uploadsService.uploadFile(file, req.user.id);
    const category = this.uploadsService.getFileCategory(file.mimetype);

    return {
      success: true,
      url,
      category,
      originalName: file.originalname,
      size: file.size,
      mimeType: file.mimetype,
    };
  }

  /**
   * Upload multiple files (up to 5)
   * POST /api/uploads/multiple
   */
  @Post('multiple')
  @UseInterceptors(FilesInterceptor('files', 5))
  async uploadMultiple(
    @UploadedFiles() files: Express.Multer.File[],
    @Req() req,
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('No files provided');
    }

    const urls = await this.uploadsService.uploadMultiple(files, req.user.id);

    return {
      success: true,
      files: files.map((file, index) => ({
        url: urls[index],
        category: this.uploadsService.getFileCategory(file.mimetype),
        originalName: file.originalname,
        size: file.size,
        mimeType: file.mimetype,
      })),
    };
  }
}


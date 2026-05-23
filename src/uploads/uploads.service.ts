import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import * as path from 'path';

@Injectable()
export class UploadsService {
  private s3Client: S3Client;
  private bucketName: string;
  private useS3: boolean;

  constructor(private config: ConfigService) {
    this.useS3 = config.get('USE_S3') === 'true';
    
    if (this.useS3) {
      const region = config.get('AWS_REGION');
      const accessKeyId = config.get('AWS_ACCESS_KEY_ID');
      const secretAccessKey = config.get('AWS_SECRET_ACCESS_KEY');
      
      if (!region || !accessKeyId || !secretAccessKey) {
        console.warn('S3 credentials not configured. File uploads will fail.');
        this.useS3 = false;
      } else {
        this.s3Client = new S3Client({
          region,
          credentials: {
            accessKeyId,
            secretAccessKey,
          },
        });
        this.bucketName = config.get('AWS_S3_BUCKET');
      }
    }
  }

  /**
   * Upload a single file to S3
   */
  async uploadFile(file: Express.Multer.File, userId: string): Promise<string> {
    if (!this.useS3) {
      throw new BadRequestException('File upload service not configured');
    }

    this.validateFile(file);

    const fileExtension = path.extname(file.originalname);
    const fileName = `${userId}/${randomUUID()}${fileExtension}`;

    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: fileName,
        Body: file.buffer,
        ContentType: file.mimetype,
        ACL: 'public-read',
      });

      await this.s3Client.send(command);

      return `https://${this.bucketName}.s3.amazonaws.com/${fileName}`;
    } catch (error) {
      console.error('S3 upload error:', error);
      throw new BadRequestException('Failed to upload file');
    }
  }

  /**
   * Upload multiple files
   */
  async uploadMultiple(files: Express.Multer.File[], userId: string): Promise<string[]> {
    const uploadPromises = files.map(file => this.uploadFile(file, userId));
    return Promise.all(uploadPromises);
  }

  /**
   * Validate file type and size
   */
  validateFile(file: Express.Multer.File): boolean {
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/jpg',
      'image/gif',
      'audio/mpeg',
      'audio/wav',
      'audio/mp3',
      'audio/mp4',
      'video/mp4',
      'video/mpeg',
    ];

    const maxSize = 10 * 1024 * 1024; // 10MB

    if (!allowedTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        `Invalid file type: ${file.mimetype}. Allowed types: ${allowedTypes.join(', ')}`,
      );
    }

    if (file.size > maxSize) {
      throw new BadRequestException(
        `File too large: ${(file.size / 1024 / 1024).toFixed(2)}MB. Maximum size: 10MB`,
      );
    }

    return true;
  }

  /**
   * Get file type category
   */
  getFileCategory(mimetype: string): 'image' | 'audio' | 'video' | 'other' {
    if (mimetype.startsWith('image/')) return 'image';
    if (mimetype.startsWith('audio/')) return 'audio';
    if (mimetype.startsWith('video/')) return 'video';
    return 'other';
  }
}


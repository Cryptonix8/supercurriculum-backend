import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { whereSubjectLocale } from '../common/curriculum-locale-filter';
import { CreateSubjectDto } from './dto/create-subject.dto';
import { UpdateSubjectDto } from './dto/update-subject.dto';

@Injectable()
export class SubjectsService {
  constructor(private prisma: PrismaService) {}

  async create(createSubjectDto: CreateSubjectDto) {
    return this.prisma.subject.create({
      data: createSubjectDto,
      include: { yearGroup: true },
    });
  }

  async findAll(yearGroupId?: string, locale?: string) {
    const effectiveLocale = locale || 'en-GB';
    const localeWhere = await whereSubjectLocale(this.prisma, effectiveLocale, {
      ...(yearGroupId && { yearGroupId }),
    });
    return this.prisma.subject.findMany({
      where: localeWhere,
      orderBy: { orderIndex: 'asc' },
      include: {
        yearGroup: true,
        _count: {
          select: { skills: true, activities: true },
        },
      },
    });
  }

  async findOne(id: string) {
    const subject = await this.prisma.subject.findUnique({
      where: { id },
      include: {
        yearGroup: true,
        skills: {
          orderBy: { orderIndex: 'asc' },
        },
      },
    });

    if (!subject) {
      throw new NotFoundException(`Subject with ID ${id} not found`);
    }

    return subject;
  }

  async update(id: string, updateSubjectDto: UpdateSubjectDto) {
    await this.findOne(id);
    return this.prisma.subject.update({
      where: { id },
      data: updateSubjectDto,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.subject.update({
      where: { id },
      data: { isActive: false },
    });
  }
}


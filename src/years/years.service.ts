import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { whereYearGroupLocale } from '../common/curriculum-locale-filter';
import { CreateYearGroupDto } from './dto/create-year-group.dto';
import { UpdateYearGroupDto } from './dto/update-year-group.dto';

@Injectable()
export class YearsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Create a new year group
   */
  async create(createYearGroupDto: CreateYearGroupDto) {
    return this.prisma.yearGroup.create({
      data: createYearGroupDto,
    });
  }

  /**
   * Get all year groups
   * DB is the source of truth.
   * - locale=en-GB (or omitted): return English locale records
   * - locale=el-GR: return Greek locale records and normalize display labels to Greek
   */
  async findAll(activeOnly: boolean = true, locale?: string) {
    const effectiveLocale = locale || 'en-GB';
    const where: any = await whereYearGroupLocale(
      this.prisma,
      effectiveLocale,
      activeOnly,
    );
    const rows = await this.prisma.yearGroup.findMany({
      where,
      orderBy: { orderIndex: 'asc' },
      include: {
        _count: {
          select: { subjects: true, studentProfiles: true },
        },
      },
    });

    return rows;
  }

  /**
   * Get a single year group
   */
  async findOne(id: string) {
    const yearGroup = await this.prisma.yearGroup.findUnique({
      where: { id },
      include: {
        subjects: {
          where: { isActive: true },
          orderBy: { orderIndex: 'asc' },
        },
        _count: {
          select: { studentProfiles: true },
        },
      },
    });

    if (!yearGroup) {
      throw new NotFoundException(`Year group with ID ${id} not found`);
    }

    return yearGroup;
  }

  /**
   * Update a year group
   */
  async update(id: string, updateYearGroupDto: UpdateYearGroupDto) {
    await this.findOne(id); // Check if exists

    return this.prisma.yearGroup.update({
      where: { id },
      data: updateYearGroupDto,
    });
  }

  /**
   * Delete a year group (soft delete)
   */
  async remove(id: string) {
    await this.findOne(id); // Check if exists

    return this.prisma.yearGroup.update({
      where: { id },
      data: { isActive: false },
    });
  }
}


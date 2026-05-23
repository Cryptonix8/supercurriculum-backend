import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInterventionDto } from './dto/create-intervention.dto';
import { UpdateInterventionDto } from './dto/update-intervention.dto';

@Injectable()
export class InterventionsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Create a new intervention
   */
  async create(createInterventionDto: CreateInterventionDto) {
    // Check if intervention already exists for this combination
    const existing = await this.prisma.intervention.findUnique({
      where: {
        subjectId_skillId_band: {
          subjectId: createInterventionDto.subjectId,
          skillId: createInterventionDto.skillId,
          band: createInterventionDto.band as any,
        },
      },
    });

    if (existing) {
      throw new BadRequestException(
        'An intervention already exists for this subject, skill, and band combination',
      );
    }

    return this.prisma.intervention.create({
      data: createInterventionDto,
      include: {
        subject: true,
        skill: true,
      },
    });
  }

  /**
   * Get all interventions
   */
  async findAll(filters?: {
    subjectId?: string;
    skillId?: string;
    band?: string;
  }) {
    return this.prisma.intervention.findMany({
      where: {
        ...(filters?.subjectId && { subjectId: filters.subjectId }),
        ...(filters?.skillId && { skillId: filters.skillId }),
        ...(filters?.band && { band: filters.band as any }),
      },
      include: {
        subject: true,
        skill: true,
      },
      orderBy: [
        { subject: { orderIndex: 'asc' } },
        { skill: { orderIndex: 'asc' } },
      ],
    });
  }

  /**
   * Get intervention by ID
   */
  async findOne(id: string) {
    const intervention = await this.prisma.intervention.findUnique({
      where: { id },
      include: {
        subject: true,
        skill: true,
      },
    });

    if (!intervention) {
      throw new NotFoundException(`Intervention with ID ${id} not found`);
    }

    return intervention;
  }

  /**
   * Get intervention for specific subject, skill, and band
   */
  async getIntervention(subjectId: string, skillId: string, band: string) {
    const intervention = await this.prisma.intervention.findUnique({
      where: {
        subjectId_skillId_band: {
          subjectId,
          skillId,
          band: band as any,
        },
      },
      include: {
        subject: true,
        skill: true,
      },
    });

    if (!intervention) {
      throw new NotFoundException(
        `No intervention found for this subject, skill, and band combination`,
      );
    }

    return intervention;
  }

  /**
   * Get all interventions for a subject
   */
  async getInterventionsForSubject(subjectId: string) {
    return this.prisma.intervention.findMany({
      where: { subjectId },
      include: {
        subject: true,
        skill: true,
      },
      orderBy: [
        { skill: { orderIndex: 'asc' } },
        { band: 'asc' },
      ],
    });
  }

  /**
   * Update intervention
   */
  async update(id: string, updateInterventionDto: UpdateInterventionDto) {
    await this.findOne(id);

    return this.prisma.intervention.update({
      where: { id },
      data: updateInterventionDto,
      include: {
        subject: true,
        skill: true,
      },
    });
  }

  /**
   * Delete intervention
   */
  async remove(id: string) {
    await this.findOne(id);

    return this.prisma.intervention.delete({
      where: { id },
    });
  }

  /**
   * Get interventions for student's current bands
   */
  async getInterventionsForStudent(userId: string) {
    // Get student's current bands
    const studentBands = await this.prisma.studentBand.findMany({
      where: { userId },
    });

    // Get interventions for each band
    const interventions = await Promise.all(
      studentBands.map(band =>
        this.prisma.intervention.findUnique({
          where: {
            subjectId_skillId_band: {
              subjectId: band.subjectId,
              skillId: band.skillId,
              band: band.currentBand,
            },
          },
          include: {
            subject: true,
            skill: true,
          },
        }),
      ),
    );

    return interventions.filter(i => i !== null);
  }
}

import { PrismaService } from '../prisma/prisma.service';

/**
 * Year/subject catalogue is seeded for English UK curriculum (and legacy null locale rows).
 * This deployment is English-only: always resolve to en-GB (or unrestricted null) filtering.
 */
export async function whereYearGroupLocale(
  _prisma: PrismaService,
  _effectiveLocale: string,
  activeOnly: boolean,
): Promise<Record<string, unknown>> {
  const activePart = activeOnly ? { isActive: true } : {};
  return { ...activePart, OR: [{ locale: 'en-GB' }, { locale: null }] };
}

export async function whereSubjectLocale(
  _prisma: PrismaService,
  _effectiveLocale: string,
  baseWhere: { yearGroupId?: string },
): Promise<Record<string, unknown>> {
  const base = { isActive: true, ...baseWhere };
  return { ...base, OR: [{ locale: 'en-GB' }, { locale: null }] };
}

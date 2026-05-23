import * as fs from 'fs';
import * as path from 'path';

/**
 * Absolute path to the backend package root (folder containing package.json and dist/).
 * Resolved via __dirname so it stays correct under PM2, systemd, or running from arbitrary cwd.
 */
export function getBackendRoot(): string {
  return path.join(__dirname, '..', '..');
}

/**
 * Env paths like DOCS_BASE_PATH: absolute paths pass through; relative paths resolve from backend root.
 */
export function resolveFromBackendRoot(relativeOrAbsolute: string): string {
  const trimmed = relativeOrAbsolute.trim();
  if (!trimmed) {
    return getBackendRoot();
  }
  if (path.isAbsolute(trimmed)) {
    return trimmed;
  }
  return path.join(getBackendRoot(), trimmed);
}

/** Legacy repo-root `pdfs/` (sibling of backend/), used only when present and docs locale folder is absent. */
export function getLegacyRepoPdfsDir(): string {
  return path.join(getBackendRoot(), '..', 'pdfs');
}

/**
 * Directory scanned for bulk curriculum import (primary/secondary PDFs).
 *
 * Resolution order:
 * 1. CURRICULUM_BULK_PDFS_PATH (relative to backend root or absolute)
 * 2. DOCS_BASE_PATH / DOCS_EN_FOLDER if that directory exists (same folder as activity curriculum PDFs)
 * 3. Legacy ../pdfs if it exists
 * 4. Fallback: DOCS_BASE_PATH / DOCS_EN_FOLDER (expected place to put primary.pdf / secondary.pdf)
 */
export function getCurriculumBulkPdfsDir(): string {
  const explicit = process.env.CURRICULUM_BULK_PDFS_PATH?.trim();
  if (explicit) {
    return resolveFromBackendRoot(explicit);
  }

  const docsBase = process.env.DOCS_BASE_PATH?.trim() || 'docs';
  const enFolder =
    process.env.DOCS_EN_FOLDER?.trim() ||
    process.env.DOCS_EN_LOCALE_SUBFOLDER?.trim() ||
    'el-EN';
  const docsEnDir = path.join(resolveFromBackendRoot(docsBase), enFolder);

  const legacy = getLegacyRepoPdfsDir();

  if (fs.existsSync(docsEnDir)) {
    return docsEnDir;
  }
  if (fs.existsSync(legacy)) {
    return legacy;
  }
  return docsEnDir;
}

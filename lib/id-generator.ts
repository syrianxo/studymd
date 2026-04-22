/**
 * Generates stable, human-readable internal IDs for lectures.
 * Format: lec_YYYYMMDD_xxxxxx  (date prefix + 6 random hex chars)
 * Example: lec_20260420_a3f9b2
 *
 * Date prefix makes IDs roughly sortable by creation date and easier
 * to identify in logs. The 6-hex suffix gives ~16M combinations per day,
 * far more than needed.
 */
export function generateLectureInternalId(): string {
  const d = new Date();
  const date = d.toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = Array.from(crypto.getRandomValues(new Uint8Array(3)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `lec_${date}_${suffix}`;
}

/** Regex that matches both the legacy format (lec_xxxxxxxx) and the current format (lec_YYYYMMDD_xxxxxx). */
export const INTERNAL_ID_PATTERN = /^lec_[a-f0-9]{8}$|^lec_\d{8}_[a-f0-9]{6}$/;

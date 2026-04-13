/**
 * StudyMD v2 — Data Migration Script
 * Workstream 0, Step 0.3
 *
 * Migrates existing lecture JSON files and slide images from local directories
 * (downloaded from cPanel) into Supabase (database + storage).
 *
 * Usage:
 *   npx ts-node scripts/migrate.ts
 *
 * Required env vars (in .env.local or shell):
 *   SUPABASE_URL           — e.g. https://xxxxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY — from Supabase dashboard > Settings > API
 *   HALEY_USER_ID          — Haley's UUID from Supabase Auth dashboard
 *
 * Expected local directory layout (download from cPanel first):
 *   migration-data/
 *     lectures/
 *       lecture_001.json
 *       lecture_002.json
 *       ...
 *     slides/
 *       lecture_001/
 *         slide_01.jpg
 *         slide_02.jpg
 *         ...
 *       lecture_002/
 *         ...
 *
 * Idempotent: re-running skips lectures that already exist in Supabase
 * (checked by internal_id). Safe to run multiple times.
 */

import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

// ─── Load env ────────────────────────────────────────────────────────────────

dotenv.config({ path: ".env.local" });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const HALEY_USER_ID = process.env.HALEY_USER_ID;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !HALEY_USER_ID) {
  console.error("❌  Missing required environment variables.");
  console.error(
    "    Ensure SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and HALEY_USER_ID are set in .env.local"
  );
  process.exit(1);
}

// ─── Config ──────────────────────────────────────────────────────────────────

/** Root directory containing the downloaded cPanel data. */
const MIGRATION_DATA_DIR = path.resolve("migration-data");
const LECTURES_DIR = path.join(MIGRATION_DATA_DIR, "lectures");
const SLIDES_DIR = path.join(MIGRATION_DATA_DIR, "slides");

/** Valid course names — must match exactly what the app uses. */
const VALID_COURSES = [
  "Physical Diagnosis I",
  "Anatomy & Physiology",
  "Laboratory Diagnosis",
] as const;
type ValidCourse = (typeof VALID_COURSES)[number];

// ─── Types ───────────────────────────────────────────────────────────────────

/** Shape of a v1 lecture JSON file. Adjust field names if yours differ. */
interface V1LectureJSON {
  title: string;
  subtitle?: string;
  course: string;
  color?: string;
  icon?: string;
  topics?: string[];
  slideCount?: number;
  slide_count?: number;
  flashcards?: unknown[];
  examQuestions?: unknown[];
  exam_questions?: unknown[];
  [key: string]: unknown; // allow any extra fields
}

interface MigrationResult {
  lectureNumber: string; // e.g. "001"
  internalId: string;    // e.g. "lec_001"
  title: string;
  slidesUploaded: number;
  skipped: boolean;
  error?: string;
}

// ─── Supabase client (service role — bypasses RLS for migration) ─────────────

const supabase: SupabaseClient = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Convert "lecture_001" → "lec_001" */
function toInternalId(filename: string): string {
  const match = filename.match(/lecture_(\d+)/i);
  if (!match) throw new Error(`Cannot derive internalId from filename: ${filename}`);
  return `lec_${match[1]}`;
}

/** Extract lecture number as an integer from filename or internalId */
function toDisplayOrder(internalId: string): number {
  const match = internalId.match(/lec_0*(\d+)/);
  return match ? parseInt(match[1], 10) : 9999;
}

/** Validate and coerce course field. Falls back to first valid course with a warning. */
function normalizeCourse(raw: string, internalId: string): ValidCourse {
  const trimmed = raw?.trim();
  if (VALID_COURSES.includes(trimmed as ValidCourse)) {
    return trimmed as ValidCourse;
  }
  console.warn(
    `  ⚠️  [${internalId}] Unknown course "${trimmed}" — defaulting to "Physical Diagnosis I"`
  );
  return "Physical Diagnosis I";
}

/** Read and parse a lecture JSON file. Throws on invalid JSON. */
function readLectureJSON(filePath: string): V1LectureJSON {
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as V1LectureJSON;
}

/** Get all lecture JSON filenames, sorted numerically. */
function getLectureFiles(): string[] {
  if (!fs.existsSync(LECTURES_DIR)) {
    throw new Error(`Lectures directory not found: ${LECTURES_DIR}`);
  }
  return fs
    .readdirSync(LECTURES_DIR)
    .filter((f) => f.match(/^lecture_\d+\.json$/i))
    .sort((a, b) => {
      const numA = parseInt(a.match(/\d+/)![0], 10);
      const numB = parseInt(b.match(/\d+/)![0], 10);
      return numA - numB;
    });
}

/** Get slide image files for a lecture directory, sorted numerically. */
function getSlideFiles(lectureDirName: string): string[] {
  const slideDir = path.join(SLIDES_DIR, lectureDirName);
  if (!fs.existsSync(slideDir)) return [];
  return fs
    .readdirSync(slideDir)
    .filter((f) => f.match(/\.(jpg|jpeg|png|webp)$/i))
    .sort((a, b) => {
      const numA = parseInt(a.match(/\d+/)?.[0] ?? "0", 10);
      const numB = parseInt(b.match(/\d+/)?.[0] ?? "0", 10);
      return numA - numB;
    });
}

/** Check if a lecture already exists in Supabase (idempotency guard). */
async function lectureExists(internalId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("lectures")
    .select("internal_id")
    .eq("internal_id", internalId)
    .maybeSingle();

  if (error) throw new Error(`Existence check failed for ${internalId}: ${error.message}`);
  return data !== null;
}

/** Determine MIME type from file extension. */
function mimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

// ─── Core migration logic ─────────────────────────────────────────────────────

async function migrateLecture(
  jsonFilename: string
): Promise<MigrationResult> {
  const lectureNumberMatch = jsonFilename.match(/lecture_(\d+)/i);
  const lectureNumber = lectureNumberMatch ? lectureNumberMatch[1] : "???";
  const internalId = toInternalId(jsonFilename);
  const lectureDirName = `lecture_${lectureNumber}`; // matches slides/ subdirectory

  // ── Step 1: Check idempotency ───────────────────────────────────────────────
  const alreadyExists = await lectureExists(internalId);
  if (alreadyExists) {
    console.log(`  ⏭️  [${internalId}] Already migrated — skipping.`);
    return { lectureNumber, internalId, title: "(skipped)", slidesUploaded: 0, skipped: true };
  }

  // ── Step 2: Read and parse JSON ────────────────────────────────────────────
  const jsonPath = path.join(LECTURES_DIR, jsonFilename);
  let lectureData: V1LectureJSON;
  try {
    lectureData = readLectureJSON(jsonPath);
  } catch (err) {
    const msg = `Failed to parse JSON: ${(err as Error).message}`;
    console.error(`  ❌  [${internalId}] ${msg}`);
    return { lectureNumber, internalId, title: "(parse error)", slidesUploaded: 0, skipped: false, error: msg };
  }

  // ── Step 3: Extract metadata ───────────────────────────────────────────────
  const title = lectureData.title ?? `Lecture ${lectureNumber}`;
  const subtitle = lectureData.subtitle ?? null;
  const course = normalizeCourse(lectureData.course ?? "", internalId);
  const color = lectureData.color ?? "#5b8dee";
  const icon = lectureData.icon ?? "📖";
  const topics: string[] = lectureData.topics ?? [];
  const slideCount =
    lectureData.slideCount ??
    lectureData.slide_count ??
    getSlideFiles(lectureDirName).length;

  console.log(`  📝  [${internalId}] "${title}" — ${course}`);

  // ── Step 4: Insert into lectures table ─────────────────────────────────────
  const { error: insertError } = await supabase.from("lectures").insert({
    internal_id: internalId,
    original_file: jsonFilename,
    title,
    subtitle,
    course,
    color,
    icon,
    topics,
    slide_count: slideCount,
    json_data: lectureData, // full JSON blob stored in JSONB column
    created_at: new Date().toISOString(),
  });

  if (insertError) {
    const msg = `DB insert failed: ${insertError.message}`;
    console.error(`  ❌  [${internalId}] ${msg}`);
    return { lectureNumber, internalId, title, slidesUploaded: 0, skipped: false, error: msg };
  }

  // ── Step 5: Create user_lecture_settings for Haley ─────────────────────────
  const displayOrder = toDisplayOrder(internalId);
  const { error: settingsError } = await supabase
    .from("user_lecture_settings")
    .insert({
      user_id: HALEY_USER_ID,
      internal_id: internalId,
      display_order: displayOrder,
      visible: true,
      archived: false,
      group_id: null,
      tags: [],
      course_override: null,
      color_override: null,
      custom_title: null,
    });

  if (settingsError) {
    // Non-fatal: lecture is in DB, just settings failed. Log and continue.
    console.warn(
      `  ⚠️  [${internalId}] user_lecture_settings insert failed: ${settingsError.message}`
    );
  }

  // ── Step 6: Upload slide images to Supabase Storage ───────────────────────
  const slideFiles = getSlideFiles(lectureDirName);
  let slidesUploaded = 0;

  if (slideFiles.length === 0) {
    console.log(`  🖼️  [${internalId}] No slides found in slides/${lectureDirName}/`);
  }

  for (let i = 0; i < slideFiles.length; i++) {
    const slideFilename = slideFiles[i];
    const localPath = path.join(SLIDES_DIR, lectureDirName, slideFilename);
    const storagePath = `slides/${internalId}/${slideFilename}`;

    process.stdout.write(
      `\r  🖼️  [${internalId}] Uploading slide ${i + 1}/${slideFiles.length} — ${slideFilename}   `
    );

    const fileBuffer = fs.readFileSync(localPath);
    const { error: uploadError } = await supabase.storage
      .from("slides")
      .upload(storagePath, fileBuffer, {
        contentType: mimeType(slideFilename),
        upsert: false, // don't overwrite; matches idempotency check above
      });

    if (uploadError) {
      // If the file already exists in storage, treat as non-fatal
      if (uploadError.message.includes("already exists")) {
        slidesUploaded++;
        continue;
      }
      console.error(
        `\n  ❌  [${internalId}] Slide upload failed (${slideFilename}): ${uploadError.message}`
      );
      // Continue with remaining slides rather than aborting
    } else {
      slidesUploaded++;
    }
  }

  if (slideFiles.length > 0) {
    process.stdout.write("\n"); // newline after progress indicator
  }

  console.log(
    `  ✅  [${internalId}] Done — ${slidesUploaded}/${slideFiles.length} slides uploaded.`
  );

  return { lectureNumber, internalId, title, slidesUploaded, skipped: false };
}

// ─── Verification ─────────────────────────────────────────────────────────────

async function verifyMigration(expectedInternalIds: string[]): Promise<void> {
  console.log("\n── Verification ──────────────────────────────────────────────");

  // Count lectures in DB
  const { count: dbCount, error: dbError } = await supabase
    .from("lectures")
    .select("*", { count: "exact", head: true });

  if (dbError) {
    console.error(`❌  Could not query lectures table: ${dbError.message}`);
    return;
  }

  // Count user_lecture_settings rows for Haley
  const { count: settingsCount, error: settingsError } = await supabase
    .from("user_lecture_settings")
    .select("*", { count: "exact", head: true })
    .eq("user_id", HALEY_USER_ID);

  if (settingsError) {
    console.error(
      `❌  Could not query user_lecture_settings: ${settingsError.message}`
    );
    return;
  }

  console.log(`📊  lectures table rows:          ${dbCount}`);
  console.log(`📊  user_lecture_settings rows:   ${settingsCount}`);
  console.log(`📊  Expected from this migration: ${expectedInternalIds.length}`);

  // Spot-check: confirm each expected ID exists
  const missing: string[] = [];
  for (const id of expectedInternalIds) {
    const { data } = await supabase
      .from("lectures")
      .select("internal_id, title")
      .eq("internal_id", id)
      .maybeSingle();
    if (!data) missing.push(id);
  }

  if (missing.length === 0) {
    console.log(`✅  All ${expectedInternalIds.length} lectures verified in Supabase.`);
  } else {
    console.error(`❌  Missing from Supabase: ${missing.join(", ")}`);
  }

  // List storage files in slides/ bucket
  const { data: storageList, error: storageError } = await supabase.storage
    .from("slides")
    .list("slides", { limit: 100 });

  if (storageError) {
    console.warn(`⚠️  Could not list storage bucket: ${storageError.message}`);
  } else {
    console.log(`🗂️  Storage bucket "slides" top-level folders: ${storageList?.length ?? 0}`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  StudyMD v2 — Data Migration");
  console.log("  Supabase URL: " + SUPABASE_URL);
  console.log("  Haley User ID: " + HALEY_USER_ID);
  console.log("═══════════════════════════════════════════════════════\n");

  // Sanity check directories
  if (!fs.existsSync(MIGRATION_DATA_DIR)) {
    console.error(`❌  migration-data/ directory not found at: ${MIGRATION_DATA_DIR}`);
    console.error(
      "    Create it and populate:\n" +
        "      migration-data/lectures/lecture_001.json ...\n" +
        "      migration-data/slides/lecture_001/slide_01.jpg ..."
    );
    process.exit(1);
  }

  // Collect lecture files
  let lectureFiles: string[];
  try {
    lectureFiles = getLectureFiles();
  } catch (err) {
    console.error(`❌  ${(err as Error).message}`);
    process.exit(1);
  }

  if (lectureFiles.length === 0) {
    console.error("❌  No lecture JSON files found in migration-data/lectures/");
    process.exit(1);
  }

  console.log(`Found ${lectureFiles.length} lecture JSON files to process.\n`);

  // Process each lecture
  const results: MigrationResult[] = [];

  for (const filename of lectureFiles) {
    console.log(`\n── ${filename} ${"─".repeat(Math.max(0, 45 - filename.length))}`);
    const result = await migrateLecture(filename);
    results.push(result);
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  const migrated = results.filter((r) => !r.skipped && !r.error);
  const skipped = results.filter((r) => r.skipped);
  const errors = results.filter((r) => !!r.error);
  const totalSlides = results.reduce((sum, r) => sum + r.slidesUploaded, 0);

  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  Migration Summary");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  ✅  Migrated:       ${migrated.length} lectures`);
  console.log(`  ⏭️   Skipped:        ${skipped.length} lectures (already existed)`);
  console.log(`  ❌  Errors:         ${errors.length} lectures`);
  console.log(`  🖼️   Slides uploaded: ${totalSlides} total`);

  if (errors.length > 0) {
    console.log("\n  Error details:");
    errors.forEach((r) => console.log(`    • ${r.internalId}: ${r.error}`));
  }

  // ── Verification ─────────────────────────────────────────────────────────────
  const allInternalIds = results
    .filter((r) => !r.error)
    .map((r) => r.internalId);

  await verifyMigration(allInternalIds);

  // ── Next steps banner ─────────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  ⏸  STOP HERE — Administrator checklist:");
  console.log("═══════════════════════════════════════════════════════");
  console.log("  1. Open Supabase dashboard > Table Editor");
  console.log('     • Confirm "lectures" table has the expected rows');
  console.log('     • Confirm "user_lecture_settings" rows exist for Haley');
  console.log('     • Spot-check one row: verify json_data is populated');
  console.log("  2. Open Supabase dashboard > Storage > slides bucket");
  console.log("     • Confirm slides/{internalId}/ folders exist");
  console.log("     • Spot-check one lecture's slides");
  console.log("  3. If anything looks wrong, fix the issue and re-run.");
  console.log("     The script is idempotent — duplicates will be skipped.");
  console.log("  4. When verified, proceed to Workstream 0.4 (front-end port).");
  console.log("═══════════════════════════════════════════════════════\n");

  process.exit(errors.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("\n💥  Unhandled error:", err);
  process.exit(1);
});

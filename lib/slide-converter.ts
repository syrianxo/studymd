/**
 * slide-converter.ts
 * Client-side PDF → JPEG slide conversion for StudyMD v2.
 *
 * Strategy:
 *  • PDF  → use pdfjs-dist to render each page to an offscreen canvas → JPEG blob
 *  • PPTX → not supported in-browser; caller should show the "export as PDF" message
 *
 * Key decisions:
 *  • The pdf.js worker runs in a real Web Worker to keep the main thread free.
 *  • We expose progress via a callback so the UI can drive a progress bar.
 *  • Uploads are batched at 3 concurrent requests to avoid overwhelming Supabase.
 */

import * as pdfjsLib from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// pdf.js worker setup
// ---------------------------------------------------------------------------
// Using the CDN worker so we don't have to copy the worker asset manually.
// Make sure pdfjs-dist version in package.json matches the CDN URL below.
// e.g. pdfjs-dist@4.x → cdn.jsdelivr.net/npm/pdfjs-dist@4.x/build/pdf.worker.min.mjs
// If you copy the worker to /public, replace this with "/pdf.worker.min.mjs".
pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConversionProgressCallback = (current: number, total: number) => void;
export type UploadProgressCallback = (uploaded: number, total: number) => void;

export interface SlideConverterOptions {
  /** Dots per inch for canvas rendering. 200 DPI ≈ 1700 px for a standard 8.5 × 11 slide. */
  dpi?: number;
  /** JPEG quality, 0–1. 0.85 is a good balance of size vs. quality. */
  quality?: number;
  /** Called after each page is rendered so the UI can update a progress bar. */
  onConversionProgress?: ConversionProgressCallback;
  /** Called after each slide is uploaded. */
  onUploadProgress?: UploadProgressCallback;
}

const DEFAULT_OPTIONS: Required<Omit<SlideConverterOptions, "onConversionProgress" | "onUploadProgress">> = {
  dpi: 200,
  quality: 0.85,
};

// ---------------------------------------------------------------------------
// convertPdfToSlides
// ---------------------------------------------------------------------------

/**
 * Renders every page in a PDF File to a JPEG blob.
 *
 * @param file   A PDF File object (from an <input type="file"> or drag-and-drop).
 * @param opts   Optional rendering options and progress callbacks.
 * @returns      An array of JPEG Blobs, one per page, in page order.
 */
export async function convertPdfToSlides(
  file: File,
  opts: SlideConverterOptions = {}
): Promise<Blob[]> {
  const { dpi, quality } = { ...DEFAULT_OPTIONS, ...opts };
  const { onConversionProgress } = opts;

  // Read file into an ArrayBuffer — pdf.js needs binary data.
  const arrayBuffer = await file.arrayBuffer();

  // Load the PDF document.
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdfDoc: PDFDocumentProxy = await loadingTask.promise;

  const totalPages = pdfDoc.numPages;
  const blobs: Blob[] = [];

  // Render pages sequentially to keep memory usage predictable.
  // A 200-DPI canvas for a 1920×1080 slide is ~25 MB; rendering in parallel
  // would multiply that by numPages and could OOM on mobile.
  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);

    // pdf.js uses a "viewport" object to control output size.
    // Scale factor: (dpi / 72) converts from PDF points (72 pt/in) to pixels.
    const scale = dpi / 72;
    const viewport = page.getViewport({ scale });

    // Create an offscreen canvas of the right size.
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not get 2D canvas context");

    // Render the PDF page onto the canvas.
    // pdfjs-dist v4+ requires `canvas` alongside `canvasContext` in RenderParameters.
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;

    // Export the canvas as a JPEG blob.
    const blob = await canvasToBlob(canvas, "image/jpeg", quality);
    blobs.push(blob);

    // Notify caller of progress.
    onConversionProgress?.(pageNum, totalPages);

    // Release the page to help GC.
    page.cleanup();
  }

  // Release PDF resources.
  pdfDoc.destroy();

  return blobs;
}

// ---------------------------------------------------------------------------
// uploadSlides
// ---------------------------------------------------------------------------

/**
 * Uploads an array of JPEG blobs to Supabase Storage.
 *
 * Files are stored at:   slides/{internalId}/slide_01.jpg
 *                                             slide_02.jpg  …etc.
 *
 * Uploads run in parallel with a concurrency limit of 3 to avoid saturating
 * the network connection or hitting Supabase rate limits.
 *
 * @param internalId  The lecture's internal ID (e.g. "lec_abc12345").
 * @param blobs       Array of JPEG blobs in slide order (index 0 = slide 1).
 * @param opts        Optional progress callback.
 */
export async function uploadSlides(
  internalId: string,
  blobs: Blob[],
  opts: Pick<SlideConverterOptions, "onUploadProgress"> = {}
): Promise<void> {
  const { onUploadProgress } = opts;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  let uploadedCount = 0;
  const total = blobs.length;

  // Work queue: array of [index, blob] pairs.
  const queue: Array<[number, Blob]> = blobs.map((blob, i) => [i, blob]);

  // Upload one blob and report progress.
  async function uploadOne(index: number, blob: Blob): Promise<void> {
    const filename = `slide_${String(index + 1).padStart(2, "0")}.jpg`;
    const storagePath = `slides/${internalId}/${filename}`;

    const { error } = await supabase.storage
      .from("slides")
      .upload(storagePath, blob, {
        contentType: "image/jpeg",
        upsert: true, // overwrite if re-uploading
      });

    if (error) {
      throw new Error(`Failed to upload ${filename}: ${error.message}`);
    }

    uploadedCount++;
    onUploadProgress?.(uploadedCount, total);
  }

  // Process the queue with a sliding window of CONCURRENCY_LIMIT active uploads.
  const CONCURRENCY_LIMIT = 3;
  await runWithConcurrencyLimit(
    queue,
    ([index, blob]) => uploadOne(index, blob),
    CONCURRENCY_LIMIT
  );
}

// ---------------------------------------------------------------------------
// isPptx / isPdf helpers (exported for use in UploadModal)
// ---------------------------------------------------------------------------

export function isPdf(file: File): boolean {
  return (
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf")
  );
}

export function isPptx(file: File): boolean {
  return (
    file.type ===
      "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    file.name.toLowerCase().endsWith(".pptx")
  );
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Wraps canvas.toBlob in a Promise.
 */
function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("canvas.toBlob returned null"));
      },
      type,
      quality
    );
  });
}

/**
 * Runs `task(item)` for each item in `items`, keeping at most `limit`
 * concurrent Promises in flight at any time.
 *
 * This is preferable to Promise.all(items.map(task)) when `items` is large
 * and each task is I/O-bound (e.g. HTTP uploads).
 */
async function runWithConcurrencyLimit<T>(
  items: T[],
  task: (item: T) => Promise<void>,
  limit: number
): Promise<void> {
  // Use an index pointer so workers can grab the next item atomically.
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      await task(items[index]);
    }
  }

  // Spawn `limit` workers and wait for all of them to drain the queue.
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/**
 * lib/pptx-extractor.ts
 *
 * Server-side PPTX text extraction — no native binaries, no LibreOffice.
 *
 * A PPTX is a ZIP archive. We parse the ZIP central directory (which always
 * has correct sizes/offsets, even for data-descriptor entries where the local
 * header has zeros) to locate each file, then inflate with Node's built-in zlib.
 */

// ─── ZIP parsing via Central Directory ───────────────────────────────────────

const CENTRAL_DIR_SIG  = 0x02014b50; // PK\x01\x02
const EOCD_SIG         = 0x06054b50; // PK\x05\x06  (End of Central Directory)
const LOCAL_FILE_SIG   = 0x04034b50; // PK\x03\x04

interface ZipEntry {
  filename:          string;
  compressionMethod: number;   // 0=stored, 8=deflate
  compressedSize:    number;
  uncompressedSize:  number;
  localHeaderOffset: number;
}

/**
 * Locate the End-of-Central-Directory record and return the offset +
 * size of the central directory.
 */
function findCentralDirectory(buf: Buffer): { cdOffset: number; cdSize: number } | null {
  // EOCD is at most 22 + 65535 bytes from the end (comment length).
  // Scan backwards for the EOCD signature.
  const minOffset = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= minOffset; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      const cdSize   = buf.readUInt32LE(i + 12);
      const cdOffset = buf.readUInt32LE(i + 16);
      return { cdOffset, cdSize };
    }
  }
  return null;
}

/**
 * Parse the central directory and return a map of filename → ZipEntry.
 * Central directory entries always contain correct compressed/uncompressed
 * sizes and the local header offset, even when the local header uses
 * data descriptors (bit 3 of the general-purpose flag).
 */
function parseCentralDirectory(buf: Buffer): Map<string, ZipEntry> {
  const entries = new Map<string, ZipEntry>();

  const cd = findCentralDirectory(buf);
  if (!cd) {
    // Fallback: no EOCD found — try scanning local headers directly
    return parseLocalHeaders(buf);
  }

  let offset = cd.cdOffset;
  const end  = cd.cdOffset + cd.cdSize;

  while (offset < end && offset + 46 <= buf.length) {
    if (buf.readUInt32LE(offset) !== CENTRAL_DIR_SIG) break;

    const compressionMethod = buf.readUInt16LE(offset + 10);
    const compressedSize    = buf.readUInt32LE(offset + 20);
    const uncompressedSize  = buf.readUInt32LE(offset + 24);
    const filenameLen       = buf.readUInt16LE(offset + 28);
    const extraLen          = buf.readUInt16LE(offset + 30);
    const commentLen        = buf.readUInt16LE(offset + 32);
    const localHeaderOffset = buf.readUInt32LE(offset + 42);

    const filename = buf.slice(offset + 46, offset + 46 + filenameLen).toString('utf8');

    entries.set(filename, {
      filename,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });

    offset += 46 + filenameLen + extraLen + commentLen;
  }

  return entries;
}

/**
 * Fallback: scan for PK\x03\x04 local file headers when EOCD is missing.
 * Only works reliably when data descriptors are NOT used (sizes are in header).
 */
function parseLocalHeaders(buf: Buffer): Map<string, ZipEntry> {
  const entries = new Map<string, ZipEntry>();
  let offset = 0;

  while (offset < buf.length - 30) {
    if (buf.readUInt32LE(offset) !== LOCAL_FILE_SIG) { offset++; continue; }

    const compressionMethod = buf.readUInt16LE(offset + 8);
    const compressedSize    = buf.readUInt32LE(offset + 18);
    const uncompressedSize  = buf.readUInt32LE(offset + 22);
    const filenameLen       = buf.readUInt16LE(offset + 26);
    const extraLen          = buf.readUInt16LE(offset + 28);

    const filename = buf.slice(offset + 30, offset + 30 + filenameLen).toString('utf8');

    entries.set(filename, {
      filename,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset: offset,
    });

    offset += 30 + filenameLen + extraLen + compressedSize;
  }

  return entries;
}

/**
 * Read and decompress a single ZIP entry.
 * Resolves the actual data offset from the local file header (to account
 * for variable-length extra fields that differ from the central directory).
 */
function readEntry(buf: Buffer, entry: ZipEntry): string {
  // Read actual extra field length from the local header (may differ from CD)
  const localOffset   = entry.localHeaderOffset;
  const filenameLen   = buf.readUInt16LE(localOffset + 26);
  const extraLen      = buf.readUInt16LE(localOffset + 28);
  const dataStart     = localOffset + 30 + filenameLen + extraLen;
  const dataEnd       = dataStart + entry.compressedSize;

  if (dataEnd > buf.length) {
    throw new Error(`Entry "${entry.filename}": data extends beyond buffer (${dataEnd} > ${buf.length})`);
  }

  const compressed = buf.slice(dataStart, dataEnd);

  if (entry.compressionMethod === 0) {
    return compressed.toString('utf8');
  }

  if (entry.compressionMethod === 8) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const zlib       = require('zlib') as typeof import('zlib');
    const decompressed = zlib.inflateRawSync(compressed);
    return decompressed.toString('utf8');
  }

  throw new Error(`Unsupported compression method ${entry.compressionMethod} for "${entry.filename}"`);
}

// ─── XML text extraction ──────────────────────────────────────────────────────

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g,  '&')
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g,   (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

/**
 * Extract readable text from OOXML slide/notes XML.
 * Works with both namespace-prefixed (<a:t>) and unprefixed (<t>) tags.
 */
function extractTextFromXml(xml: string): string {
  const lines: string[] = [];

  // Match paragraph elements (a:p or just p)
  const paraRe = /<(?:a:)?p[\s>][\s\S]*?<\/(?:a:)?p>/g;
  let paraMatch: RegExpExecArray | null;

  while ((paraMatch = paraRe.exec(xml)) !== null) {
    const para = paraMatch[0];
    const parts: string[] = [];

    // Match text runs (a:t or just t)
    const textRe = /<(?:a:)?t[^>]*>([\s\S]*?)<\/(?:a:)?t>/g;
    let textMatch: RegExpExecArray | null;

    while ((textMatch = textRe.exec(para)) !== null) {
      const raw = decodeXmlEntities(textMatch[1]).trim();
      if (raw) parts.push(raw);
    }

    const line = parts.join(' ').trim();
    if (line) lines.push(line);
  }

  return lines.join('\n');
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface PptxSlide {
  slideNumber: number;
  text:  string;
  notes: string;
}

export async function extractPptxSlides(buffer: ArrayBuffer): Promise<PptxSlide[]> {
  const buf     = Buffer.from(buffer);
  const entries = parseCentralDirectory(buf);

  // Log what we found for debugging
  const allKeys = [...entries.keys()];
  const slideKeys = allKeys.filter(k => /^ppt\/slides\/slide\d+\.xml$/.test(k));
  console.log(`[pptx] ZIP entries: ${allKeys.length} total, ${slideKeys.length} slides`);
  if (slideKeys.length === 0) {
    console.warn('[pptx] No slide XML files found. Keys sample:', allKeys.slice(0, 20));
  }

  const slideEntries: { num: number; entry: ZipEntry }[] = [];
  for (const [filename, entry] of entries) {
    const m = filename.match(/^ppt\/slides\/slide(\d+)\.xml$/);
    if (m) slideEntries.push({ num: parseInt(m[1], 10), entry });
  }
  slideEntries.sort((a, b) => a.num - b.num);

  const slides: PptxSlide[] = [];

  for (const { num, entry } of slideEntries) {
    let text  = '';
    let notes = '';

    try {
      const xml = readEntry(buf, entry);
      text = extractTextFromXml(xml);
    } catch (e) {
      console.warn(`[pptx] slide ${num} extraction failed: ${(e as Error).message}`);
    }

    // Speaker notes
    const notesEntry = entries.get(`ppt/notesSlides/notesSlide${num}.xml`);
    if (notesEntry) {
      try {
        const notesXml = readEntry(buf, notesEntry);
        notes = extractTextFromXml(notesXml)
          .split('\n')
          .filter(l => l.length > 2)
          .join('\n');
      } catch { /* notes are optional */ }
    }

    if (text || notes) {
      slides.push({ slideNumber: num, text, notes });
    }
  }

  return slides;
}

export function formatSlidesForClaude(slides: PptxSlide[], title: string): string {
  const lines: string[] = [
    `LECTURE PRESENTATION: ${title}`,
    `Total slides: ${slides.length}`,
    '',
    '---',
    '',
  ];

  for (const slide of slides) {
    lines.push(`## Slide ${slide.slideNumber}`);
    if (slide.text)  lines.push(slide.text);
    if (slide.notes) { lines.push(''); lines.push(`[Speaker notes: ${slide.notes}]`); }
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

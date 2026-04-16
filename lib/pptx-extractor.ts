/**
 * lib/pptx-extractor.ts
 *
 * Server-side PPTX text extraction — no native binaries, no LibreOffice.
 *
 * A PPTX is a ZIP archive. We parse the ZIP Central Directory (which always
 * has correct sizes, even for data-descriptor entries) to locate each file,
 * then inflate with Node's built-in zlib and extract text.
 */

// ─── ZIP Central Directory parser ────────────────────────────────────────────

const EOCD_SIG        = 0x06054b50;
const CENTRAL_DIR_SIG = 0x02014b50;
const LOCAL_FILE_SIG  = 0x04034b50;

interface ZipEntry {
  filename:          string;
  compressionMethod: number;
  compressedSize:    number;
  uncompressedSize:  number;
  localHeaderOffset: number;
}

function findEocd(buf: Buffer): number | null {
  // Scan backwards; EOCD signature PK\x05\x06
  const min = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) return i;
  }
  return null;
}

function parseCentralDirectory(buf: Buffer): Map<string, ZipEntry> {
  const entries = new Map<string, ZipEntry>();

  const eocdOffset = findEocd(buf);
  if (eocdOffset === null) {
    console.warn('[pptx] No EOCD found, falling back to local header scan');
    return parseLocalHeaders(buf);
  }

  const cdOffset = buf.readUInt32LE(eocdOffset + 16);
  const cdSize   = buf.readUInt32LE(eocdOffset + 12);
  const cdEnd    = cdOffset + cdSize;

  let pos = cdOffset;
  while (pos < cdEnd && pos + 46 <= buf.length) {
    if (buf.readUInt32LE(pos) !== CENTRAL_DIR_SIG) break;

    const compressionMethod = buf.readUInt16LE(pos + 10);
    const compressedSize    = buf.readUInt32LE(pos + 20);
    const uncompressedSize  = buf.readUInt32LE(pos + 24);
    const filenameLen       = buf.readUInt16LE(pos + 28);
    const extraLen          = buf.readUInt16LE(pos + 30);
    const commentLen        = buf.readUInt16LE(pos + 32);
    const localHeaderOffset = buf.readUInt32LE(pos + 42);

    const filename = buf.slice(pos + 46, pos + 46 + filenameLen).toString('utf8');

    entries.set(filename, {
      filename, compressionMethod,
      compressedSize, uncompressedSize, localHeaderOffset,
    });

    pos += 46 + filenameLen + extraLen + commentLen;
  }

  return entries;
}

function parseLocalHeaders(buf: Buffer): Map<string, ZipEntry> {
  // Fallback when EOCD is absent — only works if data descriptors aren't used
  const entries = new Map<string, ZipEntry>();
  let pos = 0;
  while (pos + 30 < buf.length) {
    if (buf.readUInt32LE(pos) !== LOCAL_FILE_SIG) { pos++; continue; }
    const compressionMethod = buf.readUInt16LE(pos + 8);
    const compressedSize    = buf.readUInt32LE(pos + 18);
    const uncompressedSize  = buf.readUInt32LE(pos + 22);
    const filenameLen       = buf.readUInt16LE(pos + 26);
    const extraLen          = buf.readUInt16LE(pos + 28);
    const filename          = buf.slice(pos + 30, pos + 30 + filenameLen).toString('utf8');
    entries.set(filename, { filename, compressionMethod, compressedSize, uncompressedSize, localHeaderOffset: pos });
    pos += 30 + filenameLen + extraLen + compressedSize;
  }
  return entries;
}

function readEntry(buf: Buffer, entry: ZipEntry): Buffer {
  // Local header extra field length can differ from central directory
  const lh          = entry.localHeaderOffset;
  const filenameLen = buf.readUInt16LE(lh + 26);
  const extraLen    = buf.readUInt16LE(lh + 28);
  const dataStart   = lh + 30 + filenameLen + extraLen;
  const compressed  = buf.slice(dataStart, dataStart + entry.compressedSize);

  if (entry.compressionMethod === 0) return compressed;
  if (entry.compressionMethod === 8) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require('zlib') as typeof import('zlib')).inflateRawSync(compressed);
  }
  throw new Error(`Unsupported compression method ${entry.compressionMethod}`);
}

// ─── XML text extraction ──────────────────────────────────────────────────────

function xmlEntities(s: string): string {
  return s
    .replace(/&amp;/g,  '&')
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g,      (_, n) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

/**
 * Extract all readable text from OOXML XML.
 *
 * PPTX slide XML looks like:
 *   <p:sp> ... <a:txBody> ... <a:p> ... <a:r> ... <a:t>TEXT</a:t> ... </a:r> ... </a:p> ... </a:txBody> ... </p:sp>
 *
 * We match <a:t> regardless of namespace prefix variations.
 */
function extractText(xml: string): string {
  const lines: string[] = [];

  // Strip XML comments and processing instructions first
  const clean = xml
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\?[\s\S]*?\?>/g, '');

  // Match paragraphs — any element ending in :p or just <p ...> / </p>
  // This covers <a:p>, <p>, <w:p>, etc.
  const paraPattern = /<[a-zA-Z_]?[a-zA-Z0-9_]*:?p[\s>][\s\S]*?<\/[a-zA-Z_]?[a-zA-Z0-9_]*:?p>/g;
  let paraMatch: RegExpExecArray | null;

  while ((paraMatch = paraPattern.exec(clean)) !== null) {
    const para   = paraMatch[0];
    const parts: string[] = [];

    // Match text runs: <a:t ...>TEXT</a:t> or <t ...>TEXT</t>
    const textPattern = /<[a-zA-Z_]?[a-zA-Z0-9_]*:?t[\s>]([\s\S]*?)<\/[a-zA-Z_]?[a-zA-Z0-9_]*:?t>/g;
    let textMatch: RegExpExecArray | null;

    while ((textMatch = textPattern.exec(para)) !== null) {
      const raw = xmlEntities(textMatch[1]).trim();
      if (raw) parts.push(raw);
    }

    const line = parts.join(' ').trim();
    if (line) lines.push(line);
  }

  // Deduplicate adjacent identical lines (sometimes repeated in PPTX)
  const deduped: string[] = [];
  for (const line of lines) {
    if (deduped[deduped.length - 1] !== line) deduped.push(line);
  }

  return deduped.join('\n');
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface PptxSlide {
  slideNumber: number;
  text:        string;
  notes:       string;
}

export async function extractPptxSlides(buffer: ArrayBuffer): Promise<PptxSlide[]> {
  const buf     = Buffer.from(buffer);
  const entries = parseCentralDirectory(buf);

  const allKeys    = [...entries.keys()];
  const slideKeys  = allKeys.filter(k => /^ppt\/slides\/slide\d+\.xml$/.test(k));
  console.log(`[pptx] ${allKeys.length} ZIP entries, ${slideKeys.length} slides found`);
  if (slideKeys.length === 0) {
    console.warn('[pptx] No slides found. Entries sample:', allKeys.slice(0, 30).join(', '));
  }

  // Collect and sort slides
  const slideList: { num: number; entry: ZipEntry }[] = [];
  for (const [filename, entry] of entries) {
    const m = filename.match(/^ppt\/slides\/slide(\d+)\.xml$/i);
    if (m) slideList.push({ num: parseInt(m[1], 10), entry });
  }
  slideList.sort((a, b) => a.num - b.num);

  const slides: PptxSlide[] = [];

  for (const { num, entry } of slideList) {
    let text  = '';
    let notes = '';

    try {
      const raw = readEntry(buf, entry).toString('utf8');
      text = extractText(raw);
      if (!text) {
        // Last resort: pull every text node between > and <
        const stripped = raw
          .replace(/<[^>]+>/g, '\n')
          .replace(/&[a-z]+;/g, ' ')
          .split('\n')
          .map(s => s.trim())
          .filter(s => s.length > 1 && !/^[0-9.]+$/.test(s))
          .join('\n');
        text = stripped;
      }
    } catch (e) {
      console.warn(`[pptx] slide ${num} failed: ${(e as Error).message}`);
    }

    // Speaker notes
    const notesEntry = entries.get(`ppt/notesSlides/notesSlide${num}.xml`);
    if (notesEntry) {
      try {
        const raw   = readEntry(buf, notesEntry).toString('utf8');
        notes = extractText(raw).split('\n').filter(l => l.length > 2).join('\n');
      } catch { /* optional */ }
    }

    if (text || notes) slides.push({ slideNumber: num, text, notes });
  }

  // Log sample of extracted content for debugging
  if (slides.length > 0) {
    const sample = slides[0].text.slice(0, 200);
    console.log(`[pptx] Slide 1 sample: ${JSON.stringify(sample)}`);
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

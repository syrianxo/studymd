/**
 * lib/pptx-extractor.ts
 *
 * Server-side PPTX text extraction — no native binaries, no LibreOffice.
 *
 * Strategy:
 *   A PPTX file is a ZIP archive. Each slide is stored as an XML file at
 *   ppt/slides/slide1.xml, slide2.xml, etc. We parse the ZIP in pure Node.js
 *   using the built-in Buffer/DataView APIs (no extra npm packages), then
 *   extract text runs (<a:t>) from the slide XML.
 *
 * The extracted text is passed to Claude as a structured text message instead
 * of as a document source (which only accepts PDF). The output quality is
 * comparable — Claude still sees all slide text content and speaker notes.
 *
 * Limitations:
 *   - Images/diagrams in slides are not sent to Claude (text-only extraction)
 *   - Slide formatting/layout is not preserved (just text order)
 *   - Embedded media is ignored
 * These are acceptable for flashcard/question generation.
 */

// ─── ZIP parsing (pure Node.js, no dependencies) ─────────────────────────────
// ZIP local file header signature: PK\x03\x04
const LOCAL_FILE_SIG = 0x04034b50;
// ZIP central directory signature: PK\x01\x02
const CENTRAL_DIR_SIG = 0x02014b50;

interface ZipEntry {
  filename: string;
  compressedData: Buffer;
  compressionMethod: number; // 0 = stored, 8 = deflate
  uncompressedSize: number;
}

function parseZip(buffer: Buffer): Map<string, ZipEntry> {
  const entries = new Map<string, ZipEntry>();
  let offset = 0;

  while (offset < buffer.length - 4) {
    const sig = buffer.readUInt32LE(offset);

    if (sig === LOCAL_FILE_SIG) {
      // Local file header
      const compressionMethod = buffer.readUInt16LE(offset + 8);
      const compressedSize    = buffer.readUInt32LE(offset + 18);
      const uncompressedSize  = buffer.readUInt32LE(offset + 22);
      const filenameLen       = buffer.readUInt16LE(offset + 26);
      const extraLen          = buffer.readUInt16LE(offset + 28);

      const filenameStart = offset + 30;
      const filename = buffer.slice(filenameStart, filenameStart + filenameLen).toString('utf8');

      const dataStart = filenameStart + filenameLen + extraLen;
      const compressedData = buffer.slice(dataStart, dataStart + compressedSize);

      entries.set(filename, {
        filename,
        compressedData,
        compressionMethod,
        uncompressedSize,
      });

      offset = dataStart + compressedSize;
    } else if (sig === CENTRAL_DIR_SIG) {
      // Central directory — we've seen all local entries
      break;
    } else {
      // Scan forward for next signature
      offset++;
    }
  }

  return entries;
}

function decompressEntry(entry: ZipEntry): string {
  if (entry.compressionMethod === 0) {
    // Stored (no compression)
    return entry.compressedData.toString('utf8');
  }

  if (entry.compressionMethod === 8) {
    // DEFLATE — use Node's built-in zlib
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const zlib = require('zlib') as typeof import('zlib');
    const decompressed = zlib.inflateRawSync(entry.compressedData);
    return decompressed.toString('utf8');
  }

  throw new Error(`Unsupported ZIP compression method: ${entry.compressionMethod}`);
}

// ─── XML text extraction ──────────────────────────────────────────────────────

/**
 * Extracts all text runs from a PPTX slide XML string.
 * Handles <a:t> tags (text runs) and <a:br> (line breaks).
 */
function extractTextFromSlideXml(xml: string): string {
  const lines: string[] = [];

  // Extract paragraph blocks <a:p>...</a:p>
  const paragraphMatches = xml.matchAll(/<a:p[\s>][\s\S]*?<\/a:p>/g);
  for (const paraMatch of paragraphMatches) {
    const para = paraMatch[0];
    const textParts: string[] = [];

    // Extract text runs <a:t>...</a:t>
    const textMatches = para.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g);
    for (const textMatch of textMatches) {
      const text = textMatch[1]
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&apos;/g, "'")
        .replace(/&quot;/g, '"')
        .trim();
      if (text) textParts.push(text);
    }

    const line = textParts.join(' ').trim();
    if (line) lines.push(line);
  }

  return lines.join('\n');
}

/**
 * Extracts speaker notes from a PPTX notes slide XML string.
 */
function extractNotesFromXml(xml: string): string {
  // Notes are in <p:sp> where idx=1 contains body text, idx=0 is the page number
  // We just extract all text runs and they'll naturally be the notes content
  const text = extractTextFromSlideXml(xml);
  // Filter out single-character "slide number" placeholders
  return text.split('\n').filter(l => l.length > 2).join('\n');
}

// ─── Main export ──────────────────────────────────────────────────────────────

export interface PptxSlide {
  slideNumber: number;
  text: string;
  notes: string;
}

/**
 * Extracts slide text and speaker notes from a PPTX ArrayBuffer.
 *
 * Returns an array of slides in order, each with their text content
 * and any speaker notes. This can be formatted and sent to Claude
 * as a text message instead of a document source.
 */
export async function extractPptxSlides(buffer: ArrayBuffer): Promise<PptxSlide[]> {
  const buf = Buffer.from(buffer);
  const entries = parseZip(buf);

  // Find all slide files: ppt/slides/slide1.xml, slide2.xml, etc.
  const slideEntries: { num: number; entry: ZipEntry }[] = [];
  for (const [filename, entry] of entries) {
    const match = filename.match(/^ppt\/slides\/slide(\d+)\.xml$/);
    if (match) {
      slideEntries.push({ num: parseInt(match[1], 10), entry });
    }
  }

  // Sort by slide number
  slideEntries.sort((a, b) => a.num - b.num);

  const slides: PptxSlide[] = [];

  for (const { num, entry } of slideEntries) {
    let text = '';
    let notes = '';

    try {
      const xml = decompressEntry(entry);
      text = extractTextFromSlideXml(xml);
    } catch (e) {
      console.warn(`[pptx] Could not extract slide ${num}: ${(e as Error).message}`);
    }

    // Try to get speaker notes from ppt/notesSlides/notesSlide{n}.xml
    const notesKey = `ppt/notesSlides/notesSlide${num}.xml`;
    const notesEntry = entries.get(notesKey);
    if (notesEntry) {
      try {
        const notesXml = decompressEntry(notesEntry);
        notes = extractNotesFromXml(notesXml);
      } catch {
        // Notes are optional — ignore errors
      }
    }

    if (text || notes) {
      slides.push({ slideNumber: num, text, notes });
    }
  }

  return slides;
}

/**
 * Formats extracted PPTX slides into a text prompt for Claude.
 * The output reads like a structured lecture transcript.
 */
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
    if (slide.text) {
      lines.push(slide.text);
    }
    if (slide.notes) {
      lines.push('');
      lines.push(`[Speaker notes: ${slide.notes}]`);
    }
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

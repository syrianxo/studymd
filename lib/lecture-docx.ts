// lib/lecture-docx.ts
// Converts lecture markdown into a minimal valid .docx file.
// A .docx is a ZIP containing a small set of XML parts — we render the markdown
// line-by-line into Word <w:p> paragraphs with a handful of styles.
// Uses fflate (already available transitively) for deterministic zip construction.

import { zipSync, strToU8 } from 'fflate';

// ─── XML helpers ──────────────────────────────────────────────────────────────

function xmlEscape(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Convert a run of inline markdown (bold, italic via * or _) into w:r runs.
function buildRuns(text: string): string {
  const runs: string[] = [];
  let i = 0;

  while (i < text.length) {
    // Bold: **...**
    if (text.startsWith('**', i)) {
      const end = text.indexOf('**', i + 2);
      if (end !== -1) {
        const inner = text.slice(i + 2, end);
        runs.push(`<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${xmlEscape(inner)}</w:t></w:r>`);
        i = end + 2;
        continue;
      }
    }
    // Italic: *x* (but not **)
    if (text[i] === '*' && text[i + 1] !== '*') {
      const end = text.indexOf('*', i + 1);
      if (end !== -1) {
        const inner = text.slice(i + 1, end);
        runs.push(`<w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve">${xmlEscape(inner)}</w:t></w:r>`);
        i = end + 1;
        continue;
      }
    }
    // Italic: _x_
    if (text[i] === '_') {
      const end = text.indexOf('_', i + 1);
      if (end !== -1) {
        const inner = text.slice(i + 1, end);
        runs.push(`<w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve">${xmlEscape(inner)}</w:t></w:r>`);
        i = end + 1;
        continue;
      }
    }
    // Plain text run — consume until next control char
    let j = i;
    while (j < text.length && text[j] !== '*' && text[j] !== '_') j++;
    if (j === i) j++;
    const chunk = text.slice(i, j);
    runs.push(`<w:r><w:t xml:space="preserve">${xmlEscape(chunk)}</w:t></w:r>`);
    i = j;
  }

  return runs.join('');
}

/** Build one paragraph with optional style. */
function para(runs: string, style?: string): string {
  const pPr = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : '';
  return `<w:p>${pPr}${runs}</w:p>`;
}

/** Build a bullet-list paragraph. */
function bulletPara(runs: string): string {
  return `<w:p><w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>${runs}</w:p>`;
}

// ─── Markdown → paragraphs ────────────────────────────────────────────────────

function markdownToParagraphs(md: string): string {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const body: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, '');
    if (line === '') {
      // Empty paragraph for spacing
      body.push('<w:p/>');
      continue;
    }

    const h1 = line.match(/^#\s+(.+)$/);
    const h2 = line.match(/^##\s+(.+)$/);
    const h3 = line.match(/^###\s+(.+)$/);
    const bullet = line.match(/^-\s+(.+)$/);

    if (h1) { body.push(para(buildRuns(h1[1]), 'Heading1')); continue; }
    if (h2) { body.push(para(buildRuns(h2[1]), 'Heading2')); continue; }
    if (h3) { body.push(para(buildRuns(h3[1]), 'Heading3')); continue; }
    if (bullet) { body.push(bulletPara(buildRuns(bullet[1]))); continue; }

    body.push(para(buildRuns(line)));
  }

  return body.join('');
}

// ─── Static XML parts ─────────────────────────────────────────────────────────

const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
</Types>`;

const RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOC_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
</Relationships>`;

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr><w:rPr><w:b/><w:sz w:val="40"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:pPr><w:spacing w:before="200" w:after="100"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:pPr><w:spacing w:before="160" w:after="80"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:pPr><w:ind w:left="720"/></w:pPr></w:style>
</w:styles>`;

const NUMBERING_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="0">
    <w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl>
  </w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
</w:numbering>`;

function buildDocumentXml(bodyParagraphs: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${bodyParagraphs}
    <w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>
  </w:body>
</w:document>`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function markdownToDocx(markdown: string): Promise<Uint8Array> {
  const documentXml = buildDocumentXml(markdownToParagraphs(markdown));

  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(CONTENT_TYPES_XML),
    '_rels/.rels': strToU8(RELS_XML),
    'word/_rels/document.xml.rels': strToU8(DOC_RELS_XML),
    'word/document.xml': strToU8(documentXml),
    'word/styles.xml': strToU8(STYLES_XML),
    'word/numbering.xml': strToU8(NUMBERING_XML),
  };

  return zipSync(files, { level: 6 });
}

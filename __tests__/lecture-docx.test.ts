import { describe, it, expect } from 'vitest';
import { markdownToDocx } from '../lib/lecture-docx';

describe('markdownToDocx', () => {
  it('produces a non-empty buffer starting with the PK zip magic bytes', async () => {
    const md = '# Test Title\n\nHello **world** with _italic_ text.\n\n- item one\n- item two\n';
    const buf = await markdownToDocx(md);
    expect(buf.byteLength).toBeGreaterThan(200);
    // docx files are zip archives — first two bytes are 'PK'
    expect(buf[0]).toBe(0x50);
    expect(buf[1]).toBe(0x4b);
  });
});

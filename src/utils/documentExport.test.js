import { createDocument, safeName, escapeHTML } from './documentExport';
test('rejects empty text and unsupported format', async () => {
  await expect(createDocument(' ', 'pdf')).rejects.toThrow('Add or scan');
  await expect(createDocument('Hello', 'exe')).rejects.toThrow('Unsupported');
});
test('preserves Unicode text and escapes active HTML', async () => {
  expect((await createDocument('Hello 世界', 'txt')).type).toContain('text/plain');
  expect(escapeHTML('<script>"&')).toBe('&lt;script&gt;&quot;&amp;');
  expect(safeName('../a:b')).not.toContain('/');
  await expect(createDocument('世界', 'pdf')).rejects.toThrow('DOCX');
});
test('creates multipage searchable PDF and real DOCX', async () => {
  const pdf = await createDocument('Searchable document\n'.repeat(150), 'pdf');
  expect(pdf.type).toBe('application/pdf'); expect(pdf.size).toBeGreaterThan(3000);
  const word = await createDocument('Hello\nWorld', 'docx'); expect(word.size).toBeGreaterThan(1000);
});

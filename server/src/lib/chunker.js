/** Divide o texto em trechos de até `size` caracteres, com sobreposição, cortando em fim de frase quando possível. */
export function chunkText(text, size = 900, overlap = 150) {
  if (overlap >= size) throw new Error('overlap deve ser menor que size');
  const clean = text.replace(/\s+/g, ' ').trim();
  const chunks = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + size, clean.length);
    if (end < clean.length) {
      let cut = clean.lastIndexOf('. ', end);
      if (cut < start + size / 2) cut = clean.lastIndexOf(' ', end);
      if (cut > start + size / 2) end = cut + 1;
    }
    const piece = clean.slice(start, end).trim();
    if (piece) chunks.push(piece);
    if (end >= clean.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks;
}

/** pages: [{ number, text }] -> [{ page, idx, content }] preservando a página de origem. */
export function chunkPages(pages, size, overlap) {
  const out = [];
  let idx = 0;
  for (const p of pages) {
    for (const content of chunkText(p.text, size, overlap)) out.push({ page: p.number, idx: idx++, content });
  }
  return out;
}

import { extractText, getDocumentProxy } from 'unpdf';
import { PdfError } from './errors.js';

/** Extrai o texto de cada página*/
export async function extractPages(buffer) {
  let pages;
  try {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: false });
    pages = text.map((t, i) => ({ number: i + 1, text: t.trim() }));
  } catch {
    throw new PdfError('Não consegui ler o PDF: o arquivo está corrompido ou protegido por senha.');
  }
  if (!pages.some((p) => p.text)) {
    throw new PdfError('Este PDF não tem texto extraível (provavelmente é escaneado). OCR ainda não é suportado.');
  }
  return pages;
}

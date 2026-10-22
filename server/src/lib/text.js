const STOP = new Set(
  ('a o as os um uma uns umas de do da dos das em no na nos nas por para com sem sob sobre entre ate que qual quais ' +
    'quando onde como quem se ao aos e ou mas nao sim mais menos muito muita muitos muitas ser sao era foi sera ter tem ' +
    'tinha ha isso isto esse essa esses essas este esta estes estas aquele aquela seu sua seus suas meu minha pelo pela ' +
    'pelos pelas ja so tambem').split(' '),
);

export const stripAccents = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export function contentTokens(text, { accents = true } = {}) {
  const words = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return words
    .filter((w) => w.length >= 3 && !STOP.has(stripAccents(w)))
    .map((w) => (accents ? w : stripAccents(w)));
}

export const stem = (w) => (w.length > 5 ? w.replace(/(mente|coes|cao|oes|es|s)$/, '') : w.replace(/s$/, ''));

export const toVector = (arr) => `[${arr.join(',')}]`;

export function splitSentences(text) {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-ZÀ-Ý0-9])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

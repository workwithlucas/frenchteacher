// Pronúncia da repetição guiada (AssemblyAI Universal Streaming): funções puras, sem I/O.
// A captura em si (WebSocket + microfone) fica em src/lib/repeatCapture.js.

const LOW_CONFIDENCE = 0.7;

const stripPunctuation = (w) => w.replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, '');

// Termos pra keyterms_prompt: a frase inteira (se for mais de uma palavra) + cada palavra
// dela, sem duplicar — assim a AssemblyAI reforça tanto a frase quanto cada palavra isolada.
export function keytermsFor(expectedRepeat, max = 100) {
  const words = expectedRepeat
    .split(/\s+/)
    .map(stripPunctuation)
    .filter(Boolean);
  const terms = words.length > 1 ? [expectedRepeat, ...words] : words;
  return [...new Set(terms)].slice(0, max);
}

// Resume a confiança de pronúncia de um turno: média entre as palavras e a de pior confiança.
export function summarizeWords(words) {
  const valid = (words ?? []).filter((w) => typeof w?.confidence === 'number');
  if (!valid.length) return { media: null, piorPalavra: null };
  const media = valid.reduce((sum, w) => sum + w.confidence, 0) / valid.length;
  const pior = valid.reduce((min, w) => (w.confidence < min.confidence ? w : min));
  return { media, piorPalavra: { palavra: pior.text, confianca: pior.confidence } };
}

// Nota oculta anexada à fala do aluno (não mostrada na tela) com o contexto de pronúncia
// pro professor. null quando não houve nada a avaliar (aluno não disse nada).
export function pronunciationNote({ expectedRepeat, media, piorPalavra }) {
  if (media === null) return null;
  const piorTexto = piorPalavra
    ? `; palavra com menor confiança: "${piorPalavra.palavra}" (${piorPalavra.confianca.toFixed(2)})`
    : '';
  const aviso =
    media < LOW_CONFIDENCE
      ? ' Abaixo de 0.7: pronúncia que provavelmente merece atenção — considere pedir pra repetir ou dar uma dica breve.'
      : '';
  return `[Pronúncia da repetição pedida («${expectedRepeat}»): confiança média ${media.toFixed(2)} (escala 0-1)${piorTexto}.${aviso}]`;
}

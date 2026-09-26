// Currículo CECRL — fonte da verdade para a progressão de blocos.
// `nivel` é o nível CECRL em que o aluno está enquanto cursa o bloco.

export const CURRICULUM = [
  // FASE 1 — semanas 1-6 (rumo a A2)
  {
    id: 1,
    fase: 1,
    nivel: 'A1.1',
    titulo: 'Fonética',
    topicos: [
      'Sons que não existem em português: [y] (tu), [ø]/[œ] (peu/sœur), nasais (an, in, on, un)',
      'Ritmo francês: sílaba tônica sempre na última, ligações (liaison) básicas',
      'Alfabeto e soletração (essencial pra formulários, ADEM, matrícula)',
    ],
  },
  {
    id: 2,
    fase: 1,
    nivel: 'A1.1',
    titulo: 'Estrutura base',
    topicos: [
      'Ordem sujeito-verbo-objeto, artigos definidos/indefinidos, gênero (regras práticas + exceções mais comuns)',
      'Concordância de adjetivo (posição antes/depois do substantivo — quando muda sentido: un homme grand x un grand homme)',
      'Negação (ne...pas e formas faladas sem "ne")',
      'Pronomes sujeitos e formas de tratamento (tu x vous — quando cada um, crucial socialmente)',
    ],
  },
  {
    id: 3,
    fase: 1,
    nivel: 'A1.1',
    titulo: 'Conjugação — presente',
    topicos: [
      '3 grupos regulares (-er, -ir, -re) com regra e exceção',
      'Verbos essenciais irregulares: être, avoir, aller, faire, pouvoir, vouloir, devoir',
      'Verbos pronominais (se lever, s\'appeler) — muito usados no cotidiano',
    ],
  },
  {
    id: 4,
    fase: 1,
    nivel: 'A1.2',
    titulo: 'Conjugação — passado',
    topicos: [
      'Passé composé (avoir x être como auxiliar, acordo do particípio)',
      'Imparfait (quando usar x passé composé — contraste é o ponto central, não regra isolada)',
    ],
  },
  {
    id: 5,
    fase: 1,
    nivel: 'A1.2',
    titulo: 'Conjunções e conectores básicos',
    topicos: ['et, mais, ou, donc, car, parce que', 'Contraste: mais x cependant (registro diferente)'],
  },
  {
    id: 6,
    fase: 1,
    nivel: 'A1.2',
    titulo: 'Futuro e revisão',
    topicos: [
      'Futur proche (aller + infinitivo) x futur simple',
      'Revisão geral com foco em situações reais (ADEM, mercado, escola dos filhos)',
    ],
  },

  // FASE 2 — semanas 7-14 (rumo a B1)
  {
    id: 7,
    fase: 2,
    nivel: 'A2.1',
    titulo: 'Registro e conotação',
    topicos: [
      'Mesma frase em 3 registros: formal, neutro, popular',
      'Fórmulas de polidez (demander/pouvoir + condicional = pedido educado)',
      'Quando "tu" vira ofensa e quando "vous" vira distância excessiva',
    ],
  },
  {
    id: 8,
    fase: 2,
    nivel: 'A2.1',
    titulo: 'Pronomes complementos',
    topicos: [
      'COD/COI (le, la, les, lui, leur) e ordem na frase',
      'Pronomes "y" e "en" — uso real, não regra decorada',
    ],
  },
  {
    id: 9,
    fase: 2,
    nivel: 'A2.1',
    titulo: 'Conjunções intermediárias',
    topicos: [
      'bien que, quoique (+ subjuntivo), tandis que, alors que',
      'Conectores de argumentação: en effet, par conséquent, cependant, néanmoins',
    ],
  },
  {
    id: 10,
    fase: 2,
    nivel: 'A2.2',
    titulo: 'Condicional',
    topicos: [
      'Presente do condicional — pedido educado, hipótese, conselho (à sua place, je...)',
      'Introdução ao "si" + imparfait + condicional (hipótese irreal do presente)',
    ],
  },
  {
    id: 11,
    fase: 2,
    nivel: 'A2.2',
    titulo: 'Subjuntivo — introdução',
    topicos: [
      'Quando aparece: desejo, dúvida, emoção, necessidade (il faut que...)',
      'Verbos mais usados no subjuntivo presente',
    ],
  },
  {
    id: 12,
    fase: 2,
    nivel: 'A2.2',
    titulo: 'Idiomatismos essenciais',
    topicos: [
      'Expressões de uso diário que não traduzem literal (avoir faim, avoir l\'air, il y a)',
      'Expressões úteis pra ADEM, entrevista, atendimento público',
    ],
  },

  // FASE 3 — semanas 15-20 (rumo a B2)
  {
    id: 13,
    fase: 3,
    nivel: 'B1.1',
    titulo: 'Subjuntivo — consolidação',
    topicos: [
      'Contraste subjuntivo x indicativo em frases próximas (je pense que + indicativo x je ne pense pas que + subjuntivo)',
      'Conjunções que sempre pedem subjuntivo: pour que, avant que, à moins que',
    ],
  },
  {
    id: 14,
    fase: 3,
    nivel: 'B1.1',
    titulo: 'Discurso indireto e concordância de tempos',
    topicos: [
      'Relatar o que alguém disse (il a dit que...) com ajuste de tempo verbal',
      'Essencial pra formulário, entrevista, relato de situação (ADEM, imigração)',
    ],
  },
  {
    id: 15,
    fase: 3,
    nivel: 'B1.1',
    titulo: 'Voz passiva e nominalização',
    topicos: [
      'Quando o francês prefere passiva ou construção com "on"',
      'Transformar verbo em substantivo (registro mais formal/escrito)',
    ],
  },
  {
    id: 16,
    fase: 3,
    nivel: 'B1.2',
    titulo: 'Conectores avançados de argumentação',
    topicos: [
      'de plus, en outre, toutefois, or, dès lors',
      'Estrutura de argumento formal (útil pra Direito, entrevista, e-mail formal)',
    ],
  },
  {
    id: 17,
    fase: 3,
    nivel: 'B1.2',
    titulo: 'Registro final e nuance cultural',
    topicos: [
      'Humor, ironia, understatement à francesa',
      'Expressões idiomáticas de nível B2, gírias comuns (sem exagero, uso real)',
      'Simulações completas: entrevista ADEM, atendimento em banco/prefeitura, conversa social',
    ],
  },

  // FASE 4 — semana 21+ (extensão rumo a C1)
  {
    id: 18,
    fase: 4,
    nivel: 'B2',
    titulo: 'Precisão de registro e matiz',
    topicos: [
      'Diferença fina entre sinônimos próximos (petit x minuscule x infime — quando cada um cabe)',
      'Ironia, eufemismo, litote (dizer menos pra significar mais — muito francês)',
    ],
  },
  {
    id: 19,
    fase: 4,
    nivel: 'B2',
    titulo: 'Estrutura de texto longo e argumentação complexa',
    topicos: [
      'Conectores de alto nível (en dépit de, quand bien même, nonobstant)',
      'Construção de argumento com concessão (reconhecer o contrário antes de refutar)',
    ],
  },
  {
    id: 20,
    fase: 4,
    nivel: 'B2',
    titulo: 'Compreensão de nuance cultural e referência implícita',
    topicos: [
      'Referências que um francês entende sem explicar (expressões, humor, referência histórica leve)',
      'Discurso técnico/formal (o que muda ao ouvir uma palestra, uma reunião, um noticiário)',
    ],
  },
];

export function getBlock(blockId) {
  return CURRICULUM.find((b) => b.id === blockId) ?? CURRICULUM[0];
}

export function nextBlockId(blockId) {
  const last = CURRICULUM[CURRICULUM.length - 1].id;
  return Math.min(blockId + 1, last);
}

// Texto que preenche {{bloco_do_dia}}: título do bloco + tópicos que ele cobre.
// O professor escolhe UMA regra dentre os tópicos, usando {{ultima_regra}} pra não repetir.
export function describeBlock(blockId) {
  const b = getBlock(blockId);
  return `Bloco ${b.id}: ${b.titulo} (tópicos do bloco: ${b.topicos.join('; ')})`;
}

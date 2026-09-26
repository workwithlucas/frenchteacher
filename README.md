# Professor de francês (PWA)

App de conversação em francês por voz, com professor de IA seguindo o CECRL.
Fluxo de cada turno: **falar → navegador transcreve em tempo real (Web Speech API) → Claude responde (streaming) → Fish Audio sintetiza → áudio toca**.

## Reconhecimento de fala

O reconhecimento de fala usa a **Web Speech API** do próprio navegador. Não passa pelas nossas
functions e não tem custo de API.

- A transcrição aparece **enquanto você fala** (resultados interinos).
- A fala é enviada sozinha depois de ~1,8 s de silêncio. Tocar no microfone envia antes.
- A escuta é em **francês (`fr-FR`)**. O seletor **FR/PT** ao lado do microfone permite fazer
  uma fala em português (`pt-BR`), por exemplo "não entendi" ou uma pergunta sobre a regra.
  Depois de cada fala, o seletor volta para FR.
- **Navegadores:** funciona no Chrome (Android e computador) e no Edge. O Safari expõe a API,
  mas ela é menos estável, sobretudo no app instalado na tela de início do iOS. O Firefox não
  tem suporte. Sem suporte, o app avisa na tela e desativa o botão de falar. Não existe fallback
  pago.
- No Chrome, o áudio é processado pelos servidores do Google, então é preciso estar online.

## Estrutura

```
├── index.html               # shell do PWA
├── vite.config.js           # React + manifest/service worker (vite-plugin-pwa)
├── netlify.toml             # build, functions e redirect SPA
├── .env.example             # variáveis de ambiente (configurar no Netlify)
├── public/                  # ícones
├── shared/                  # código usado pelo app E pelas functions
│   ├── curriculum.js        # os 20 blocos do currículo, nível CECRL de cada um
│   ├── teacherPrompt.js     # prompt de sistema do professor (texto exato) + preenchimento
│   ├── summaryPrompt.js     # prompt do resumo pós-sessão
│   ├── progress.js          # estado do aluno, erros recorrentes, tag avancar_bloco, corte de frases p/ TTS
│   ├── caderno.js           # entradas do Caderno, pergunta pendente, agrupamento por bloco
│   └── protocol.js
├── netlify/functions/       # proxy serverless — as chaves de API ficam só aqui
│   ├── chat.mjs             # POST /api/chat       → Claude (streaming de texto)
│   ├── tts.mjs              # POST /api/tts        → Fish Audio (mp3)
│   ├── summarize.mjs        # POST /api/summarize  → Claude Haiku (resumo + Caderno, saída estruturada)
│   └── _lib/                # utilitários (código de acesso, erros, validação)
├── src/
│   ├── App.jsx              # telas: perfil → início → sessão → resumo
│   ├── lib/api.js           # chamadas /api/*
│   ├── lib/speech.js        # reconhecimento de fala (Web Speech API, fr-FR / pt-BR)
│   ├── lib/speaker.js       # fila de áudio (toca trecho 1 enquanto sintetiza o 2)
│   ├── lib/teacherTurn.js   # orquestra um turno do professor
│   └── lib/storage.js       # localStorage: progresso por perfil, sessão em andamento
└── tests/                   # node --test (lógica + functions com fetch simulado)
```

## Como funciona o estado

Cada perfil (Lucas, Eduarda) tem seu progresso no `localStorage` do aparelho:
bloco atual (começa no Bloco 1, A1.1), última regra ensinada e histórico de erros.

- **Início da sessão:** o app preenche `nome_aluno`, `nivel_atual`, `bloco_do_dia`, `ultima_regra`
  e `erros_recorrentes` e congela esses valores durante a sessão. O prompt é montado no servidor.
- **Durante a sessão:** a tag `{{avancar_bloco: true/false}}` é removida do texto antes de ir
  para a tela e para o TTS. O último valor emitido é guardado.
- **Ao encerrar:** a segunda chamada ao Claude, feita com o **Haiku**, devolve `regra_ensinada`,
  `novos_erros`, `avancar_bloco` e, quando houve regra nova, a entrada do **Caderno**. Ela recebe
  como contexto a tag emitida pelo professor. Se `avancar_bloco` vier `true`, o app avança **um**
  bloco. A conversa por voz continua no Sonnet.
- **Erros recorrentes** são os que apareceram em 2 sessões ou mais, até 5 itens, os mais
  frequentes primeiro. O resumo recebe a lista de erros já registrados e reaproveita o mesmo
  texto quando o erro se repete.
- Uma sessão em andamento sobrevive a recarregar a página. Na volta, a tela inicial oferece
  "Continuar" ou "Descartar".

## Caderno

A aba **Caderno** guarda material escrito para reler fora da chamada de voz. É só leitura: não tem
exercícios, gabarito nem pontuação.

- **Quando nasce uma entrada:** cada sessão que ensinou uma regra nova do currículo gera uma
  entrada. Sessões só de conversa ou revisão não geram. Quem decide é a mesma chamada de
  encerramento (Haiku), que devolve `caderno: null` quando não houve regra nova. Nada é gerado
  durante a conversa, para não atrasar a voz.
- **O que a entrada contém:** a cena usada na abertura da regra, a regra explicada por extenso,
  de 3 a 5 exemplos comentados e uma pergunta aberta em francês, sem campo de resposta.
  Também guarda a data, o bloco, o aluno e o status da pergunta (`pendente` ou `retomada`).
- **Pergunta retomada:** ao iniciar a sessão seguinte, se a última entrada do aluno tiver pergunta
  pendente, ela é enviada ao professor na mensagem oculta de abertura, para ele usar como cena
  inicial. O prompt de sistema do professor não muda. Quando essa sessão é encerrada, a pergunta
  vira `retomada`. A resposta falada não é guardada.
- **Organização:** mais recentes primeiro, agrupadas por bloco e fase. Tocar numa entrada abre o
  conteúdo completo.

## Limitação conhecida: dados por aparelho

Nesta fase não existe backend, então **o progresso e o Caderno ficam salvos só no aparelho** (no
`localStorage` do navegador). Celular e computador têm progresso e Caderno separados. Usar sempre o
mesmo aparelho para cada aluno evita perder ou duplicar dados. Limpar os dados do navegador apaga
tudo. Resolver isso de verdade exige conta de usuário com backend, o que está fora do escopo
desta fase.

## Deploy no Netlify

1. No Netlify: **Add new site → Import an existing project → GitHub →** `workwithlucas/frenchteacher`.
   Build command e publish dir já vêm do `netlify.toml`.
2. **Site configuration → Environment variables**, preencha:
   - `ANTHROPIC_API_KEY`, `FISH_AUDIO_API_KEY` (obrigatórias)
   - `APP_ACCESS_CODE`: um código qualquer. O app pede esse código uma vez por aparelho.
     **Sem ele, qualquer pessoa com a URL consegue gastar suas chaves.**
   - `FISH_AUDIO_VOICE_ID`: ID de uma voz francesa escolhida em fish.audio (opcional; sem ele,
     usa a voz padrão da API)
   - opcionais: `FISH_AUDIO_MODEL`, `CLAUDE_MODEL` (conversa, padrão `claude-sonnet-5`),
     `SUMMARY_MODEL` (encerramento + Caderno, padrão `claude-haiku-4-5`)
3. Faça um novo deploy depois de salvar as variáveis. Elas só entram em vigor no deploy seguinte.
4. No celular, abra a URL e use "Adicionar à tela de início" para instalar como app.
   O microfone exige HTTPS, que o Netlify já fornece.

## Desenvolvimento local

```bash
npm install
npm test                 # testes (sem chamar APIs reais)
npx netlify dev          # app + functions em http://localhost:8888 (usa o .env)
```

`npm run dev` sozinho sobe só o frontend, sem as functions.

## Custos (estimativa aproximada, confira os preços atuais)

Por sessão de ~30 min: reconhecimento de fala sem custo (navegador), Claude Sonnet 5 ~US$ 0,20–0,40
(o histórico é reenviado a cada turno, com cache de prompt ligado), e Fish Audio ~US$ 0,20–0,30
(≈15 mil caracteres falados pelo professor). O encerramento com Caderno roda no Haiku e custa
~US$ 0,01–0,03. **Total: ~US$ 0,45–0,70 por sessão.**
Com US$ 50/mês para os dois, isso dá **~70–110 sessões de 30 min por mês no total**.

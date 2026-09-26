# Professor de francês (PWA)

App de conversação em francês por voz, com professor de IA seguindo o CECRL.
Fluxo de cada turno: **falar → Whisper transcreve → Claude responde (streaming) → Fish Audio sintetiza → áudio toca**.

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
│   └── protocol.js
├── netlify/functions/       # proxy serverless — as chaves de API ficam só aqui
│   ├── transcribe.mjs       # POST /api/transcribe → OpenAI Whisper
│   ├── chat.mjs             # POST /api/chat       → Claude (streaming de texto)
│   ├── tts.mjs              # POST /api/tts        → Fish Audio (mp3)
│   ├── summarize.mjs        # POST /api/summarize  → Claude (saída estruturada)
│   └── _lib/                # utilitários (código de acesso, erros, validação)
├── src/
│   ├── App.jsx              # telas: perfil → início → sessão → resumo
│   ├── lib/api.js           # chamadas /api/*
│   ├── lib/recorder.js      # microfone (MediaRecorder; webm ou mp4 no iOS)
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
- **Ao encerrar:** a segunda chamada ao Claude devolve `regra_ensinada`, `novos_erros` e
  `avancar_bloco`, e recebe como contexto a tag emitida pelo professor. Se `avancar_bloco` vier
  `true`, o app avança **um** bloco.
- **Erros recorrentes** são os que apareceram em 2 sessões ou mais, até 5 itens, os mais
  frequentes primeiro. O resumo recebe a lista de erros já registrados e reaproveita o mesmo
  texto quando o erro se repete.
- Uma sessão em andamento sobrevive a recarregar a página. Na volta, a tela inicial oferece
  "Continuar" ou "Descartar".

O progresso fica **só no aparelho**. Celular e computador têm progresso separado.

## Deploy no Netlify

1. No Netlify: **Add new site → Import an existing project → GitHub →** `workwithlucas/frenchteacher`.
   Build command e publish dir já vêm do `netlify.toml`.
2. **Site configuration → Environment variables**, preencha:
   - `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `FISH_AUDIO_API_KEY` (obrigatórias)
   - `APP_ACCESS_CODE`: um código qualquer. O app pede esse código uma vez por aparelho.
     **Sem ele, qualquer pessoa com a URL consegue gastar suas chaves.**
   - `FISH_AUDIO_VOICE_ID`: ID de uma voz francesa escolhida em fish.audio (opcional; sem ele,
     usa a voz padrão da API)
   - opcionais: `FISH_AUDIO_MODEL`, `CLAUDE_MODEL` (padrão `claude-sonnet-5`)
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

Por sessão de ~30 min: Whisper ~US$ 0,06 (≈10 min de fala do aluno), Claude Sonnet 5 ~US$ 0,20–0,40
(o histórico é reenviado a cada turno, com cache de prompt ligado), e Fish Audio ~US$ 0,20–0,30
(≈15 mil caracteres falados pelo professor). **Total: ~US$ 0,50–0,80 por sessão.**
Com US$ 50/mês para os dois, isso dá **~60–100 sessões de 30 min por mês no total**.

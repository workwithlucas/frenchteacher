import { useEffect, useMemo, useRef, useState } from 'react';
import {
  PROFILES,
  loadProgress,
  saveProgress,
  loadSession,
  saveSession,
  loadLastProfileId,
  saveLastProfileId,
  loadAccessCode,
  saveAccessCode,
  loadCaderno,
  saveCaderno,
} from './lib/storage.js';
import { ApiError, correctWriting, summarize } from './lib/api.js';
import { LANGS, Listener, isSpeechRecognitionSupported } from './lib/speech.js';
import { Speaker } from './lib/speaker.js';
import { runTeacherTurn } from './lib/teacherTurn.js';
import { getBlock, describeBlock } from '../shared/curriculum.js';
import { SESSION_OPENER } from '../shared/teacherPrompt.js';
import { applySessionSummary, nivelAtual, recurringErrors, teacherPromptVars } from '../shared/progress.js';
import { applySupportUsage, buildSessionSupport, supportNotes } from '../shared/apoio.js';
import {
  createCadernoEntry,
  groupByBlock,
  markQuestionResumed,
  pendingQuestion,
  resumeQuestionNote,
  saveWriting,
} from '../shared/caderno.js';

const UNSUPPORTED_MESSAGE =
  'Este navegador não tem reconhecimento de voz nativo, então não dá para falar com o professor por aqui. Use o Chrome (Android ou computador) ou o Edge.';

// Um único Speaker para o app todo: é destravado no toque de "Iniciar sessão".
let speakerSingleton = null;
function getSpeaker() {
  speakerSingleton ??= new Speaker();
  return speakerSingleton;
}

export default function App() {
  const [profileId, setProfileId] = useState(loadLastProfileId);
  const profile = PROFILES.find((p) => p.id === profileId);

  if (!profile) {
    return (
      <ProfilePicker
        onPick={(id) => {
          saveLastProfileId(id);
          setProfileId(id);
        }}
      />
    );
  }
  return (
    <ProfileHome
      key={profile.id}
      profile={profile}
      onSwitch={() => {
        saveLastProfileId(null);
        setProfileId(null);
      }}
    />
  );
}

function ProfilePicker({ onPick }) {
  return (
    <main className="screen center">
      <h1>Professor de francês</h1>
      <p className="muted">Quem vai praticar agora?</p>
      <div className="profiles">
        {PROFILES.map((p) => (
          <button key={p.id} className="btn big" onClick={() => onPick(p.id)}>
            {p.nome}
          </button>
        ))}
      </div>
      <AccessCodeForm />
    </main>
  );
}

function AccessCodeForm({ onSaved }) {
  const [code, setCode] = useState(loadAccessCode);
  const [saved, setSaved] = useState(false);
  return (
    <form
      className="access"
      onSubmit={(e) => {
        e.preventDefault();
        saveAccessCode(code.trim());
        setSaved(true);
        onSaved?.();
      }}
    >
      <label htmlFor="access-code">Código de acesso</label>
      <div className="row">
        <input
          id="access-code"
          type="password"
          autoComplete="off"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setSaved(false);
          }}
        />
        <button className="btn small" type="submit">
          {saved ? 'Salvo' : 'Salvar'}
        </button>
      </div>
    </form>
  );
}

function ProfileHome({ profile, onSwitch }) {
  const [progress, setProgress] = useState(() => loadProgress(profile));
  const [session, setSession] = useState(() => loadSession(profile.id));
  const [active, setActive] = useState(false);
  const [result, setResult] = useState(null);
  const [caderno, setCaderno] = useState(() => loadCaderno(profile.id));
  const [tab, setTab] = useState('aula');

  const block = getBlock(progress.blocoId);
  const erros = recurringErrors(progress);

  function start() {
    getSpeaker().unlock(); // precisa acontecer dentro do toque
    if (!session) {
      const fresh = {
        startedAt: new Date().toISOString(),
        // Variáveis congeladas no início: o prompt fica estável durante a sessão toda.
        vars: teacherPromptVars(progress),
        blocoId: progress.blocoId,
        lastTag: null,
        // Pergunta aberta pendente da última entrada do Caderno, retomada na abertura.
        perguntaRetomada: pendingQuestion(caderno),
        // Vocabulário do nível, provérbio sugerido e revisão espaçada (se for a vez).
        apoio: buildSessionSupport(progress, caderno, nivelAtual(progress)),
        messages: [],
      };
      saveSession(profile.id, fresh);
      setSession(fresh);
    }
    setResult(null);
    setActive(true);
  }

  function discard() {
    saveSession(profile.id, null);
    setSession(null);
  }

  if (active && session) {
    return (
      <SessionView
        profile={profile}
        progress={progress}
        initialSession={session}
        onClose={(outcome) => {
          setActive(false);
          if (outcome?.progress) {
            setProgress(outcome.progress);
            setResult(outcome);
          }
          setSession(loadSession(profile.id));
          setCaderno(loadCaderno(profile.id));
        }}
      />
    );
  }

  return (
    <main className="screen">
      <header className="topbar">
        <strong>{profile.nome}</strong>
        <button className="link" onClick={onSwitch}>
          trocar perfil
        </button>
      </header>

      <nav className="tabs" role="tablist">
        <button
          role="tab"
          aria-selected={tab === 'aula'}
          className={tab === 'aula' ? 'on' : ''}
          onClick={() => setTab('aula')}
        >
          Aula
        </button>
        <button
          role="tab"
          aria-selected={tab === 'caderno'}
          className={tab === 'caderno' ? 'on' : ''}
          onClick={() => setTab('caderno')}
        >
          Caderno
        </button>
      </nav>

      {tab === 'caderno' ? (
        <CadernoView
          entries={caderno}
          nivel={nivelAtual(progress)}
          onChange={(next) => {
            saveCaderno(profile.id, next);
            setCaderno(next);
          }}
        />
      ) : (
        <>
          {result && <SummaryCard result={result} />}

          <section className="card">
            <div className="kv">
              <span>Nível</span>
              <strong>{nivelAtual(progress)}</strong>
            </div>
            <div className="kv">
              <span>Bloco</span>
              <strong>
                {block.id}. {block.titulo}
              </strong>
            </div>
            <ul className="topics">
              {block.topicos.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
            <div className="kv">
              <span>Última regra</span>
              <span>{progress.ultimaRegra ?? '—'}</span>
            </div>
            <div className="kv">
              <span>Erros recorrentes</span>
              <span>{erros.length ? erros.join('; ') : '—'}</span>
            </div>
          </section>

          {!isSpeechRecognitionSupported() && (
            <p className="error" role="alert">
              {UNSUPPORTED_MESSAGE}
            </p>
          )}

          {session ? (
            <div className="actions">
              <button className="btn big primary" onClick={start} disabled={!isSpeechRecognitionSupported()}>
                Continuar sessão em andamento
              </button>
              <button className="link danger" onClick={discard}>
                Descartar sessão sem salvar
              </button>
            </div>
          ) : (
            <div className="actions">
              <button className="btn big primary" onClick={start} disabled={!isSpeechRecognitionSupported()}>
                Iniciar sessão
              </button>
            </div>
          )}
        </>
      )}
    </main>
  );
}

const formatDate = (iso) =>
  new Date(iso).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' });

// Biblioteca de leitura: entradas agrupadas por bloco, mais recentes primeiro. Somente leitura.
function CadernoView({ entries, nivel, onChange }) {
  const groups = useMemo(() => groupByBlock(entries), [entries]);
  if (!groups.length) {
    return (
      <p className="muted empty">
        O Caderno ainda está vazio. Cada sessão que ensinar uma regra nova ganha aqui uma página para reler: a cena, a
        regra por extenso, exemplos comentados e uma pergunta para a próxima aula.
      </p>
    );
  }
  return (
    <div className="caderno">
      {groups.map((g) => (
        <section key={g.blocoId} className="caderno-group">
          <h2>
            <span className="muted">Fase {g.fase} · </span>Bloco {g.blocoId}: {g.blocoTitulo}
          </h2>
          {g.entries.map((e) => (
            <details key={e.id} className="card entry">
              <summary>
                <span className="entry-title">{e.regraTitulo}</span>
                <span className="muted entry-date">{formatDate(e.criadoEm)}</span>
              </summary>
              <h3>Cena</h3>
              <p>{e.cena}</p>
              <h3>A regra</h3>
              {e.regra.split(/\n\s*\n/).map((par, i) => (
                <p key={i}>{par}</p>
              ))}
              <h3>Exemplos</h3>
              <ul className="examples">
                {e.exemplos.map((ex, i) => (
                  <li key={i}>
                    <p lang="fr" className="fr">
                      {ex.frase}
                    </p>
                    {ex.nuance && <p className="muted">{ex.nuance}</p>}
                  </li>
                ))}
              </ul>
              <h3>Para pensar até a próxima aula</h3>
              <p lang="fr" className="fr">
                {e.perguntaAberta}
              </p>
              <p className="muted small">
                {e.perguntaStatus === 'retomada'
                  ? 'Pergunta retomada numa aula seguinte.'
                  : 'O professor retoma esta pergunta no começo da próxima aula.'}
              </p>
              <WritingBox
                entry={e}
                nivel={nivel}
                onSaved={(texto, correcao) => onChange(saveWriting(entries, e.id, { texto, correcao }))}
              />
            </details>
          ))}
        </section>
      ))}
    </div>
  );
}

// Expressão escrita: opcional. A correção (Haiku) só é pedida quando o aluno envia.
function WritingBox({ entry, nivel, onSaved }) {
  const [editing, setEditing] = useState(!entry.escrita);
  const [texto, setTexto] = useState(entry.escrita?.texto ?? '');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const inputId = `escrita-${entry.id}`;

  async function send(ev) {
    ev.preventDefault();
    const t = texto.trim();
    if (!t) return;
    setSending(true);
    setError(null);
    try {
      const correcao = await correctWriting({
        texto: t,
        convite: entry.conviteEscrita,
        regra: entry.regraTitulo,
        nivel,
      });
      onSaved(t, correcao);
      setEditing(false);
    } catch (err) {
      setError(err);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="writing">
      <h3>Escrita</h3>
      <label htmlFor={inputId}>{entry.conviteEscrita}</label>
      {editing ? (
        <form onSubmit={send}>
          <textarea
            id={inputId}
            lang="fr"
            rows={4}
            maxLength={2000}
            value={texto}
            onChange={(ev) => setTexto(ev.target.value)}
            disabled={sending}
          />
          {error && (
            <p className="error" role="alert">
              {error.message}
            </p>
          )}
          <button className="btn small primary" type="submit" disabled={sending || !texto.trim()}>
            {sending ? 'Corrigindo…' : 'Enviar para correção'}
          </button>
        </form>
      ) : (
        entry.escrita && (
          <div className="correction">
            <p className="muted small">Você escreveu:</p>
            <p lang="fr" className="fr">
              {entry.escrita.texto}
            </p>
            <p className="muted small">Versão corrigida:</p>
            <p lang="fr" className="fr corrected">
              {entry.escrita.correcao.versao_corrigida}
            </p>
            <p className="explanation">{entry.escrita.correcao.explicacao}</p>
            <button className="link" onClick={() => setEditing(true)}>
              Escrever de novo
            </button>
          </div>
        )
      )}
    </div>
  );
}

function SummaryCard({ result }) {
  const { summary, before, progress } = result;
  const advanced = progress.blocoId !== before.blocoId;
  return (
    <section className="card summary">
      <h2>Resumo da sessão</h2>
      <div className="kv">
        <span>Regra de hoje</span>
        <span>{summary.regra_ensinada}</span>
      </div>
      <div className="kv">
        <span>Erros observados</span>
        <span>{summary.novos_erros.length ? summary.novos_erros.join('; ') : 'nenhum'}</span>
      </div>
      <div className="kv">
        <span>Caderno</span>
        <span>
          {result.cadernoEntry
            ? `nova página: ${result.cadernoEntry.regraTitulo}`
            : 'sem página nova (não houve regra nova)'}
        </span>
      </div>
      <div className="kv">
        <span>Próxima sessão</span>
        <span>
          {advanced
            ? `avança para o bloco ${progress.blocoId}: ${getBlock(progress.blocoId).titulo}`
            : `continua no bloco ${progress.blocoId}`}
        </span>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

const PHASE_LABEL = {
  idle: 'Toque no microfone para falar',
  listening: 'Ouvindo… envia sozinho quando você parar (ou toque para enviar)',
  thinking: 'Professor pensando…',
  speaking: 'Professor falando… (toque para interromper e falar)',
  ending: 'Gerando resumo da sessão…',
};

function SessionView({ profile, progress, initialSession, onClose }) {
  const [session, setSessionState] = useState(initialSession);
  const sessionRef = useRef(initialSession);
  const [phase, setPhase] = useState('idle');
  const [speaking, setSpeaking] = useState(false);
  const [liveText, setLiveText] = useState('');
  const [error, setError] = useState(null);
  const [retry, setRetry] = useState(null);
  const [lang, setLang] = useState('fr');
  const [heardText, setHeardText] = useState('');

  const speaker = getSpeaker();
  const listenerRef = useRef(null);
  const listRef = useRef(null);

  const persist = (next) => {
    sessionRef.current = next;
    saveSession(profile.id, next);
    setSessionState(next);
  };

  const fail = (err, retryFn = null) => {
    console.error(err);
    setError(err);
    setRetry(() => retryFn);
  };

  // Liga o alto-falante à interface e mantém a tela acesa durante a sessão.
  useEffect(() => {
    speaker.onSpeakingChange = setSpeaking;
    speaker.onError = (err) => fail(err);
    let wakeLock = null;
    navigator.wakeLock
      ?.request('screen')
      .then((l) => (wakeLock = l))
      .catch(() => {});
    return () => {
      speaker.stop();
      speaker.onSpeakingChange = () => {};
      speaker.onError = () => {};
      listenerRef.current?.cancel();
      wakeLock?.release().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sessão nova: o professor abre a aula. Sessão retomada com fala pendente: oferece repetir.
  const openedRef = useRef(false);
  useEffect(() => {
    if (openedRef.current) return;
    openedRef.current = true;
    const msgs = sessionRef.current.messages;
    if (msgs.length === 0) {
      const pq = sessionRef.current.perguntaRetomada;
      const opener = [
        SESSION_OPENER,
        ...(pq ? [resumeQuestionNote(pq.pergunta)] : []),
        ...supportNotes(sessionRef.current.apoio),
      ].join('\n');
      teacherTurn([{ role: 'user', content: opener, hidden: true }]);
    } else if (msgs[msgs.length - 1].role === 'user') {
      setRetry(() => () => teacherTurn(msgs));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [session.messages.length, liveText, heardText]);

  async function teacherTurn(msgs) {
    persist({ ...sessionRef.current, messages: msgs });
    setPhase('thinking');
    setLiveText('');
    setError(null);
    setRetry(null);
    try {
      const { raw, clean, advanceTag } = await runTeacherTurn({
        vars: sessionRef.current.vars,
        messages: msgs.map(({ role, content }) => ({ role, content })),
        speaker,
        onText: setLiveText,
      });
      if (!clean) throw new Error('O professor não respondeu nada. Tente de novo.');
      persist({
        ...sessionRef.current,
        messages: [...msgs, { role: 'assistant', content: raw, display: clean }],
        lastTag: advanceTag ?? sessionRef.current.lastTag,
      });
    } catch (err) {
      fail(err, () => teacherTurn(msgs));
    } finally {
      setLiveText('');
      setPhase('idle');
    }
  }

  function onMic() {
    if (phase === 'listening') return listenerRef.current?.finish();
    if (phase !== 'idle') return;
    speaker.stop(); // aluno interrompe o professor
    setError(null);
    setHeardText('');
    try {
      const listener = new Listener({
        lang: LANGS[lang].code,
        onInterim: setHeardText,
        onFinal: (text) => {
          listenerRef.current = null;
          setHeardText('');
          setLang('fr'); // o seletor volta para francês depois de cada fala
          if (!text) {
            setPhase('idle');
            return fail(new Error('Não ouvi nada. Toque no microfone e fale de novo.'));
          }
          sendStudentText(text);
        },
        onError: (err) => {
          listenerRef.current = null;
          setHeardText('');
          setPhase('idle');
          fail(err);
        },
      });
      listenerRef.current = listener;
      listener.start();
      setPhase('listening');
    } catch (err) {
      listenerRef.current = null;
      setPhase('idle');
      fail(err);
    }
  }

  function sendStudentText(text) {
    const msgs = [...sessionRef.current.messages];
    const last = msgs[msgs.length - 1];
    // Se a resposta anterior do professor falhou, junta a nova fala à anterior.
    if (last?.role === 'user' && !last.hidden) {
      msgs[msgs.length - 1] = { ...last, content: `${last.content}\n${text}` };
    } else {
      msgs.push({ role: 'user', content: text });
    }
    return teacherTurn(msgs);
  }

  async function endSession() {
    speaker.stop();
    listenerRef.current?.cancel();
    listenerRef.current = null;
    setHeardText('');

    const current = sessionRef.current;
    const visible = current.messages.filter((m) => !m.hidden);
    if (!visible.some((m) => m.role === 'user')) {
      // O aluno não falou nada: não há o que resumir.
      saveSession(profile.id, null);
      return onClose(null);
    }

    setPhase('ending');
    setError(null);
    setRetry(null);
    try {
      const transcript = visible
        .map((m) => `${m.role === 'user' ? 'Aluno' : 'Professor'}: ${m.display ?? m.content}`)
        .join('\n\n');
      const summary = await summarize({
        bloco: describeBlock(current.blocoId ?? progress.blocoId),
        errosRegistrados: progress.errorLog.map((e) => e.erro),
        tagProfessor: current.lastTag ?? null,
        proverbio: current.apoio?.proverbio ?? null,
        transcript,
      });
      const now = new Date();
      const cadernoEntry = createCadernoEntry(summary, {
        alunoId: profile.id,
        alunoNome: profile.nome,
        blocoId: current.blocoId ?? progress.blocoId,
        now,
      });
      const teacherText = visible
        .filter((m) => m.role === 'assistant')
        .map((m) => m.display ?? m.content)
        .join('\n');
      const next = applySupportUsage(applySessionSummary(progress, summary, now), {
        apoio: current.apoio,
        teacherText,
        cadernoEntry,
        now,
      });
      let caderno = loadCaderno(profile.id);
      if (current.perguntaRetomada) caderno = markQuestionResumed(caderno, current.perguntaRetomada.id);
      if (cadernoEntry) caderno = [...caderno, cadernoEntry];
      saveCaderno(profile.id, caderno);
      saveProgress(profile.id, next);
      saveSession(profile.id, null);
      onClose({ summary, before: progress, progress: next, cadernoEntry });
    } catch (err) {
      setPhase('idle');
      fail(err, () => endSession());
    }
  }

  const status = phase === 'idle' && speaking ? 'speaking' : phase;
  const busy = ['thinking', 'ending'].includes(phase);
  const supported = isSpeechRecognitionSupported();
  const visibleMessages = useMemo(() => session.messages.filter((m) => !m.hidden), [session.messages]);

  return (
    <main className="screen session">
      <header className="topbar">
        <strong>
          {profile.nome} · {session.vars.nivel_atual}
        </strong>
        <button className="btn small" onClick={endSession} disabled={phase === 'ending'}>
          Encerrar sessão
        </button>
      </header>

      <div className="transcript" ref={listRef} aria-live="polite">
        {visibleMessages.map((m, i) => (
          <p key={i} className={`bubble ${m.role}`}>
            {m.display ?? m.content}
          </p>
        ))}
        {heardText && <p className="bubble user live">{heardText}</p>}
        {liveText && <p className="bubble assistant live">{liveText}</p>}
      </div>

      {error && (
        <div className="error" role="alert">
          <p>{error.message}</p>
          {error instanceof ApiError && error.code === 'bad_access_code' && (
            <AccessCodeForm onSaved={() => setError(null)} />
          )}
          {retry && (
            <button className="btn small" onClick={() => retry()} disabled={busy}>
              Tentar de novo
            </button>
          )}
        </div>
      )}

      <footer className="controls">
        <p className={`status ${status}`}>{supported ? PHASE_LABEL[status] : UNSUPPORTED_MESSAGE}</p>
        <div className="mic-row">
          <div className="lang-toggle" role="group" aria-label="Idioma da fala">
            {Object.entries(LANGS).map(([key, { label }]) => (
              <button
                key={key}
                className={lang === key ? 'on' : ''}
                aria-pressed={lang === key}
                onClick={() => setLang(key)}
                disabled={phase === 'listening'}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            className={`mic ${status}`}
            onClick={onMic}
            disabled={busy || !supported}
            aria-label={phase === 'listening' ? 'Parar e enviar' : 'Falar'}
          >
            <MicIcon />
          </button>
          <div className="mic-row-spacer" />
        </div>
      </footer>
    </main>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" width="40" height="40" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z"
      />
    </svg>
  );
}

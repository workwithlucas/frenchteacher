import { useEffect, useMemo, useRef, useState } from 'react';
import { PROFILES, loadProgress, saveProgress, loadSession, saveSession, loadLastProfileId, saveLastProfileId, loadAccessCode, saveAccessCode } from './lib/storage.js';
import { ApiError, summarize } from './lib/api.js';
import { LANGS, Listener, isSpeechRecognitionSupported } from './lib/speech.js';
import { Speaker } from './lib/speaker.js';
import { runTeacherTurn } from './lib/teacherTurn.js';
import { getBlock, describeBlock } from '../shared/curriculum.js';
import { SESSION_OPENER } from '../shared/teacherPrompt.js';
import { applySessionSummary, nivelAtual, recurringErrors, teacherPromptVars } from '../shared/progress.js';

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
    </main>
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
    navigator.wakeLock?.request('screen').then((l) => (wakeLock = l)).catch(() => {});
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
      teacherTurn([{ role: 'user', content: SESSION_OPENER, hidden: true }]);
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
        transcript,
      });
      const next = applySessionSummary(progress, summary);
      saveProgress(profile.id, next);
      saveSession(profile.id, null);
      onClose({ summary, before: progress, progress: next });
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

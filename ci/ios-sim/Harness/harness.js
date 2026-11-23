// Pilote de test injecté dans la page (WKUserScript) : réglages, page Emma, « Commencer », puis
// suit la conversation et renvoie au fil de l'eau les bulles et le journal de l'appli.
(() => {
  if (window.__harnessStarted) return;
  window.__harnessStarted = true;
  const H = window.__HARNESS || {};
  const post = (m) => {
    try {
      window.webkit.messageHandlers.harness.postMessage(String(m));
    } catch (e) {
      /* hors appli de test */
    }
  };
  const t0 = Date.now();
  const sec = () => `[${Math.round((Date.now() - t0) / 1000)}s]`;
  window.addEventListener('error', (e) => post(`js-error ${e.message || ''} ${(e.filename || '').split('/').pop()}:${e.lineno || ''}`));
  window.addEventListener('unhandledrejection', (e) => post(`js-rejection ${String(e.reason).slice(0, 200)}`));

  // Espions : niveaux du micro (messages du worklet de capture) et texte rendu par Whisper.
  const levels = [];
  const spy = (proto) => {
    const d = Object.getOwnPropertyDescriptor(proto, 'onmessage');
    if (!d || !d.set) return;
    Object.defineProperty(proto, 'onmessage', {
      configurable: true,
      get() {
        return d.get.call(this);
      },
      set(fn) {
        if (typeof fn !== 'function') return d.set.call(this, fn);
        return d.set.call(this, function (e) {
          try {
            const m = e && e.data;
            if (m && typeof m.rms === 'number') levels.push(m.rms);
            else if (m && m.type === 'result' && typeof m.text === 'string') post(`whisper texte « ${m.text.slice(0, 120)} »`);
          } catch (err) {
            /* ignore */
          }
          return fn.call(this, e);
        });
      },
    });
  };
  spy(MessagePort.prototype);
  spy(Worker.prototype);
  setInterval(() => {
    if (!levels.length) return;
    const xs = levels.splice(0);
    const zeros = xs.filter((x) => x === 0).length;
    const max = Math.max(...xs);
    const avg = xs.reduce((a, b) => a + b, 0) / xs.length;
    post(`niveaux micro : ${xs.length} blocs, moyenne ${avg.toFixed(4)}, max ${max.toFixed(4)}, nuls ${zeros}`);
  }, 3000);

  // Mode « voix » : le simulateur n'offre que des micros factices (un sifflement continu) ; la page
  // reçoit à la place la réponse enregistrée, rejouée à chaque ouverture du micro (puis du silence).
  let voiceInstalled = false;
  const installVoice = () => {
    if (voiceInstalled || H.mode !== 'voix' || !window.MediaDevices || !MediaDevices.prototype.getUserMedia) return;
    voiceInstalled = true;
    const realProto = MediaDevices.prototype.getUserMedia;
    let buf = null;
    MediaDevices.prototype.getUserMedia = async function (c) {
      if (!c || !c.audio) return realProto.call(this, c);
      const Ctor = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctor();
      if (!buf) {
        const bytes = H.wav
          ? Uint8Array.from(atob(H.wav), (ch) => ch.charCodeAt(0)).buffer
          : await (await fetch('/__harness-user-says.wav')).arrayBuffer();
        buf = await ctx.decodeAudioData(bytes);
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const dst = ctx.createMediaStreamDestination();
      src.connect(dst);
      await ctx.resume().catch(() => undefined);
      src.start(ctx.currentTime + 0.3);
      for (const t of dst.stream.getAudioTracks()) {
        const stop = t.stop.bind(t);
        t.stop = () => {
          try {
            src.stop();
          } catch (e) {
            /* déjà arrêtée */
          }
          stop();
          ctx.close().catch(() => undefined);
        };
      }
      post(`getUserMedia remplacé : réponse enregistrée (${buf.duration.toFixed(1)} s, lecteur ${ctx.state})`);
      return dst.stream;
    };
    post('remplacement du micro installé (MediaDevices.prototype.getUserMedia)');
  };
  installVoice();

  if (!sessionStorage.getItem('h:stage')) {
    localStorage.clear();
    const settings = Object.assign({ handsFree: true, llmProvider: 'scripted', subtitles: true }, H.settings || {});
    localStorage.setItem('teatime-english:v1', JSON.stringify({ settings, profile: { name: 'Tom', onboarded: true, level: 'A2' } }));
    sessionStorage.setItem('h:stage', 'run');
    post(`réglages écrits ${JSON.stringify(settings)}`);
    location.href = `${location.origin}${location.pathname}?r=${Date.now()}#/emma`;
    return;
  }

  const SR = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  post(`page ${location.href} · UA ${navigator.userAgent} · audioSession ${navigator.audioSession ? navigator.audioSession.type : 'absente'} · SpeechRecognition ${SR}`);
  let clicked = false;
  let lastBtn = '';
  let shown = 0;
  let lastJ = 0;
  let done = false;

  let devicesShown = false;
  // Écoutes : ouvertures du micro, et celles qui ont livré du son.
  let opens = 0;
  let sounds = 0;
  let typeAt = 0;
  let typed = 0;
  const answers = ['I like to go to the beach with my family', 'I usually read books in the evening', 'My favourite food is pizza'];
  const journal = () => {
    try {
      const j = JSON.parse(localStorage.getItem('teatime:journal') || '[]');
      for (const e of j) {
        if (e.t <= lastJ) continue;
        lastJ = e.t;
        post(`J ${new Date(e.t).toISOString().slice(11, 23)} ${e.e}`);
        if (/^micro ouvert/.test(e.e)) opens++;
        if (/^micro : premier son/.test(e.e)) {
          sounds++;
          // Mode « tape » : réponse tapée 3 s après que le micro rouvert a livré du son.
          if (H.mode === 'tape') typeAt = Date.now() + 3000;
        }
        if (!devicesShown && /micro ouvert/.test(e.e)) {
          devicesShown = true;
          navigator.mediaDevices
            .enumerateDevices()
            .then((ds) => post(`micros : ${ds.filter((d) => d.kind === 'audioinput').map((d) => d.label || d.deviceId.slice(0, 8)).join(' | ')}`))
            .catch((err) => post(`micros ? ${err}`));
        }
      }
    } catch (err) {
      post(`journal illisible ${err}`);
    }
  };

  const finish = (why) => {
    if (done) return;
    done = true;
    journal();
    let stt = '?';
    try {
      const s = JSON.parse(localStorage.getItem('teatime-english:v1')).settings;
      stt = `${s.sttEngine} · rév. ${s.settingsRev} · ${s.whisperModel}`;
    } catch (e) {
      /* ignore */
    }
    const users = [...document.querySelectorAll('.chat .bubble.user')].length;
    post(`${sec()} ${why} · réponses ${users} (dont tapées ${typed}) · écoutes ${opens}, avec du son ${sounds} · réglages ${stt}`);
    post('EXIT');
  };

  const tick = () => {
    if (done) return;
    installVoice();
    journal();
    if (!clicked) {
      const btns = [...document.querySelectorAll('button')]
        .filter((b) => /Commencer|échauffe|Préparation/.test(b.textContent))
        .map((b) => b.textContent.trim().slice(0, 60) + (b.disabled ? ' [désactivé]' : ''));
      const s = btns.join(' | ');
      if (s !== lastBtn) {
        lastBtn = s;
        post(`${sec()} boutons : ${s}`);
      }
      const b = [...document.querySelectorAll('button')].find((x) => /Commencer la conversation/.test(x.textContent) && !x.disabled);
      if (b) {
        b.click();
        clicked = true;
        post(`${sec()} clic « Commencer la conversation »`);
      }
    } else {
      const bubbles = [...document.querySelectorAll('.chat .bubble')]
        .filter((b) => !b.classList.contains('interim'))
        .map((b) => (b.classList.contains('user') ? 'MOI : ' : 'EMMA : ') + b.textContent.trim().replace(/\s+/g, ' ').slice(0, 120));
      bubbles.slice(shown).forEach((l) => post(`${sec()} ${l}`));
      shown = bubbles.length;
      const users = bubbles.filter((l) => l.startsWith('MOI : ')).length;
      const lastIsEmma = bubbles.length > 0 && bubbles[bubbles.length - 1].startsWith('EMMA : ');
      // Fin : assez de réponses, Emma a répondu à la dernière, et (mode « tape ») le micro s'est rouvert ensuite avec du son.
      if (users >= (H.turns || 3) && lastIsEmma && (H.mode !== 'tape' || sounds > users)) finish('FIN');
      if (typeAt && Date.now() >= typeAt && typed < (H.turns || 3)) {
        typeAt = 0;
        const input = document.querySelector('input[aria-label="Écrire une réponse"]');
        if (input) {
          const text = answers[typed % answers.length];
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, text);
          input.dispatchEvent(new Event('input', { bubbles: true }));
          setTimeout(() => {
            const form = input.closest('form');
            if (form) form.requestSubmit();
            typed++;
            post(`${sec()} réponse tapée « ${text} »`);
          }, 300);
        }
      }
      const err = document.querySelector('.error, [role="alert"]');
      if (err && err.textContent.trim()) {
        const t = err.textContent.trim().slice(0, 160);
        if (t !== window.__lastErr) {
          window.__lastErr = t;
          post(`${sec()} message d’erreur : ${t}`);
        }
      }
    }
    if (Date.now() - t0 > (H.timeout || 480) * 1000) finish('DÉLAI DÉPASSÉ');
  };
  setInterval(tick, 500);
})();

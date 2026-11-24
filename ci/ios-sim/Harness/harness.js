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

  // Mode « demarrage » : phase A, l'onglet s'ouvre (l'appli de test enregistre son état) ; phase B, après
  // la mise à jour du site, l'onglet est restauré comme Brave le fait au lancement. À chaque chargement :
  // ce qui s'affiche au bout de 15 s au plus (l'appli, l'écran de démarrage, ou rien).
  // Mode « reglages » : page Réglages d'un apprenant (journal rempli, plantage récent) à la largeur du
  // téléphone ; ce qui dépasse à droite (ascenseur horizontal), diagnostic fermé puis ouvert.
  if (H.mode === 'reglages') {
    if (!sessionStorage.getItem('h:stage')) {
      localStorage.clear();
      localStorage.setItem('teatime-english:v1', JSON.stringify({ settings: H.settings || {}, profile: { name: 'Tom', onboarded: true, level: 'A2' } }));
      const t = Date.now() - 600000;
      const lines = [
        '— page ouverte —',
        'micro ouvert (Whisper) · session play-and-record · capture 48000 Hz · lecteur de capture running',
        'whisper : modèle onnx-community/whisper-base chargé en 4,2 s · mémoire du moteur 615 Mo',
        'téléchargement https://huggingface.co/onnx-community/whisper-base/resolve/main/onnx/decoder_model_merged_quantized.onnx',
        'phrase de 3,4 s programmée · départ dans 0,0 s · lecteur running · tête 12,345 s · horloge 12,301 s',
        '⚠ PLANTAGE : la page a été tuée pendant « conversation (Emma parle) »',
      ];
      localStorage.setItem('teatime:journal', JSON.stringify(lines.concat(lines, lines).map((e, i) => ({ t: t + i * 1000, e }))));
      localStorage.setItem('teatime:last-crash', JSON.stringify({ label: 'conversation (Emma parle)', t: Date.now() - 60000 }));
      sessionStorage.setItem('h:stage', 'run');
      post('réglages et journal écrits');
      location.href = `${location.origin}${location.pathname}?r=${Date.now()}#/reglages`;
      return;
    }
    const measure = (label) => {
      const W = document.documentElement.clientWidth;
      const out = [];
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect();
        if (!r.width || r.right <= W + 0.5) continue;
        if ([...el.children].some((c) => c.getBoundingClientRect().right > W + 0.5)) continue;
        const cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().replace(/\s+/g, '.') : '';
        const path = [];
        for (let p = el.parentElement; p && p !== document.body && path.length < 4; p = p.parentElement) {
          path.push(p.tagName.toLowerCase() + (typeof p.className === 'string' && p.className.trim() ? '.' + p.className.trim().split(/\s+/)[0] : ''));
        }
        out.push(`${el.tagName.toLowerCase()}${cls} droite ${Math.round(r.right)} larg. ${Math.round(r.width)} « ${(el.textContent || el.value || '').trim().slice(0, 50)} » dans ${path.join(' < ')}`);
      }
      post(`${label} : largeur ${W} (fenêtre ${innerWidth}, vue ${window.visualViewport ? Math.round(visualViewport.width) : '?'}) · page ${document.documentElement.scrollWidth} · body ${document.body.scrollWidth} · ${out.length} éléments dépassent`);
      out.slice(0, 30).forEach((o) => post(`  dépasse : ${o}`));
    };
    // Débordement sans boîte qui dépasse : textes qui dépassent, puis ce qui le fait disparaître une
    // fois masqué (un élément à la fois), puis le correctif des menus injecté.
    const culprits = () => {
      const W = document.documentElement.clientWidth;
      const page = () => document.documentElement.scrollWidth;
      const base = page();
      if (base <= W) return post('  aucun débordement');
      const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let texts = 0;
      for (let n = tw.nextNode(); n; n = tw.nextNode()) {
        if (!n.textContent.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        const rr = range.getBoundingClientRect();
        if (rr.width && rr.right > W + 0.5 && texts++ < 10) post(`  texte qui dépasse : ${n.parentElement.tagName.toLowerCase()} → ${Math.round(rr.right)} « ${n.textContent.trim().slice(0, 60)} »`);
      }
      post(`  ${texts} texte(s) qui dépasse(nt)`);
      const name = (el) => {
        if (el.tagName === 'SELECT') return `menu « ${(el.options[el.selectedIndex] || {}).text || '?'} » (${el.getAttribute('aria-label') || (el.closest('label') || {}).firstChild?.textContent?.trim() || '?'})`;
        return `${el.tagName.toLowerCase()}${typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/)[0] : ''} « ${(el.textContent || '').trim().slice(0, 40)} »`;
      };
      let found = 0;
      for (const el of document.querySelectorAll('select, input, textarea, .engine-row, .card, .diag-section, .page-head, .section-title, details, .switch, .row')) {
        const prev = el.style.display;
        el.style.display = 'none';
        const w = page();
        el.style.display = prev;
        if (w < base && found++ < 15) post(`  sans ${name(el)} : page ${w}`);
      }
      const st = document.createElement('style');
      st.textContent = 'select { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }';
      document.head.appendChild(st);
      post(`  avec le correctif des menus injecté : page ${page()}`);
      st.remove();
    };
    post(`page ${location.href} · UA ${navigator.userAgent}`);
    setTimeout(() => {
      measure('diagnostic fermé');
      culprits();
      const d = document.getElementById('diagnostic');
      if (d) d.open = true;
      setTimeout(() => {
        measure('diagnostic ouvert');
        culprits();
        // Nouvelle version : rubriques d'effacement affichées ?
        post(`  rubriques d'effacement : ${document.querySelectorAll('.check-row').length}`);
        post('EXIT');
      }, 2500);
    }, 6000);
    return;
  }

  if (String(H.mode).startsWith('demarrage')) {
    const phase = H.phase || 'A';
    const nav = () => {
      try {
        return performance.getEntriesByType('navigation')[0].type;
      } catch (e) {
        return '?';
      }
    };
    window.addEventListener(
      'error',
      (e) => {
        const el = e.target;
        if (el && el.tagName) post(`${phase} échec de chargement ${el.tagName} ${(el.src || el.href || '').split('/').pop()}`);
      },
      true,
    );
    post(`${phase} chargement ${location.href} · ouverture ${nav()}`);
    let n = 0;
    let seen = 0;
    const tick = setInterval(() => {
      n++;
      const $ = (s) => document.querySelector(s);
      const app = !!$('.app');
      if (app && !seen) seen = n;
      // Phase B : 5 s de plus une fois l'appli affichée, le temps qu'elle se recharge vers la nouvelle version.
      if (app ? phase === 'B' && n - seen < 20 : n < 60) return;
      clearInterval(tick);
      let j = [];
      try {
        j = JSON.parse(localStorage.getItem('teatime:journal') || '[]').map((x) => x.e);
      } catch (e) {}
      const msg = $('#boot-msg') && !$('#boot-msg').hidden ? ` « ${$('#boot-msg').textContent} »` : '';
      const code = ($('script[type=module][src]') || {}).src || '?';
      const bg = getComputedStyle(document.body || document.documentElement).backgroundColor;
      post(`${phase} ${app ? 'APPLI AFFICHÉE' : 'RIEN D’AFFICHÉ'} (${(n / 4).toFixed(2)} s) · ouverture ${nav()} · code ${code.split('/').pop()} · écran de démarrage ${$('#boot') ? 'oui' : 'non'}${msg} · fond ${bg}`);
      j.slice(-4).forEach((e) => post(`${phase} journal : ${e}`));
      // Phase A : laisser le cache s'écrire avant que l'appli de test enregistre l'onglet et soit tuée.
      if (phase === 'A') setTimeout(() => post('PHASE-A'), 3000);
      else post('EXIT');
    }, 250);
    return;
  }

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

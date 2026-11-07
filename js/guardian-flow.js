/**
 * GuardIAn Flow — módulo compartilhado entre a landing (/) e o painel (/dashboard/).
 * Centraliza sessão, estado do tutorial, leitura do backend e a ponte com a extensão.
 * O progresso "real" vem sempre do backend: o tutorial só termina quando
 * GET /api/dispositivos retorna pelo menos um dispositivo vinculado.
 */
(function () {
  "use strict";

  var TOKEN_KEY = "guardian_token";
  var EMAIL_KEY = "guardian_email";
  var SETUP_TOKEN_KEY = "guardian_setup_token";
  var MINOR_EMAIL_KEY = "guardian_minor_email";

  var URLS = {
    landing: "/",
    auth: "/auth.html",
    onboarding: "/onboarding.html",
    dashboard: "/dashboard/",
    dependents: "/dashboard/dependents.html",
    devices: "/dashboard/devices.html",
    download: "/downloads/GuardIAn-Extensao.zip",
    protection: "/downloads/GuardIAn-Protecao.bat",
    installer: "/downloads/Instalar-GuardIAn.bat",
  };

  var listeners = {};
  function on(evt, cb) {
    (listeners[evt] = listeners[evt] || []).push(cb);
    return function () {
      listeners[evt] = (listeners[evt] || []).filter(function (f) { return f !== cb; });
    };
  }
  function emit(evt, data) {
    (listeners[evt] || []).slice().forEach(function (cb) {
      try { cb(data); } catch (e) { console.error(e); }
    });
  }

  // ---------- Sessão ----------
  function token() { return localStorage.getItem(SETUP_TOKEN_KEY) || localStorage.getItem(TOKEN_KEY); }
  function email() { return localStorage.getItem(EMAIL_KEY) || localStorage.getItem(MINOR_EMAIL_KEY) || ""; }
  function isLoggedIn() { return !!token(); }
  function isMinor() { return !!localStorage.getItem(MINOR_EMAIL_KEY); }
  function hasSetupSession() { return !!localStorage.getItem(SETUP_TOKEN_KEY); }
  function hasParentSession() { return !!localStorage.getItem(TOKEN_KEY); }
  function saveSession(tk, mail) {
    localStorage.removeItem(SETUP_TOKEN_KEY);
    localStorage.removeItem(MINOR_EMAIL_KEY);
    localStorage.setItem(TOKEN_KEY, tk);
    localStorage.setItem(EMAIL_KEY, mail);
  }

  async function revokeSession(tk) {
    if (!tk) return;
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 8000);
    try {
      var res = await fetch("/api/autenticacao/sair", {
        method: "POST",
        headers: { Authorization: "Bearer " + tk },
        signal: controller.signal,
        keepalive: true,
      });
      if (!res.ok && res.status !== 401) throw new Error("O servidor não confirmou o encerramento da sessão.");
    } finally {
      clearTimeout(timer);
    }
  }

  async function logout(redirectTo) {
    var tk = token();
    var error = null;
    try { await revokeSession(tk); } catch (e) { error = e; }
    localStorage.removeItem(SETUP_TOKEN_KEY);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EMAIL_KEY);
    if (error) throw new Error("A sessão foi removida deste navegador, mas não foi possível confirmar seu encerramento no servidor. Verifique a conexão.");
    if (redirectTo !== false) location.href = redirectTo || URLS.landing;
  }

  async function beginMinor() {
    var mail = email();
    var original = localStorage.getItem(TOKEN_KEY);
    if (!mail || !original) throw new Error("Entre com a conta do responsável para iniciar a configuração.");
    try {
      var data = await api("/api/autenticacao/sessao-menor", { method: "POST", body: "{}" });
      if (!data || !data.token) throw new Error("O servidor não retornou a autorização temporária.");
      setState({ role: "minor", startedAt: getState().startedAt || Date.now() });
      localStorage.setItem(SETUP_TOKEN_KEY, data.token);
      localStorage.setItem(MINOR_EMAIL_KEY, mail);
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(EMAIL_KEY);
    } catch (e) {
      var revokeError = null;
      try { await revokeSession(original); } catch (failure) { revokeError = failure; }
      setState({ role: "minor" });
      localStorage.setItem(MINOR_EMAIL_KEY, mail);
      localStorage.removeItem(SETUP_TOKEN_KEY);
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(EMAIL_KEY);
      if (revokeError) {
        throw new Error("A sessão foi removida deste navegador, mas não foi possível confirmar seu encerramento no servidor. Verifique a conexão.");
      }
      throw e;
    }
  }

  async function finishMinor() {
    var tk = localStorage.getItem(SETUP_TOKEN_KEY);
    await revokeSession(tk);
    localStorage.removeItem(SETUP_TOKEN_KEY);
  }

  async function reauth(nextRole) {
    var setup = localStorage.getItem(SETUP_TOKEN_KEY), mail = email();
    if (setup && mail) {
      try {
        var res = await fetch("/api/autenticacao/retomar-responsavel", { method: "POST", headers: { Authorization: "Bearer " + setup } });
        var data = res.ok ? await res.json() : null;
        if (data && data.token) {
          saveSession(data.token, mail);
          var st = getState();
          if (nextRole) st.role = nextRole; else delete st.role;
          st.updatedAt = Date.now();
          localStorage.setItem(stateKey(), JSON.stringify(st));
          location.href = URLS.onboarding;
          return;
        }
      } catch (e) { /* segue para o login */ }
    }
    localStorage.setItem("guardian_reauth", JSON.stringify({ email: mail.toLowerCase(), role: nextRole || "" }));
    await logout(false);
    location.href = URLS.auth + "?reauth=1";
  }

  // ---------- Estado do tutorial (por conta, compartilhado entre abas) ----------
  function stateKey() { return "guardian_flow:" + email().toLowerCase(); }
  function getState() {
    try { return JSON.parse(localStorage.getItem(stateKey())) || {}; }
    catch (e) { return {}; }
  }
  function setState(patch) {
    var s = Object.assign(getState(), patch, { updatedAt: Date.now() });
    localStorage.setItem(stateKey(), JSON.stringify(s));
    emit("state", s);
    return s;
  }
  window.addEventListener("storage", function (e) {
    if (e.key === stateKey()) emit("state", getState());
    if (e.key === TOKEN_KEY && !e.newValue) {
      emit("logout");
      if (location.pathname.indexOf("/dashboard/") === 0 && !/\/login\.html$/.test(location.pathname)) {
        if (document.body) document.body.textContent = "";
        location.replace(isMinor() ? "/onboarding.html?restrito=1" : URLS.auth);
      }
    }
  });

  // ---------- Backend ----------
  async function api(path, options) {
    options = options || {};
    var headers = Object.assign({ "Content-Type": "application/json" }, options.headers || {});
    if (token()) headers.Authorization = "Bearer " + token();
    var demo = window.GuardianAPI && window.GuardianAPI.isDemo && window.GuardianAPI.isDemo() &&
      path.indexOf("/api/autenticacao/") !== 0;
    var res = demo
      ? await window.GuardianAPI.mockFetch(path, options)
      : await fetch(path, Object.assign({}, options, { headers: headers }));
    if (res.status === 401) {
      localStorage.removeItem(SETUP_TOKEN_KEY);
      if (!isMinor()) {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(EMAIL_KEY);
        location.href = URLS.auth;
      }
      throw new Error(isMinor() ? "A autorização temporária expirou. Confirme sua senha para continuar." : "Sua sessão expirou. Entre novamente.");
    }
    var text = await res.text();
    var data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
    if (!res.ok) {
      throw new Error((data && (data.mensagem || data.message)) || "Erro " + res.status);
    }
    return data;
  }

  async function login(mail, senha) {
    var data = await api("/api/autenticacao/entrar", {
      method: "POST",
      body: JSON.stringify({ email: mail, senha: senha }),
    });
    saveSession(data.token, mail);
    return data;
  }

  function normDependent(d) {
    return { id: d.id, nickname: d.apelido || d.nickname || "Dependente" };
  }
  function normDevice(d) {
    return {
      id: d.id,
      name: d.nome || d.name || "Dispositivo",
      dependentId: d.dependenteId || d.dependentId,
      dependentNickname: d.apelidoDependente || d.dependentNickname || "",
      linkedAt: d.vinculadoEm || d.linkedAt || null,
    };
  }

  var lastStatus = null;
  async function status() {
    var r = isMinor() && !hasSetupSession()
      ? [[], []]
      : await Promise.all([api("/api/dependentes"), isMinor() ? Promise.resolve([]) : api("/api/dispositivos")]);
    lastStatus = {
      dependents: (Array.isArray(r[0]) ? r[0] : []).map(normDependent),
      devices: (Array.isArray(r[1]) ? r[1] : []).map(normDevice),
      at: Date.now(),
    };
    if (lastStatus.devices.length > 0 && !getState().completedAt) {
      setState({ completedAt: Date.now() });
    }
    emit("status", lastStatus);
    return lastStatus;
  }

  async function createDependent(d) {
    var data = await api("/api/dependentes", {
      method: "POST",
      body: JSON.stringify({ apelido: d.nickname, dataNascimento: d.birthDate, sexo: d.sex }),
    });
    return normDependent(data || {});
  }

  async function generateCode(dependentId) {
    var data = await api("/api/dispositivos/gerar-codigo/" + encodeURIComponent(dependentId), {
      method: "POST",
      body: "{}",
    });
    var code = data && (data.codigo || data.code);
    if (!code) throw new Error("O servidor não retornou o código de vínculo.");
    return String(code).toLowerCase();
  }

  // ---------- Ponte com a extensão (content script webBridge.js) ----------
  var ext = { status: null };
  var pending = {};
  window.addEventListener("message", function (event) {
    if (event.source !== window || event.origin !== location.origin) return;
    var msg = event.data;
    if (!msg || msg.source !== "guardian-ext") return;
    if (msg.type === "READY" || msg.type === "PONG") {
      ext.status = msg.status || { installed: true };
      emit("extension", ext.status);
    }
    if (msg.requestId && pending[msg.requestId]) {
      pending[msg.requestId](msg);
      delete pending[msg.requestId];
    }
  });

  function request(type, extra, timeout) {
    return new Promise(function (resolve) {
      var id = Math.random().toString(36).slice(2);
      var timer = setTimeout(function () { delete pending[id]; resolve(null); }, timeout);
      pending[id] = function (msg) { clearTimeout(timer); resolve(msg); };
      window.postMessage(Object.assign({ source: "guardian-web", type: type, requestId: id }, extra || {}), location.origin);
    });
  }

  async function detectExtension(timeout) {
    var msg = await request("PING", null, timeout || 1200);
    if (msg && msg.status) { ext.status = msg.status; return ext.status; }
    return ext.status;
  }

  // ---------- Palavra-chave (protege a extensão contra desconexão) ----------
  async function keywordDefined() {
    var r = await api("/api/protecao/palavra-chave");
    return !!(r && r.definida);
  }

  async function saveKeyword(palavra) {
    await api("/api/protecao/palavra-chave", { method: "PUT", body: JSON.stringify({ palavraChave: palavra }) });
  }

  function askKeyword(opts) {
    opts = opts || {};
    return new Promise(function (resolve, reject) {
      var wrap = document.createElement("div");
      wrap.className = "gf-kw-overlay";
      wrap.innerHTML =
        '<form class="gf-kw" role="dialog" aria-modal="true" aria-labelledby="gfKwTitle">' +
          '<div class="gf-kw-ico" aria-hidden="true">🔑</div>' +
          '<h2 id="gfKwTitle">' + escapeHTML(opts.title || "Crie sua palavra-chave") + '</h2>' +
          '<p>Só você vai saber. Ela é pedida para mexer na extensão — assim seu filho não consegue desligar a proteção.</p>' +
          '<label>Palavra-chave<input name="a" type="password" autocomplete="new-password" minlength="4" maxlength="60" required placeholder="Ex.: nome do seu primeiro cachorro"></label>' +
          '<label>Repita<input name="b" type="password" autocomplete="new-password" required></label>' +
          '<p class="gf-kw-err" role="alert"></p>' +
          '<div class="gf-kw-actions">' +
            (opts.cancelable ? '<button type="button" class="gf-btn gf-btn-ghost" data-kw-cancel>Cancelar</button>' : "") +
            '<button type="submit" class="gf-btn gf-btn-lg">Salvar palavra-chave</button>' +
          "</div>" +
        "</form>";
      document.body.appendChild(wrap);
      var form = wrap.querySelector("form");
      var err = wrap.querySelector(".gf-kw-err");
      form.a.focus();
      var cancel = wrap.querySelector("[data-kw-cancel]");
      if (cancel) cancel.addEventListener("click", function () { wrap.remove(); reject(new Error("cancelado")); });
      form.addEventListener("submit", async function (e) {
        e.preventDefault();
        var a = form.a.value.trim(), b = form.b.value.trim();
        if (a.length < 4) { err.textContent = "Use pelo menos 4 letras."; return; }
        if (a !== b) { err.textContent = "As duas não estão iguais."; return; }
        var btn = form.querySelector("[type=submit]");
        btn.disabled = true; btn.textContent = "Salvando…";
        try {
          await saveKeyword(a);
          wrap.remove();
          resolve();
        } catch (failure) {
          err.textContent = failure.message;
          btn.disabled = false; btn.textContent = "Salvar palavra-chave";
        }
      });
    });
  }

  async function ensureKeyword() {
    if (await keywordDefined()) return;
    await askKeyword();
  }

  async function enrollWithExtension(code) {
    var installed = await detectExtension();
    if (!installed || !installed.scopedEnrollment || installed.browserProtection !== true || installed.incognitoPolicy !== true) {
      throw new Error("Atualize a extensão para ativar a proteção contra guia anônima e alterações no navegador: baixe o novo ZIP, substitua os arquivos e clique em Recarregar.");
    }
    await ensureKeyword();
    var grant = await api("/api/autenticacao/autorizacao-vinculo", { method: "POST", body: "{}" });
    if (!grant || !grant.token) throw new Error("O servidor não retornou a autorização de vínculo.");
    try {
      var msg = await request("ENROLL", { code: String(code).toLowerCase(), token: grant.token }, 20000);
      if (!msg) throw new Error("A extensão não respondeu. Recarregue a página e tente novamente.");
      var result = msg.result || {};
      if (!result.ok) throw new Error(result.error || "Não foi possível vincular este navegador.");
      if (result.warning) window.alert(result.warning);
      detectExtension();
      return result;
    } catch (e) {
      try { await revokeSession(grant.token); }
      catch (revokeError) {
        throw new Error("Não foi possível vincular nem confirmar o encerramento da autorização temporária. Verifique a conexão.");
      }
      throw e;
    }
  }

  function startExtensionWatch(intervalMs) {
    var stopped = false;
    (function loop() {
      if (stopped) return;
      detectExtension(900).finally(function () {
        if (!stopped) setTimeout(loop, intervalMs || 2500);
      });
    })();
    return function () { stopped = true; };
  }

  // ---------- Navegador ----------
  function browserInfo() {
    var ua = navigator.userAgent;
    if (/Edg\//.test(ua)) {
      return { name: "Microsoft Edge", page: "edge://extensions", dev: "Modo de desenvolvedor", devWhere: "no menu à esquerda", load: "Carregar sem pacote", incognito: "Permitir em InPrivate", supported: true };
    }
    if (/Chrome\//.test(ua) && !/OPR\//.test(ua)) {
      return { name: "Google Chrome", page: "chrome://extensions", dev: "Modo do desenvolvedor", devWhere: "no canto superior direito", load: "Carregar sem compactação", incognito: "Permitir no modo anônimo", supported: true };
    }
    return { name: "este navegador", page: "chrome://extensions", dev: "Modo do desenvolvedor", devWhere: "no canto superior direito", load: "Carregar sem compactação", incognito: "Permitir no modo anônimo", supported: false };
  }

  function saveFile(blobOrUrl, name) {
    var a = document.createElement("a");
    a.href = typeof blobOrUrl === "string" ? blobOrUrl : URL.createObjectURL(blobOrUrl);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    if (typeof blobOrUrl !== "string") setTimeout(function () { URL.revokeObjectURL(a.href); }, 10000);
  }

  // O instalador sai com o endereço deste servidor e o navegador atual já preenchidos.
  function downloadExtension() {
    setState({ downloadedAt: Date.now() });
    var nav = /Edg\//.test(navigator.userAgent) ? "edge" : "chrome";
    fetch(URLS.installer, { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })
      .then(function (text) {
        text = text.replace(/__SERVIDOR__/g, location.origin).replace(/__NAVEGADOR__/g, nav);
        saveFile(new Blob([text], { type: "application/octet-stream" }), "Instalar-GuardIAn.bat");
      })
      .catch(function () { saveFile(URLS.download, "GuardIAn-Extensao.zip"); });
  }

  function downloadProtection() {
    var a = document.createElement("a");
    a.href = URLS.protection;
    a.download = "GuardIAn-Protecao.bat";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function protectionStepsHTML() {
    var b = browserInfo();
    return '<p>A guia anônima e o modo visitante abrem o navegador sem a extensão. Este arquivo desliga os dois neste computador.</p>' +
      '<ol>' +
        '<li>Clique em <strong>Baixar arquivo de proteção</strong>. Se o ' + (b.name === "Microsoft Edge" ? "Edge" : "Chrome") + ' avisar sobre o arquivo, clique em <strong>Manter</strong>.</li>' +
        '<li>Abra o arquivo <strong>GuardIAn-Protecao</strong> (na lista de downloads, no canto superior direito).</li>' +
        '<li>Se aparecer “O Windows protegeu o computador”, clique em <strong>Mais informações</strong> → <strong>Executar assim mesmo</strong>.</li>' +
        '<li>Clique em <strong>Sim</strong> quando o Windows pedir permissão.</li>' +
      '</ol>' +
      '<button type="button" class="gf-btn gf-btn-soft" data-gf-protect>Baixar arquivo de proteção</button>';
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    var t = document.createElement("textarea");
    t.value = text;
    t.style.position = "fixed";
    t.style.opacity = "0";
    document.body.appendChild(t);
    t.select();
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    t.remove();
    return ok ? Promise.resolve() : Promise.reject(new Error("copy"));
  }

  // ---------- Guia de instalação (usado na landing e no painel) ----------
  function installGuideHTML() {
    var b = browserInfo();
    var warn = b.supported ? "" :
      '<div class="gf-alert">Para instalar a extensão, abra este site no <strong>Google Chrome</strong> ou no <strong>Microsoft Edge</strong>.</div>';
    return (
      warn +
      '<ol class="gf-steps">' +
        '<li data-gf-step="download"><span class="gf-n">1</span><div>' +
          '<h3>Abra o instalador</h3>' +
          '<p>Na lista de downloads (canto superior direito do navegador), clique em <strong>Instalar-GuardIAn</strong>. Se o navegador avisar sobre o arquivo, clique em <strong>Manter</strong>.</p>' +
          '<p>Se aparecer “O Windows protegeu o computador”, clique em <strong>Mais informações</strong> → <strong>Executar assim mesmo</strong>. Depois clique em <strong>Sim</strong>.</p>' +
          '<button type="button" class="gf-btn gf-btn-soft" data-gf-download>Baixar o instalador de novo</button>' +
        '</div></li>' +
        '<li><span class="gf-n">2</span><div>' +
          '<h3>Ative o “' + b.dev + '”</h3>' +
          '<p>O instalador abre sozinho a página de extensões. Ligue o botão ' + b.devWhere + '.</p>' +
          '<div class="gf-mock"><span class="gf-mock-title">Extensões</span><span class="gf-toggle"><i></i></span><small>' + b.dev + '</small></div>' +
        '</div></li>' +
        '<li><span class="gf-n">3</span><div>' +
          '<h3>Clique em “' + b.load + '” e cole</h3>' +
          '<p>Na janela que abrir, clique no campo <strong>Pasta</strong>, aperte <kbd>Ctrl</kbd>+<kbd>V</kbd> e clique em <strong>Selecionar pasta</strong>. O caminho já foi copiado pelo instalador.</p>' +
          '<div class="gf-mock"><span class="gf-mock-btn">' + b.load + '</span><span class="gf-mock-btn ghost">Compactar extensão</span></div>' +
        '</div></li>' +
        '<li><span class="gf-n">4</span><div>' +
          '<h3>Volte para cá</h3>' +
          '<p>Esta tela percebe sozinha quando você terminar. A guia anônima já foi desligada e as atualizações serão automáticas.</p>' +
        '</div></li>' +
      '</ol>' +
      '<div class="gf-wait" data-gf-wait><span class="gf-spin"></span>Aguardando a extensão ser instalada neste navegador…</div>'
    );
  }

  function updateGuideHTML() {
    var b = browserInfo();
    return '<div class="gf-alert"><strong>Não digite sua senha na versão antiga.</strong> Atualize a extensão antes de continuar.</div>' +
      '<ol class="gf-steps">' +
      '<li><span class="gf-n">1</span><div><h3>Abra o instalador</h3>' +
      '<p>Abra o arquivo <strong>Instalar-GuardIAn</strong> e clique em <strong>Sim</strong>. A partir dele, as próximas atualizações são automáticas.</p>' +
      '<button type="button" class="gf-btn gf-btn-soft" data-gf-download>Baixar o instalador</button></div></li>' +
      '<li><span class="gf-n">2</span><div><h3>Troque a extensão antiga</h3>' +
      '<p>Na página de extensões, no quadro <strong>Guardian - Proteção Familiar</strong>, clique em <strong>Remover</strong>. Depois clique em <strong>' + b.load + '</strong>, aperte <kbd>Ctrl</kbd>+<kbd>V</kbd> no campo <strong>Pasta</strong> e clique em <strong>Selecionar pasta</strong>.</p></div></li>' +
      '<li><span class="gf-n">3</span><div><h3>Volte para cá</h3>' +
      '<p>Esta tela percebe sozinha quando terminar.</p></div></li></ol>';
  }
  function bindInstallGuide(root) {
    root.querySelectorAll("[data-gf-download]").forEach(function (btn) {
      btn.addEventListener("click", downloadExtension);
    });
    root.querySelectorAll("[data-gf-protect]").forEach(function (btn) {
      btn.addEventListener("click", downloadProtection);
    });
    root.querySelectorAll("[data-gf-copy]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var original = btn.textContent;
        copyText(btn.dataset.gfCopy).then(function () {
          btn.textContent = "Copiado! Agora cole na nova aba";
        }).catch(function () {
          btn.textContent = "Selecione e copie o endereço";
        }).finally(function () {
          setTimeout(function () { btn.textContent = original; }, 3500);
        });
      });
    });
  }

  function escapeHTML(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  window.GuardianFlow = {
    URLS: URLS,
    on: on,
    emit: emit,
    token: token,
    email: email,
    isLoggedIn: isLoggedIn,
    isMinor: isMinor,
    hasSetupSession: hasSetupSession,
    hasParentSession: hasParentSession,
    saveSession: saveSession,
    logout: logout,
    beginMinor: beginMinor,
    finishMinor: finishMinor,
    getState: getState,
    setState: setState,
    api: api,
    login: login,
    status: status,
    lastStatus: function () { return lastStatus; },
    generateCode: generateCode,
    createDependent: createDependent,
    reauth: reauth,
    keyword: {
      defined: keywordDefined,
      save: saveKeyword,
      ask: askKeyword,
      ensure: ensureKeyword,
    },
    extension: {
      current: function () { return ext.status; },
      detect: detectExtension,
      enroll: enrollWithExtension,
      watch: startExtensionWatch,
    },
    browserInfo: browserInfo,
    downloadExtension: downloadExtension,
    downloadProtection: downloadProtection,
    protectionStepsHTML: protectionStepsHTML,
    copyText: copyText,
    installGuideHTML: installGuideHTML,
    updateGuideHTML: updateGuideHTML,
    bindInstallGuide: bindInstallGuide,
    escapeHTML: escapeHTML,
  };
})();

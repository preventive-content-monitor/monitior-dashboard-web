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

  var URLS = {
    landing: "/",
    auth: "/auth.html",
    onboarding: "/onboarding.html",
    dashboard: "/dashboard/",
    dependents: "/dashboard/dependents.html",
    devices: "/dashboard/devices.html",
    download: "/downloads/GuardIAn-Extensao.zip",
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
  function token() { return localStorage.getItem(TOKEN_KEY); }
  function email() { return localStorage.getItem(EMAIL_KEY) || ""; }
  function isLoggedIn() { return !!token(); }
  function saveSession(tk, mail) {
    localStorage.setItem(TOKEN_KEY, tk);
    localStorage.setItem(EMAIL_KEY, mail);
  }
  function logout(redirectTo) {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EMAIL_KEY);
    if (redirectTo !== false) location.href = redirectTo || URLS.landing;
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
    if (e.key === TOKEN_KEY && !e.newValue) emit("logout");
  });

  // ---------- Backend ----------
  async function api(path, options) {
    options = options || {};
    var headers = Object.assign({ "Content-Type": "application/json" }, options.headers || {});
    if (token()) headers.Authorization = "Bearer " + token();
    var res = await fetch(path, Object.assign({}, options, { headers: headers }));
    if (res.status === 401) {
      logout(false);
      location.href = URLS.auth;
      throw new Error("Sua sessão expirou. Entre novamente.");
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
    var r = await Promise.all([api("/api/dependentes"), api("/api/dispositivos")]);
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

  async function enrollWithExtension(code) {
    var msg = await request("ENROLL", { code: String(code).toLowerCase() }, 20000);
    if (!msg) throw new Error("A extensão não respondeu. Recarregue a página e tente novamente.");
    var result = msg.result || {};
    if (!result.ok) throw new Error(result.error || "Não foi possível vincular este navegador.");
    detectExtension();
    return result;
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
      return { name: "Microsoft Edge", page: "edge://extensions", dev: "Modo de desenvolvedor", devWhere: "no menu à esquerda", load: "Carregar sem pacote", supported: true };
    }
    if (/Chrome\//.test(ua) && !/OPR\//.test(ua)) {
      return { name: "Google Chrome", page: "chrome://extensions", dev: "Modo do desenvolvedor", devWhere: "no canto superior direito", load: "Carregar sem compactação", supported: true };
    }
    return { name: "este navegador", page: "chrome://extensions", dev: "Modo do desenvolvedor", devWhere: "no canto superior direito", load: "Carregar sem compactação", supported: false };
  }

  function downloadExtension() {
    var a = document.createElement("a");
    a.href = URLS.download;
    a.download = "GuardIAn-Extensao.zip";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setState({ downloadedAt: Date.now() });
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
          '<h3>Baixe a extensão</h3>' +
          '<p>O arquivo <strong>GuardIAn-Extensao.zip</strong> vai para a pasta <strong>Downloads</strong>.</p>' +
          '<button type="button" class="gf-btn gf-btn-soft" data-gf-download>Baixar novamente</button>' +
        '</div></li>' +
        '<li><span class="gf-n">2</span><div>' +
          '<h3>Extraia o arquivo</h3>' +
          '<p>Abra a pasta <strong>Downloads</strong>, clique com o <strong>botão direito</strong> em <strong>GuardIAn-Extensao.zip</strong> → <strong>Extrair tudo…</strong> → <strong>Extrair</strong>. Vai aparecer a pasta <strong>GuardIAn-Extensao</strong>. Não apague essa pasta.</p>' +
        '</div></li>' +
        '<li><span class="gf-n">3</span><div>' +
          '<h3>Abra a página de extensões</h3>' +
          '<p>Clique em copiar, abra uma <strong>nova aba</strong> (<kbd>Ctrl</kbd>+<kbd>T</kbd>), cole (<kbd>Ctrl</kbd>+<kbd>V</kbd>) e aperte <kbd>Enter</kbd>.</p>' +
          '<div class="gf-copy"><code>' + b.page + '</code><button type="button" class="gf-btn" data-gf-copy="' + b.page + '">Copiar endereço</button></div>' +
        '</div></li>' +
        '<li><span class="gf-n">4</span><div>' +
          '<h3>Ative o “' + b.dev + '”</h3>' +
          '<p>É um botão de liga/desliga ' + b.devWhere + ' da página de extensões.</p>' +
          '<div class="gf-mock"><span class="gf-mock-title">Extensões</span><span class="gf-toggle"><i></i></span><small>' + b.dev + '</small></div>' +
        '</div></li>' +
        '<li><span class="gf-n">5</span><div>' +
          '<h3>Clique em “' + b.load + '”</h3>' +
          '<p>Escolha a pasta <strong>GuardIAn-Extensao</strong> (dentro de Downloads) e clique em <strong>Selecionar pasta</strong>.</p>' +
          '<div class="gf-mock"><span class="gf-mock-btn">' + b.load + '</span><span class="gf-mock-btn ghost">Compactar extensão</span></div>' +
        '</div></li>' +
        '<li><span class="gf-n">6</span><div>' +
          '<h3>Pronto, volte para cá</h3>' +
          '<p>Assim que a extensão for instalada, esta tela atualiza sozinha e continua o passo a passo.</p>' +
        '</div></li>' +
      '</ol>' +
      '<div class="gf-wait" data-gf-wait><span class="gf-spin"></span>Aguardando a extensão ser instalada neste navegador…</div>'
    );
  }

  function bindInstallGuide(root) {
    root.querySelectorAll("[data-gf-download]").forEach(function (btn) {
      btn.addEventListener("click", downloadExtension);
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
    saveSession: saveSession,
    logout: logout,
    getState: getState,
    setState: setState,
    api: api,
    login: login,
    status: status,
    lastStatus: function () { return lastStatus; },
    generateCode: generateCode,
    extension: {
      current: function () { return ext.status; },
      detect: detectExtension,
      enroll: enrollWithExtension,
      watch: startExtensionWatch,
    },
    browserInfo: browserInfo,
    downloadExtension: downloadExtension,
    copyText: copyText,
    installGuideHTML: installGuideHTML,
    bindInstallGuide: bindInstallGuide,
    escapeHTML: escapeHTML,
  };
})();

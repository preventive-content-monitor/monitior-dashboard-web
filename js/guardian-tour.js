/**
 * GuardIAn Tour — tutorial guiado do painel.
 * Fica ativo até existir o primeiro dispositivo vinculado (verificado no backend).
 * Só a área destacada recebe cliques; o X (ou Esc) fecha o tutorial até recarregar a página.
 */
(function () {
  "use strict";
  var F = window.GuardianFlow;
  if (!F || !F.isLoggedIn()) return;

  var page = location.pathname.split("/").pop() || "index.html";
  var data = null;
  var lastCode = null;
  var enroll = { busy: false, error: "", manual: false };
  var manualCode = null;
  var dismissed = false;
  var CODE_TTL_MS = 4.5 * 60 * 1000;
  var esc = F.escapeHTML;

  // ---------- UI base ----------
  var root = document.createElement("div");
  root.className = "gt-root";
  root.hidden = true;
  root.innerHTML =
    '<div class="gt-shade" data-s="t"></div><div class="gt-shade" data-s="b"></div>' +
    '<div class="gt-shade" data-s="l"></div><div class="gt-shade" data-s="r"></div>' +
    '<div class="gt-ring"></div><div class="gt-card" role="dialog" aria-live="polite"></div>';
  document.body.appendChild(root);
  var shades = {};
  root.querySelectorAll(".gt-shade").forEach(function (s) { shades[s.dataset.s] = s; });
  var ring = root.querySelector(".gt-ring");
  var card = root.querySelector(".gt-card");
  var current = { key: null, target: null, panel: false, placement: null };

  function box(el, x, y, w, h) {
    el.style.left = x + "px"; el.style.top = y + "px";
    el.style.width = Math.max(0, w) + "px"; el.style.height = Math.max(0, h) + "px";
  }

  function position() {
    if (root.hidden) return;
    var vw = window.innerWidth, vh = window.innerHeight;
    if (current.panel || !current.target) {
      box(shades.t, 0, 0, vw, vh); box(shades.b, 0, 0, 0, 0);
      box(shades.l, 0, 0, 0, 0); box(shades.r, 0, 0, 0, 0);
      ring.style.display = "none";
      return;
    }
    var r = current.target.getBoundingClientRect();
    if (!r.width && !r.height) return;
    var pad = 8;
    var x = Math.max(0, r.left - pad), y = Math.max(0, r.top - pad);
    var w = Math.min(vw - x, r.width + pad * 2), h = Math.min(vh - y, r.height + pad * 2);
    box(shades.t, 0, 0, vw, y);
    box(shades.b, 0, y + h, vw, vh - y - h);
    box(shades.l, 0, y, x, h);
    box(shades.r, x + w, y, vw - x - w, h);
    ring.style.display = "block";
    box(ring, x, y, w, h);

    var cw = card.offsetWidth, ch = card.offsetHeight, gap = 18, cx, cy;
    var want = current.placement;
    var fits = {
      right: x + w + gap + cw < vw,
      left: x - gap - cw > 0,
      bottom: y + h + gap + ch < vh,
      top: y - gap - ch > 0,
    };
    var place = (want && fits[want]) ? want :
      fits.right ? "right" : fits.bottom ? "bottom" : fits.left ? "left" : fits.top ? "top" : "inside";
    if (place === "right") { cx = x + w + gap; cy = y; }
    else if (place === "left") { cx = x - gap - cw; cy = y; }
    else if (place === "bottom") { cx = x; cy = y + h + gap; }
    else if (place === "top") { cx = x; cy = y - gap - ch; }
    else { cx = vw - cw - 12; cy = vh - ch - 12; }
    cx = Math.min(Math.max(12, cx), vw - cw - 12);
    cy = Math.min(Math.max(12, cy), vh - ch - 12);
    card.style.left = cx + "px"; card.style.top = cy + "px";
  }
  setInterval(position, 150);
  window.addEventListener("resize", position);
  window.addEventListener("scroll", position, true);

  function footer(step, total) {
    return '<div class="gt-foot"><span>' + (step ? "Passo " + step + " de " + total : "Configuração inicial") +
      '</span><button type="button" data-gt-logout>Sair da conta</button></div>';
  }

  function dismiss() {
    dismissed = true;
    if (current.key === "done") F.setState({ doneAck: Date.now() });
    var codeClose = shown("#codeModal") && document.querySelector("#codeModal .modal-close");
    if (codeClose) codeClose.click();
    hide();
  }
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !root.hidden) dismiss();
  });

  function paint(key, html, bind) {
    if (current.key === key) return false;
    current.key = key;
    card.innerHTML = '<button type="button" class="gt-x" aria-label="Fechar tutorial" title="Fechar">&times;</button>' + html;
    card.querySelector(".gt-x").addEventListener("click", dismiss);
    var out = card.querySelector("[data-gt-logout]");
    if (out) out.addEventListener("click", function () {
      F.logout("/").catch(function (error) { alert(error.message); location.href = "/"; });
    });
    if (bind) bind(card);
    return true;
  }

  function spot(key, target, opts) {
    if (!target) return;
    var rect = target.getBoundingClientRect();
    if (!rect.width && !rect.height) {
      // Alvo escondido (ex.: menu recolhido no celular): vira um painel com atalho.
      return panel(key + ":fallback", opts, function (c) {
        var btn = c.querySelector("[data-gt-go]");
        if (btn) btn.addEventListener("click", function () { target.click(); });
      }, '<div class="gt-actions"><button class="gf-btn gf-btn-lg" data-gt-go>' + esc(opts.fallbackLabel || "Continuar") + "</button></div>");
    }
    root.hidden = false;
    card.classList.remove("gt-panel", "gt-center");
    current.panel = false;
    current.placement = opts.placement || null;
    var changed = paint(key,
      '<span class="gt-step">' + esc(opts.badge || "Tutorial") + "</span>" +
      "<h2>" + esc(opts.title) + "</h2>" +
      (opts.html || "<p>" + esc(opts.text) + "</p>") +
      footer(opts.step, opts.total), opts.bind);
    if (current.target !== target || changed) {
      current.target = target;
      target.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    position();
  }

  function panel(key, opts, bind, extraHTML) {
    root.hidden = false;
    current.panel = true;
    current.target = null;
    card.classList.add("gt-panel");
    card.classList.toggle("gt-center", !!opts.center);
    paint(key,
      (opts.icon ? '<div class="gt-big-ico">' + opts.icon + "</div>" : "") +
      (opts.badge ? '<span class="gt-step">' + esc(opts.badge) + "</span>" : "") +
      "<h2>" + esc(opts.title) + "</h2>" +
      (opts.html || "<p>" + esc(opts.text || "") + "</p>") +
      (extraHTML || "") +
      (opts.noFooter ? "" : footer(opts.step, opts.total)), bind);
    position();
  }

  function hide() {
    root.hidden = true;
    current = { key: null, target: null, panel: false, placement: null };
  }

  // ---------- Helpers ----------
  function visible(sel) {
    var list = document.querySelectorAll(sel);
    for (var i = 0; i < list.length; i++) {
      var r = list[i].getBoundingClientRect();
      if (r.width || r.height) return list[i];
    }
    return null;
  }
  function shown(sel) {
    var el = document.querySelector(sel);
    return !!(el && el.classList.contains("show"));
  }
  function navLink(href) {
    return document.querySelector('.sidebar a[href="' + href + '"]');
  }
  function totalFor(role) { return role === "resp" ? 2 : 3; }
  function firstDependentName() {
    if (!data) return "seu filho";
    var dev = data.devices[0];
    if (dev && dev.dependentNickname) return dev.dependentNickname;
    var dep = data.dependents[0];
    return dep ? dep.nickname : "seu filho";
  }

  // ---------- Integração com as chamadas reais do painel ----------
  function wrap(obj, name, after) {
    if (!obj || typeof obj[name] !== "function") return;
    var original = obj[name];
    obj[name] = async function () {
      var args = arguments;
      var result = await original.apply(this, args);
      try { after(result, args); } catch (e) { console.error(e); }
      return result;
    };
  }
  if (window.GuardianAPI) {
    wrap(GuardianAPI.dependents, "create", function () { refresh(); });
    wrap(GuardianAPI.devices, "generateCode", function (res, args) {
      var code = res && (res.code || res.codigo);
      if (code) {
        lastCode = { code: String(code).toLowerCase(), dependentId: args[0], at: Date.now() };
        current.key = null;
        render();
      }
    });
  }

  // ---------- Telas especiais ----------
  function choosePanel() {
    panel("choose", {
      badge: "Antes de começar",
      title: "Qual computador é este?",
      text: "Escolha uma opção para o GuardIAn montar o passo a passo certo. Ao escolher o computador do menor, suas sessões de painel em outros computadores também serão encerradas.",
      noFooter: false,
    }, function (c) {
      c.querySelectorAll("[data-role]").forEach(function (b) {
        b.addEventListener("click", async function () {
          if (b.dataset.role === "minor") {
            b.disabled = true;
            try {
              await F.beginMinor();
              location.replace("/onboarding.html");
            } catch (error) {
              alert(error.message);
              if (F.isMinor()) location.replace("/onboarding.html");
              else b.disabled = false;
            }
            return;
          }
          F.setState({ role: b.dataset.role, startedAt: Date.now() });
          current.key = null;
          render();
        });
      });
    },
      '<div class="gt-actions" style="flex-direction:column;align-items:stretch">' +
        '<button class="gf-btn gf-btn-lg" data-role="minor">É o computador do meu filho (menor de idade)</button>' +
        '<button class="gf-btn gf-btn-lg" data-role="resp">É o meu computador (responsável)</button>' +
        '<button class="gf-btn gf-btn-lg" data-role="same">Vou configurar os dois neste computador</button>' +
      "</div>");
  }

  function installPanel(role) {
    var st = F.getState();
    panel("install", {
      badge: "Passo 2 de 3",
      title: "Instale a extensão GuardIAn neste navegador",
      html:
        "<p>Ela é quem protege a navegação do seu filho. Siga os passos abaixo — quando terminar, esta tela continua sozinha.</p>" +
        (st.downloadedAt ? "" :
          '<div class="gt-actions" style="margin:4px 0 14px"><button class="gf-btn gf-btn-lg" data-gf-download>Baixar a extensão</button></div>') +
        F.installGuideHTML(),
      step: 2, total: totalFor(role),
    }, function (c) { F.bindInstallGuide(c); });
  }

  function updatePanel() {
    panel("update-extension", {
      badge: "Atualização necessária",
      title: "Atualize a extensão antes de continuar",
      html: F.updateGuideHTML(),
    }, function (c) { F.bindInstallGuide(c); });
  }

  function reauthorizePanel() {
    panel("reauthorize-extension", {
      badge: "Atualização necessária",
      title: "Autorize novamente a proteção",
      text: "Clique no ícone do Guardian no navegador e entre com a conta do responsável. O vínculo existente será mantido e você não precisa gerar outro código.",
    });
  }

  function waitChildPanel() {
    var origin = location.origin;
    var html =
      (F.extension.current()
        ? '<div class="gf-wait ok"><span class="gf-spin"></span>A extensão já está instalada neste navegador. Se seu filho usa este computador, clique em “Na verdade, vou configurar os dois neste computador”.</div>'
        : "") +
      "<p>Você já cadastrou <strong>" + esc(firstDependentName()) + "</strong>. Falta conectar o computador que ele usa:</p>" +
      '<ol class="gf-steps">' +
        '<li><span class="gf-n">1</span><div><h3>No computador do seu filho, abra o Chrome</h3><p>Acesse este endereço:</p>' +
          '<div class="gf-copy"><code>' + esc(origin) + '</code><button type="button" class="gf-btn" data-gf-copy="' + esc(origin) + '">Copiar endereço</button></div></div></li>' +
        '<li><span class="gf-n">2</span><div><h3>Entre com a sua conta</h3><p>Clique em <strong>Fazer login</strong> e use <strong>' + esc(F.email()) + "</strong>.</p></div></li>" +
        '<li><span class="gf-n">3</span><div><h3>Escolha “computador de um menor de idade”</h3><p>Lá o GuardIAn instala só a extensão. Por segurança, esta sessão do painel será encerrada; entre novamente aqui para acompanhar o vínculo.</p></div></li>' +
      "</ol>" +
      '<div class="gf-wait"><span class="gf-spin"></span>Aguardando o computador do seu filho se conectar… esta tela atualiza sozinha.</div>' +
      (manualCode
        ? '<p style="margin-top:14px">Código para digitar na extensão (vale 5 minutos):<br><span class="gt-code">' + esc(manualCode.code) + "</span><br>" +
          "Clique no ícone do <strong>Guardian</strong> ao lado da barra de endereço (ou em 🧩 → Guardian). Na janelinha, entre com sua conta, digite o código e clique em <strong>Conectar</strong>.</p>"
        : "");
    panel("wait-child:" + (manualCode ? manualCode.code : ""), {
      badge: "Passo 2 de 2",
      title: "Agora conecte o computador do seu filho",
      html: html,
      step: 2, total: 2,
    }, function (c) {
      F.bindInstallGuide(c);
      c.querySelector("[data-gt-manual]")?.addEventListener("click", async function (e) {
        e.target.disabled = true;
        try {
          manualCode = { code: await F.generateCode(data.dependents[0].id), at: Date.now() };
        } catch (err) { alert(err.message); }
        current.key = null; render();
      });
      c.querySelector("[data-gt-same]")?.addEventListener("click", function () {
        F.setState({ role: "same" }); current.key = null; render();
      });
    }, '<div class="gt-actions">' +
      '<button class="gf-btn gf-btn-soft" style="margin:0" data-gt-manual>' + (manualCode ? "Gerar outro código" : "Prefiro digitar um código na extensão") + "</button>" +
      '<button class="gf-btn gf-btn-ghost" data-gt-same>Na verdade, vou configurar os dois neste computador</button></div>');
  }

  function minorPanel() {
    panel("minor", {
      badge: "Computador do seu filho",
      title: "O painel não é usado neste computador",
      html:
        "<p>Você marcou este computador como <strong>do seu filho</strong>. Nele, só instalamos a extensão GuardIAn; o painel com os alertas fica no <strong>seu</strong> computador.</p>" +
        "<p>Volte para a instalação para terminar a vinculação, ou mude a escolha se este computador também é seu.</p>",
    }, function (c) {
      c.querySelector("[data-gt-back]").addEventListener("click", function () { location.href = "/onboarding.html"; });
      c.querySelectorAll("[data-gt-role]").forEach(function (b) {
        b.addEventListener("click", function () {
          F.reauth(b.dataset.gtRole).catch(function (error) { alert(error.message); });
        });
      });
    }, '<div class="gt-actions" style="flex-direction:column;align-items:stretch">' +
      '<button class="gf-btn gf-btn-lg" data-gt-back>Voltar para a instalação da extensão</button>' +
      '<button class="gf-btn gf-btn-soft" style="margin:0" data-gt-role="same">Usamos o mesmo computador (confirmar senha)</button>' +
      '<button class="gf-btn gf-btn-ghost" data-gt-role="resp">Sou o responsável (confirmar senha)</button></div>');
  }

  function codeCardHTML() {
    var parts = [];
    parts.push("<p>Não precisa digitar nada: clique no botão abaixo e o GuardIAn passa o código para a extensão automaticamente.</p>");
    if (enroll.error) parts.push('<p class="gt-error">' + esc(enroll.error) + "</p>");
    parts.push('<div class="gt-actions"><button class="gf-btn gf-btn-lg" data-gt-enroll ' + (enroll.busy ? "disabled" : "") + ">" +
      (enroll.busy ? "Vinculando…" : enroll.error ? "Tentar novamente" : "Vincular este navegador agora") + "</button></div>");
    if (enroll.error || enroll.manual) {
      parts.push('<p style="margin-top:12px;font-size:.88rem">Se preferir fazer manualmente: clique no ícone do <strong>Guardian</strong> ao lado da barra de endereço (ou em 🧩 → Guardian). Na janelinha, entre com <strong>' +
        esc(F.email()) + "</strong>, digite o código <strong>" + esc(lastCode ? lastCode.code.toUpperCase() : "") + "</strong> e clique em <strong>Conectar</strong>.</p>");
    }
    return parts.join("");
  }

  async function doEnroll() {
    if (!lastCode || enroll.busy) return;
    enroll.busy = true; enroll.error = ""; current.key = null; render();
    try {
      if (Date.now() - lastCode.at > CODE_TTL_MS) {
        lastCode = { code: await F.generateCode(lastCode.dependentId), dependentId: lastCode.dependentId, at: Date.now() };
      }
      await F.extension.enroll(lastCode.code);
      for (var i = 0; i < 8; i++) {
        await refresh();
        if (data && data.devices.length) break;
        await new Promise(function (r) { setTimeout(r, 1200); });
      }
      if (!data || !data.devices.length) throw new Error("A extensão respondeu, mas o painel ainda não recebeu o vínculo.");
      var modal = document.querySelector("#codeModal");
      if (modal) modal.classList.remove("show");
    } catch (e) {
      enroll.error = e.message || String(e);
      enroll.manual = true;
    } finally {
      enroll.busy = false; current.key = null; render();
    }
  }

  var autoStarted = false;
  function autoEnrollPanel(dep) {
    if (!autoStarted && !enroll.busy) {
      autoStarted = true;
      enroll.busy = true; enroll.error = "";
      (async function () {
        try {
          lastCode = { code: await F.generateCode(dep.id), dependentId: dep.id, at: Date.now() };
        } catch (e) {
          enroll.error = e.message; enroll.manual = true;
        } finally {
          enroll.busy = false;
        }
        if (lastCode && !enroll.error) await doEnroll();
        if (enroll.error === "cancelado") { enroll.error = ""; autoStarted = false; }
        current.key = null; render();
      })();
    }
    panel("auto-enroll:" + enroll.busy, {
      badge: "Passo 3 de 3",
      title: "Extensão instalada! Protegendo " + esc(dep.nickname) + "…",
      html: '<div class="gf-wait"><span class="gf-spin"></span>Conectando a extensão à sua conta. Você não precisa digitar nada.</div>',
      step: 3, total: 3,
    });
  }

  function donePanel(role) {
    var name = esc(firstDependentName());
    var isMinor = role === "minor";
    var text = role === "resp"
      ? "<p>O computador de <strong>" + name + "</strong> já está conectado e protegido. Tudo o que acontecer lá aparece aqui no painel.</p>"
      : "<p><strong>" + name + "</strong> já está protegido neste navegador. A partir de agora, os alertas e a atividade aparecem no painel.</p>";
    if (isMinor) {
      text += '<div class="gf-alert" style="text-align:left">Por segurança, <strong>saia da sua conta neste computador</strong>. Você acompanha tudo pelo seu próprio computador em <strong>' +
        esc(location.origin) + "/dashboard/</strong>.</div>";
    }
    text += '<p style="font-size:.9rem;color:#5b6382">Para proteger outro filho ou outro computador, use <strong>Dependentes → Vincular</strong> quando quiser.</p>';
    panel("done", {
      icon: "✓", center: true, noFooter: true,
      title: "Primeira vinculação concluída!",
      html: text,
    }, function (c) {
      c.querySelectorAll("[data-gt-finish]").forEach(function (b) {
        b.addEventListener("click", function () {
          F.setState({ doneAck: Date.now() });
          var go = b.dataset.gtFinish;
          if (go === "logout") return F.logout("/").catch(function (error) { alert(error.message); location.href = "/"; });
          hide();
          if (go === "devices" && page !== "devices.html") location.href = "devices.html";
          else if (go === "panel" && page !== "index.html") location.href = "index.html";
        });
      });
    }, isMinor
      ? '<div class="gt-actions"><button class="gf-btn gf-btn-lg" data-gt-finish="logout">Sair da conta neste computador</button><button class="gf-btn gf-btn-ghost" data-gt-finish="panel">Continuar no painel</button></div>'
      : '<div class="gt-actions"><button class="gf-btn gf-btn-lg" data-gt-finish="devices">Ver dispositivo vinculado</button><button class="gf-btn gf-btn-ghost" data-gt-finish="panel">Ir para o painel</button></div>');
  }

  // No PC do responsável, a palavra-chave é pedida logo após cadastrar o filho (uma vez; dá para adiar).
  var keywordAsking = false;
  function askKeywordOnce() {
    if (keywordAsking || F.getState().keywordAskedAt) return;
    keywordAsking = true;
    F.keyword.defined().then(function (defined) {
      if (defined) return;
      return F.keyword.ask({
        title: "Crie a palavra-chave do GuardIAn",
        cancelable: true,
        cancelLabel: "Agora não",
      }).then(function () {
        if (window.showToast) showToast("Palavra-chave salva!", "success");
      }, function () {});
    }).catch(function (e) {
      console.warn("[GuardIAn tour]", e);
    }).finally(function () {
      F.setState({ keywordAskedAt: Date.now() });
    });
  }

  // ---------- Máquina de estados ----------
  function render() {
    if (!data) return;
    if (dismissed) return hide();
    var st = F.getState();
    var role = st.role;
    var extension = F.extension.current();

    if (role === "same" && extension && !extension.scopedEnrollment) return updatePanel();
    if (role === "same" && extension && extension.requiresAuthorization) return reauthorizePanel();

    if (data.devices.length > 0) {
      if (role && !st.doneAck) return donePanel(role);
      return hide();
    }
    if (!role) return choosePanel();
    if (role === "minor") return minorPanel();

    var total = totalFor(role);

    if (data.dependents.length === 0) {
      if (page !== "dependents.html") {
        return spot("dep-nav", navLink("dependents.html"), {
          badge: "Passo 1 de " + total, step: 1, total: total, placement: "right",
          title: "Comece cadastrando seu filho",
          text: "Clique em “Dependentes” no menu ao lado.",
          fallbackLabel: "Abrir Dependentes",
        });
      }
      if (shown("#addModal")) {
        return spot("dep-form", document.querySelector("#addModal .modal"), {
          badge: "Passo 1 de " + total, step: 1, total: total, placement: "right",
          title: "Preencha os dados do seu filho",
          text: "Informe nome ou apelido, sexo e data de nascimento. Depois clique em “Adicionar”.",
        });
      }
      var addBtn = visible("#addFirstDependentBtn") || visible("#addDependentBtn");
      if (!addBtn) return;
      return spot("dep-add", addBtn, {
        badge: "Passo 1 de " + total, step: 1, total: total, placement: "bottom",
        title: "Adicione o perfil do seu filho",
        text: "Clique em “" + (addBtn.textContent.trim() || "Adicionar Dependente") + "”.",
      });
    }

    if (role === "resp") {
      askKeywordOnce();
      return waitChildPanel();
    }

    if (!F.extension.current()) return installPanel(role);

    if (data.dependents.length === 1 && !enroll.manual) return autoEnrollPanel(data.dependents[0]);

    if (page !== "dependents.html") {
      return spot("link-nav", navLink("dependents.html"), {
        badge: "Passo 3 de 3", step: 3, total: 3, placement: "right",
        title: "Extensão instalada! Agora vamos vincular",
        text: "Clique em “Dependentes” para escolher quem usa este computador.",
        fallbackLabel: "Abrir Dependentes",
      });
    }
    if (shown("#addModal")) {
      return spot("link-addform", document.querySelector("#addModal .modal"), {
        badge: "Passo 3 de 3", step: 3, total: 3, placement: "right",
        title: "Cadastrando outro filho",
        text: "Preencha e clique em “Adicionar”, ou cancele para continuar o vínculo.",
      });
    }
    if (shown("#codeModal")) {
      var modal = document.querySelector("#codeModal .modal");
      if (!lastCode) {
        return spot("code-loading", modal, {
          badge: "Passo 3 de 3", step: 3, total: 3, title: "Gerando o código…", text: "Só um instante.",
        });
      }
      return spot("code-ready:" + lastCode.code + ":" + enroll.busy + ":" + enroll.error, modal, {
        badge: "Passo 3 de 3", step: 3, total: 3, placement: "right",
        title: "Código gerado! Falta um clique",
        html: codeCardHTML(),
        bind: function (c) {
          var b = c.querySelector("[data-gt-enroll]");
          if (b) b.addEventListener("click", doEnroll);
        },
      });
    }
    var grid = document.querySelector("#dependentsGrid");
    if (!grid || !grid.children.length) return;
    return spot("link-pick", grid, {
      badge: "Passo 3 de 3", step: 3, total: 3, placement: "bottom",
      title: "Quem usa este computador?",
      text: "Clique em “Vincular” no cartão do seu filho que vai usar este navegador.",
    });
  }

  // ---------- Atualização de dados ----------
  var refreshing = null;
  function refresh() {
    if (refreshing) return refreshing;
    refreshing = F.status().then(function (s) {
      data = s;
      render();
      return s;
    }).catch(function (e) {
      console.warn("[GuardIAn tour]", e);
    }).finally(function () { refreshing = null; });
    return refreshing;
  }

  var renderTimer = null;
  new MutationObserver(function (mutations) {
    for (var i = 0; i < mutations.length; i++) {
      if (!root.contains(mutations[i].target)) {
        clearTimeout(renderTimer);
        renderTimer = setTimeout(render, 80);
        return;
      }
    }
  }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "style"] });

  F.on("state", function () { current.key = null; render(); });
  F.on("extension", function () { render(); });
  F.on("logout", function () { location.href = "/"; });
  window.addEventListener("focus", refresh);

  setInterval(function () {
    var st = F.getState();
    if (!data || data.devices.length) return;
    if (st.role === "resp" || data.dependents.length === 0 || enroll.busy) refresh();
  }, 5000);

  F.extension.watch(2500);
  refresh();
})();

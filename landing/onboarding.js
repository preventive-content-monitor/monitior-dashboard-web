(function () {
  'use strict';
  var F = window.GuardianFlow;
  if (!F || !F.isLoggedIn()) { window.location.replace('auth.html'); return; }

  var root = document.getElementById('onb'), back = document.getElementById('back');
  var label = document.getElementById('stepLabel'), dots = document.querySelectorAll('#dots span');
  var $ = function (id) { return document.getElementById(id); };
  var esc = F.escapeHTML;
  var PANEL_TAB = 'guardian-painel';
  var current = null, status = null, extStatus = F.extension.current();
  var reinstallLinked = false;
  var guideLink = { busy: false, error: '' };

  function mostrar(nome) {
    current = nome;
    root.dataset.cur = nome;
    document.querySelectorAll('.screen').forEach(function (s) {
      var ativa = s.dataset.screen === nome;
      s.classList.toggle('active', ativa);
      if (ativa) {
        var passo = +s.dataset.step || 0;
        label.innerHTML = passo ? 'Passo ' + passo + ' de 3' : '&nbsp;';
        dots.forEach(function (d, i) { d.classList.toggle('on', i === passo - 1); });
        var h = s.querySelector('h1'); if (h) h.focus({ preventScroll: true });
      }
    });
    back.hidden = !(nome === 'choose' || nome === 'guide' || nome === 'reinstall' || nome === 'handoff');
    if (nome === 'guide') renderGuide();
    if (nome === 'handoff') renderHandoff();
    if (nome === 'reinstall') renderReinstall();
    if (nome === 'home') renderHome();
    if (nome === 'complete') renderComplete();
  }

  function openPanel(path) {
    // Aba nomeada: reaproveita a mesma aba do painel em vez de abrir várias.
    var w = window.open(path || F.URLS.dependents, PANEL_TAB);
    if (w) w.focus(); else location.href = path || F.URLS.dependents;
  }

  function linked() { return !!((status && status.devices.length) || (extStatus && extStatus.enrolled)); }
  function extInstalled() { return !!(extStatus && extStatus.installed); }

  var restrictedAsked = /[?&]restrito=1/.test(location.search);
  function decide() {
    var st = F.getState();
    if (restrictedAsked && st.role === 'minor') { restrictedAsked = false; return 'restricted'; }
    if (linked()) return st.role && !st.doneAck ? 'complete' : 'home';
    if (st.role) return 'guide';
    return 'intro';
  }

  function updateBadge() {
    var b = $('protStatus');
    var on = linked();
    b.classList.toggle('on', on);
    b.innerHTML = '<i></i>' + (on ? 'Proteção Ativa' : 'Proteção Inativa');
  }

  // ---------- Guia (depois da escolha) ----------
  function item(done, cur, title, sub) {
    return '<li class="' + (done ? 'done' : cur ? 'current' : '') + '"><span class="gf-dot"></span><span>' +
      title + (sub ? '<small>' + sub + '</small>' : '') + '</span></li>';
  }

  function renderGuide() {
    var st = F.getState(), role = st.role || 'same';
    root.dataset.role = role;
    var deps = status ? status.dependents : [];
    var hasDep = deps.length > 0, inst = extInstalled(), isLinked = linked();
    var depSub = hasDep ? deps.length + ' dependente(s) cadastrado(s)' : '';
    var list = [item(true, false, 'Conta de responsável criada', esc(F.email()))];
    var cta = $('guideCta');
    cta.style.display = '';

    if (role === 'minor') {
      // Computador do filho: só a extensão. O painel nunca é aberto aqui.
      list.push(item(inst, !inst, 'Instalar a extensão neste navegador', inst ? 'Extensão detectada' : 'Siga o guia abaixo'));
      list.push(item(hasDep, inst && !hasDep, 'Cadastrar o filho', depSub || 'Aqui mesmo, só o nome e a idade'));
      list.push(item(isLinked, inst && hasDep && !isLinked, 'Vincular este computador ao filho', 'Aqui mesmo, com um clique'));
      $('guideTitle').textContent = inst ? 'Extensão instalada! Falta vincular' : 'Vamos proteger este computador';
      $('guideLead').textContent = inst
        ? 'Escolha qual filho usa este computador. O painel com os alertas fica no seu computador, não neste.'
        : st.downloadedAt
          ? 'Siga o guia abaixo para instalar. Esta tela percebe sozinha quando você terminar.'
          : 'Neste computador vamos apenas instalar a extensão que protege a navegação. O painel com os alertas fica no seu computador.';
      cta.textContent = st.downloadedAt ? 'Baixar a extensão novamente' : 'Baixar a extensão';
      cta.className = st.downloadedAt ? 'btn-secondary' : 'btn-primary';
      if (inst) cta.style.display = 'none';
    } else if (role === 'resp') {
      list.push(item(hasDep, !hasDep, 'Cadastrar o filho no painel', depSub || 'No painel, na aba Dependentes'));
      list.push(item(isLinked, hasDep && !isLinked, 'Vincular o computador do filho', 'Feito no computador do filho'));
      $('guideTitle').textContent = 'Vamos preparar o seu painel';
      $('guideLead').textContent = 'Neste computador você acompanha tudo pelo painel. Ele abre em outra aba com os destaques; esta aba fica aqui acompanhando o progresso.';
      cta.textContent = 'Abrir o painel';
      cta.className = 'btn-primary';
    } else {
      list.push(item(hasDep, !hasDep, 'Cadastrar o filho no painel', depSub || 'Primeiro passo, no painel'));
      list.push(item(inst, hasDep && !inst, 'Instalar a extensão neste navegador', inst ? 'Extensão detectada' : 'O painel mostra como baixar e instalar'));
      list.push(item(isLinked, hasDep && inst && !isLinked, 'Vincular este navegador ao filho', 'Um clique no painel, no botão destacado'));
      $('guideTitle').textContent = 'Vamos configurar tudo neste computador';
      $('guideLead').textContent = 'Primeiro o painel, depois a extensão. O painel abre em outra aba com cada passo destacado; esta aba fica aqui acompanhando.';
      cta.textContent = 'Abrir o painel';
      cta.className = 'btn-primary';
    }
    $('guideCheck').innerHTML = list.join('');

    var extra = $('guideExtra');
    var sig = deps.map(function (d) { return d.id; }).join(',');
    var key = [role, !!st.downloadedAt, inst, sig, guideLink.busy, guideLink.error].join('|');
    if (extra.dataset.key !== key) {
      extra.dataset.key = key;
      var keep = extra.querySelector('#guideDep');
      var picked = keep ? keep.value : '';
      extra.innerHTML = guideExtraHTML(role, st, inst, deps);
      F.bindInstallGuide(extra);
      var sel = extra.querySelector('#guideDep');
      if (sel && picked) sel.value = picked;
    }

    var notes = [];
    if (!isLinked) {
      if (role === 'minor' && inst) notes.push('<button type="button" class="link" data-handoff>Tudo certo aqui: continuar no meu computador</button>');
      if (role === 'minor') notes.push('<button type="button" class="link" data-same>Na verdade, usamos o mesmo computador</button>');
      notes.push('<button type="button" class="link" data-change-role>Mudar a escolha do computador</button>');
    }
    $('guideNote').innerHTML = notes.join('<br>');
  }

  function panelStepsHTML(withCode) {
    return '<li>No <strong>seu</strong> computador ou celular, abra <code>' + esc(location.host) + '/dashboard</code> e entre com <strong>' + esc(F.email()) + '</strong>.</li>' +
      '<li>Vá em <strong>Dependentes</strong> e clique em <strong>Adicionar Dependente</strong> (se ainda não cadastrou).</li>' +
      (withCode ? '<li>No cartão do filho, clique em <strong>Vincular</strong> e anote o código de 6 letras.</li>' : '');
  }
  function popupStepsHTML() {
    return '<li>Clique no ícone do <strong>Guardian</strong> ao lado da barra de endereço (ou em 🧩 → Guardian).</li>' +
      '<li>Na janelinha, entre com <strong>' + esc(F.email()) + '</strong>.</li>' +
      '<li>Digite o código e clique em <strong>Conectar</strong>.</li>';
  }

  function guideExtraHTML(role, st, inst, deps) {
    if (role === 'minor') {
      if (!inst) {
        return st.downloadedAt ? '<h2 style="margin-bottom:12px">Como instalar a extensão</h2>' + F.installGuideHTML() : '';
      }
      if (!deps.length) {
        return '<h2 style="margin:4px 0 6px">Quem vai usar este computador?</h2>' +
          '<p class="onb-note" style="margin:0 0 10px">Cadastre seu filho aqui mesmo. Depois ele aparece no seu painel.</p>' +
          '<form id="depForm" class="dep-form" novalidate>' +
            '<div class="field-row"><label for="depNick"><strong>Nome ou apelido</strong></label><input id="depNick" maxlength="60" required autocomplete="off"></div>' +
            '<div class="field-row"><label for="depBirth"><strong>Data de nascimento</strong></label><input id="depBirth" type="date" required max="' + new Date().toISOString().slice(0, 10) + '"></div>' +
            '<div class="field-row"><span><strong>Sexo</strong></span><div class="dep-sex">' +
              '<label><input type="radio" name="depSex" value="MASCULINO" required> Menino</label>' +
              '<label><input type="radio" name="depSex" value="FEMININO"> Menina</label></div></div>' +
            '<p class="error" id="depError" role="alert"></p>' +
            '<div class="onb-cta"><button class="btn-primary" type="submit">Cadastrar e continuar</button></div>' +
          '</form>';
      }
      return '<div class="field-row"><label for="guideDep"><strong>Quem usa este computador?</strong></label><select id="guideDep">' +
          deps.map(function (d) { return '<option value="' + esc(d.id) + '">' + esc(d.nickname) + '</option>'; }).join('') +
        '</select></div>' +
        '<p class="error" role="alert">' + esc(guideLink.error) + '</p>' +
        '<div class="onb-cta"><button class="btn-primary" type="button" data-guide-link ' + (guideLink.busy ? 'disabled' : '') + '>' +
          (guideLink.busy ? 'Vinculando…' : 'Vincular este computador agora') + '</button></div>' +
        '<details class="next-pc"><summary><strong>Prefere usar um código?</strong></summary><ol>' + panelStepsHTML(true) +
          '<li>De volta neste computador:</li>' + popupStepsHTML() + '</ol></details>';
    }
    if (role === 'resp') {
      var here = inst
        ? '<div class="gf-wait ok"><span class="gf-spin"></span>A extensão já está instalada neste navegador.</div>' +
          '<p class="onb-note">Seu filho também usa este computador? <button type="button" class="link" data-same-here>Vincular este navegador agora</button></p>'
        : '';
      return here + '<div class="next-pc"><h2>' + (inst ? 'Ou, se ele usa outro computador:' : 'Depois, no computador do seu filho:') + '</h2><ol>' +
          '<li>Abra <code>' + esc(location.host) + '</code> no Chrome ou Edge.</li>' +
          '<li>Clique em <strong>Fazer login</strong> e entre com <strong>' + esc(F.email()) + '</strong>.</li>' +
          '<li>Escolha <strong>“Este é o computador de um menor de idade”</strong>: lá instalamos só a extensão e você vincula com um clique.</li>' +
        '</ol></div>' +
        '<div class="gf-wait"><span class="gf-spin"></span>Aguardando o primeiro computador ser vinculado…</div>' +
        '<p class="onb-note">' + (inst ? '' : 'Quer proteger este navegador também? <button type="button" class="link" data-optional-download>Baixar a extensão (opcional)</button>') + '</p>';
    }
    if (inst) return '<div class="gf-wait ok"><span class="gf-spin"></span>Extensão instalada! Volte ao painel e clique no botão destacado para vincular.</div>';
    if (deps.length) return '<div class="gf-wait"><span class="gf-spin"></span>Dependente cadastrado. No painel, baixe e instale a extensão seguindo o destaque.</div>';
    return '';
  }

  $('guideCta').addEventListener('click', function () {
    var st = F.getState();
    if (st.role === 'minor') F.downloadExtension();
    else openPanel(F.URLS.dependents);
    renderGuide();
  });
  $('guideExtra').addEventListener('click', async function (e) {
    if (e.target.closest('[data-optional-download]')) { F.downloadExtension(); return; }
    if (e.target.closest('[data-same-here]')) { F.setState({ role: 'same' }); openPanel(F.URLS.dependents); return; }
    if (!e.target.closest('[data-guide-link]') || guideLink.busy) return;
    var dep = $('guideDep') && $('guideDep').value;
    if (!dep) return;
    guideLink.busy = true; guideLink.error = ''; renderGuide();
    try {
      await F.extension.enroll(await F.generateCode(dep));
      await refresh();
    } catch (err) {
      guideLink.error = (err && err.message) || 'Não foi possível vincular. Tente de novo.';
    } finally {
      guideLink.busy = false;
      if (current === 'guide') renderGuide();
    }
  });
  $('guideExtra').addEventListener('submit', async function (e) {
    if (e.target.id !== 'depForm') return;
    e.preventDefault();
    var f = e.target, err = $('depError'), btn = f.querySelector('button[type=submit]');
    var nick = $('depNick').value.trim(), birth = $('depBirth').value;
    var sex = f.querySelector('input[name=depSex]:checked');
    err.textContent = '';
    if (!nick) { err.textContent = 'Informe o nome ou apelido do seu filho.'; $('depNick').focus(); return; }
    if (!birth) { err.textContent = 'Informe a data de nascimento.'; $('depBirth').focus(); return; }
    if (!sex) { err.textContent = 'Escolha menino ou menina.'; return; }
    btn.disabled = true; btn.textContent = 'Cadastrando…';
    try {
      await F.createDependent({ nickname: nick, birthDate: birth, sex: sex.value });
      await refresh();
    } catch (ex) {
      err.textContent = (ex && ex.message) || 'Não foi possível cadastrar. Tente de novo.';
      btn.disabled = false; btn.textContent = 'Cadastrar e continuar';
    }
  });
  $('guideNote').addEventListener('click', function (e) {
    if (e.target.closest('[data-change-role]')) {
      if (F.getState().role === 'minor') F.reauth('');
      else mostrar('choose');
    }
    else if (e.target.closest('[data-same]')) F.reauth('same');
    else if (e.target.closest('[data-handoff]')) mostrar('handoff');
  });

  function renderHandoff() {
    $('handoffPanel').innerHTML = panelStepsHTML(true);
    $('handoffPopup').innerHTML = popupStepsHTML();
  }

  // ---------- Conclusão ----------
  function renderComplete() {
    var role = F.getState().role || 'same';
    root.dataset.role = role;
    var d = status && status.devices[0];
    $('completeLead').textContent = d
      ? '“' + d.name + '” agora protege ' + (d.dependentNickname || 'seu filho') + '. Os alertas aparecem no painel.'
      : 'O computador foi vinculado com sucesso.';
  }
  document.querySelectorAll('[data-finish]').forEach(function (b) {
    b.addEventListener('click', function () {
      F.setState({ doneAck: true });
      if (b.dataset.finish === 'logout') F.logout('/');
      else location.href = F.URLS.dashboard;
    });
  });

  // ---------- Usuário que volta ----------
  function renderHome() {
    root.dataset.role = F.getState().role || 'same';
    var devs = status ? status.devices : [];
    $('homeLead').textContent = devs.length === 1
      ? 'Você tem 1 computador protegido.'
      : 'Você tem ' + devs.length + ' computadores protegidos.';
    $('homeDevices').innerHTML = devs.map(function (d) {
      return '<li class="done"><span class="gf-dot"></span><span>' + esc(d.name) +
        '<small>' + esc(d.dependentNickname || 'Dependente') + '</small></span></li>';
    }).join('');
  }

  // ---------- Reinstalar / vincular outro navegador ----------
  function renderReinstall() {
    var g = $('reinstallGuide');
    if (!g.dataset.ready) { g.innerHTML = F.installGuideHTML(); F.bindInstallGuide(g); g.dataset.ready = '1'; }
    var inst = extInstalled();
    g.hidden = inst || reinstallLinked;
    $('reinstallLink').hidden = !inst || reinstallLinked;
    $('reinstallDone').hidden = !reinstallLinked;
    var sel = $('reinstallDep'), deps = status ? status.dependents : [];
    var sig = deps.map(function (d) { return d.id; }).join(',');
    if (sel.dataset.sig !== sig) {
      sel.dataset.sig = sig;
      sel.innerHTML = deps.map(function (d) {
        return '<option value="' + esc(d.id) + '">' + esc(d.nickname) + '</option>';
      }).join('');
    }
  }
  document.querySelector('[data-download]').addEventListener('click', F.downloadExtension);
  $('reinstallBtn').addEventListener('click', async function () {
    var btn = this, err = $('reinstallError'), dep = $('reinstallDep').value;
    err.textContent = '';
    if (!dep) { err.textContent = 'Cadastre um dependente no painel primeiro.'; return; }
    btn.disabled = true; btn.textContent = 'Vinculando…';
    try {
      var code = await F.generateCode(dep);
      await F.extension.enroll(code);
      reinstallLinked = true;
      await refresh();
    } catch (e) {
      err.textContent = e.message;
    } finally {
      btn.disabled = false; btn.textContent = 'Vincular este navegador';
      renderReinstall();
    }
  });

  // ---------- Navegação ----------
  document.querySelectorAll('[data-go]').forEach(function (b) {
    b.addEventListener('click', function () { mostrar(b.dataset.go); });
  });
  document.querySelectorAll('[data-pick]').forEach(function (b) {
    b.addEventListener('click', function () {
      var cur = F.getState().role;
      if (cur === 'minor' && b.dataset.pick !== 'minor') return F.reauth(b.dataset.pick);
      F.setState({ role: b.dataset.pick, startedAt: F.getState().startedAt || Date.now() });
      mostrar('guide');
    });
  });
  document.querySelectorAll('[data-logout]').forEach(function (b) {
    b.addEventListener('click', function () { F.logout('/'); });
  });
  document.querySelectorAll('[data-reauth]').forEach(function (b) {
    b.addEventListener('click', function () { F.reauth(b.dataset.reauth); });
  });
  document.querySelectorAll('[data-go-home]').forEach(function (b) {
    b.addEventListener('click', function () { history.replaceState(null, '', 'onboarding.html'); mostrar(decide()); });
  });
  back.addEventListener('click', function () {
    if (current === 'reinstall') mostrar('home');
    else if (current === 'guide') mostrar('choose');
    else if (current === 'handoff') mostrar('guide');
    else if (current === 'choose') mostrar('intro');
  });

  // ---------- Sincronização ao vivo (backend + extensão + outras abas) ----------
  var wasLinked = false;
  async function refresh() {
    try { status = await F.status(); } catch (e) {
      if (current === 'loading') {
        document.querySelector('[data-screen="loading"] .gf-wait').innerHTML =
          '<span class="gf-spin"></span>Não conseguimos falar com o servidor. Tentando de novo…';
      }
      return;
    }
    updateBadge();
    if (!wasLinked && linked() && (current === 'guide' || current === 'loading')) {
      wasLinked = true;
      mostrar(decide());
      return;
    }
    wasLinked = linked();
    if (current === 'loading') mostrar(decide());
    else rerender();
  }
  function rerender() {
    if (current === 'guide') renderGuide();
    if (current === 'reinstall') renderReinstall();
    if (current === 'home') renderHome();
  }

  F.on('extension', function (s) {
    extStatus = s;
    // Vínculo feito pelo ícone do Guardian (código digitado) também conclui o guia.
    if (!wasLinked && linked() && (current === 'guide' || current === 'handoff')) {
      wasLinked = true; updateBadge(); mostrar(decide()); return;
    }
    rerender();
  });
  F.on('state', function () { if (current === 'guide') renderGuide(); });
  F.on('logout', function () { location.replace('auth.html'); });
  F.extension.watch(2500);
  setInterval(function () { if (!document.hidden) refresh(); }, 4000);
  window.addEventListener('focus', refresh);

  mostrar('loading');
  F.extension.detect().then(function (s) { extStatus = s; });
  refresh();
})();

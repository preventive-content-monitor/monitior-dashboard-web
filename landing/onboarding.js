(function () {
  'use strict';
  var F = window.GuardianFlow;
  if (!F || (!F.isLoggedIn() && !F.isMinor())) { window.location.replace('auth.html'); return; }

  var root = document.getElementById('onb'), back = document.getElementById('back');
  var label = document.getElementById('stepLabel'), dots = document.querySelectorAll('#dots span');
  var $ = function (id) { return document.getElementById(id); };
  var esc = F.escapeHTML;
  var PANEL_TAB = 'guardian-painel';
  var current = null, status = null, extStatus = F.extension.current();
  var reinstallLinked = false;
  var guideLink = { busy: false, error: '' };
  var minorClosePromise = null;

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

  function linked() {
    if (extOutdated()) return false;
    if (F.isMinor()) return !!(extStatus && extStatus.scopedEnrollment && extStatus.enrolled);
    return !!((status && status.devices.length) || (extStatus && extStatus.enrolled));
  }
  function extInstalled() { return !!(extStatus && extStatus.installed); }
  function extOutdated() {
    return extInstalled() && (!extStatus.scopedEnrollment || extStatus.browserProtection !== true || extStatus.incognitoPolicy !== true);
  }

  var restrictedAsked = /[?&]restrito=1/.test(location.search);
  function decide() {
    var st = F.getState();
    if (restrictedAsked && (F.isMinor() || st.role === 'minor')) { restrictedAsked = false; return 'restricted'; }
    if (extOutdated() && st.role) return 'guide';
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
    var st = F.getState(), role = F.isMinor() ? 'minor' : (st.role || 'same');
    root.dataset.role = role;
    var deps = status ? status.dependents : [];
    var outdated = extOutdated();
    var needsAuth = !!(extStatus && extStatus.requiresAuthorization);
    var hasDep = deps.length > 0, inst = extInstalled() && !outdated, isLinked = linked();
    var incognitoAllowed = !!(inst && extStatus.anonimoPermitido);
    var depSub = hasDep ? deps.length + ' dependente(s) cadastrado(s)' : '';
    var list = [item(true, false, 'Conta de responsável criada', esc(F.email()))];
    var cta = $('guideCta');
    cta.style.display = '';

    if (role === 'minor') {
      list.push(item(inst, !inst, 'Instalar a extensão neste navegador', inst ? 'Extensão detectada' : 'Siga o guia abaixo'));
      if (inst) list.push(item(incognitoAllowed, !incognitoAllowed, 'Ativar no modo anônimo', incognitoAllowed ? 'Ativado' : 'Saiba mais → Permitir no modo anônimo'));
      list.push(item(hasDep, inst && !hasDep, 'Cadastrar o filho', F.hasSetupSession() ? (depSub || 'Aqui mesmo, só o nome e a idade') : 'No painel do responsável'));
      list.push(item(isLinked, inst && !isLinked, 'Vincular este computador ao filho', F.hasSetupSession() ? 'Aqui mesmo, com um clique' : 'Com o código do painel'));
      $('guideTitle').textContent = inst ? 'Extensão instalada! Falta vincular' : 'Vamos proteger este computador';
      $('guideLead').textContent = inst
        ? (F.hasSetupSession() ? 'Escolha qual filho usa este computador. O painel com os alertas fica no seu computador, não neste.' : 'No seu computador, gere o código no painel e depois digite-o na extensão deste navegador.')
        : st.downloadedAt
          ? 'Siga o guia abaixo para instalar. Esta tela percebe sozinha quando você terminar.'
          : 'Neste computador vamos apenas instalar a extensão que protege a navegação. O painel com os alertas fica no seu computador.';
      cta.textContent = st.downloadedAt ? 'Baixar a extensão novamente' : 'Baixar a extensão';
      cta.className = st.downloadedAt ? 'btn-secondary' : 'btn-primary';
      if (inst) cta.style.display = 'none';
      if (outdated) {
        $('guideTitle').textContent = 'Atualize a extensão neste computador';
        $('guideLead').textContent = 'A versão antiga precisa ser atualizada antes de você digitar sua senha.';
        cta.textContent = 'Baixar a versão atualizada';
        cta.className = 'btn-primary';
      } else if (needsAuth) {
        $('guideTitle').textContent = 'Autorize novamente a proteção';
        $('guideLead').textContent = 'O vínculo anterior será mantido. Abra o Guardian e confirme a conta do responsável.';
      }
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
      if (inst) list.push(item(incognitoAllowed, !incognitoAllowed, 'Ativar no modo anônimo', incognitoAllowed ? 'Ativado' : 'Saiba mais → Permitir no modo anônimo'));
      list.push(item(isLinked, hasDep && inst && !isLinked, 'Vincular este navegador ao filho', 'Um clique no painel, no botão destacado'));
      $('guideTitle').textContent = 'Vamos configurar tudo neste computador';
      $('guideLead').textContent = 'Primeiro o painel, depois a extensão. O painel abre em outra aba com cada passo destacado; esta aba fica aqui acompanhando.';
      cta.textContent = 'Abrir o painel';
      cta.className = 'btn-primary';
    }
    if (outdated && role !== 'minor') {
      $('guideTitle').textContent = 'Atualize a extensão neste computador';
      $('guideLead').textContent = 'A versão atual precisa ser instalada para proteger as configurações do navegador e as janelas anônimas.';
      cta.textContent = 'Baixar a versão atualizada';
      cta.className = 'btn-primary';
    }
    $('guideCheck').innerHTML = list.join('');

    var extra = $('guideExtra');
    var sig = deps.map(function (d) { return d.id; }).join(',');
    var key = [role, !!st.downloadedAt, inst, outdated, needsAuth, incognitoAllowed, sig, F.hasSetupSession(), guideLink.busy, guideLink.error].join('|');
    if (extra.dataset.key !== key) {
      extra.dataset.key = key;
      var keep = extra.querySelector('#guideDep');
      var picked = keep ? keep.value : '';
      extra.innerHTML = guideExtraHTML(role, st, inst, deps, outdated, needsAuth);
      F.bindInstallGuide(extra);
      stepper(extra);
      var sel = extra.querySelector('#guideDep');
      if (sel && picked) sel.value = picked;
    }
    document.querySelector('[data-screen="guide"]').classList.toggle('installing', !!extra.querySelector('.gf-steps'));

    var notes = [];
    if (!isLinked) {
      if (role === 'minor' && inst) notes.push('<button type="button" class="link" data-handoff>Tudo certo aqui: continuar no meu computador</button>');
      if (role === 'minor') notes.push('<button type="button" class="link" data-same>Na verdade, usamos o mesmo computador</button>');
      notes.push('<button type="button" class="link" data-change-role>Mudar a escolha do computador</button>');
    }
    $('guideNote').innerHTML = (guideLink.error ? '<span class="error" role="alert">' + esc(guideLink.error) + '</span><br>' : '') + notes.join('<br>');
  }

  // Guia de instalação um passo por vez, para caber na tela sem rolagem.
  var installStep = 0;
  function stepper(root) {
    var ol = root.querySelector('.gf-steps');
    if (!ol) return;
    root.querySelectorAll('.gf-alert').forEach(function (a) {
      if (/^(Já tinha|Depois de vincular)/.test(a.textContent.trim())) a.remove();
    });
    var items = Array.prototype.slice.call(ol.children);
    var nav = document.createElement('div');
    nav.className = 'gf-stepnav';
    nav.innerHTML = '<button type="button" class="btn-secondary" data-step-prev>Anterior</button>' +
      '<span class="gf-stepcount" aria-live="polite"></span>' +
      '<button type="button" class="btn-primary" data-step-next>Próximo</button>';
    ol.after(nav);
    function show(i) {
      installStep = Math.max(0, Math.min(i, items.length - 1));
      items.forEach(function (li, j) { li.hidden = j !== installStep; });
      nav.querySelector('.gf-stepcount').textContent = 'Etapa ' + (installStep + 1) + ' de ' + items.length;
      nav.querySelector('[data-step-prev]').disabled = installStep === 0;
      nav.querySelector('[data-step-next]').hidden = installStep === items.length - 1;
    }
    nav.addEventListener('click', function (e) {
      if (e.target.closest('[data-step-prev]')) show(installStep - 1);
      if (e.target.closest('[data-step-next]')) show(installStep + 1);
    });
    show(installStep);
  }

  function panelStepsHTML(withCode) {
    return '<li>No <strong>seu</strong> computador ou celular, abra <code>' + esc(location.origin) + '/dashboard</code> e entre com <strong>' + esc(F.email()) + '</strong>.</li>' +
      '<li>Vá em <strong>Dependentes</strong> e clique em <strong>Adicionar Dependente</strong> (se ainda não cadastrou).</li>' +
      (withCode ? '<li>No cartão do filho, clique em <strong>Vincular</strong> e anote o código de 6 letras.</li>' : '');
  }
  function popupStepsHTML() {
    return '<li>Clique no ícone do <strong>Guardian</strong> ao lado da barra de endereço (ou em 🧩 → Guardian).</li>' +
      '<li>Na janelinha, entre com <strong>' + esc(F.email()) + '</strong>.</li>' +
      '<li>Digite o código e clique em <strong>Conectar</strong>.</li>';
  }

  function guideExtraHTML(role, st, inst, deps, outdated, needsAuth) {
    if (outdated) return F.updateGuideHTML();
    var incognitoSetup = inst && extStatus && extStatus.anonimoPermitido === false
      ? '<div class="gf-alert"><strong>Falta 1 passo:</strong> em <code>' + F.browserInfo().page + '</code>, no quadro <strong>Guardian - Proteção Familiar</strong>, clique em <strong>Saiba mais</strong> e ligue <strong>' + F.browserInfo().incognito + '</strong>. Esta tela confirma sozinha.</div>'
      : '';
    if (role === 'minor') {
      if (needsAuth) {
        return incognitoSetup + '<div class="gf-alert">Clique no ícone do <strong>Guardian</strong> ao lado da barra de endereço (ou em 🧩 → Guardian) e entre com a conta do responsável. Não é necessário gerar outro código.</div>' +
          '<div class="gf-wait"><span class="gf-spin"></span>Aguardando a reautorização da extensão…</div>';
      }
      if (!inst) {
        return st.downloadedAt ? '<h2 style="margin-bottom:12px">Como instalar a extensão</h2>' + F.installGuideHTML() : '';
      }
      if (!F.hasSetupSession()) {
        return incognitoSetup + '<h2 style="margin:4px 0 6px">Vincule este computador</h2>' +
          '<p class="onb-note">A sessão do responsável não fica salva aqui. Para continuar, use o código gerado no seu painel.</p>' +
          (guideLink.error ? '<p class="error" role="alert">' + esc(guideLink.error) + '</p>' : '') +
          '<ol>' + panelStepsHTML(true) + '<li>De volta neste computador:</li>' + popupStepsHTML() + '</ol>' +
          '<p class="onb-note">Prefere cadastrar e vincular aqui? <a href="/auth.html?configurar=1">Confirme sua senha para uma configuração temporária</a>.</p>';
      }
      if (!deps.length) {
        return incognitoSetup + '<h2 style="margin:4px 0 6px">Quem vai usar este computador?</h2>' +
          '<p class="onb-note" style="margin:0 0 10px">Cadastre seu filho aqui mesmo. Depois ele aparece no seu painel.</p>' +
          '<form id="depForm" class="dep-form" novalidate>' +
            '<div class="field-row"><label for="depNick"><strong>Nome ou apelido</strong></label><input id="depNick" maxlength="60" required autocomplete="off"></div>' +
            '<div class="field-row"><label for="depBirth"><strong>Data de nascimento</strong></label><input id="depBirth" type="date" required min="' + (function () { var d = new Date(); d.setFullYear(d.getFullYear() - 18); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); })() + '" max="' + new Date().toISOString().slice(0, 10) + '"></div>' +
            '<div class="field-row"><span><strong>Sexo</strong></span><div class="dep-sex">' +
              '<label><input type="radio" name="depSex" value="MASCULINO" required> Menino</label>' +
              '<label><input type="radio" name="depSex" value="FEMININO"> Menina</label></div></div>' +
            '<p class="error" id="depError" role="alert"></p>' +
            '<div class="onb-cta"><button class="btn-primary" type="submit">Cadastrar e continuar</button></div>' +
          '</form>';
      }
      return incognitoSetup + '<div class="field-row"><label for="guideDep"><strong>Quem usa este computador?</strong></label><select id="guideDep">' +
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
        ? incognitoSetup + '<div class="gf-wait ok"><span class="gf-spin"></span>A extensão já está instalada neste navegador.</div>' +
          '<p class="onb-note">Seu filho também usa este computador? <button type="button" class="link" data-same-here>Vincular este navegador agora</button></p>'
        : '';
      return here + '<div class="next-pc"><h2>' + (inst ? 'Ou, se ele usa outro computador:' : 'Depois, no computador do seu filho:') + '</h2><ol>' +
          '<li>Abra <code>' + esc(location.host) + '</code> no Chrome ou Edge.</li>' +
          '<li>Clique em <strong>Fazer login</strong> e entre com <strong>' + esc(F.email()) + '</strong>.</li>' +
          '<li>Escolha <strong>“Este é o computador de um menor de idade”</strong>. A sessão do painel será encerrada e a configuração terá acesso temporário limitado.</li>' +
        '</ol></div>' +
        '<div class="gf-wait"><span class="gf-spin"></span>Aguardando o primeiro computador ser vinculado…</div>' +
        '<p class="onb-note">' + (inst ? '' : 'Quer proteger este navegador também? <button type="button" class="link" data-optional-download>Baixar a extensão (opcional)</button>') + '</p>';
    }
    if (inst) return incognitoSetup + '<div class="gf-wait ok"><span class="gf-spin"></span>Extensão instalada! Volte ao painel e clique no botão destacado para vincular.</div>';
    if (deps.length) return '<div class="gf-wait"><span class="gf-spin"></span>Dependente cadastrado. No painel, baixe e instale a extensão seguindo o destaque.</div>';
    return '';
  }

  $('guideCta').addEventListener('click', function () {
    var st = F.getState();
    if (extOutdated() || st.role === 'minor') F.downloadExtension();
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
      if (!await closeMinorSession()) return;
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
  $('guideNote').addEventListener('click', async function (e) {
    if (e.target.closest('[data-change-role]')) {
      if (F.isMinor() || F.getState().role === 'minor') {
        try { await F.reauth(''); } catch (err) { alert(err.message); }
      }
      else mostrar('choose');
    }
    else if (e.target.closest('[data-same]')) {
      try { await F.reauth('same'); } catch (err) { alert(err.message); }
    }
    else if (e.target.closest('[data-handoff]') && await closeMinorSession()) mostrar('handoff');
  });

  function closeMinorSession() {
    if (!F.isMinor() || !F.hasSetupSession()) return Promise.resolve(true);
    if (minorClosePromise) return minorClosePromise;
    minorClosePromise = F.finishMinor().then(function () {
      guideLink.error = '';
      return true;
    }).catch(function () {
      guideLink.error = 'Não foi possível encerrar a autorização temporária no servidor. Verifique a conexão e tente novamente.';
      if (current === 'guide') renderGuide();
      return false;
    }).finally(function () { minorClosePromise = null; });
    return minorClosePromise;
  }

  function renderHandoff() {
    $('handoffPanel').innerHTML = panelStepsHTML(true);
    $('handoffPopup').innerHTML = popupStepsHTML();
  }

  // ---------- Conclusão ----------
  function renderComplete() {
    var role = F.isMinor() ? 'minor' : (F.getState().role || 'same');
    root.dataset.role = role;
    var d = status && status.devices[0];
    $('completeLead').textContent = d
      ? '“' + d.name + '” agora protege ' + (d.dependentNickname || 'seu filho') + '. Os alertas aparecem no painel.'
      : 'O computador foi vinculado com sucesso.';
  }
  document.querySelectorAll('[data-finish]').forEach(function (b) {
    b.addEventListener('click', async function () {
      F.setState({ doneAck: true });
      if (b.dataset.finish === 'logout') {
        try { await F.logout('/'); } catch (err) { alert(err.message); location.href = '/'; }
      }
      else location.href = F.URLS.dashboard;
    });
  });

  // ---------- Usuário que volta ----------
  function renderHome() {
    root.dataset.role = F.isMinor() ? 'minor' : (F.getState().role || 'same');
    var devs = status ? status.devices : [];
    if (F.isMinor()) {
      $('homeLead').textContent = extStatus && extStatus.enrolled ? 'Este navegador está protegido.' : 'A extensão pode ser instalada neste navegador.';
      $('homeDevices').innerHTML = '';
      return;
    }
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
    if (!g.dataset.ready) { g.innerHTML = F.installGuideHTML(); F.bindInstallGuide(g); stepper(g); g.dataset.ready = '1'; }
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
    b.addEventListener('click', async function () {
      var cur = F.getState().role;
      if ((F.isMinor() || cur === 'minor') && b.dataset.pick !== 'minor') {
        try { await F.reauth(b.dataset.pick); } catch (err) { alert(err.message); }
        return;
      }
      if (b.dataset.pick === 'minor' && F.hasParentSession()) {
        b.disabled = true;
        try {
          await F.beginMinor();
          await refresh();
          mostrar('guide');
        } catch (err) {
          alert(err.message);
          if (F.isMinor()) mostrar('guide');
        } finally { b.disabled = false; }
        return;
      }
      F.setState({ role: b.dataset.pick, startedAt: F.getState().startedAt || Date.now() });
      mostrar('guide');
    });
  });
  document.querySelectorAll('[data-logout]').forEach(function (b) {
    b.addEventListener('click', async function () {
      try { await F.logout('/'); } catch (err) { alert(err.message); location.href = '/'; }
    });
  });
  document.querySelectorAll('[data-reauth]').forEach(function (b) {
    b.addEventListener('click', async function () {
      try { await F.reauth(b.dataset.reauth); } catch (err) { alert(err.message); }
    });
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
      if (F.isMinor() && !F.hasSetupSession()) {
        status = { dependents: [], devices: [] };
        guideLink.error = e.message;
      } else {
      if (current === 'loading') {
        document.querySelector('[data-screen="loading"] .gf-wait').innerHTML =
          '<span class="gf-spin"></span>Não conseguimos falar com o servidor. Tentando de novo…';
      }
      return;
      }
    }
    updateBadge();
    if (!wasLinked && linked() && (current === 'guide' || current === 'loading')) {
      if (!await closeMinorSession()) return;
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

  F.on('extension', async function (s) {
    extStatus = s;
    // Vínculo feito pelo ícone do Guardian (código digitado) também conclui o guia.
    if (!wasLinked && linked() && !guideLink.busy && (current === 'guide' || current === 'handoff')) {
      if (!await closeMinorSession()) return;
      wasLinked = true; updateBadge(); mostrar(decide()); return;
    }
    rerender();
  });
  F.on('state', function () { if (current === 'guide') renderGuide(); });
  F.on('logout', function () { if (!F.isMinor()) location.replace('auth.html'); });
  F.extension.watch(2500);
  setInterval(function () { if (!document.hidden) refresh(); }, 4000);
  window.addEventListener('focus', refresh);

  mostrar('loading');
  F.extension.detect().then(function (s) { extStatus = s; });
  if (F.getState().role === 'minor' && F.hasParentSession()) {
    F.beginMinor().then(refresh).catch(function (err) { alert(err.message); refresh(); });
  } else refresh();
})();

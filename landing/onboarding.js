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
    back.hidden = !(nome === 'choose' || nome === 'guide' || nome === 'reinstall');
    if (nome === 'guide') renderGuide();
    if (nome === 'reinstall') renderReinstall();
    if (nome === 'home') renderHome();
    if (nome === 'complete') renderComplete();
  }

  function openPanel(path) {
    // Aba nomeada: reaproveita a mesma aba do painel em vez de abrir várias.
    var w = window.open(path || F.URLS.dependents, PANEL_TAB);
    if (w) w.focus(); else location.href = path || F.URLS.dependents;
  }

  function linked() { return !!(status && status.devices.length); }
  function extInstalled() { return !!(extStatus && extStatus.installed); }

  function decide() {
    var st = F.getState();
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
    var deps = status ? status.dependents.length : 0;
    var hasDep = deps > 0, inst = extInstalled(), isLinked = linked();
    var needsExt = role !== 'resp';
    var list = [];
    list.push(item(true, false, 'Conta de responsável criada', esc(F.email())));
    list.push(item(hasDep, !hasDep, 'Cadastrar o filho no painel', hasDep ? deps + ' dependente(s) cadastrado(s)' : 'Feito no painel, na aba Dependentes'));
    if (needsExt) {
      list.push(item(inst, hasDep && !inst, 'Instalar a extensão neste navegador', inst ? 'Extensão detectada' : 'Siga o guia abaixo'));
      list.push(item(isLinked, hasDep && inst && !isLinked, 'Vincular este navegador ao filho', 'Um clique no painel, no botão destacado'));
    } else {
      list.push(item(isLinked, hasDep && !isLinked, 'Vincular o computador do filho', 'Feito no computador do filho'));
    }
    $('guideCheck').innerHTML = list.join('');

    var titles = {
      minor: 'Vamos proteger este computador',
      resp: 'Vamos preparar o seu painel',
      same: 'Vamos configurar tudo neste computador',
    };
    $('guideTitle').textContent = titles[role];
    var cta = $('guideCta');
    if (needsExt) {
      $('guideLead').textContent = st.downloadedAt
        ? 'O painel abriu em outra aba com o passo a passo destacado. Esta aba continua aqui acompanhando o seu progresso.'
        : 'Um clique só: baixamos a extensão e abrimos o painel em outra aba. Esta aba fica aberta acompanhando cada passo.';
      cta.textContent = st.downloadedAt ? 'Voltar para o painel' : 'Baixar a extensão e abrir o painel';
    } else {
      $('guideLead').textContent = 'Abra o painel em outra aba e siga os destaques. Esta aba fica aberta acompanhando o seu progresso.';
      cta.textContent = 'Abrir o painel';
    }

    var extra = $('guideExtra');
    var key = role + '|' + (needsExt && st.downloadedAt && !inst ? 'guide' : '') + '|' + inst + '|' + hasDep;
    if (extra.dataset.key !== key) {
      extra.dataset.key = key;
      var html = '';
      if (needsExt && st.downloadedAt && !inst) {
        html = '<h2 style="margin-bottom:12px">Como instalar a extensão</h2>' + F.installGuideHTML();
      } else if (needsExt && inst && !isLinked) {
        html = '<div class="gf-wait ok"><span class="gf-spin"></span>Extensão instalada! Volte ao painel e clique no botão destacado para vincular.</div>';
      } else if (!needsExt) {
        html = '<div class="next-pc"><h2>Depois, no computador do seu filho:</h2><ol>' +
          '<li>Abra <code>' + esc(location.host) + '</code> no Chrome ou Edge.</li>' +
          '<li>Clique em <strong>Fazer login</strong> e entre com <strong>' + esc(F.email()) + '</strong>.</li>' +
          '<li>Escolha <strong>“Este é o computador de um menor de idade”</strong> e siga os destaques.</li>' +
          '</ol></div><div class="gf-wait"><span class="gf-spin"></span>Aguardando o primeiro computador ser vinculado…</div>';
      }
      extra.innerHTML = html;
      F.bindInstallGuide(extra);
    }
    $('guideNote').innerHTML = isLinked ? '' : '<button type="button" class="link" data-change-role>Mudar a escolha do computador</button>';
  }

  $('guideCta').addEventListener('click', function () {
    var st = F.getState();
    if (st.role !== 'resp' && !st.downloadedAt) F.downloadExtension();
    openPanel(F.URLS.dependents);
    renderGuide();
  });
  $('guideNote').addEventListener('click', function (e) {
    if (e.target.closest('[data-change-role]')) mostrar('choose');
  });

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
      F.setState({ role: b.dataset.pick, startedAt: F.getState().startedAt || Date.now() });
      mostrar('guide');
    });
  });
  document.querySelectorAll('[data-logout]').forEach(function (b) {
    b.addEventListener('click', function () { F.logout('/'); });
  });
  back.addEventListener('click', function () {
    if (current === 'reinstall') mostrar('home');
    else if (current === 'guide') mostrar('choose');
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

  F.on('extension', function (s) { extStatus = s; rerender(); });
  F.on('state', function () { if (current === 'guide') renderGuide(); });
  F.on('logout', function () { location.replace('auth.html'); });
  F.extension.watch(2500);
  setInterval(function () { if (!document.hidden) refresh(); }, 4000);
  window.addEventListener('focus', refresh);

  mostrar('loading');
  F.extension.detect().then(function (s) { extStatus = s; });
  refresh();
})();

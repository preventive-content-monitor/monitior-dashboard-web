(function () {
  'use strict';
  var setupMode = new URLSearchParams(location.search).get('configurar') === '1' && !!localStorage.getItem('guardian_minor_email');
  if (localStorage.getItem('guardian_token') && !setupMode) { window.location.replace('onboarding.html'); return; }
  var card = document.getElementById('auth'), seg = document.getElementById('seg');
  var form = document.getElementById('form'), submit = document.getElementById('submit');
  var titulos = {
    entrar: ['Bem-vindo de volta', 'Entre para acompanhar a proteção digital da sua família.', 'Fazer Login'],
    cadastro: ['Crie sua conta', 'Crie sua conta e siga o passo a passo.', 'Fazer Cadastro']
  };
  var aba = 'entrar';

  function setAba(a, foco) {
    aba = a;
    card.dataset.aba = a; seg.dataset.aba = a;
    document.getElementById('titulo').textContent = titulos[a][0];
    document.getElementById('subtitulo').textContent = titulos[a][1];
    submit.textContent = titulos[a][2];
    document.getElementById('senha').autocomplete = a === 'entrar' ? 'current-password' : 'new-password';
    seg.querySelectorAll('[role=tab]').forEach(function (b) { b.setAttribute('aria-selected', b.dataset.abaBtn === a); });
    document.querySelector('.legal').hidden = a !== 'cadastro';
    limpar();
    document.title = (a === 'entrar' ? 'Entrar' : 'Cadastrar') + ' | GuardIAn';
    if (foco) document.getElementById('email').focus();
  }
  function limpar() {
    form.querySelectorAll('.error').forEach(function (e) { e.textContent = ''; });
    form.querySelectorAll('input').forEach(function (i) { i.classList.remove('invalid'); });
    document.getElementById('geral').textContent = '';
  }

  document.querySelectorAll('[data-aba-btn]').forEach(function (b) {
    b.addEventListener('click', function () { setAba(b.dataset.abaBtn, true); });
  });
  document.querySelectorAll('[data-aba-link]').forEach(function (l) {
    l.addEventListener('click', function (e) { e.preventDefault(); setAba(l.dataset.abaLink, true); });
  });

  /* mostrar/ocultar senha */
  document.querySelectorAll('[data-eye]').forEach(function (b) {
    b.addEventListener('click', function () {
      var i = document.getElementById(b.dataset.eye), v = i.type === 'password';
      i.type = v ? 'text' : 'password';
      b.classList.toggle('on', v);
      b.setAttribute('aria-label', v ? 'Ocultar senha' : 'Mostrar senha');
    });
  });

  /* força da senha */
  function forca(s) {
    var n = 0;
    if (s.length >= 8) n++;
    if (/[a-z]/.test(s) && /[A-Z]/.test(s)) n++;
    if (/\d/.test(s)) n++;
    if (/[^A-Za-z0-9]/.test(s)) n++;
    return s ? Math.max(1, n) : 0;
  }
  var nomes = ['8 ou mais caracteres, com letras e números.', 'Senha fraca', 'Senha razoável', 'Senha boa', 'Senha forte'];
  document.getElementById('senha').addEventListener('input', function () {
    if (aba !== 'cadastro') return;
    var n = forca(this.value);
    document.getElementById('meter').dataset.n = n;
    document.getElementById('meterTxt').textContent = nomes[n];
  });

  function erro(id, msg) {
    var i = document.getElementById(id);
    i.classList.add('invalid'); i.setAttribute('aria-invalid', 'true');
    form.querySelector('[data-err="' + id + '"]').textContent = msg;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault(); limpar();
    var email = document.getElementById('email').value.trim();
    var s = document.getElementById('senha').value, s2 = document.getElementById('senha2').value;
    var primeiro = null, ok = true;
    function falha(id, m) { erro(id, m); ok = false; if (!primeiro) primeiro = id; }

    if (!email) falha('email', 'Informe seu e-mail.');
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) falha('email', 'Digite um e-mail válido, como nome@email.com.');
    if (!s) falha('senha', 'Informe sua senha.');
    else if (aba === 'cadastro' && (s.length < 8 || !/\d/.test(s) || !/[A-Za-z]/.test(s))) falha('senha', 'A senha precisa ter 8 ou mais caracteres, com letras e números.');
    if (aba === 'cadastro' && s && s2 !== s) falha('senha2', 'As senhas não coincidem.');
    if (!ok) { document.getElementById(primeiro).focus(); return; }

    submit.disabled = true; submit.classList.add('loading');
    submit.textContent = aba === 'cadastro' ? 'Criando conta...' : 'Entrando...';
    var endpoint = setupMode ? '/api/autenticacao/entrar-configuracao' :
      aba === 'cadastro' ? '/api/autenticacao/registrar' : '/api/autenticacao/entrar';
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, senha: s })
    }).then(function (response) {
      if (!response.ok) {
        return response.json().catch(function () { return {}; }).then(function (body) {
          throw new Error(body.mensagem || (aba === 'cadastro' ? 'Não foi possível criar sua conta.' : 'E-mail ou senha inválidos.'));
        });
      }
      return aba === 'cadastro'
        ? fetch('/api/autenticacao/entrar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email, senha: s }) })
        : response;
    }).then(function (response) {
      if (!response.ok) throw new Error('Conta criada, mas não foi possível iniciar a sessão.');
      return response.json();
    }).then(function (data) {
      if (!data || !data.token) throw new Error('O servidor não retornou uma sessão válida.');
      if (setupMode) {
        var key = 'guardian_flow:' + email.toLowerCase(), state = {};
        try { state = JSON.parse(localStorage.getItem(key)) || {}; } catch (e) { state = {}; }
        state.role = 'minor';
        localStorage.setItem(key, JSON.stringify(state));
        localStorage.setItem('guardian_minor_email', email);
        localStorage.removeItem('guardian_token');
        localStorage.removeItem('guardian_email');
        sessionStorage.setItem('guardian_setup_token', data.token);
      } else {
        sessionStorage.removeItem('guardian_setup_token');
        localStorage.removeItem('guardian_minor_email');
        localStorage.setItem('guardian_token', data.token);
        localStorage.setItem('guardian_email', email);
        applyReauth(email);
      }
      document.getElementById('senha').value = '';
      window.location.href = 'onboarding.html';
    }).catch(function (error) {
      document.getElementById('geral').textContent = error.message;
    }).finally(function () {
      submit.disabled = false; submit.classList.remove('loading'); submit.textContent = titulos[aba][2];
    });
  });

  setAba(new URLSearchParams(location.search).get('aba') === 'cadastro' ? 'cadastro' : 'entrar', false);

  // Troca de papel pedida no "computador do menor": só vale após e-mail e senha corretos.
  function pendingReauth() {
    try { return JSON.parse(localStorage.getItem('guardian_reauth')); } catch (e) { return null; }
  }
  function applyReauth(email) {
    var p = pendingReauth();
    localStorage.removeItem('guardian_reauth');
    if (!p || p.email !== email.toLowerCase()) return;
    var key = 'guardian_flow:' + p.email, st = {};
    try { st = JSON.parse(localStorage.getItem(key)) || {}; } catch (e) {}
    if (p.role) st.role = p.role; else delete st.role;
    st.updatedAt = Date.now();
    localStorage.setItem(key, JSON.stringify(st));
  }
  if (setupMode || (new URLSearchParams(location.search).get('reauth') && pendingReauth())) {
    setAba('entrar', false);
    seg.style.display = 'none';
    form.querySelectorAll('.swap').forEach(function (el) { el.style.display = 'none'; });
    document.getElementById('titulo').textContent = 'Confirme que você é o responsável';
    document.getElementById('subtitulo').textContent = setupMode
      ? 'Entre para receber uma autorização temporária, sem acesso ao painel. Por segurança, suas outras sessões de painel serão encerradas.'
      : 'Este computador está protegido como computador do menor. Para mudar isso, entre com o e-mail e a senha do responsável.';
    document.getElementById('email').value = setupMode ? localStorage.getItem('guardian_minor_email') : (pendingReauth().email || '');
    document.getElementById('senha').focus();
  }
})();

/* menu móvel */
(function () {
  var t = document.querySelector('.menu-toggle'), m = document.getElementById('menu');
  t.addEventListener('click', function () { var o = m.classList.toggle('open'); t.setAttribute('aria-expanded', o); });
})();

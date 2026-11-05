(function () {
  'use strict';
  var reduzMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Frase com animação de scroll (palavra por palavra) ---------- */
  var secao = document.getElementById('statement');
  var titulo = secao.querySelector('.statement-text');
  var barra = document.getElementById('statementBar');
  var palavras = titulo.textContent.trim().split(/\s+/);

  titulo.textContent = '';
  var spans = palavras.map(function (p) {
    var s = document.createElement('span');
    s.className = 'w' + (/^inteligente/i.test(p) ? ' hl' : '');
    s.textContent = p;
    titulo.appendChild(s);
    return s;
  });

  function atualizarFrase() {
    var r = secao.getBoundingClientRect();
    var total = secao.offsetHeight - window.innerHeight;
    var prog = Math.min(1, Math.max(0, -r.top / total));
    // as palavras terminam de acender com ~85% do percurso
    var alvo = reduzMovimento ? spans.length : Math.ceil(Math.min(1, prog / 0.9) * spans.length);
    spans.forEach(function (s, i) { s.classList.toggle('on', i < alvo); });
    barra.style.width = (prog * 100) + '%';
  }

  var ticking = false;
  function aoRolar() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () { atualizarFrase(); ticking = false; });
  }
  window.addEventListener('scroll', aoRolar, { passive: true });
  window.addEventListener('resize', aoRolar);
  atualizarFrase();

  /* ---------- Menu mobile ---------- */
  var toggle = document.querySelector('.menu-toggle');
  var menu = document.getElementById('menu');
  toggle.addEventListener('click', function () {
    var aberto = menu.classList.toggle('open');
    toggle.setAttribute('aria-expanded', aberto);
  });
  menu.addEventListener('click', function (e) {
    if (e.target.tagName === 'A') {
      menu.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    }
  });

  /* ---------- FAQ (um item aberto por vez) ---------- */
  var botoes = document.querySelectorAll('.acc-btn');
  botoes.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var abrir = btn.getAttribute('aria-expanded') !== 'true';
      botoes.forEach(function (b) { b.setAttribute('aria-expanded', 'false'); });
      btn.setAttribute('aria-expanded', abrir);
    });
  });

  /* ---------- Contadores dos números ---------- */
  var contadores = document.querySelectorAll('.count');
  function animar(el) {
    var fim = +el.dataset.to;
    if (reduzMovimento) { el.textContent = fim; return; }
    var ini = null, dur = 1600;
    function passo(t) {
      if (!ini) ini = t;
      var p = Math.min(1, (t - ini) / dur);
      el.textContent = Math.round(fim * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(passo);
    }
    requestAnimationFrame(passo);
  }
  if ('IntersectionObserver' in window) {
    var obs = new IntersectionObserver(function (itens) {
      itens.forEach(function (i) {
        if (i.isIntersecting) { animar(i.target); obs.unobserve(i.target); }
      });
    }, { threshold: 0.6 });
    contadores.forEach(function (c) { obs.observe(c); });
  } else {
    contadores.forEach(animar);
  }

  /* ---------- Formulário de contato ---------- */
  var form = document.getElementById('contactForm');
  var msg = document.getElementById('formMsg');
  var botaoEnviar = form.querySelector('.btn-send');
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (botaoEnviar.disabled) return;
    var ok = true;
    form.querySelectorAll('.fl input, .fl textarea').forEach(function (c) {
      var valido = c.value.trim() !== '' && (c.type !== 'email' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.value.trim()));
      c.classList.toggle('invalid', !valido);
      if (!valido) ok = false;
    });
    msg.className = 'form-msg ' + (ok ? 'ok' : 'err');
    if (!ok) {
      msg.textContent = 'Preencha todos os campos com um e-mail válido.';
      return;
    }

    botaoEnviar.disabled = true;
    msg.className = 'form-msg';
    msg.textContent = 'Enviando...';
    fetch('/api/contato', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome: form.nome.value.trim(),
        email: form.email.value.trim(),
        mensagem: form.msg.value.trim(),
        site: form.site.value
      })
    })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, d: d }; });
      })
      .then(function (res) {
        if (!res.ok || !res.d.enviado) throw new Error(res.d.mensagem || 'Não foi possível enviar agora. Tente novamente em alguns minutos.');
        msg.className = 'form-msg ok';
        msg.textContent = 'Mensagem enviada! Responderemos em breve no seu e-mail.';
        form.reset();
      })
      .catch(function (err) {
        msg.className = 'form-msg err';
        msg.textContent = err && err.message && err.message !== 'Failed to fetch'
          ? err.message
          : 'Sem conexão com o servidor. Tente novamente em instantes.';
      })
      .then(function () { botaoEnviar.disabled = false; });
  });
})();

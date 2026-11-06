/**
 * Guardian Dashboard - Visão geral da família (index.html)
 * Mostra todos os filhos lado a lado, com filtro rápido para focar em um.
 */
(function () {
  const { $, showToast, formatNumber, requireAuth } = window.GuardianUtils;
  const { auth } = window.GuardianAPI;
  const F = window.GuardianFamily;
  const { escapeHtml, plural } = F;

  if (!requireAuth()) return;

  const state = {
    family: [],
    period: "week",
    selected: "all",
    data: null, // { period, stats: Map, alerts: [] }
    loadSeq: 0,
  };

  let riskChart = null;

  // ---------- Status de cada filho ----------
  function childAlerts(child) {
    if (!state.data) return [];
    return state.data.alerts.filter((a) => F.alertChildName(a) === child.nickname);
  }

  // O nível vem do índice de risco, mas bloqueios/conteúdo sensível nunca
  // deixam o filho aparecer como "Tudo tranquilo".
  function childLevel(child, stats) {
    if (!child.devices.length || !stats) return F.RISK_LEVELS.none;
    const issues = stats.blockAttempts + stats.sensitiveEvents;
    let level = F.riskLevel(stats.riskScore);
    if (level.key === "none") {
      if (stats.totalEvents === 0) return F.RISK_LEVELS.none;
      level = F.RISK_LEVELS.low;
    }
    if (level.key === "low" && issues > 0) level = F.RISK_LEVELS.medium;
    return level;
  }

  function visibleChildren() {
    if (state.selected === "all") return state.family;
    return state.family.filter((c) => c.id === state.selected);
  }

  function joinNames(names) {
    if (names.length <= 1) return names.join("");
    return `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
  }

  // ---------- Filtros ----------
  function renderChildChips() {
    const box = $("#childChips");
    const chips = [
      `<button type="button" class="fam-chip" data-child="all" aria-pressed="${state.selected === "all"}">
        <i class="fa-solid fa-people-group" aria-hidden="true"></i> Todos
      </button>`,
      ...state.family.map(
        (child) => `
        <button type="button" class="fam-chip" data-child="${escapeHtml(child.id)}" aria-pressed="${state.selected === child.id}">
          ${F.avatarHtml(child)} ${escapeHtml(child.nickname)}
        </button>`,
      ),
    ];
    box.innerHTML = chips.join("");
  }

  function syncPeriodChips() {
    document.querySelectorAll("#periodChips .fam-chip").forEach((btn) => {
      btn.setAttribute("aria-pressed", String(btn.dataset.period === state.period));
    });
  }

  // ---------- Frase-resumo ----------
  function renderHeadline(children) {
    const box = $("#familyHeadline");
    const periodPhrase = F.PERIODS[state.period].phrase;
    let tone = "success";
    let icon = "fa-circle-check";
    let title = "";
    let text = "";

    if (!state.family.length) {
      tone = "muted";
      icon = "fa-user-plus";
      title = "Vamos começar? Cadastre seu primeiro filho.";
      text = "Depois é só conectar o computador dele para ver tudo aqui.";
    } else if (!children.some((c) => c.devices.length)) {
      tone = "muted";
      icon = "fa-laptop";
      title = "Nenhum computador conectado ainda.";
      text = "Conecte o computador do seu filho em “Dependentes” para começar a ver as atividades.";
    } else {
      const rows = children
        .filter((c) => c.devices.length)
        .map((child) => {
          const stats = state.data.stats.get(child.id);
          return { child, stats, level: childLevel(child, stats) };
        });

      const high = rows.filter((r) => r.level.key === "high");
      const medium = rows.filter((r) => r.level.key === "medium");
      const calm = rows.filter((r) => r.level.key === "low" || r.level.key === "none");

      if (high.length) {
        tone = "danger";
        icon = "fa-circle-exclamation";
        const names = high.map((r) => r.child.nickname);
        title = `${joinNames(names)} ${names.length > 1 ? "precisam" : "precisa"} de atenção.`;
      } else if (medium.length) {
        tone = "warning";
        icon = "fa-eye";
        title = `Fique de olho em ${joinNames(medium.map((r) => r.child.nickname))}.`;
      } else {
        title = rows.length > 1 ? "Tudo tranquilo com seus filhos." : `Tudo tranquilo com ${rows[0].child.nickname}.`;
      }

      const sentences = [...high, ...medium].map(({ child, stats }) => {
        const parts = [];
        if (stats.blockAttempts) parts.push(`tentou entrar em sites proibidos ${plural(stats.blockAttempts, "vez", "vezes")} (tudo bloqueado)`);
        if (stats.sensitiveEvents) parts.push(`viu ${plural(stats.sensitiveEvents, "conteúdo sensível", "conteúdos sensíveis")}`);
        if (!parts.length) parts.push("teve dias com nível de risco alto");
        return `${child.nickname} ${parts.join(" e ")}.`;
      });
      if (calm.length) {
        const names = calm.map((r) => r.child.nickname);
        sentences.push(`${joinNames(names)} ${names.length > 1 ? "navegaram" : "navegou"} sem problemas.`);
      }
      text = `${periodPhrase}: ${sentences.join(" ")}`;
    }

    box.className = `fam-headline tone-${tone}`;
    box.innerHTML = `
      <div class="fam-headline-icon"><i class="fa-solid ${icon}" aria-hidden="true"></i></div>
      <div>
        <div class="fam-headline-title">${escapeHtml(title)}</div>
        ${text ? `<div class="fam-headline-text">${escapeHtml(text)}</div>` : ""}
      </div>`;
  }

  // ---------- Cards por filho ----------
  function metric(icon, label, value, tone = "") {
    return `
      <div class="ov-metric ${tone ? `tone-${tone}` : ""}">
        <dt><i class="fa-solid ${icon}" aria-hidden="true"></i> ${label}</dt>
        <dd>${formatNumber(value)}</dd>
      </div>`;
  }

  function formatDay(day) {
    const [, month, date] = String(day || "").split("-");
    return date && month ? `${date}/${month}` : "";
  }

  function childCard(child) {
    const stats = state.data.stats.get(child.id);
    const level = childLevel(child, stats);
    const meta = [F.ageText(child), plural(child.devices.length, "computador", "computadores")]
      .filter(Boolean)
      .join(" · ");

    const header = `
      <header class="ov-child-head">
        ${F.avatarHtml(child, "lg")}
        <div class="ov-child-id">
          <h3 class="ov-child-name">${escapeHtml(child.nickname)}</h3>
          <p class="ov-child-meta">${escapeHtml(meta)}</p>
        </div>
        <span class="fam-pill tone-${level.tone}">
          <i class="fa-solid ${level.icon}" aria-hidden="true"></i> ${level.label}
        </span>
      </header>`;

    if (!child.devices.length) {
      return `
        <article class="card ov-child-card tone-muted" style="--child-color: ${escapeHtml(child.color)}">
          ${header}
          <div class="fam-empty">
            <div class="fam-empty-icon"><i class="fa-solid fa-laptop" aria-hidden="true"></i></div>
            <div class="fam-empty-title">Nenhum computador conectado</div>
            <p>Conecte o computador de ${escapeHtml(child.nickname)} para ver as atividades aqui.</p>
            <a class="btn btn-primary fam-btn-link" href="dependents.html">
              <i class="fa-solid fa-link" aria-hidden="true"></i> Conectar computador
            </a>
          </div>
        </article>`;
    }

    const score = stats.riskScore;
    const alertsCount = childAlerts(child).length;
    const peakDay = stats.vulnerability.reduce(
      (best, d) => (best === null || Number(d.score) > Number(best.score) ? d : best),
      null,
    );
    const riskNote =
      score === null
        ? "Ainda não há dados suficientes para calcular."
        : `Média ${stats.riskAvg} · pior dia ${stats.riskPeak}${peakDay ? ` (${formatDay(peakDay.day)})` : ""}`;

    const safe = stats.safePercent;
    const reportUrl = `activity.html?dependente=${encodeURIComponent(child.id)}&periodo=${state.period}`;

    return `
      <article class="card ov-child-card tone-${level.tone}" style="--child-color: ${escapeHtml(child.color)}">
        ${header}
        <div class="ov-risk">
          <div class="ov-risk-row">
            <span>Nível de risco</span>
            <strong>${score === null ? "—" : `${score} de 100`}</strong>
          </div>
          <div class="ov-risk-track" role="meter" aria-label="Nível de risco de ${escapeHtml(child.nickname)}"
            aria-valuemin="0" aria-valuemax="100" aria-valuenow="${score ?? 0}">
            <div class="ov-risk-fill tone-${level.tone}" style="width: ${score ?? 0}%"></div>
          </div>
          <p class="ov-risk-note">${escapeHtml(riskNote)}</p>
        </div>
        <dl class="ov-metrics">
          ${metric("fa-globe", "Acessos", stats.totalEvents)}
          ${metric("fa-ban", "Bloqueados", stats.blockAttempts, stats.blockAttempts ? "danger" : "")}
          ${metric("fa-triangle-exclamation", "Conteúdo sensível", stats.sensitiveEvents, stats.sensitiveEvents ? "warning" : "")}
          ${metric("fa-bell", "Alertas", alertsCount, alertsCount ? "warning" : "")}
        </dl>
        <div class="ov-safe">
          <div class="ov-safe-text">
            ${safe === null ? "Nenhum acesso neste período." : `<strong>${safe}%</strong> da navegação foi segura`}
          </div>
          ${safe === null ? "" : `<div class="progress-bar" aria-hidden="true"><div class="progress-fill green" style="width: ${safe}%"></div></div>`}
        </div>
        ${stats.failed ? '<p class="ov-warn-note"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> Alguns dados não carregaram. Tente “Atualizar”.</p>' : ""}
        <footer class="ov-child-actions">
          <a class="btn btn-primary fam-btn-link" href="${reportUrl}">
            <i class="fa-solid fa-clipboard-list" aria-hidden="true"></i> Ver relatório
          </a>
          <a class="btn btn-secondary fam-btn-link" href="policies.html">
            <i class="fa-solid fa-sliders" aria-hidden="true"></i> Ajustar regras
          </a>
        </footer>
      </article>`;
  }

  function renderCards(children) {
    const box = $("#childCards");
    box.setAttribute("aria-busy", "false");
    box.classList.toggle("is-single", children.length === 1);

    if (!state.family.length) {
      box.innerHTML = `
        <div class="card fam-empty ov-span-all">
          <div class="fam-empty-icon"><i class="fa-solid fa-children" aria-hidden="true"></i></div>
          <div class="fam-empty-title">Nenhum filho cadastrado ainda</div>
          <p>Cadastre seu filho e conecte o computador dele. Leva menos de 2 minutos.</p>
          <a class="btn btn-primary fam-btn-link" href="dependents.html">
            <i class="fa-solid fa-plus" aria-hidden="true"></i> Cadastrar filho
          </a>
        </div>`;
      return;
    }
    box.innerHTML = children.map(childCard).join("");
  }

  // ---------- Comparação (barras em CSS puro) ----------
  function renderCompare(children) {
    const card = $("#compareCard");
    const withDevices = children.filter((c) => c.devices.length);
    if (state.selected !== "all" || withDevices.length < 2) {
      card.hidden = true;
      return;
    }
    card.hidden = false;

    const rows = withDevices.map((child) => {
      const stats = state.data.stats.get(child.id);
      return {
        child,
        values: {
          totalEvents: stats.totalEvents,
          blockAttempts: stats.blockAttempts,
          sensitiveEvents: stats.sensitiveEvents,
          alerts: childAlerts(child).length,
          riskScore: stats.riskScore ?? 0,
        },
      };
    });

    const metrics = [
      { key: "totalEvents", label: "Acessos à internet", icon: "fa-globe" },
      { key: "blockAttempts", label: "Tentativas bloqueadas", icon: "fa-ban" },
      { key: "sensitiveEvents", label: "Conteúdo sensível", icon: "fa-triangle-exclamation" },
      { key: "alerts", label: "Alertas recebidos", icon: "fa-bell" },
      { key: "riskScore", label: "Nível de risco (0 a 100)", icon: "fa-gauge-high", max: 100 },
    ];

    $("#compareLegend").innerHTML = withDevices
      .map((c) => `<span class="ov-legend-item">${F.avatarHtml(c)} ${escapeHtml(c.nickname)}</span>`)
      .join("");

    $("#compareBody").innerHTML = metrics
      .map((m) => {
        const max = m.max || Math.max(1, ...rows.map((r) => r.values[m.key]));
        const top = [...rows].sort((a, b) => b.values[m.key] - a.values[m.key]);
        const leader =
          top[0].values[m.key] > 0 && top[0].values[m.key] !== (top[1]?.values[m.key] ?? -1)
            ? `${top[0].child.nickname} tem mais`
            : top[0].values[m.key] === 0
              ? "Nenhum registro"
              : "Empate";
        return `
          <div class="ov-compare-group" role="group" aria-label="${escapeHtml(m.label)}">
            <div class="ov-compare-head">
              <span><i class="fa-solid ${m.icon}" aria-hidden="true"></i> ${m.label}</span>
              <span class="ov-compare-leader">${escapeHtml(leader)}</span>
            </div>
            ${rows
              .map(({ child, values }) => {
                const value = values[m.key];
                const width = value > 0 ? Math.max(3, (value / max) * 100) : 0;
                return `
                  <div class="ov-bar-row">
                    <span class="ov-bar-name">${escapeHtml(child.nickname)}</span>
                    <div class="ov-bar-track" aria-hidden="true">
                      <div class="ov-bar-fill" style="width: ${width}%; --child-color: ${escapeHtml(child.color)}"></div>
                    </div>
                    <span class="ov-bar-value">${formatNumber(value)}</span>
                  </div>`;
              })
              .join("")}
          </div>`;
      })
      .join("");
  }

  // ---------- Gráfico de risco (Chart.js já usado no projeto) ----------
  function chartColors() {
    const css = getComputedStyle(document.documentElement);
    const v = (name, fallback) => (css.getPropertyValue(name) || fallback).trim();
    return {
      grid: v("--chart-grid", "rgba(66,80,129,.2)"),
      text: v("--chart-text", "#425081"),
      surface: v("--surface", "#ffffff"),
    };
  }

  function renderRiskChart(children) {
    const box = $("#riskChartBox");
    const withData = children
      .map((child) => ({ child, stats: state.data.stats.get(child.id) }))
      .filter(({ child, stats }) => child.devices.length && stats && stats.vulnerability.length);

    if (riskChart) {
      riskChart.destroy();
      riskChart = null;
    }

    if (!withData.length || typeof window.Chart === "undefined") {
      box.innerHTML = `
        <div class="fam-empty">
          <div class="fam-empty-icon"><i class="fa-solid fa-chart-line" aria-hidden="true"></i></div>
          <div class="fam-empty-title">Sem dados neste período</div>
          <p>Quando houver atividade, o gráfico aparece aqui.</p>
        </div>`;
      $("#riskChartText").textContent = "";
      return;
    }

    if (!box.querySelector("canvas")) {
      box.innerHTML = '<canvas id="riskChart" role="img" aria-label="Gráfico do nível de risco por dia"></canvas>';
    }

    const days = [...new Set(withData.flatMap(({ stats }) => stats.vulnerability.map((d) => d.day)))].sort();
    const colors = chartColors();

    const datasets = withData.map(({ child, stats }) => {
      const byDay = new Map(stats.vulnerability.map((d) => [d.day, Number(d.score || 0)]));
      return {
        label: child.nickname,
        data: days.map((d) => (byDay.has(d) ? byDay.get(d) : null)),
        borderColor: child.color,
        backgroundColor: child.color + "22",
        pointBackgroundColor: child.color,
        pointBorderColor: colors.surface,
        pointBorderWidth: 2,
        pointRadius: days.length > 20 ? 2 : 5,
        pointHoverRadius: 7,
        borderWidth: 3,
        tension: 0.35,
        spanGaps: true,
        fill: withData.length === 1,
      };
    });

    const zonesPlugin = {
      id: "ovRiskZones",
      beforeDraw(chart) {
        const { ctx, chartArea, scales } = chart;
        if (!chartArea) return;
        const { left, right } = chartArea;
        [
          { from: 70, to: 100, color: "rgba(239,68,68,0.08)" },
          { from: 40, to: 70, color: "rgba(245,158,11,0.08)" },
          { from: 0, to: 40, color: "rgba(16,185,129,0.07)" },
        ].forEach(({ from, to, color }) => {
          const y1 = scales.y.getPixelForValue(to);
          const y2 = scales.y.getPixelForValue(from);
          ctx.fillStyle = color;
          ctx.fillRect(left, y1, right - left, y2 - y1);
        });
      },
    };

    const ctx = box.querySelector("canvas").getContext("2d");
    riskChart = new window.Chart(ctx, {
      type: "line",
      data: { labels: days.map(formatDay), datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: {
            display: withData.length > 1,
            position: "bottom",
            labels: { color: colors.text, usePointStyle: true, boxWidth: 8, font: { size: 13, weight: "600" } },
          },
          tooltip: {
            padding: 12,
            callbacks: {
              label: (item) => {
                const v = item.parsed.y;
                return ` ${item.dataset.label}: ${v}/100 · ${F.riskLevel(v).label}`;
              },
            },
          },
        },
        scales: {
          x: { ticks: { color: colors.text, maxRotation: 0, autoSkip: true, maxTicksLimit: 10 }, grid: { color: colors.grid } },
          y: { beginAtZero: true, max: 100, ticks: { color: colors.text, stepSize: 20 }, grid: { color: colors.grid } },
        },
      },
      plugins: [zonesPlugin],
    });

    $("#riskChartText").textContent = withData
      .map(({ child, stats }) => `${child.nickname}: média ${stats.riskAvg}, pior dia ${stats.riskPeak} de 100.`)
      .join(" ");
  }

  // ---------- Sites mais visitados ----------
  function renderTopSites(children) {
    const box = $("#topSites");
    const merged = new Map();
    children.forEach((child) => {
      const stats = state.data.stats.get(child.id);
      if (!stats) return;
      stats.domains.forEach((count, host) => {
        if (!merged.has(host)) merged.set(host, { host, total: 0, perChild: [] });
        const entry = merged.get(host);
        entry.total += count;
        entry.perChild.push({ child, count });
      });
    });

    const top = [...merged.values()].sort((a, b) => b.total - a.total).slice(0, 8);
    if (!top.length) {
      box.innerHTML = `
        <div class="fam-empty">
          <div class="fam-empty-icon"><i class="fa-solid fa-globe" aria-hidden="true"></i></div>
          <div class="fam-empty-title">Nenhum site visitado neste período</div>
          <p>Assim que houver navegação, os sites mais usados aparecem aqui.</p>
        </div>`;
      return;
    }

    const max = top[0].total;
    const showSplit = children.length > 1;
    box.innerHTML = `<ol class="ov-sites">${top
      .map(
        (site) => `
        <li class="ov-site">
          <div class="ov-site-row">
            <span class="ov-site-host">${escapeHtml(site.host)}</span>
            <span class="ov-site-total">${plural(site.total, "acesso", "acessos")}</span>
          </div>
          <div class="ov-site-bar" aria-hidden="true">
            ${
              showSplit
                ? site.perChild
                    .map(({ child, count }) => `<span style="width: ${(count / max) * 100}%; --child-color: ${escapeHtml(child.color)}"></span>`)
                    .join("")
                : `<span style="width: ${(site.total / max) * 100}%; --child-color: ${escapeHtml(children[0].color)}"></span>`
            }
          </div>
          ${
            showSplit
              ? `<div class="ov-site-split">${site.perChild
                  .map(({ child, count }) => `<span>${F.avatarHtml(child)} ${escapeHtml(child.nickname)}: ${count}</span>`)
                  .join("")}</div>`
              : ""
          }
        </li>`,
      )
      .join("")}</ol>`;
  }

  // ---------- Últimos avisos ----------
  function alertText(alert) {
    const name = F.alertChildName(alert) || "Seu filho";
    const ref = F.prettyHost(alert.referencia || "");
    if (alert.tipo === "TENTATIVA_BLOQUEIO" && ref) {
      return { title: `${name} tentou entrar em ${ref}`, sub: "O acesso foi bloqueado." };
    }
    if (alert.tipo === "CONTEUDO_SENSIVEL") {
      const match = /como\s+([A-Z_]+)/.exec(alert.mensagem || "");
      const cat = match ? F.CATEGORIES[match[1]] : null;
      return {
        title: `${name} viu ${cat ? cat.one : "um conteúdo sensível"}`,
        sub: ref ? `Em ${ref}.` : "",
      };
    }
    return { title: alert.titulo || "Aviso", sub: alert.mensagem || "" };
  }

  function renderAlerts(children) {
    const box = $("#recentAlerts");
    const names = new Set(children.map((c) => c.nickname));
    const list = state.data.alerts
      .filter((a) => state.selected === "all" || names.has(F.alertChildName(a)))
      .sort((a, b) => new Date(b.criadoEm) - new Date(a.criadoEm))
      .slice(0, 5);

    if (!list.length) {
      box.innerHTML = `
        <div class="fam-empty">
          <div class="fam-empty-icon"><i class="fa-solid fa-face-smile" aria-hidden="true"></i></div>
          <div class="fam-empty-title">Nenhum aviso neste período</div>
          <p>Ótima notícia! Quando algo precisar da sua atenção, aparece aqui.</p>
        </div>`;
      return;
    }

    const byName = new Map(state.family.map((c) => [c.nickname, c]));
    box.innerHTML = `<ul class="ov-alert-list">${list
      .map((alert) => {
        const { title, sub } = alertText(alert);
        const critical = alert.severidade === "CRITICO";
        const child = byName.get(F.alertChildName(alert));
        return `
          <li class="ov-alert ${critical ? "tone-danger" : "tone-warning"}">
            <span class="ov-alert-icon"><i class="fa-solid ${critical ? "fa-ban" : "fa-triangle-exclamation"}" aria-hidden="true"></i></span>
            <div class="ov-alert-body">
              <div class="ov-alert-title">${escapeHtml(title)}</div>
              ${sub ? `<div class="ov-alert-sub">${escapeHtml(sub)}</div>` : ""}
              <div class="ov-alert-when"><i class="fa-regular fa-clock" aria-hidden="true"></i> ${escapeHtml(F.friendlyWhen(alert.criadoEm))}</div>
            </div>
            ${child ? F.avatarHtml(child, "md") : ""}
          </li>`;
      })
      .join("")}</ul>`;
  }

  // ---------- Fluxo ----------
  function render() {
    if (!state.data) return;
    const children = visibleChildren();
    renderChildChips();
    syncPeriodChips();
    renderHeadline(children);
    renderCards(children);
    renderCompare(children);
    renderRiskChart(children);
    renderTopSites(children);
    renderAlerts(children);
  }

  function showLoadingState() {
    $("#childCards").setAttribute("aria-busy", "true");
    const count = Math.max(1, state.selected === "all" ? state.family.length || 2 : 1);
    $("#childCards").innerHTML = Array.from({ length: count }, () => '<div class="fam-skeleton" style="min-height: 320px"></div>').join("");
    $("#topSites").innerHTML = '<div class="fam-skeleton"></div>';
    $("#recentAlerts").innerHTML = '<div class="fam-skeleton"></div>';
    const headline = $("#familyHeadline");
    headline.className = "fam-headline tone-muted";
    headline.innerHTML = `
      <div class="fam-headline-icon"><i class="fa-solid fa-hourglass-half" aria-hidden="true"></i></div>
      <div><div class="fam-headline-title">Carregando o resumo da família...</div></div>`;
  }

  async function load({ reloadFamily = false } = {}) {
    const seq = ++state.loadSeq;
    showLoadingState();
    try {
      if (reloadFamily || !state.family.length) {
        state.family = await F.loadFamily();
        if (state.selected !== "all" && !state.family.some((c) => c.id === state.selected)) {
          state.selected = "all";
        }
      }
      const range = F.periodRange(state.period);
      const [statsList, alertsList] = await Promise.all([
        Promise.all(state.family.map((child) => F.loadChildStats(child, range))),
        F.loadAlertsInRange(range).catch(() => []),
      ]);
      if (seq !== state.loadSeq) return;
      state.data = {
        period: state.period,
        stats: new Map(state.family.map((child, i) => [child.id, statsList[i]])),
        alerts: alertsList,
      };
      render();
    } catch (error) {
      if (seq !== state.loadSeq) return;
      showToast("Não foi possível carregar o painel: " + error.message, "error");
      const headline = $("#familyHeadline");
      headline.className = "fam-headline tone-danger";
      headline.innerHTML = `
        <div class="fam-headline-icon"><i class="fa-solid fa-plug-circle-xmark" aria-hidden="true"></i></div>
        <div>
          <div class="fam-headline-title">Não conseguimos carregar os dados agora.</div>
          <div class="fam-headline-text">Verifique sua internet e toque em “Atualizar”.</div>
        </div>`;
      $("#childCards").setAttribute("aria-busy", "false");
      $("#childCards").innerHTML = "";
    }
  }

  function init() {
    $("#userName").textContent = auth.getEmail() || "Responsável";
    $("#logoutBtn").addEventListener("click", () => auth.logout());

    // Trocar de filho só re-renderiza: os dados de todos já estão em memória.
    $("#childChips").addEventListener("click", (event) => {
      const btn = event.target.closest(".fam-chip");
      if (!btn || btn.dataset.child === state.selected) return;
      state.selected = btn.dataset.child;
      render();
      document.querySelector(`#childChips [data-child="${CSS.escape(state.selected)}"]`)?.focus();
    });

    $("#periodChips").addEventListener("click", (event) => {
      const btn = event.target.closest(".fam-chip");
      if (!btn || btn.dataset.period === state.period) return;
      state.period = btn.dataset.period;
      syncPeriodChips();
      load();
    });

    $("#refreshBtn").addEventListener("click", () => load({ reloadFamily: true }));
    window.addEventListener("guardian-theme-change", () => {
      if (state.data) renderRiskChart(visibleChildren());
    });

    load({ reloadFamily: true });
  }

  init();
})();

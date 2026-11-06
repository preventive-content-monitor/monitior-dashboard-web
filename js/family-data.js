/**
 * Guardian Dashboard - Dados da família
 * Agrega, no navegador, os dados de todos os filhos usando apenas os
 * endpoints que já existem em GuardianAPI (por dispositivo / por dependente).
 * Usado pelo Dashboard (overview.js) e pelos Relatórios (reports.js).
 */
(function () {
  const { dependents, devices, dashboard, activity, alerts } = window.GuardianAPI;
  const { getDateRangeForPeriod, calculateAge } = window.GuardianUtils;

  const PERIODS = {
    today: { label: "Hoje", phrase: "Hoje", short: "hoje" },
    week: { label: "Últimos 7 dias", phrase: "Nos últimos 7 dias", short: "nos últimos 7 dias" },
    month: { label: "Últimos 30 dias", phrase: "Nos últimos 30 dias", short: "nos últimos 30 dias" },
  };

  // Cores fixas por posição do filho, para o mesmo filho ter sempre a mesma cor
  const CHILD_COLORS = ["#1d7cce", "#7d41c4", "#0f9f8f", "#e0663d", "#c43d7a", "#5b6bd6"];

  // Categorias da IA em linguagem de pais. "site" = o problema é o site em si;
  // "content" = conteúdo específico dentro de um site comum (ex.: YouTube).
  const CATEGORIES = {
    GAMBLING: { name: "Apostas", one: "site de apostas", many: "sites de apostas", kind: "site", level: "warning", icon: "fa-dice",
      tip: "Sites de apostas podem viciar e causar prejuízo. Vale uma conversa tranquila sobre dinheiro e jogos." },
    EXPLICIT: { name: "Conteúdo adulto", one: "site de conteúdo adulto", many: "sites de conteúdo adulto", kind: "site", level: "danger", icon: "fa-eye-slash",
      tip: "Converse sem broncas: explique que esse conteúdo não é para a idade e que ele(a) pode contar com você." },
    GROOMING_RISK: { name: "Conversa com desconhecidos", one: "chat com desconhecidos", many: "chats com desconhecidos", kind: "site", level: "danger", icon: "fa-user-secret",
      tip: "Chats com desconhecidos são o caminho mais comum de aliciamento. Reforce: nunca passar dados, fotos ou marcar encontros." },
    VIOLENCE: { name: "Violência", one: "conteúdo violento", many: "conteúdos violentos", kind: "content", level: "warning", icon: "fa-hand-fist",
      tip: "Pergunte o que ele(a) viu e como se sentiu. Conteúdo violento pode assustar ou banalizar a violência." },
    HORROR: { name: "Terror", one: "conteúdo de terror", many: "conteúdos de terror", kind: "content", level: "warning", icon: "fa-ghost",
      tip: "Conteúdo de terror pode causar medo e atrapalhar o sono, principalmente à noite." },
    DRUGS: { name: "Drogas", one: "conteúdo sobre drogas", many: "conteúdos sobre drogas", kind: "content", level: "warning", icon: "fa-pills",
      tip: "Aproveite para conversar sobre drogas com informação e sem julgamento." },
    OTHER: { name: "Impróprio", one: "conteúdo impróprio", many: "conteúdos impróprios", kind: "content", level: "warning", icon: "fa-triangle-exclamation",
      tip: "Confira os detalhes e, se achar necessário, ajuste as regras de proteção." },
  };

  const RISK_LEVELS = {
    high: { key: "high", label: "Precisa de atenção", short: "Alto", tone: "danger", icon: "fa-circle-exclamation" },
    medium: { key: "medium", label: "Fique de olho", short: "Médio", tone: "warning", icon: "fa-eye" },
    low: { key: "low", label: "Tudo tranquilo", short: "Baixo", tone: "success", icon: "fa-circle-check" },
    none: { key: "none", label: "Sem dados ainda", short: "—", tone: "muted", icon: "fa-circle-question" },
  };

  // Itens de risco a partir deste valor entram em "precisa da sua atenção"
  const ATTENTION_MIN_RISK = 40;

  function escapeHtml(value) {
    if (value === null || value === undefined) return "";
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function plural(n, one, many) {
    return `${n} ${n === 1 ? one : many}`;
  }

  function category(label) {
    return CATEGORIES[label] || CATEGORIES.OTHER;
  }

  function prettyHost(host) {
    return String(host || "").replace(/^www\./, "");
  }

  function isBlocked(item) {
    return item.acao === "BLOCK" || item.tipo === "BLOCK_ATTEMPT";
  }

  function friendlyWhen(iso) {
    const date = new Date(iso);
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffDays = Math.round((startToday - startDate) / 86400000);
    const time = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    if (diffDays === 0) return `hoje às ${time}`;
    if (diffDays === 1) return `ontem às ${time}`;
    if (diffDays < 7) {
      const weekday = date.toLocaleDateString("pt-BR", { weekday: "long" });
      return `${weekday} às ${time}`;
    }
    return `${date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} às ${time}`;
  }

  function periodRange(period) {
    const { from, to } = getDateRangeForPeriod(period);
    return { from, to, fromDay: from.split("T")[0], toDay: to.split("T")[0] };
  }

  function riskLevel(score) {
    if (score === null || score === undefined) return RISK_LEVELS.none;
    if (score >= 70) return RISK_LEVELS.high;
    if (score >= 40) return RISK_LEVELS.medium;
    return RISK_LEVELS.low;
  }

  function ageText(child) {
    if (!child.birthYear) return "";
    const age = Number.isFinite(child.age) ? child.age : calculateAge(child.birthYear);
    return Number.isFinite(age) ? `${age} anos` : "";
  }

  async function loadFamily() {
    const [children, allDevices] = await Promise.all([dependents.list(), devices.list()]);
    return children.map((child, index) => ({
      ...child,
      color: CHILD_COLORS[index % CHILD_COLORS.length],
      initial: (child.nickname || "?").trim().charAt(0).toUpperCase(),
      devices: allDevices.filter((d) => d.dependentId === child.id),
    }));
  }

  function mergeDomains(target, list) {
    (Array.isArray(list) ? list : []).forEach((entry) => {
      if (!Array.isArray(entry) || entry.length < 2) return;
      const host = prettyHost(entry[0]);
      target.set(host, (target.get(host) || 0) + Number(entry[1] || 0));
    });
  }

  /** Números do período para um filho (soma de todos os dispositivos dele). */
  async function loadChildStats(child, range) {
    const stats = {
      totalEvents: 0,
      sensitiveEvents: 0,
      blockAttempts: 0,
      domains: new Map(),
      vulnerability: [],
      riskAvg: null,
      riskPeak: null,
      riskScore: null,
      failed: false,
    };

    const deviceJobs = child.devices.map(async (device) => {
      const [summary, top] = await Promise.all([
        dashboard.getSummary(device.id, range.from, range.to),
        dashboard.getTopDomains(device.id, range.from, range.to).catch(() => []),
      ]);
      stats.totalEvents += Number(summary.totalEvents || 0);
      stats.sensitiveEvents += Number(summary.sensitiveEvents || 0);
      stats.blockAttempts += Number(summary.blockAttempts || 0);
      mergeDomains(stats.domains, top);
    });

    const vulnJob = dashboard
      .getVulnerability(child.id, range.fromDay, range.toDay)
      .then((data) => {
        stats.vulnerability = data
          .filter((d) => d.day)
          .sort((a, b) => String(a.day).localeCompare(String(b.day)));
      })
      .catch(() => {});

    const results = await Promise.allSettled([...deviceJobs, vulnJob]);
    stats.failed = results.some((r) => r.status === "rejected");

    if (stats.vulnerability.length) {
      const scores = stats.vulnerability.map((d) => Number(d.score || 0));
      stats.riskAvg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
      stats.riskPeak = Math.max(...scores);
      // Média e pior dia pesam igual: um único dia muito ruim não some na média,
      // mas também não define sozinho a semana inteira.
      stats.riskScore = Math.round((stats.riskAvg + stats.riskPeak) / 2);
    }

    const total = stats.totalEvents;
    stats.safePercent = total > 0
      ? Math.max(0, Math.min(100, Math.round(((total - stats.sensitiveEvents - stats.blockAttempts) / total) * 100)))
      : null;
    stats.topDomains = [...stats.domains.entries()].sort((a, b) => b[1] - a[1]);
    return stats;
  }

  function alertChildName(alert) {
    const dep = alert.dependente;
    if (!dep) return null;
    if (typeof dep === "string") return dep;
    return dep.apelido || dep.nickname || null;
  }

  /** Alertas dentro do período. A API pagina do mais novo para o mais antigo. */
  async function loadAlertsInRange(range, maxPages = 8) {
    const fromTime = new Date(range.from).getTime();
    const found = [];
    for (let page = 0; page < maxPages; page++) {
      const result = await alerts.list({ page, size: 100 });
      let reachedOlder = false;
      result.items.forEach((item) => {
        const time = new Date(item.criadoEm).getTime();
        if (time >= fromTime) found.push(item);
        else reachedOlder = true;
      });
      if (reachedOlder || page >= result.totalPages - 1 || !result.items.length) break;
    }
    return found;
  }

  async function listAll(deviceId, options, maxPages = 5) {
    const items = [];
    for (let page = 0; page < maxPages; page++) {
      const result = await activity.list(deviceId, { ...options, page, size: 100 });
      items.push(...result.items);
      if (page >= result.totalPages - 1 || !result.items.length) break;
    }
    return items;
  }

  /** Acessos bloqueados ou de risco de um filho, já marcados com o nome dele. */
  async function loadAttentionItems(child, range) {
    const byId = new Map();
    await Promise.all(
      child.devices.map(async (device) => {
        const base = { from: range.from, to: range.to };
        const [risky, blocked] = await Promise.all([
          listAll(device.id, { ...base, minRisk: ATTENTION_MIN_RISK }),
          listAll(device.id, { ...base, type: "BLOCK_ATTEMPT" }),
        ]);
        [...risky, ...blocked].forEach((item) => {
          byId.set(item.id, {
            ...item,
            childId: child.id,
            childName: child.nickname,
            childColor: child.color,
            deviceName: device.name,
            blocked: isBlocked(item),
          });
        });
      }),
    );
    return [...byId.values()].sort((a, b) => new Date(b.ocorridoEm) - new Date(a.ocorridoEm));
  }

  function avatarHtml(child, size = "") {
    return `<span class="fam-avatar ${size}" style="--child-color: ${escapeHtml(child.color)}" aria-hidden="true">${escapeHtml(child.initial)}</span>`;
  }

  window.GuardianFamily = {
    PERIODS,
    CATEGORIES,
    RISK_LEVELS,
    ATTENTION_MIN_RISK,
    escapeHtml,
    plural,
    category,
    prettyHost,
    isBlocked,
    friendlyWhen,
    periodRange,
    riskLevel,
    ageText,
    loadFamily,
    loadChildStats,
    loadAlertsInRange,
    alertChildName,
    loadAttentionItems,
    avatarHtml,
  };
})();

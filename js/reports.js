/**
 * Guardian Dashboard - Relatórios (activity.html)
 * Resumo em linguagem simples por filho, lista do que precisa de atenção
 * e, para quem quiser, o histórico completo de acessos.
 */
(function () {
  const { $, showToast, formatNumber, formatDateTime, requireAuth, createModal } = window.GuardianUtils;
  const { auth, activity } = window.GuardianAPI;
  const F = window.GuardianFamily;
  const { escapeHtml, plural } = F;

  if (!requireAuth()) return;

  const ATTENTION_PAGE = 8;
  const HISTORY_PAGE_SIZE = 25;

  const params = new URLSearchParams(location.search);
  const state = {
    family: [],
    selected: params.get("dependente") || "all",
    period: F.PERIODS[params.get("periodo")] ? params.get("periodo") : "week",
    data: null, // { stats: Map, attention: Map<childId, item[]> }
    attentionMode: "all", // all | blocked | seen
    attentionCategory: params.get("categoria") || null,
    attentionShown: ATTENTION_PAGE,
    loadSeq: 0,
  };

  const ACTION_TEXT = {
    ALLOW: { text: "Liberado", tone: "muted" },
    BLOCK: { text: "Bloqueado", tone: "success" },
    WARN: { text: "Liberado com aviso", tone: "warning" },
    EDUCATE: { text: "Mostrou orientação", tone: "warning" },
    UNKNOWN: { text: "Sem análise", tone: "muted" },
  };

  const LABEL_TEXT = {
    SAFE: "Seguro",
    VIOLENCE: "Violência",
    HORROR: "Terror",
    EXPLICIT: "Conteúdo adulto",
    GROOMING_RISK: "Conversa com desconhecidos",
    DRUGS: "Drogas",
    GAMBLING: "Apostas",
  };

  function labelText(label) {
    if (!label) return "Sem análise";
    return LABEL_TEXT[label] || label;
  }

  function visibleChildren() {
    if (state.selected === "all") return state.family;
    return state.family.filter((c) => c.id === state.selected);
  }

  function childById(id) {
    return state.family.find((c) => c.id === id);
  }

  function syncUrl() {
    const next = new URLSearchParams();
    if (state.selected !== "all") next.set("dependente", state.selected);
    if (state.period !== "week") next.set("periodo", state.period);
    if (state.attentionCategory) next.set("categoria", state.attentionCategory);
    const query = next.toString();
    window.history.replaceState(null, "", query ? `?${query}` : location.pathname);
  }

  // ---------- Filtros ----------
  function renderChildChips() {
    $("#childChips").innerHTML = [
      `<button type="button" class="fam-chip" data-child="all" aria-pressed="${state.selected === "all"}">
        <i class="fa-solid fa-people-group" aria-hidden="true"></i> Todos
      </button>`,
      ...state.family.map(
        (child) => `
        <button type="button" class="fam-chip" data-child="${escapeHtml(child.id)}" aria-pressed="${state.selected === child.id}">
          ${F.avatarHtml(child)} ${escapeHtml(child.nickname)}
        </button>`,
      ),
    ].join("");
  }

  function syncChips(selector, key, value) {
    document.querySelectorAll(`${selector} .fam-chip`).forEach((btn) => {
      btn.setAttribute("aria-pressed", String(btn.dataset[key] === value));
    });
  }

  // ---------- Frases do resumo ----------
  function buildSentences(children) {
    const sentences = [];

    children.forEach((child) => {
      if (!child.devices.length) {
        sentences.push({
          tone: "muted",
          icon: "fa-laptop",
          rank: 3,
          text: `${child.nickname} ainda não tem um computador conectado.`,
          actions: [{ href: "dependents.html", label: "Conectar computador", icon: "fa-link", primary: true }],
        });
        return;
      }

      const stats = state.data.stats.get(child.id);
      const items = state.data.attention.get(child.id) || [];
      const groups = new Map();
      items.forEach((item) => {
        const key = `${item.blocked ? "b" : "s"}|${F.CATEGORIES[item.rotulo] ? item.rotulo : "OTHER"}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(item);
      });

      groups.forEach((list, key) => {
        const [mode, label] = key.split("|");
        const blocked = mode === "b";
        const cat = F.category(label);
        const targets = new Set(list.map((i) => F.prettyHost(i.urlConteudo || i.urlHost)));
        const hosts = [...new Set(list.map((i) => F.prettyHost(i.urlHost)))];
        const attempts = list.length;
        const distinct = targets.size;

        let text;
        if (blocked) {
          text = `${child.nickname} tentou acessar ${plural(distinct, cat.one, cat.many)}`;
          if (attempts > distinct) text += ` (${attempts} tentativas)`;
          text += attempts > 1 ? " — tudo foi bloqueado." : " — foi bloqueado.";
        } else {
          text = `${child.nickname} viu ${plural(distinct, cat.one, cat.many)}`;
          text += " — não foi bloqueado.";
        }

        sentences.push({
          tone: cat.level === "danger" ? "danger" : "warning",
          icon: cat.icon,
          rank: (cat.level === "danger" ? 0 : 1) + (blocked ? 0.5 : 0),
          count: attempts,
          text,
          sites: `${hosts.length === 1 ? "Site" : "Sites"}: ${hosts.slice(0, 4).join(", ")}${hosts.length > 4 ? ` e mais ${hosts.length - 4}` : ""}`,
          tip: !blocked || cat.level === "danger" ? cat.tip : "",
          actions: [
            { filter: { childId: child.id, category: label, mode: blocked ? "blocked" : "seen" }, label: "Ver quais foram", icon: "fa-list", primary: true },
            { href: "policies.html", label: blocked ? "Ver regras" : "Bloquear isso", icon: "fa-sliders" },
          ],
        });
      });

      if (!groups.size) {
        sentences.push(
          stats.totalEvents
            ? {
                tone: "success",
                icon: "fa-face-smile",
                rank: 2,
                text: `${child.nickname} navegou com tranquilidade: ${plural(stats.totalEvents, "acesso", "acessos")} e nada preocupante.`,
                actions: [],
              }
            : {
                tone: "muted",
                icon: "fa-moon",
                rank: 2,
                text: `${child.nickname} não usou a internet ${F.PERIODS[state.period].short}.`,
                actions: [],
              },
        );
      }
    });

    return sentences.sort((a, b) => a.rank - b.rank || (b.count || 0) - (a.count || 0));
  }

  function renderHeadline(children, sentences) {
    const box = $("#reportHeadline");
    const phrase = F.PERIODS[state.period].phrase;
    let tone = "success";
    let icon = "fa-circle-check";
    let title;
    let text = "";

    if (!state.family.length) {
      tone = "muted";
      icon = "fa-user-plus";
      title = "Cadastre seu primeiro filho para ver os relatórios.";
    } else if (!children.some((c) => c.devices.length)) {
      tone = "muted";
      icon = "fa-laptop";
      title = "Nenhum computador conectado ainda.";
      text = "Assim que o computador do seu filho estiver conectado, o relatório aparece aqui.";
    } else {
      const worst = sentences.find((s) => s.tone === "danger" || s.tone === "warning");
      if (worst) {
        tone = worst.tone;
        icon = "fa-circle-exclamation";
        title = `${phrase}, ${worst.text}`;
      } else {
        const names = children.filter((c) => c.devices.length).map((c) => c.nickname);
        title = `${phrase}, tudo tranquilo com ${names.length > 1 ? "seus filhos" : names[0]}.`;
      }
      const totals = sumStats(children);
      text = `No total: ${plural(totals.totalEvents, "acesso", "acessos")}, ${plural(totals.blockAttempts, "bloqueio", "bloqueios")} e ${plural(totals.sensitiveEvents, "conteúdo sensível", "conteúdos sensíveis")}.`;
    }

    box.className = `fam-headline tone-${tone}`;
    box.innerHTML = `
      <div class="fam-headline-icon"><i class="fa-solid ${icon}" aria-hidden="true"></i></div>
      <div>
        <div class="fam-headline-title">${escapeHtml(title)}</div>
        ${text ? `<div class="fam-headline-text">${escapeHtml(text)}</div>` : ""}
      </div>`;
  }

  function renderSentences(sentences) {
    const box = $("#summaryList");
    if (!state.family.length) {
      box.innerHTML = `
        <li class="fam-empty">
          <div class="fam-empty-icon"><i class="fa-solid fa-children" aria-hidden="true"></i></div>
          <div class="fam-empty-title">Nenhum filho cadastrado</div>
          <p>Cadastre seu filho para começar a receber relatórios.</p>
          <a class="btn btn-primary fam-btn-link" href="dependents.html"><i class="fa-solid fa-plus" aria-hidden="true"></i> Cadastrar filho</a>
        </li>`;
      return;
    }

    box.innerHTML = sentences
      .map(
        (s, index) => `
        <li class="rp-sentence tone-${s.tone}">
          <span class="rp-sentence-icon"><i class="fa-solid ${s.icon}" aria-hidden="true"></i></span>
          <div class="rp-sentence-body">
            <div class="rp-sentence-text">${escapeHtml(s.text)}</div>
            ${s.sites ? `<div class="rp-sentence-sites">${escapeHtml(s.sites)}</div>` : ""}
            ${s.tip ? `<div class="rp-sentence-tip"><i class="fa-solid fa-lightbulb" aria-hidden="true"></i>${escapeHtml(s.tip)}</div>` : ""}
            ${
              s.actions.length
                ? `<div class="rp-sentence-actions">${s.actions
                    .map((a, ai) =>
                      a.href
                        ? `<a class="btn ${a.primary ? "btn-primary" : "btn-secondary"}" href="${a.href}"><i class="fa-solid ${a.icon}" aria-hidden="true"></i> ${a.label}</a>`
                        : `<button type="button" class="btn ${a.primary ? "btn-primary" : "btn-secondary"}" data-sentence="${index}" data-action="${ai}"><i class="fa-solid ${a.icon}" aria-hidden="true"></i> ${a.label}</button>`,
                    )
                    .join("")}</div>`
                : ""
            }
          </div>
        </li>`,
      )
      .join("");

    box.querySelectorAll("button[data-sentence]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const action = sentences[Number(btn.dataset.sentence)].actions[Number(btn.dataset.action)];
        focusAttention(action.filter);
      });
    });
  }

  // ---------- Números ----------
  function sumStats(children) {
    const totals = { totalEvents: 0, blockAttempts: 0, sensitiveEvents: 0, sites: new Set() };
    children.forEach((child) => {
      const stats = state.data.stats.get(child.id);
      if (!stats) return;
      totals.totalEvents += stats.totalEvents;
      totals.blockAttempts += stats.blockAttempts;
      totals.sensitiveEvents += stats.sensitiveEvents;
      stats.domains.forEach((_, host) => totals.sites.add(host));
    });
    return totals;
  }

  function renderStats(children) {
    const totals = sumStats(children);
    $("#statTotal").textContent = formatNumber(totals.totalEvents);
    $("#statBlocks").textContent = formatNumber(totals.blockAttempts);
    $("#statSensitive").textContent = formatNumber(totals.sensitiveEvents);
    $("#statSites").textContent = formatNumber(totals.sites.size);
  }

  // ---------- Lista de atenção ----------
  function focusAttention(filter) {
    if (filter.childId && state.selected !== "all" && state.selected !== filter.childId) {
      state.selected = filter.childId;
    }
    state.attentionCategory = filter.category || null;
    state.attentionMode = filter.mode || "all";
    state.attentionFilterChild = state.selected === "all" ? filter.childId : null;
    state.attentionShown = ATTENTION_PAGE;
    syncUrl();
    renderAttention(visibleChildren());
    $("#attentionCard").scrollIntoView({ behavior: "smooth", block: "start" });
    $("#attentionTitle").focus({ preventScroll: true });
  }

  function filteredAttention(children) {
    let items = children.flatMap((child) => state.data.attention.get(child.id) || []);
    if (state.attentionFilterChild) items = items.filter((i) => i.childId === state.attentionFilterChild);
    if (state.attentionCategory) {
      items = items.filter((i) =>
        state.attentionCategory === "OTHER" ? !F.CATEGORIES[i.rotulo] || i.rotulo === "OTHER" : i.rotulo === state.attentionCategory,
      );
    }
    if (state.attentionMode === "blocked") items = items.filter((i) => i.blocked);
    if (state.attentionMode === "seen") items = items.filter((i) => !i.blocked);
    return items.sort((a, b) => new Date(b.ocorridoEm) - new Date(a.ocorridoEm));
  }

  function itemTitle(item, showName) {
    const cat = F.category(item.rotulo);
    const who = showName ? `${item.childName} ` : "";
    const article = cat.one.startsWith("conteúdo") || cat.one.startsWith("site") || cat.one.startsWith("chat") ? "um " : "";
    const verb = item.blocked ? "tentou acessar" : "viu";
    const sentence = `${who}${verb} ${article}${cat.one}`;
    return sentence.charAt(0).toUpperCase() + sentence.slice(1);
  }

  function renderAttention(children) {
    syncChips("#attentionChips", "mode", state.attentionMode);
    const filterBox = $("#activeCategory");
    const parts = [];
    if (state.attentionFilterChild) parts.push(childById(state.attentionFilterChild)?.nickname);
    if (state.attentionCategory) parts.push(F.category(state.attentionCategory).name);
    if (parts.length) {
      filterBox.hidden = false;
      filterBox.innerHTML = `
        <span><i class="fa-solid fa-filter" aria-hidden="true"></i> Mostrando só: ${escapeHtml(parts.filter(Boolean).join(" · "))}</span>
        <button type="button" class="btn btn-ghost" id="clearCategoryBtn"><i class="fa-solid fa-xmark" aria-hidden="true"></i> Mostrar tudo</button>`;
      $("#clearCategoryBtn").addEventListener("click", () => {
        state.attentionCategory = null;
        state.attentionFilterChild = null;
        state.attentionMode = "all";
        state.attentionShown = ATTENTION_PAGE;
        syncUrl();
        renderAttention(visibleChildren());
      });
    } else {
      filterBox.hidden = true;
      filterBox.innerHTML = "";
    }

    const box = $("#attentionList");
    const more = $("#moreAttentionBtn");
    const items = filteredAttention(children);

    if (!items.length) {
      const anything = children.some((c) => (state.data.attention.get(c.id) || []).length);
      box.innerHTML = `
        <li class="fam-empty">
          <div class="fam-empty-icon"><i class="fa-solid ${anything ? "fa-filter-circle-xmark" : "fa-face-smile"}" aria-hidden="true"></i></div>
          <div class="fam-empty-title">${anything ? "Nada com esse filtro" : "Nada preocupante neste período"}</div>
          <p>${anything ? "Toque em “Tudo” para ver a lista completa." : "Que bom! Quando algo precisar da sua atenção, aparece aqui."}</p>
        </li>`;
      more.hidden = true;
      return;
    }

    const showName = state.selected === "all" && state.family.length > 1;
    box.innerHTML = items
      .slice(0, state.attentionShown)
      .map((item) => {
        const cat = F.category(item.rotulo);
        const tone = item.blocked ? "warning" : cat.level === "danger" ? "danger" : "warning";
        const meta = [F.prettyHost(item.urlHost), item.deviceName, F.friendlyWhen(item.ocorridoEm)].filter(Boolean).join(" · ");
        const showContent = item.titulo && item.plataformaMista;
        return `
          <li class="rp-item tone-${item.blocked ? tone : cat.level === "danger" ? "danger" : "warning"}">
            <span class="rp-item-icon"><i class="fa-solid ${cat.icon}" aria-hidden="true"></i></span>
            <div class="rp-item-body">
              <div class="rp-item-title">${escapeHtml(itemTitle(item, showName))}</div>
              <div class="rp-item-meta">${escapeHtml(meta)}</div>
              ${showContent ? `<div class="rp-item-content" title="${escapeHtml(item.titulo)}">“${escapeHtml(item.titulo)}”</div>` : ""}
            </div>
            <div class="rp-item-side">
              ${
                item.blocked
                  ? '<span class="fam-pill tone-success"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i> Bloqueado</span>'
                  : '<span class="fam-pill tone-warning"><i class="fa-solid fa-eye" aria-hidden="true"></i> Foi visto</span>'
              }
              <button type="button" class="btn btn-ghost" data-detail="${escapeHtml(item.id)}" aria-label="Detalhes: ${escapeHtml(itemTitle(item, true))}">Detalhes</button>
            </div>
          </li>`;
      })
      .join("");

    box.querySelectorAll("[data-detail]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const item = items.find((i) => i.id === btn.dataset.detail);
        if (item) openDetail(item);
      });
    });

    const remaining = items.length - state.attentionShown;
    more.hidden = remaining <= 0;
    more.textContent = `Mostrar mais (${remaining})`;
  }

  // ---------- Sites ----------
  function renderTopSites(children) {
    const box = $("#topSites");
    const merged = new Map();
    children.forEach((child) => {
      state.data.stats.get(child.id)?.domains.forEach((count, host) => {
        merged.set(host, (merged.get(host) || 0) + count);
      });
    });
    const top = [...merged.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    if (!top.length) {
      box.innerHTML = `
        <div class="fam-empty">
          <div class="fam-empty-icon"><i class="fa-solid fa-globe" aria-hidden="true"></i></div>
          <div class="fam-empty-title">Nenhum site visitado</div>
          <p>Não houve navegação neste período.</p>
        </div>`;
      return;
    }
    const max = top[0][1];
    box.innerHTML = `<ol class="rp-sites">${top
      .map(
        ([host, count]) => `
        <li>
          <div class="rp-site-row">
            <span class="rp-site-host">${escapeHtml(host)}</span>
            <span class="rp-site-count">${plural(count, "acesso", "acessos")}</span>
          </div>
          <div class="progress-bar" aria-hidden="true"><div class="progress-fill blue" style="width: ${(count / max) * 100}%"></div></div>
        </li>`,
      )
      .join("")}</ol>`;
  }

  // ---------- Detalhes ----------
  function openDetail(item) {
    const score = item.pontuacaoRisco;
    const level = F.riskLevel(score);
    const action = ACTION_TEXT[item.acao] || (item.blocked ? ACTION_TEXT.BLOCK : ACTION_TEXT.UNKNOWN);
    const child = childById(item.childId);
    const showKey = item.urlConteudo && F.prettyHost(item.urlConteudo) !== F.prettyHost(item.urlHost);

    createModal({
      title: "O que aconteceu",
      footer: false,
      content: `
        <div class="detail-grid">
          <div class="detail-lead">
            ${child ? F.avatarHtml(child, "md") : ""}
            <span>${escapeHtml(itemTitle(item, Boolean(child)))}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Quando</span>
            <span class="detail-value">${escapeHtml(formatDateTime(item.ocorridoEm))}${item.deviceName ? ` · ${escapeHtml(item.deviceName)}` : ""}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Site</span>
            <span class="detail-value">${escapeHtml(F.prettyHost(item.urlHost))}</span>
          </div>
          ${item.titulo ? `<div class="detail-item"><span class="detail-label">Nome da página ou vídeo</span><span class="detail-value">${escapeHtml(item.titulo)}</span></div>` : ""}
          ${showKey ? `<div class="detail-item"><span class="detail-label">Endereço exato</span><span class="detail-value">${escapeHtml(item.urlConteudo)}</span></div>` : ""}
          <div class="detail-item">
            <span class="detail-label">O que o GuardIAn fez</span>
            <span class="detail-value"><span class="fam-pill tone-${action.tone}">${action.text}</span></span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Quão preocupante é</span>
            <span class="detail-value">
              ${score === null || score === undefined ? "Ainda não avaliado" : `<span class="fam-pill tone-${level.tone}">${level.short} · ${score} de 100</span> — ${escapeHtml(labelText(item.rotulo))}`}
            </span>
          </div>
          ${item.justificativa ? `<div class="detail-item"><span class="detail-label">Explicação</span><div class="detail-reason">${escapeHtml(item.justificativa)}</div></div>` : ""}
          ${F.CATEGORIES[item.rotulo] ? `<div class="detail-item"><span class="detail-label">Dica</span><div class="detail-value">${escapeHtml(F.category(item.rotulo).tip)}</div></div>` : ""}
          <div class="detail-actions">
            <a class="btn btn-primary" href="policies.html"><i class="fa-solid fa-sliders" aria-hidden="true"></i> Ajustar regras</a>
          </div>
        </div>`,
    });
  }

  // ---------- Histórico completo ----------
  const hist = { device: null, page: 0, last: null, seq: 0, debounce: null, loaded: false };

  function historyDevices() {
    return visibleChildren().flatMap((child) => child.devices.map((device) => ({ ...device, childName: child.nickname })));
  }

  function fillDeviceSelect() {
    const list = historyDevices();
    const select = $("#deviceSelect");
    const previous = select.value;
    if (!list.length) {
      select.innerHTML = '<option value="">Nenhum computador conectado</option>';
      hist.device = null;
      return;
    }
    const showChild = state.selected === "all" && state.family.length > 1;
    select.innerHTML = list
      .map((d) => `<option value="${escapeHtml(d.id)}">${escapeHtml(d.name)}${showChild ? ` (${escapeHtml(d.childName)})` : ""}</option>`)
      .join("");
    select.value = list.some((d) => d.id === previous) ? previous : list[0].id;
    hist.device = list.find((d) => d.id === select.value) || null;
  }

  async function loadLabels() {
    const select = $("#labelSelect");
    const previous = select.value;
    select.innerHTML = '<option value="">Todos</option>';
    if (!hist.device) return;
    try {
      const labels = await activity.labels(hist.device.id);
      labels.forEach((label) => {
        const option = document.createElement("option");
        option.value = label;
        option.textContent = labelText(label);
        select.appendChild(option);
      });
      if (previous && labels.includes(previous)) select.value = previous;
    } catch {
      // Filtro opcional: o histórico funciona sem ele.
    }
  }

  function riskClass(score) {
    if (score === null || score === undefined || score < 40) return "risk-low";
    return score >= 70 ? "risk-high" : "risk-medium";
  }

  async function loadHistory() {
    const container = $("#tableContainer");
    if (!hist.device) {
      container.innerHTML = `
        <div class="fam-empty">
          <div class="fam-empty-icon"><i class="fa-solid fa-laptop" aria-hidden="true"></i></div>
          <div class="fam-empty-title">Nenhum computador conectado</div>
          <p>Conecte um computador para ver o histórico.</p>
        </div>`;
      $("#pagination").hidden = true;
      return;
    }

    const seq = ++hist.seq;
    const range = F.periodRange(state.period);
    container.innerHTML = '<div class="table-loading">Carregando acessos...</div>';
    try {
      const result = await activity.list(hist.device.id, {
        from: range.from,
        to: range.to,
        page: hist.page,
        size: HISTORY_PAGE_SIZE,
        search: $("#searchInput").value.trim(),
        label: $("#labelSelect").value,
        type: $("#typeSelect").value,
        minRisk: $("#riskSelect").value,
      });
      if (seq !== hist.seq) return;
      hist.last = result;
      renderHistory(result);
    } catch (error) {
      if (seq !== hist.seq) return;
      container.innerHTML = `
        <div class="fam-empty">
          <div class="fam-empty-icon"><i class="fa-solid fa-plug-circle-xmark" aria-hidden="true"></i></div>
          <div class="fam-empty-title">Não foi possível carregar</div>
          <p>${escapeHtml(error.message)}</p>
        </div>`;
      $("#pagination").hidden = true;
    }
  }

  function renderHistory(result) {
    const container = $("#tableContainer");
    if (!result.items.length) {
      container.innerHTML = `
        <div class="fam-empty">
          <div class="fam-empty-icon"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i></div>
          <div class="fam-empty-title">Nenhum acesso encontrado</div>
          <p>Tente outro período ou toque em “Limpar”.</p>
        </div>`;
      $("#pagination").hidden = true;
      return;
    }

    const child = state.family.find((c) => c.id === hist.device.dependentId);
    const rows = result.items
      .map((item) => {
        const when = new Date(item.ocorridoEm);
        const score = item.pontuacaoRisco;
        const cls = riskClass(score);
        const blocked = F.isBlocked(item);
        const action = ACTION_TEXT[item.acao] || (blocked ? ACTION_TEXT.BLOCK : ACTION_TEXT.UNKNOWN);
        return `
          <tr class="activity-row" data-id="${escapeHtml(item.id)}" tabindex="0">
            <td class="activity-when">
              <div class="activity-when-time">${when.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</div>
              <div class="activity-when-date">${when.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</div>
            </td>
            <td class="activity-content">
              <div class="activity-host">${escapeHtml(F.prettyHost(item.urlHost))}</div>
              ${item.titulo ? `<div class="activity-title" title="${escapeHtml(item.titulo)}">${escapeHtml(item.titulo)}</div>` : ""}
            </td>
            <td class="risk-cell">
              ${
                score === null || score === undefined
                  ? '<span class="label-name">Sem análise</span>'
                  : `<div class="risk-score ${cls}">${F.riskLevel(score).short}</div>
                     <div class="risk-bar" aria-hidden="true"><div class="risk-bar-fill ${cls}" style="width: ${score}%"></div></div>
                     <div class="label-name">${escapeHtml(labelText(item.rotulo))}</div>`
              }
            </td>
            <td class="col-optional"><span class="fam-pill tone-${action.tone}">${action.text}</span></td>
          </tr>`;
      })
      .join("");

    container.innerHTML = `
      <table>
        <thead>
          <tr>
            <th scope="col">Quando</th>
            <th scope="col">Site</th>
            <th scope="col">Risco</th>
            <th scope="col" class="col-optional">O que aconteceu</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;

    const open = (id) => {
      const item = result.items.find((i) => i.id === id);
      if (!item) return;
      openDetail({
        ...item,
        childId: child?.id,
        childName: child?.nickname,
        deviceName: hist.device.name,
        blocked: F.isBlocked(item),
      });
    };
    container.querySelectorAll(".activity-row").forEach((row) => {
      row.addEventListener("click", () => open(row.dataset.id));
      row.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          open(row.dataset.id);
        }
      });
    });

    const pagination = $("#pagination");
    pagination.hidden = false;
    const first = result.page * result.size + 1;
    const last = Math.min(first + result.items.length - 1, result.totalItems);
    $("#paginationInfo").textContent = `Mostrando ${first}–${last} de ${result.totalItems}`;
    $("#paginationPage").textContent = `Página ${result.page + 1} de ${Math.max(result.totalPages, 1)}`;
    $("#prevPageBtn").disabled = result.page <= 0;
    $("#nextPageBtn").disabled = result.page >= result.totalPages - 1;
  }

  async function refreshHistory({ resetDevice = false } = {}) {
    if (!$("#historyDetails").open) {
      hist.loaded = false;
      return;
    }
    if (resetDevice || !hist.loaded) {
      fillDeviceSelect();
      await loadLabels();
    }
    hist.loaded = true;
    hist.page = 0;
    await loadHistory();
  }

  function exportCsv() {
    if (!hist.last?.items.length) {
      showToast("Não há nada para baixar nesta lista", "warning");
      return;
    }
    const header = ["Data/Hora", "Site", "Endereço exato", "Título", "Assunto", "Risco (0-100)", "O que aconteceu", "Explicação"];
    const esc = (value) => `"${(value === null || value === undefined ? "" : String(value)).replace(/"/g, '""')}"`;
    const rows = hist.last.items.map((item) =>
      [
        formatDateTime(item.ocorridoEm),
        item.urlHost,
        item.urlConteudo || "",
        item.titulo || "",
        labelText(item.rotulo),
        item.pontuacaoRisco ?? "",
        (ACTION_TEXT[item.acao] || ACTION_TEXT.UNKNOWN).text,
        item.justificativa || "",
      ]
        .map(esc)
        .join(","),
    );
    // BOM para o Excel reconhecer UTF-8 e manter os acentos
    const csv = String.fromCharCode(0xfeff) + [header.map(esc).join(","), ...rows].join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a");
    const name = (hist.device?.name || "computador").replace(/[^a-zA-Z0-9]+/g, "-");
    link.href = url;
    link.download = `guardian-relatorio-${name}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast(`${hist.last.items.length} acessos baixados`, "success");
  }

  // ---------- Fluxo ----------
  function render() {
    if (!state.data) return;
    const children = visibleChildren();
    renderChildChips();
    syncChips("#periodChips", "period", state.period);
    const sentences = state.family.length ? buildSentences(children) : [];
    renderHeadline(children, sentences);
    renderStats(children);
    renderSentences(sentences);
    renderAttention(children);
    renderTopSites(children);
  }

  function showLoading() {
    const headline = $("#reportHeadline");
    headline.className = "fam-headline tone-muted";
    headline.innerHTML = `
      <div class="fam-headline-icon"><i class="fa-solid fa-hourglass-half" aria-hidden="true"></i></div>
      <div><div class="fam-headline-title">Preparando o relatório...</div></div>`;
    ["#statTotal", "#statBlocks", "#statSensitive", "#statSites"].forEach((id) => {
      $(id).textContent = "-";
    });
    $("#summaryList").innerHTML = '<li class="fam-skeleton" style="min-height: 80px"></li>';
    $("#attentionList").innerHTML = '<li class="fam-skeleton"></li>';
    $("#moreAttentionBtn").hidden = true;
    $("#topSites").innerHTML = '<div class="fam-skeleton"></div>';
  }

  async function load({ reloadFamily = false } = {}) {
    const seq = ++state.loadSeq;
    showLoading();
    try {
      if (reloadFamily || !state.family.length) {
        state.family = await F.loadFamily();
        if (state.selected !== "all" && !state.family.some((c) => c.id === state.selected)) {
          state.selected = "all";
        }
      }
      const range = F.periodRange(state.period);
      const [statsList, attentionList] = await Promise.all([
        Promise.all(state.family.map((child) => F.loadChildStats(child, range))),
        Promise.all(state.family.map((child) => F.loadAttentionItems(child, range).catch(() => []))),
      ]);
      if (seq !== state.loadSeq) return;
      state.data = {
        stats: new Map(state.family.map((c, i) => [c.id, statsList[i]])),
        attention: new Map(state.family.map((c, i) => [c.id, attentionList[i]])),
      };
      render();
      refreshHistory({ resetDevice: true });
    } catch (error) {
      if (seq !== state.loadSeq) return;
      showToast("Não foi possível carregar o relatório: " + error.message, "error");
      const headline = $("#reportHeadline");
      headline.className = "fam-headline tone-danger";
      headline.innerHTML = `
        <div class="fam-headline-icon"><i class="fa-solid fa-plug-circle-xmark" aria-hidden="true"></i></div>
        <div>
          <div class="fam-headline-title">Não conseguimos carregar o relatório agora.</div>
          <div class="fam-headline-text">Verifique sua internet e toque em “Atualizar”.</div>
        </div>`;
      $("#summaryList").innerHTML = "";
      $("#attentionList").innerHTML = "";
      $("#topSites").innerHTML = "";
    }
  }

  function init() {
    $("#userName").textContent = auth.getEmail() || "Responsável";
    $("#logoutBtn").addEventListener("click", () => auth.logout());

    $("#childChips").addEventListener("click", (event) => {
      const btn = event.target.closest(".fam-chip");
      if (!btn || btn.dataset.child === state.selected) return;
      state.selected = btn.dataset.child;
      state.attentionFilterChild = null;
      state.attentionCategory = null;
      state.attentionMode = "all";
      state.attentionShown = ATTENTION_PAGE;
      syncUrl();
      render();
      document.querySelector(`#childChips [data-child="${CSS.escape(state.selected)}"]`)?.focus();
      refreshHistory({ resetDevice: true });
    });

    $("#periodChips").addEventListener("click", (event) => {
      const btn = event.target.closest(".fam-chip");
      if (!btn || btn.dataset.period === state.period) return;
      state.period = btn.dataset.period;
      syncChips("#periodChips", "period", state.period);
      syncUrl();
      load();
    });

    $("#attentionChips").addEventListener("click", (event) => {
      const btn = event.target.closest(".fam-chip");
      if (!btn || !state.data) return;
      state.attentionMode = btn.dataset.mode;
      state.attentionShown = ATTENTION_PAGE;
      renderAttention(visibleChildren());
    });

    $("#moreAttentionBtn").addEventListener("click", () => {
      state.attentionShown += ATTENTION_PAGE;
      renderAttention(visibleChildren());
    });

    $("#refreshBtn").addEventListener("click", () => load({ reloadFamily: true }));

    // Histórico
    $("#historyDetails").addEventListener("toggle", () => {
      if ($("#historyDetails").open && !hist.loaded) refreshHistory({ resetDevice: true });
    });
    $("#deviceSelect").addEventListener("change", async () => {
      hist.device = historyDevices().find((d) => d.id === $("#deviceSelect").value) || null;
      hist.page = 0;
      await loadLabels();
      loadHistory();
    });
    const onFilter = () => {
      hist.page = 0;
      loadHistory();
    };
    ["#labelSelect", "#typeSelect", "#riskSelect"].forEach((id) => $(id).addEventListener("change", onFilter));
    $("#searchInput").addEventListener("input", () => {
      clearTimeout(hist.debounce);
      hist.debounce = setTimeout(onFilter, 350);
    });
    $("#clearFiltersBtn").addEventListener("click", () => {
      $("#searchInput").value = "";
      $("#labelSelect").value = "";
      $("#typeSelect").value = "";
      $("#riskSelect").value = "";
      onFilter();
    });
    $("#prevPageBtn").addEventListener("click", () => {
      if (hist.page > 0) {
        hist.page -= 1;
        loadHistory();
      }
    });
    $("#nextPageBtn").addEventListener("click", () => {
      if (hist.last && hist.page < hist.last.totalPages - 1) {
        hist.page += 1;
        loadHistory();
      }
    });
    $("#exportBtn").addEventListener("click", exportCsv);

    load({ reloadFamily: true });
  }

  init();
})();

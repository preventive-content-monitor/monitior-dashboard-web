/**
 * GuardIAn - Página de Políticas.
 * Fluxo: 1) escolher o filho  2) nível de proteção  3) regras extras
 * (sites bloqueados e horário escolar)  4) ajustes avançados.
 * Cada alteração é salva automaticamente, pouco depois de feita.
 */
(function () {
  "use strict";

  const { $, showToast, calculateAge, requireAuth } = GuardianUtils;
  const { auth, dependents, devices, policy } = GuardianAPI;

  if (!requireAuth()) return;

  const SELECTED_KEY = "guardian_policies_selected";

  const MODES = [
    {
      value: "BLOCK",
      title: "Bloquear",
      icon: "fa-shield-halved",
      tone: "danger",
      level: 3,
      levelLabel: "Proteção alta",
      desc: "Sites impróprios não abrem. A criança fica protegida.",
      ages: "Indicado até 10 anos",
    },
    {
      value: "WARN",
      title: "Avisar a criança",
      icon: "fa-hand",
      tone: "warning",
      level: 2,
      levelLabel: "Proteção média",
      desc: "Mostra um alerta na tela, mas deixa a criança continuar.",
      ages: "Indicado de 11 a 13 anos",
    },
    {
      value: "EDUCATE",
      title: "Só me avisar",
      icon: "fa-eye",
      tone: "primary",
      level: 1,
      levelLabel: "Proteção leve",
      desc: "Não bloqueia nada. Você acompanha tudo aqui pelo painel.",
      ages: "Indicado a partir de 14 anos",
    },
  ];
  const MODE_BY_VALUE = Object.fromEntries(MODES.map((m) => [m.value, m]));

  // Estado
  let dependentsList = [];
  let devicesByDependent = {};
  let savedById = {};
  let draftById = {};
  let selectedId = null;
  let pendingSaveData = null;
  let saving = false;
  let advancedOpen = false;

  const panel = $("#policyPanel");
  const picker = $("#childPicker");

  // ---------- Helpers ----------
  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function parseDomains(value) {
    if (!value) return [];
    try {
      const list = typeof value === "string" ? JSON.parse(value) : value;
      return Array.isArray(list) ? list.filter(Boolean) : [];
    } catch {
      return [];
    }
  }

  function toState(current) {
    const threshold = Number(current?.riskThreshold);
    return {
      mode: MODE_BY_VALUE[current?.mode] ? current.mode : "BLOCK",
      riskThreshold: current?.riskThreshold && Number.isFinite(threshold) ? threshold : 50,
      protectionEnabled: current?.protectionEnabled !== false,
      schoolModeEnabled: Boolean(current?.schoolModeEnabled),
      schoolStart: current?.schoolStart || "07:00",
      schoolEnd: current?.schoolEnd || "17:00",
      blockedDomains: parseDomains(current?.blockedDomains),
      allowedDomains: parseDomains(current?.allowedDomains),
    };
  }

  function cloneState(state) {
    return {
      ...state,
      blockedDomains: [...state.blockedDomains],
      allowedDomains: [...state.allowedDomains],
    };
  }

  function getDraft(id) {
    if (!draftById[id]) draftById[id] = cloneState(savedById[id] || toState(null));
    return draftById[id];
  }

  function isDirty(id) {
    return Boolean(
      draftById[id] &&
        savedById[id] &&
        JSON.stringify(draftById[id]) !== JSON.stringify(savedById[id]),
    );
  }

  function findDep(id) {
    return dependentsList.find((d) => String(d.id) === String(id));
  }

  function depDevicesOf(id) {
    return devicesByDependent[id] || [];
  }

  function ageOf(dep) {
    if (!dep?.birthYear) return null;
    const age = Number.isFinite(dep.age) ? dep.age : calculateAge(Number(dep.birthYear));
    return Number.isFinite(age) && age >= 0 && age < 30 ? age : null;
  }

  function recommendedMode(age) {
    if (age === null) return null;
    if (age <= 10) return "BLOCK";
    if (age <= 13) return "WARN";
    return "EDUCATE";
  }

  function avatarIcon(dep, age) {
    if (age !== null && age <= 3) return "fa-baby";
    const sex = String(dep.sex || dep.sexo || "").toUpperCase();
    if (sex === "FEMININO" || sex === "FEMALE") return "fa-child-dress";
    return "fa-child";
  }

  function devicesLabel(depId) {
    const all = depDevicesOf(depId);
    const count = all.filter((d) => !d.removedAt).length;
    if (count === 0) return all.length ? "Extensão removida do computador — reinstale" : "Nenhum dispositivo";
    return count === 1 ? "1 dispositivo" : `${count} dispositivos`;
  }

  function sensitivityLabel(value) {
    if (value <= 30) return "Rigoroso";
    if (value <= 60) return "Equilibrado";
    return "Tolerante";
  }

  function normalizeDomain(raw) {
    return String(raw || "")
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "");
  }

  // ---------- Init ----------
  function init() {
    $("#userName").textContent = auth.getEmail() || "Responsável";
    $("#logoutBtn").addEventListener("click", () => auth.logout());

    const modal = $("#allowedDomainsModal");
    modal.querySelector(".modal-close").addEventListener("click", closeAllowedModal);
    $("#cancelAllowedBtn").addEventListener("click", closeAllowedModal);
    $("#confirmAllowedBtn").addEventListener("click", confirmAndSave);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeAllowedModal();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && modal.classList.contains("show")) closeAllowedModal();
    });

    picker.addEventListener("click", (e) => {
      const btn = e.target.closest(".pol-child[data-id]");
      if (btn) selectChild(btn.dataset.id);
    });

    bindPanelEvents();
    loadData();
  }

  // ---------- Dados ----------
  async function loadData() {
    try {
      dependentsList = await dependents.list();
      const allDevices = await devices.list();

      devicesByDependent = {};
      allDevices.forEach((device) => {
        const depId = device.dependentId;
        if (depId) {
          if (!devicesByDependent[depId]) devicesByDependent[depId] = [];
          devicesByDependent[depId].push(device);
        }
      });

      const entries = await Promise.all(
        dependentsList.map(async (dep) => {
          const depDevices = depDevicesOf(dep.id);
          let currentPolicy = null;
          if (depDevices.length > 0) {
            try {
              currentPolicy = await policy.get(depDevices[0].id);
            } catch (e) {
              // Ainda sem política salva: usa os padrões.
            }
          }
          return [String(dep.id), toState(currentPolicy)];
        }),
      );
      savedById = Object.fromEntries(entries);

      Object.keys(draftById).forEach((id) => {
        if (!savedById[id]) delete draftById[id];
      });

      if (!selectedId || !findDep(selectedId)) {
        const stored = sessionStorage.getItem(SELECTED_KEY);
        const firstWithDevice = dependentsList.find((d) => depDevicesOf(d.id).length > 0);
        selectedId = findDep(stored)
          ? stored
          : String((firstWithDevice || dependentsList[0] || {}).id ?? "");
      }

      renderPicker();
      renderPanel();
    } catch (error) {
      showToast("Erro ao carregar dados: " + esc(error.message), "error");
      renderLoadError();
    }
  }

  // ---------- Passo 1: escolher o filho ----------
  function renderPicker() {
    const step = picker.closest(".pol-step");
    step.hidden = dependentsList.length === 0;
    if (dependentsList.length === 0) return;

    picker.innerHTML = dependentsList
      .map((dep) => {
        const id = String(dep.id);
        const age = ageOf(dep);
        const count = depDevicesOf(dep.id).length;
        const saved = savedById[id];
        const mode = MODE_BY_VALUE[saved?.mode];
        const selected = id === String(selectedId);
        const status =
          count === 0
            ? `<span class="pol-pill pol-tone-muted"><i class="fa-solid fa-plug-circle-xmark" aria-hidden="true"></i> Sem dispositivo</span>`
            : `<span class="pol-pill pol-tone-${mode.tone}"><i class="fa-solid ${mode.icon}" aria-hidden="true"></i> ${mode.title}</span>`;
        return `
          <button type="button" class="pol-child${selected ? " is-selected" : ""}" data-id="${esc(id)}" aria-pressed="${selected}">
            <span class="pol-child-avatar" aria-hidden="true"><i class="fa-solid ${avatarIcon(dep, age)}"></i></span>
            <span class="pol-child-info">
              <span class="pol-child-name">${esc(dep.nickname)}</span>
              <span class="pol-child-meta">${age !== null ? `${age} anos · ` : ""}${devicesLabel(dep.id)}</span>
              ${status}
            </span>
            <span class="pol-child-check" aria-hidden="true"><i class="fa-solid fa-check"></i></span>
            ${isDirty(id) ? `<span class="pol-child-dot" title="Alterações não salvas"><span class="pol-sr-only">Alterações não salvas</span></span>` : ""}
          </button>`;
      })
      .join("");
  }

  function selectChild(id) {
    if (String(id) === String(selectedId)) return;
    selectedId = String(id);
    sessionStorage.setItem(SELECTED_KEY, selectedId);
    renderPicker();
    renderPanel();
  }

  // ---------- Painel do filho ----------
  function renderLoadError() {
    picker.closest(".pol-step").hidden = true;
    panel.innerHTML = `
      <div class="card pol-empty">
        <div class="pol-empty-icon pol-tone-danger" aria-hidden="true"><i class="fa-solid fa-cloud-arrow-down"></i></div>
        <h2>Não conseguimos carregar as regras</h2>
        <p>Verifique sua internet e tente de novo.</p>
        <button type="button" class="btn btn-primary" data-action="retry">
          <i class="fa-solid fa-rotate-right" aria-hidden="true"></i> Tentar de novo
        </button>
      </div>`;
  }

  function renderPanel() {
    if (dependentsList.length === 0) {
      panel.innerHTML = `
        <div class="card pol-empty">
          <div class="pol-empty-icon" aria-hidden="true"><i class="fa-solid fa-people-group"></i></div>
          <h2>Você ainda não adicionou nenhum filho</h2>
          <p>Cadastre seu filho para escolher como protegê-lo na internet.</p>
          <a href="dependents.html" class="btn btn-primary btn-large">
            <i class="fa-solid fa-plus" aria-hidden="true"></i> Adicionar filho
          </a>
        </div>`;
      return;
    }

    const dep = findDep(selectedId);
    if (!dep) return;
    const id = String(dep.id);
    const age = ageOf(dep);
    const name = esc(dep.nickname);
    const count = depDevicesOf(dep.id).length;

    if (count === 0) {
      panel.innerHTML = `
        <div class="card pol-empty">
          <div class="pol-empty-icon" aria-hidden="true"><i class="fa-solid fa-laptop"></i></div>
          <h2>${name} ainda não tem um dispositivo conectado</h2>
          <p>Conecte o computador de ${name} para escolher as regras de proteção.</p>
          <a href="dependents.html" class="btn btn-primary btn-large">
            <i class="fa-solid fa-link" aria-hidden="true"></i> Conectar dispositivo
          </a>
        </div>`;
      return;
    }

    const s = getDraft(id);
    const saved = savedById[id];
    const rec = recommendedMode(age);

    panel.innerHTML = `
      <div class="card pol-banner">
        <span class="pol-banner-avatar" aria-hidden="true"><i class="fa-solid ${avatarIcon(dep, age)}"></i></span>
        <div class="pol-banner-text">
          <h2>Regras de ${name}</h2>
          <p>${age !== null ? `${age} anos · ` : ""}${devicesLabel(id)} · as regras valem para todos</p>
        </div>
        <span class="pol-pill pol-pill-lg" id="polProtectionPill"></span>
      </div>

      <section class="pol-step" aria-labelledby="stepModeTitle">
        <div class="pol-step-head">
          <span class="pol-step-num" aria-hidden="true">2</span>
          <div>
            <h2 class="pol-step-title" id="stepModeTitle">O que fazer quando ${name} abrir um site impróprio?</h2>
            <p class="pol-step-desc">Escolha uma opção. Você pode mudar quando quiser.</p>
          </div>
        </div>
        ${
          rec
            ? `<div class="pol-reco" id="polReco" data-age="${age}">
                <i class="fa-solid fa-star" aria-hidden="true"></i>
                <span data-reco-text></span>
                <button type="button" class="btn btn-secondary pol-reco-btn" data-action="use-reco" data-mode="${rec}">Usar recomendação</button>
              </div>`
            : ""
        }
        <div class="pol-modes" role="radiogroup" aria-labelledby="stepModeTitle">
          ${MODES.map(
            (m) => `
            <label class="pol-mode pol-tone-${m.tone}">
              <input type="radio" name="polMode" value="${m.value}" class="pol-sr-only" ${s.mode === m.value ? "checked" : ""} />
              <span class="pol-mode-card">
                <span class="pol-mode-top">
                  <span class="pol-mode-icon" aria-hidden="true"><i class="fa-solid ${m.icon}"></i></span>
                  <span class="pol-mode-radio" aria-hidden="true"><i class="fa-solid fa-check"></i></span>
                </span>
                ${m.value === rec ? `<span class="pol-mode-reco"><i class="fa-solid fa-star" aria-hidden="true"></i> Recomendado para ${age} anos</span>` : ""}
                <span class="pol-mode-title">${m.title}</span>
                <span class="pol-mode-desc">${m.desc}</span>
                <span class="pol-mode-foot">
                  <span class="pol-bars" data-level="${m.level}" aria-hidden="true"><i></i><i></i><i></i></span>
                  <span>${m.levelLabel}</span>
                  <span class="pol-mode-ages">${m.ages}</span>
                </span>
              </span>
            </label>`,
          ).join("")}
        </div>
      </section>

      <section class="pol-step" aria-labelledby="stepExtraTitle">
        <div class="pol-step-head">
          <span class="pol-step-num" aria-hidden="true">3</span>
          <div>
            <h2 class="pol-step-title" id="stepExtraTitle">Regras extras <span class="pol-optional">opcional</span></h2>
            <p class="pol-step-desc">O GuardIAn já analisa os sites sozinho. Use aqui só se quiser algo a mais.</p>
          </div>
        </div>
        <div class="pol-extras">
          <div class="card pol-box">
            <div class="pol-box-head">
              <span class="pol-box-icon pol-tone-danger" aria-hidden="true"><i class="fa-solid fa-ban"></i></span>
              <div>
                <h3>Sites bloqueados <span class="pol-count" data-count="blocked"></span></h3>
                <p>Estes sites nunca vão abrir para ${name}.</p>
              </div>
            </div>
            <div class="pol-callout pol-callout-info" data-note="blocked" hidden>
              <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
              <p>Você ligou <strong>“Só permitir sites escolhidos”</strong> nos ajustes avançados, então esta lista não será usada.</p>
            </div>
            ${addFormHTML("blocked", "Bloquear", "ex.: tiktok.com")}
            <ul class="pol-sites" data-list="blocked" aria-label="Sites bloqueados"></ul>
          </div>

          <div class="card pol-box">
            <div class="pol-box-head">
              <span class="pol-box-icon pol-tone-primary" aria-hidden="true"><i class="fa-solid fa-school"></i></span>
              <div>
                <h3 id="polSchoolLabel">Horário da escola</h3>
                <p id="polSchoolDesc">Proteção extra durante o horário de aula.</p>
              </div>
              ${switchHTML("polSchool", s.schoolModeEnabled, "polSchoolLabel", "polSchoolDesc")}
            </div>
            <div class="pol-times" id="polTimes" ${s.schoolModeEnabled ? "" : "hidden"}>
              <div class="form-group">
                <label for="polSchoolStart">Começa às</label>
                <input type="time" id="polSchoolStart" value="${esc(s.schoolStart)}" />
              </div>
              <span class="pol-times-sep" aria-hidden="true"><i class="fa-solid fa-arrow-right"></i></span>
              <div class="form-group">
                <label for="polSchoolEnd">Termina às</label>
                <input type="time" id="polSchoolEnd" value="${esc(s.schoolEnd)}" />
              </div>
            </div>
            <p class="pol-box-off" id="polSchoolOff" ${s.schoolModeEnabled ? "hidden" : ""}>
              <i class="fa-regular fa-moon" aria-hidden="true"></i> Desligado. Ligue para escolher o horário.
            </p>
          </div>
        </div>
      </section>

      <details class="card pol-advanced" ${advancedOpen ? "open" : ""}>
        <summary>
          <span class="pol-box-icon" aria-hidden="true"><i class="fa-solid fa-sliders"></i></span>
          <span class="pol-advanced-text">
            <strong>Ajustes avançados</strong>
            <span>Para quem quer mais controle. Pode deixar como está.</span>
          </span>
          <i class="fa-solid fa-chevron-down pol-advanced-arrow" aria-hidden="true"></i>
        </summary>
        <div class="pol-advanced-body">
          <div class="pol-row">
            <div class="pol-row-text">
              <h3 id="polProtectionLabel">Proteção ligada</h3>
              <p id="polProtectionDesc">Desligue só se quiser pausar o GuardIAn para ${name}.</p>
            </div>
            ${switchHTML("polProtection", s.protectionEnabled, "polProtectionLabel", "polProtectionDesc")}
          </div>

          <div class="pol-row pol-row-col">
            <div class="pol-row-text pol-row-split">
              <div>
                <h3><label for="polRisk">Sensibilidade do filtro</label></h3>
                <p id="polRiskHelp"></p>
              </div>
              <span class="pol-pill pol-tone-primary" id="polRiskValue"></span>
            </div>
            <input type="range" id="polRisk" class="pol-range" min="0" max="100" step="5" value="${esc(s.riskThreshold)}" aria-describedby="polRiskHelp" />
            <div class="pol-range-scale" aria-hidden="true">
              <span>Mais rigoroso</span><span>Equilibrado</span><span>Mais tolerante</span>
            </div>
          </div>

          <div class="pol-row pol-row-col">
            <div class="pol-row-text">
              <h3>Só permitir sites escolhidos <span class="pol-count" data-count="allowed"></span></h3>
              <p>Para crianças pequenas que só usam poucos sites (ex.: o site da escola).</p>
            </div>
            <div class="pol-callout pol-callout-warning">
              <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
              <p>Se você adicionar algum site aqui, <strong>todos os outros serão bloqueados</strong>.</p>
            </div>
            ${addFormHTML("allowed", "Permitir", "ex.: escola.edu.br")}
            <ul class="pol-sites" data-list="allowed" aria-label="Sites sempre permitidos"></ul>
          </div>
        </div>
      </details>

      <div class="pol-savebar" id="polSavebar">
        <div class="pol-savebar-status" id="polSaveStatus" role="status"></div>
        <p class="error-message pol-error" id="polError" role="alert"></p>
      </div>`;

    renderSites("blocked");
    renderSites("allowed");
    updateRisk();
    updateReco();
    updateSaveBar();
  }

  function addFormHTML(type, actionLabel, placeholder) {
    const inputId = `polAdd-${type}`;
    const label = type === "blocked" ? "Endereço do site que deseja bloquear" : "Endereço do site que deseja permitir";
    return `
      <div class="pol-add">
        <label for="${inputId}" class="pol-sr-only">${label}</label>
        <span class="pol-add-field">
          <i class="fa-solid fa-globe" aria-hidden="true"></i>
          <input type="text" id="${inputId}" class="pol-add-input" data-type="${type}" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${placeholder}" />
        </span>
        <button type="button" class="btn btn-secondary" data-action="add" data-type="${type}">
          <i class="fa-solid fa-plus" aria-hidden="true"></i> ${actionLabel}
        </button>
      </div>`;
  }

  function switchHTML(id, checked, labelId, descId) {
    return `
      <span class="pol-switch">
        <input type="checkbox" role="switch" id="${id}" ${checked ? "checked" : ""} aria-labelledby="${labelId}" aria-describedby="${descId}" />
        <span class="pol-switch-track" aria-hidden="true"><span class="pol-switch-thumb"></span></span>
      </span>`;
  }

  // ---------- Atualizações parciais ----------
  function renderSites(type, highlight) {
    const list = panel.querySelector(`[data-list="${type}"]`);
    if (!list) return;
    const s = getDraft(selectedId);
    const items = s[`${type}Domains`];

    if (items.length === 0) {
      list.innerHTML = `
        <li class="pol-sites-empty">
          <i class="fa-solid ${type === "blocked" ? "fa-face-smile" : "fa-earth-americas"}" aria-hidden="true"></i>
          ${type === "blocked" ? "Nenhum site bloqueado ainda." : "Nenhum site aqui: a navegação segue normal (exceto os bloqueados)."}
        </li>`;
    } else {
      list.innerHTML = items
        .map(
          (d) => `
          <li class="pol-site${d === highlight ? " is-new" : ""}">
            <span class="pol-site-icon pol-tone-${type === "blocked" ? "danger" : "success"}" aria-hidden="true">
              <i class="fa-solid ${type === "blocked" ? "fa-ban" : "fa-check"}"></i>
            </span>
            <span class="pol-site-name">${esc(d)}</span>
            <button type="button" class="pol-site-remove" data-action="remove" data-type="${type}" data-domain="${esc(d)}" aria-label="Remover ${esc(d)}">
              <i class="fa-solid fa-xmark" aria-hidden="true"></i><span>Remover</span>
            </button>
          </li>`,
        )
        .join("");
    }

    const counter = panel.querySelector(`[data-count="${type}"]`);
    if (counter) counter.textContent = items.length ? `(${items.length})` : "";

    const note = panel.querySelector('[data-note="blocked"]');
    if (note) note.hidden = s.allowedDomains.length === 0;
  }

  function updateRisk() {
    const input = panel.querySelector("#polRisk");
    if (!input) return;
    const v = Number(input.value);
    const label = sensitivityLabel(v);
    panel.querySelector("#polRiskValue").textContent = `${v} · ${label}`;
    panel.querySelector("#polRiskHelp").textContent =
      `O GuardIAn age quando o risco de um site chega a ${v} de 100. Número menor = mais cuidado.`;
    input.setAttribute("aria-valuetext", `${v}, ${label}`);
    input.style.setProperty("--pol-range-fill", `${v}%`);
  }

  function updateReco() {
    const box = panel.querySelector("#polReco");
    if (!box) return;
    const btn = box.querySelector("[data-action='use-reco']");
    const mode = btn.dataset.mode;
    const using = getDraft(selectedId).mode === mode;
    btn.hidden = using;
    box.classList.toggle("is-using", using);
    box.querySelector("[data-reco-text]").innerHTML = using
      ? `Ótimo! Você está usando o recomendado para ${box.dataset.age} anos: <strong>${MODE_BY_VALUE[mode].title}</strong>.`
      : `Para ${box.dataset.age} anos, recomendamos <strong>${MODE_BY_VALUE[mode].title}</strong>.`;
  }

  function updateProtectionPill() {
    const pill = panel.querySelector("#polProtectionPill");
    const saved = savedById[selectedId];
    if (!pill || !saved) return;
    const on = saved.protectionEnabled;
    pill.className = `pol-pill pol-pill-lg ${on ? "pol-tone-success" : "pol-tone-warning"}`;
    pill.innerHTML = `<i class="fa-solid ${on ? "fa-circle-check" : "fa-circle-pause"}" aria-hidden="true"></i> ${on ? "Proteção ligada" : "Proteção pausada"}`;
  }

  function updateSaveBar() {
    const bar = panel.querySelector("#polSavebar");
    if (!bar) return;
    const dirty = isDirty(selectedId);
    if (dirty) scheduleSave(selectedId);
    const busy = dirty || saving;
    bar.classList.toggle("is-dirty", busy);
    panel.querySelector("#polSaveStatus").innerHTML = busy
      ? `<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i><span>Salvando…</span>`
      : `<i class="fa-solid fa-circle-check" aria-hidden="true"></i><span>Salvo automaticamente. As regras acima já estão valendo.</span>`;
    updateProtectionPill();
    renderPickerDots();
  }

  // Salva sozinho pouco depois de cada mudança (agrupa cliques e o arraste do controle).
  const saveTimers = {};
  let saveFailed = false;
  function scheduleSave(id) {
    clearTimeout(saveTimers[id]);
    saveTimers[id] = setTimeout(() => {
      delete saveTimers[id];
      handleSavePolicy(id);
    }, saveFailed ? 4000 : 700);
  }

  function renderPickerDots() {
    picker.querySelectorAll(".pol-child[data-id]").forEach((btn) => {
      const dirty = isDirty(btn.dataset.id);
      let dot = btn.querySelector(".pol-child-dot");
      if (dirty && !dot) {
        dot = document.createElement("span");
        dot.className = "pol-child-dot";
        dot.title = "Alterações não salvas";
        dot.innerHTML = '<span class="pol-sr-only">Alterações não salvas</span>';
        btn.appendChild(dot);
      } else if (!dirty && dot) {
        dot.remove();
      }
    });
  }

  function setMode(value) {
    if (!MODE_BY_VALUE[value]) return;
    getDraft(selectedId).mode = value;
    const radio = panel.querySelector(`input[name="polMode"][value="${value}"]`);
    if (radio) radio.checked = true;
    updateReco();
    updateSaveBar();
  }

  // ---------- Sites ----------
  function addDomain(type) {
    const input = panel.querySelector(`.pol-add-input[data-type="${type}"]`);
    const domain = normalizeDomain(input.value);
    if (!domain) {
      input.focus();
      return;
    }
    const list = getDraft(selectedId)[`${type}Domains`];
    if (list.includes(domain)) {
      showToast("Este site já está na lista", "warning");
      return;
    }
    list.push(domain);
    input.value = "";
    input.focus();
    renderSites(type, domain);
    updateSaveBar();
  }

  function removeDomain(type, domain) {
    const s = getDraft(selectedId);
    s[`${type}Domains`] = s[`${type}Domains`].filter((d) => d !== domain);
    renderSites(type);
    updateSaveBar();
    panel.querySelector(`.pol-add-input[data-type="${type}"]`)?.focus();
  }

  // ---------- Eventos do painel ----------
  function bindPanelEvents() {
    panel.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const action = btn.dataset.action;
      if (action === "add") addDomain(btn.dataset.type);
      else if (action === "remove") removeDomain(btn.dataset.type, btn.dataset.domain);
      else if (action === "use-reco") setMode(btn.dataset.mode);
      else if (action === "retry") {
        panel.innerHTML = `<div class="card pol-loading"><div class="loading-spinner"></div><p>Carregando as regras de proteção...</p></div>`;
        loadData();
      }
    });

    panel.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.target.classList.contains("pol-add-input")) {
        e.preventDefault();
        addDomain(e.target.dataset.type);
      }
    });

    panel.addEventListener("change", (e) => {
      const t = e.target;
      if (!selectedId || !savedById[selectedId]) return;
      const s = getDraft(selectedId);
      if (t.name === "polMode") setMode(t.value);
      else if (t.id === "polProtection") s.protectionEnabled = t.checked;
      else if (t.id === "polSchool") {
        s.schoolModeEnabled = t.checked;
        panel.querySelector("#polTimes").hidden = !t.checked;
        panel.querySelector("#polSchoolOff").hidden = t.checked;
      } else if (t.id === "polSchoolStart") s.schoolStart = t.value;
      else if (t.id === "polSchoolEnd") s.schoolEnd = t.value;
      else return;
      updateSaveBar();
    });

    panel.addEventListener("input", (e) => {
      if (e.target.id !== "polRisk") return;
      getDraft(selectedId).riskThreshold = Number(e.target.value);
      updateRisk();
      updateSaveBar();
    });

    // "toggle" não borbulha; captura para lembrar se o usuário abriu os ajustes.
    panel.addEventListener(
      "toggle",
      (e) => {
        if (e.target.classList?.contains("pol-advanced")) advancedOpen = e.target.open;
      },
      true,
    );
  }

  // ---------- Salvar (automático) ----------
  function handleSavePolicy(dependentId) {
    if (!isDirty(dependentId)) return;
    if (saving || $("#allowedDomainsModal").classList.contains("show")) return scheduleSave(dependentId);
    const depDevices = depDevicesOf(dependentId);
    if (depDevices.length === 0) return;

    const s = getDraft(dependentId);
    const errorEl = panel.querySelector("#polError");
    if (errorEl) errorEl.textContent = "";

    const riskThreshold = parseInt(s.riskThreshold, 10);
    if (!Number.isFinite(riskThreshold) || riskThreshold < 0 || riskThreshold > 100) {
      if (errorEl) errorEl.textContent = "A sensibilidade deve ficar entre 0 e 100.";
      return;
    }

    const clean = (list) => list.map((d) => d.trim().toLowerCase()).filter((d) => d.length > 0);
    const blockedDomains = clean(s.blockedDomains);
    const allowedDomains = clean(s.allowedDomains);

    const policyData = {
      mode: s.mode,
      riskThreshold,
      protectionEnabled: s.protectionEnabled,
      // Com sites permitidos definidos, a lista de bloqueados deixa de valer.
      blockedDomains: allowedDomains.length > 0 ? [] : blockedDomains,
      allowedDomains,
      schoolModeEnabled: s.schoolModeEnabled,
      schoolStart: s.schoolStart || null,
      schoolEnd: s.schoolEnd || null,
    };
    const snapshot = cloneState(s);

    // Confirma só ao ligar a lista de "só permitir" pela primeira vez (ela bloqueia todo o resto).
    if (allowedDomains.length > 0 && (savedById[dependentId]?.allowedDomains.length || 0) === 0) {
      $("#allowedDomainsList").innerHTML = allowedDomains
        .map(
          (d) =>
            `<li><i class="fa-solid fa-circle-check" aria-hidden="true"></i> ${esc(d)}</li>`,
        )
        .join("");
      pendingSaveData = { dependentId, depDevices, policyData, snapshot };
      $("#allowedDomainsModal").classList.add("show");
      setTimeout(() => $("#confirmAllowedBtn").focus(), 50);
      return;
    }

    savePolicy({ dependentId, depDevices, policyData, snapshot });
  }

  function closeAllowedModal() {
    const modal = $("#allowedDomainsModal");
    if (!modal.classList.contains("show")) return;
    modal.classList.remove("show");
    const pending = pendingSaveData;
    pendingSaveData = null;
    if (!pending) return;
    // Cancelou: desfaz a lista de permitidos e salva o resto normalmente.
    const draft = draftById[pending.dependentId];
    if (draft) draft.allowedDomains = [...(savedById[pending.dependentId]?.allowedDomains || [])];
    if (pending.dependentId === selectedId) renderSites("allowed");
    if (pending.dependentId === selectedId) renderSites("blocked");
    updateSaveBar();
  }

  function confirmAndSave() {
    if (!pendingSaveData) return;
    const data = pendingSaveData;
    pendingSaveData = null;
    $("#allowedDomainsModal").classList.remove("show");
    savePolicy(data);
  }

  async function savePolicy({ dependentId, depDevices, policyData, snapshot }) {
    saving = true;
    if (dependentId === selectedId) updateSaveBar();
    try {
      for (const device of depDevices) {
        await policy.update(device.id, policyData);
      }
      saveFailed = false;
      savedById[dependentId] = snapshot;
      if (!isDirty(dependentId)) delete draftById[dependentId];
    } catch (error) {
      const errorEl = panel.querySelector("#polError");
      if (errorEl && dependentId === selectedId) errorEl.textContent = error.message;
      if (!saveFailed) showToast("Não foi possível salvar. Tentando de novo…", "error");
      saveFailed = true;
    } finally {
      saving = false;
      renderPicker();
      if (dependentId === selectedId) updateSaveBar();
    }
  }

  window.addEventListener("beforeunload", (e) => {
    if (saving || Object.keys(saveTimers).length) {
      e.preventDefault();
      e.returnValue = "";
    }
  });

  init();
})();

(function () {
  const layout = document.querySelector(".dashboard-layout");
  const sidebar = document.querySelector("#sidebar");
  const sidebarHeader = sidebar && sidebar.querySelector(".sidebar-header");
  if (!layout || !sidebar || !sidebarHeader) return;

  const mobile = window.matchMedia("(max-width: 900px)");
  const page = window.location.pathname.split("/").pop() || "index.html";
  const icon = (content) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${content}</svg>`;
  const icons = {
    home: icon('<path d="M3 10.5 12 3l9 7.5V20H3z"/><path d="M9 20v-6h6v6"/>'),
    children: icon('<circle cx="9" cy="8" r="3"/><path d="M3.5 20v-2a5.5 5.5 0 0 1 11 0v2z"/><path d="M16 5.5a3 3 0 0 1 0 5.8M17 13a5 5 0 0 1 3.5 4.8V20h-3"/>'),
    activity: icon('<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 16v-3m4 3V8m4 8v-5"/>'),
    rules: icon('<path d="M4 7h10m4 0h2M4 12h3m4 0h9M4 17h10m4 0h2"/><circle cx="16" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="16" cy="17" r="2"/>'),
    more: icon('<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>'),
    bell: icon('<path d="M18 8a6 6 0 0 0-12 0c0 7-2 7-2 9h16c0-2-2-2-2-9M10 20h4"/>'),
    close: icon('<path d="M5 5l14 14M19 5 5 19"/>'),
  };
  const items = [
    { href: "index.html", label: "Início", icon: icons.home },
    { href: "dependents.html", label: "Filhos", icon: icons.children },
    { href: "activity.html", label: "Atividade", icon: icons.activity },
    { href: "policies.html", label: "Regras", icon: icons.rules },
  ];

  const header = document.createElement("header");
  header.className = "app-mobile-header";
  header.innerHTML = `
    <a class="app-mobile-brand" href="index.html" aria-label="GuardIAn, início do painel">
      <img src="assets/logo.png" alt="GuardIAn">
    </a>
    <div class="app-mobile-header-actions">
      <a class="app-mobile-icon-button${page === "alerts.html" ? " is-active" : ""}" href="alerts.html" aria-label="Alertas"${page === "alerts.html" ? ' aria-current="page"' : ""}>${icons.bell}</a>
      <button class="app-mobile-icon-button app-menu-trigger" type="button" aria-label="Abrir menu" aria-controls="sidebar" aria-expanded="false">${icons.more}</button>
    </div>`;

  const nav = document.createElement("nav");
  nav.className = "app-mobile-nav";
  nav.setAttribute("aria-label", "Navegação principal");
  nav.innerHTML = items
    .map(
      (item) => `
        <a class="app-mobile-nav-item${page === item.href ? " is-active" : ""}" href="${item.href}"${page === item.href ? ' aria-current="page"' : ""}>
          ${item.icon}<span>${item.label}</span>
        </a>`,
    )
    .join("") + `
      <button class="app-mobile-nav-item app-menu-trigger${page === "devices.html" ? " is-active" : ""}" type="button" aria-controls="sidebar" aria-expanded="false">
        ${icons.more}<span>Mais</span>
      </button>`;

  const backdrop = document.createElement("div");
  backdrop.className = "app-mobile-backdrop";
  backdrop.hidden = true;

  const close = document.createElement("button");
  close.type = "button";
  close.className = "app-drawer-close";
  close.setAttribute("aria-label", "Fechar menu");
  close.innerHTML = icons.close;
  sidebarHeader.appendChild(close);

  document.body.insertBefore(header, layout);
  document.body.appendChild(backdrop);
  document.body.appendChild(nav);
  document.body.classList.add("has-app-navigation");

  const triggers = document.querySelectorAll(".app-menu-trigger");
  let opened = false;
  let lastTrigger = null;

  function setOpen(value, restoreFocus = true) {
    const wasOpen = opened;
    opened = mobile.matches && value;
    sidebar.classList.toggle("open", opened);
    sidebar.inert = mobile.matches && !opened;
    if (mobile.matches && !opened) sidebar.setAttribute("aria-hidden", "true");
    else sidebar.removeAttribute("aria-hidden");
    backdrop.hidden = !opened;
    document.body.classList.toggle("app-drawer-open", opened);
    triggers.forEach((trigger) => trigger.setAttribute("aria-expanded", String(opened)));

    if (opened) {
      requestAnimationFrame(() => {
        if (opened) close.focus({ preventScroll: true });
      });
    } else if (wasOpen && restoreFocus && lastTrigger) {
      lastTrigger.focus({ preventScroll: true });
    }
  }

  triggers.forEach((trigger) => {
    trigger.addEventListener("click", () => {
      lastTrigger = trigger;
      setOpen(!opened);
    });
  });
  close.addEventListener("click", () => setOpen(false));
  backdrop.addEventListener("click", () => setOpen(false));

  document.addEventListener("keydown", (event) => {
    if (!opened) return;
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      sidebar.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'),
    ).filter((element) => element.getClientRects().length);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  const syncLayout = () => setOpen(false, false);
  if (mobile.addEventListener) mobile.addEventListener("change", syncLayout);
  else mobile.addListener(syncLayout);
  syncLayout();
})();

/**
 * Guardian Dashboard - Utilities
 */

(function () {
  // ========== DOM Helpers ==========
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => document.querySelectorAll(selector);

  // ========== Theme ==========
  const THEME_STORAGE_KEY = "guardian_theme";

  function getPreferredTheme() {
    const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    if (storedTheme === "light" || storedTheme === "dark") {
      return storedTheme;
    }

    const prefersDark =
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    return prefersDark ? "dark" : "light";
  }

  function syncThemeToggleUI(theme) {
    const btn = $("#themeToggleBtn");
    if (!btn) return;

    const isDark = theme === "dark";
    const nextModeLabel = isDark ? "Ativar modo claro" : "Ativar modo escuro";

    btn.setAttribute("aria-pressed", String(isDark));
    btn.setAttribute("aria-label", nextModeLabel);
    btn.setAttribute("title", nextModeLabel);

    const icon = btn.querySelector(".theme-toggle-icon");
    if (icon) {
      icon.textContent = isDark ? "☀️" : "🌙";
    }
  }

  function applyTheme(theme, options = {}) {
    const normalizedTheme = theme === "dark" ? "dark" : "light";
    const { persist = false } = options;

    document.documentElement.setAttribute("data-theme", normalizedTheme);

    if (persist) {
      localStorage.setItem(THEME_STORAGE_KEY, normalizedTheme);
    }

    syncThemeToggleUI(normalizedTheme);
    window.dispatchEvent(
      new CustomEvent("guardian-theme-change", {
        detail: { theme: normalizedTheme },
      }),
    );

    return normalizedTheme;
  }

  function toggleTheme() {
    const currentTheme =
      document.documentElement.getAttribute("data-theme") ||
      getPreferredTheme();
    const nextTheme = currentTheme === "dark" ? "light" : "dark";
    return applyTheme(nextTheme, { persist: true });
  }

  function mountThemeToggle() {
    const sidebarHeader = $(".sidebar-header");
    if (!sidebarHeader) return;

    let toggleBtn = $("#themeToggleBtn");
    if (!toggleBtn) {
      toggleBtn = document.createElement("button");
      toggleBtn.type = "button";
      toggleBtn.id = "themeToggleBtn";
      toggleBtn.className = "theme-toggle-btn";
      toggleBtn.innerHTML =
        '<span class="theme-toggle-icon" aria-hidden="true"></span>';
      toggleBtn.addEventListener("click", toggleTheme);
      sidebarHeader.appendChild(toggleBtn);
    }

    const currentTheme =
      document.documentElement.getAttribute("data-theme") ||
      getPreferredTheme();
    syncThemeToggleUI(currentTheme);
  }

  function initTheme() {
    const htmlTheme = document.documentElement.getAttribute("data-theme");
    const initialTheme =
      htmlTheme === "dark" || htmlTheme === "light"
        ? htmlTheme
        : getPreferredTheme();

    applyTheme(initialTheme, { persist: false });
    mountThemeToggle();
  }

  // ========== Toast Notifications ==========
  let toastContainer = null;

  function initToasts() {
    if (!toastContainer) {
      toastContainer = document.createElement("div");
      toastContainer.className = "toast-container";
      document.body.appendChild(toastContainer);
    }
  }

  function showToast(message, type = "info") {
    initToasts();

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;

    const icons = {
      success: "✓",
      error: "✕",
      warning: "⚠",
      info: "ℹ",
    };

    toast.innerHTML = `
    <span class="toast-icon">${icons[type] || icons.info}</span>
    <span class="toast-message">${message}</span>
  `;

    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = "slideIn 0.3s ease reverse";
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // ========== Loading ==========
  function showLoading(message = "Carregando...") {
    let overlay = $("#loading-overlay");

    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "loading-overlay";
      overlay.className = "loading-overlay";
      overlay.innerHTML = `
      <div class="loading-spinner"></div>
      <p class="loading-text">${message}</p>
    `;
      document.body.appendChild(overlay);
    } else {
      overlay.querySelector(".loading-text").textContent = message;
      overlay.style.display = "flex";
    }
  }

  function hideLoading() {
    const overlay = $("#loading-overlay");
    if (overlay) {
      overlay.style.display = "none";
    }
  }

  // ========== Modal ==========
  function createModal(options) {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";

    overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h3 class="modal-title">${options.title || "Modal"}</h3>
        <button class="modal-close" type="button">&times;</button>
      </div>
      <div class="modal-body">
        ${options.content || ""}
      </div>
      ${
        options.footer !== false
          ? `
        <div class="modal-footer">
          <button class="btn btn-secondary modal-cancel">Cancelar</button>
          <button class="btn btn-primary modal-confirm">${options.confirmText || "Confirmar"}</button>
        </div>
      `
          : ""
      }
    </div>
  `;

    document.body.appendChild(overlay);

    // Show with animation
    requestAnimationFrame(() => overlay.classList.add("show"));

    // Close handlers
    const close = () => {
      overlay.classList.remove("show");
      setTimeout(() => overlay.remove(), 200);
    };

    overlay.querySelector(".modal-close").onclick = close;
    overlay.querySelector(".modal-cancel")?.addEventListener("click", close);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });

    return {
      element: overlay,
      close,
      onConfirm(callback) {
        overlay
          .querySelector(".modal-confirm")
          ?.addEventListener("click", () => {
            callback();
            close();
          });
      },
    };
  }

  function confirmModal(options) {
    return new Promise((resolve) => {
      const modal = createModal({
        title: options.title || "Confirmar",
        content: `<p>${options.message || "Tem certeza?"}</p>`,
        confirmText: options.confirmText || "Confirmar",
      });

      modal.onConfirm(() => resolve(true));
      modal.element.querySelector(".modal-cancel").onclick = () => {
        modal.close();
        resolve(false);
      };
    });
  }

  // ========== Date Helpers ==========
  function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString("pt-BR");
  }

  function formatDateTime(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString("pt-BR");
  }

  function formatRelativeTime(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "agora";
    if (diffMins < 60) return `${diffMins} min atrás`;
    if (diffHours < 24) return `${diffHours}h atrás`;
    if (diffDays < 7) return `${diffDays}d atrás`;
    return formatDate(dateString);
  }

  function getDateRangeForPeriod(period) {
    const now = new Date();
    const to = now.toISOString();
    let from;

    switch (period) {
      case "today":
        from = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
        ).toISOString();
        break;
      case "week":
        from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
        break;
      case "month":
        from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
        break;
      default:
        from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    }

    return { from, to };
  }

  // ========== String Helpers ==========
  function truncate(str, length = 50) {
    if (!str) return "";
    if (str.length <= length) return str;
    return str.substring(0, length) + "...";
  }

  function calculateAge(birthYear) {
    const currentYear = new Date().getFullYear();
    return currentYear - birthYear;
  }

  // ========== Number Helpers ==========
  function formatNumber(num) {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + "M";
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + "K";
    }
    return num.toString();
  }

  // ========== Auth Check ==========
  function requireAuth() {
    const token = localStorage.getItem("guardian_token");
    if (!token) {
      window.location.replace("login.html");
      return false;
    }
    return true;
  }

  // ========== Exports ==========
  window.GuardianUtils = {
    $,
    $$,
    initTheme,
    applyTheme,
    toggleTheme,
    showToast,
    showLoading,
    hideLoading,
    createModal,
    confirmModal,
    formatDate,
    formatDateTime,
    formatRelativeTime,
    getDateRangeForPeriod,
    truncate,
    calculateAge,
    formatNumber,
    requireAuth,
  };

  initTheme();
})();

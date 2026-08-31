/**
 * Guardian Dashboard - API Client
 * Integração com o backend Guardian
 */

(function () {
  // URL vazia = URL relativa. nginx faz proxy /api/ → Spring Boot :8080
  const API_BASE_URL = "";

  // ========== Utils ==========
  function getToken() {
    return localStorage.getItem("guardian_token");
  }

  function setToken(token) {
    localStorage.setItem("guardian_token", token);
  }

  function clearToken() {
    localStorage.removeItem("guardian_token");
    localStorage.removeItem("guardian_email");
  }

  function getEmail() {
    return localStorage.getItem("guardian_email");
  }

  function setEmail(email) {
    localStorage.setItem("guardian_email", email);
  }

  function isAuthenticated() {
    return !!getToken();
  }

  function extractErrorMessage(error) {
    if (!error || typeof error !== "object") {
      return null;
    }

    return error.mensagem || error.message || null;
  }

  async function parseJsonSafely(response) {
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  function normalizeDependent(dependent = {}) {
    const birthDate = dependent.birthDate ?? dependent.dataNascimento ?? null;
    const birthYearFromDate =
      typeof birthDate === "string" && birthDate.length >= 4
        ? Number(birthDate.slice(0, 4))
        : null;

    return {
      ...dependent,
      nickname: dependent.nickname ?? dependent.apelido,
      birthDate,
      sex: dependent.sex ?? dependent.sexo ?? null,
      birthYear:
        dependent.birthYear ?? dependent.anoNascimento ?? birthYearFromDate,
      createdAt: dependent.createdAt ?? dependent.criadoEm,
    };
  }

  function normalizeDevice(device = {}) {
    return {
      ...device,
      name: device.name ?? device.nome ?? device.nomeDispositivo,
      platform: device.platform ?? device.plataforma,
      dependentId: device.dependentId ?? device.dependenteId,
      dependentNickname: device.dependentNickname ?? device.apelidoDependente,
      enrolledAt: device.enrolledAt ?? device.vinculadoEm,
      lastSeenAt: device.lastSeenAt ?? device.ultimoAcessoEm,
    };
  }

  function parseDomainList(value) {
    if (!value) {
      return [];
    }

    if (Array.isArray(value)) {
      return value;
    }

    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return value
          .split(",")
          .map((domain) => domain.trim())
          .filter((domain) => domain.length > 0);
      }
    }

    return [];
  }

  function normalizePolicy(data = {}) {
    return {
      ...data,
      // O backend devolve "modo"; sem esta linha policies.html lia undefined
      // e caia no fallback "BLOCK", ignorando o modo realmente salvo.
      mode: data.mode ?? data.modo,
      riskThreshold: data.riskThreshold ?? data.limiteRisco,
      blockedDomains: data.blockedDomains ?? data.dominiosBloqueados,
      allowedDomains: data.allowedDomains ?? data.dominiosPermitidos,
      schoolModeEnabled: data.schoolModeEnabled ?? data.modoEscolaAtivo,
      schoolStart: data.schoolStart ?? data.escolaInicio,
      schoolEnd: data.schoolEnd ?? data.escolaFim,
      protectionEnabled: data.protectionEnabled ?? true,
    };
  }

  function normalizeSummary(data = {}) {
    return {
      ...data,
      totalEvents: data.totalEvents ?? data.totalEventos,
      sensitiveEvents: data.sensitiveEvents ?? data.eventosSensiveis,
      blockAttempts: data.blockAttempts ?? data.tentativasBloqueio,
    };
  }

  function normalizeVulnerabilityItem(item = {}) {
    return {
      ...item,
      day: item.day ?? item.dia,
      score: item.score ?? item.pontuacao,
    };
  }

  // ========== Base Fetch ==========
  async function apiFetch(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;

    const headers = {
      "Content-Type": "application/json",
      ...options.headers,
    };

    const token = getToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    // Handle 401 - redirect to login
    if (response.status === 401) {
      clearToken();
      window.location.href = "login.html";
      throw new Error("Sessão expirada");
    }

    return response;
  }

  async function apiGet(endpoint) {
    const response = await apiFetch(endpoint, { method: "GET" });

    if (!response.ok) {
      const error = await parseJsonSafely(response).catch(() => ({}));
      throw new Error(
        extractErrorMessage(error) ||
          `GET ${endpoint} failed: ${response.status}`,
      );
    }

    return parseJsonSafely(response);
  }

  async function apiPost(endpoint, data) {
    const response = await apiFetch(endpoint, {
      method: "POST",
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await parseJsonSafely(response).catch(() => ({}));
      throw new Error(
        extractErrorMessage(error) ||
          `POST ${endpoint} failed: ${response.status}`,
      );
    }

    // Some endpoints return 201 with no body
    return (await parseJsonSafely(response)) || {};
  }

  async function apiPut(endpoint, data) {
    const response = await apiFetch(endpoint, {
      method: "PUT",
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await parseJsonSafely(response).catch(() => ({}));
      throw new Error(
        extractErrorMessage(error) ||
          `PUT ${endpoint} failed: ${response.status}`,
      );
    }

    return (await parseJsonSafely(response)) || {};
  }

  async function apiDelete(endpoint) {
    const response = await apiFetch(endpoint, { method: "DELETE" });

    if (!response.ok) {
      const error = await parseJsonSafely(response).catch(() => ({}));
      throw new Error(
        extractErrorMessage(error) ||
          `DELETE ${endpoint} failed: ${response.status}`,
      );
    }

    return true;
  }

  // ========== Auth ==========
  const auth = {
    async login(email, password) {
      const response = await fetch(`${API_BASE_URL}/api/autenticacao/entrar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, senha: password }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Email ou senha incorretos");
        }
        const error = await parseJsonSafely(response).catch(() => ({}));
        throw new Error(extractErrorMessage(error) || "Erro ao fazer login");
      }

      const data = await response.json();
      setToken(data.token);
      setEmail(email);
      return data;
    },

    async register(email, password) {
      const response = await fetch(
        `${API_BASE_URL}/api/autenticacao/registrar`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, senha: password }),
        },
      );

      if (!response.ok) {
        if (response.status === 409) {
          throw new Error("Este email já está cadastrado");
        }
        const error = await parseJsonSafely(response).catch(() => ({}));
        throw new Error(extractErrorMessage(error) || "Erro ao criar conta");
      }

      return true;
    },

    logout() {
      clearToken();
      window.location.replace("login.html");
    },

    isAuthenticated,
    getEmail,
    getToken,
  };

  // ========== Dependents ==========
  const dependents = {
    async list() {
      const data = await apiGet("/api/dependentes");
      return Array.isArray(data) ? data.map(normalizeDependent) : [];
    },

    async create({ nickname, birthDate, sex }) {
      const data = await apiPost("/api/dependentes", {
        apelido: nickname,
        dataNascimento: birthDate,
        sexo: sex,
      });
      return normalizeDependent(data);
    },

    async get(id) {
      const data = await apiGet(`/api/dependentes/${id}`);
      return normalizeDependent(data);
    },
  };

  // ========== Devices ==========
  const devices = {
    async list() {
      const data = await apiGet("/api/dispositivos");
      return Array.isArray(data) ? data.map(normalizeDevice) : [];
    },

    async generateCode(dependentId) {
      const data = await apiPost(
        `/api/dispositivos/gerar-codigo/${dependentId}`,
        {},
      );
      return {
        ...data,
        code: data?.code ?? data?.codigo ?? null,
      };
    },

    async enroll(code, deviceInfo) {
      const payload = {
        codigo: code,
        nomeDispositivo:
          deviceInfo?.name || deviceInfo?.nomeDispositivo || "Dispositivo",
      };
      const data = await apiPost("/api/dispositivos/vincular", payload);
      return normalizeDevice(data);
    },

    async getByDependent(dependentId) {
      const all = await this.list();
      return all.filter((d) => d.dependentId === dependentId);
    },

    async remove(deviceId) {
      return apiDelete(`/api/dispositivos/${deviceId}`);
    },
  };

  // ========== Policy ==========
  const policy = {
    async get(deviceId) {
      const params = new URLSearchParams({ dispositivoId: deviceId });
      const data = await apiGet(`/api/politica/atual?${params}`);
      return normalizePolicy(data);
    },

    async update(deviceId, policyData) {
      const blockedDomains = parseDomainList(
        policyData.blockedDomains ?? policyData.dominiosBloqueados,
      );
      const allowedDomains = parseDomainList(
        policyData.allowedDomains ?? policyData.dominiosPermitidos,
      );

      const payload = {
        modo: policyData.mode,
        limiteRisco: policyData.riskThreshold,
        dominiosBloqueados: blockedDomains,
        dominiosPermitidos: allowedDomains,
        modoEscolaAtivo: Boolean(policyData.schoolModeEnabled),
        escolaInicio: policyData.schoolStart || null,
        escolaFim: policyData.schoolEnd || null,
      };

      const params = new URLSearchParams({ dispositivoId: deviceId });
      const data = await apiPut(`/api/politica?${params}`, payload);
      return normalizePolicy(data);
    },
  };

  // ========== Dashboard ==========
  const dashboard = {
    async getSummary(deviceId, from, to) {
      const params = new URLSearchParams({ dispositivoId: deviceId, from, to });
      const data = await apiGet(`/api/painel/resumo?${params}`);
      return normalizeSummary(data);
    },

    async getTopDomains(deviceId, from, to) {
      const params = new URLSearchParams({ dispositivoId: deviceId, from, to });
      return apiGet(`/api/painel/top-dominios?${params}`);
    },

    async getVulnerability(dependentId, from, to) {
      const params = new URLSearchParams({
        dependenteId: dependentId,
        from,
        to,
      });
      const data = await apiGet(`/api/painel/vulnerabilidade?${params}`);
      return Array.isArray(data) ? data.map(normalizeVulnerabilityItem) : [];
    },
  };

  // ========== Activity ==========
  // Histórico detalhado. Ao contrário do dashboard (que agrega por domínio),
  // cada item traz urlConteudo — a chave granular que identifica o vídeo/página
  // específica dentro de plataformas mistas como o YouTube.
  const activity = {
    async list(deviceId, options = {}) {
      const {
        from,
        to,
        page = 0,
        size = 50,
        search = "",
        label = "",
        type = "",
        minRisk = null,
      } = options;

      const params = new URLSearchParams({
        dispositivoId: deviceId,
        from,
        to,
        pagina: page,
        tamanho: size,
      });

      if (search) params.set("busca", search);
      if (label) params.set("rotulo", label);
      if (type) params.set("tipo", type);
      if (minRisk !== null && minRisk !== "") {
        params.set("riscoMinimo", minRisk);
      }

      const data = await apiGet(`/api/painel/atividades?${params}`);

      return {
        items: Array.isArray(data?.itens) ? data.itens : [],
        page: data?.pagina ?? 0,
        size: data?.tamanho ?? size,
        totalItems: data?.totalItens ?? 0,
        totalPages: data?.totalPaginas ?? 0,
        summary: {
          totalAccesses: data?.resumo?.totalAcessos ?? 0,
          riskyAccesses: data?.resumo?.acessosRisco ?? 0,
          blockAttempts: data?.resumo?.tentativasBloqueio ?? 0,
          distinctDomains: data?.resumo?.dominiosDistintos ?? 0,
        },
      };
    },

    async labels(deviceId) {
      const params = new URLSearchParams({ dispositivoId: deviceId });
      const data = await apiGet(`/api/painel/atividades/rotulos?${params}`);
      return Array.isArray(data) ? data : [];
    },
  };

  // ========== Alerts ==========
  const alerts = {
    async list({ page = 0, size = 20, unreadOnly = false, type = "" } = {}) {
      const params = new URLSearchParams({
        pagina: page,
        tamanho: size,
        apenasNaoLidos: unreadOnly,
      });
      if (type) params.set("tipo", type);

      const data = await apiGet(`/api/alertas?${params}`);

      return {
        items: Array.isArray(data?.itens) ? data.itens : [],
        page: data?.pagina ?? 0,
        size: data?.tamanho ?? size,
        totalItems: data?.totalItens ?? 0,
        totalPages: data?.totalPaginas ?? 0,
        unread: data?.naoLidos ?? 0,
      };
    },

    async markRead(alertId) {
      const response = await apiFetch(`/api/alertas/${alertId}/lido`, {
        method: "PATCH",
      });
      return response.ok;
    },

    async markAllRead() {
      const response = await apiFetch("/api/alertas/lidos", {
        method: "PATCH",
      });
      if (!response.ok) throw new Error("Não foi possível marcar como lidos");
      const data = await parseJsonSafely(response);
      return data?.marcados ?? 0;
    },

    async getPreferences() {
      const data = await apiGet("/api/alertas/preferencias");
      return {
        blockAttempts: Boolean(data?.tentativasBloqueio),
        sensitiveContent: Boolean(data?.conteudoSensivel),
        dailySummary: Boolean(data?.resumoDiario),
        emailTarget: data?.emailDestino ?? "",
        emailEnabled: Boolean(data?.emailHabilitado),
      };
    },

    async updatePreferences({ blockAttempts, sensitiveContent, dailySummary }) {
      const data = await apiPut("/api/alertas/preferencias", {
        tentativasBloqueio: Boolean(blockAttempts),
        conteudoSensivel: Boolean(sensitiveContent),
        resumoDiario: Boolean(dailySummary),
      });
      return {
        blockAttempts: Boolean(data?.tentativasBloqueio),
        sensitiveContent: Boolean(data?.conteudoSensivel),
        dailySummary: Boolean(data?.resumoDiario),
        emailTarget: data?.emailDestino ?? "",
        emailEnabled: Boolean(data?.emailHabilitado),
      };
    },

    async sendTestEmail() {
      const data = await apiPost("/api/alertas/preferencias/testar-email", {});
      return { sent: Boolean(data?.enviado), message: data?.mensagem ?? "" };
    },

    async sendSummaryNow() {
      const data = await apiPost("/api/alertas/preferencias/enviar-resumo", {});
      return { sent: Boolean(data?.enviado), message: data?.mensagem ?? "" };
    },
  };

  // ========== Exports ==========
  window.GuardianAPI = {
    auth,
    dependents,
    devices,
    policy,
    dashboard,
    activity,
    alerts,
  };
})();

/**
 * Guardian Dashboard - API Client
 * Integração com o backend Guardian
 */

(function () {
  // URL vazia = URL relativa. nginx faz proxy /api/ → Spring Boot :8080
  const API_BASE_URL = "";

  // MODO MOCK — liga dados fake sem precisar do backend. Ideal para prints/demo.
  // Para voltar a usar o backend real, mude para false.
  const MOCK_MODE = false;

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

  // ========== Mock Data ==========
  function isoDaysAgo(days, hour = 12, minute = 0) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    d.setHours(hour, minute, 0, 0);
    return d.toISOString();
  }

  const mockDB = {
    dependentes: [
      {
        id: "1",
        apelido: "Sofia",
        dataNascimento: "2014-05-12",
        sexo: "FEMININO",
        criadoEm: isoDaysAgo(180),
      },
      {
        id: "2",
        apelido: "Lucas",
        dataNascimento: "2016-08-20",
        sexo: "MASCULINO",
        criadoEm: isoDaysAgo(120),
      },
    ],
    dispositivos: [
      {
        id: "a1b2c3d4-e5f6-notebook-sofia",
        nomeDispositivo: "Chrome - Notebook da Sofia",
        plataforma: "Windows",
        dependenteId: "1",
        apelidoDependente: "Sofia",
        vinculadoEm: isoDaysAgo(179),
        ultimoAcessoEm: isoDaysAgo(0, new Date().getHours(), 2),
      },
      {
        id: "b2c3d4e5-f6a7-tablet-lucas",
        nomeDispositivo: "Chrome - Tablet do Lucas",
        plataforma: "Android",
        dependenteId: "2",
        apelidoDependente: "Lucas",
        vinculadoEm: isoDaysAgo(119),
        ultimoAcessoEm: isoDaysAgo(0, 6, 30),
      },
    ],
    politicas: {
      "a1b2c3d4-e5f6-notebook-sofia": {
        modo: "WARN",
        limiteRisco: 60,
        dominiosBloqueados: ["apostas-online-exemplo.com", "chat-anonimo-exemplo.com"],
        dominiosPermitidos: ["khanacademy.org", "wikipedia.org"],
        modoEscolaAtivo: true,
        escolaInicio: "07:00",
        escolaFim: "17:00",
      },
      "b2c3d4e5-f6a7-tablet-lucas": {
        modo: "BLOCK",
        limiteRisco: 40,
        dominiosBloqueados: ["conteudo-adulto-exemplo.com"],
        dominiosPermitidos: ["youtube.com"],
        modoEscolaAtivo: false,
        escolaInicio: "07:00",
        escolaFim: "17:00",
      },
    },
    alertas: [
      {
        id: "al-1",
        titulo: "Tentativa de acesso bloqueada",
        mensagem: "Sofia tentou acessar apostas-online-exemplo.com e foi bloqueada.",
        severidade: "CRITICO",
        criadoEm: isoDaysAgo(0, 8, 15),
        lido: false,
        dependente: "Sofia",
        pontuacaoRisco: 88,
        emailEnviado: true,
        referencia: "apostas-online-exemplo.com",
        tipo: "BLOQUEIO",
      },
      {
        id: "al-2",
        titulo: "Conteúdo sensível detectado",
        mensagem: "Vídeo com risco moderado assistido por Lucas no YouTube.",
        severidade: "ATENCAO",
        criadoEm: isoDaysAgo(0, 6, 40),
        lido: false,
        dependente: "Lucas",
        pontuacaoRisco: 55,
        emailEnviado: false,
        referencia: "youtube.com",
        tipo: "CONTEUDO_SENSIVEL",
      },
      {
        id: "al-3",
        titulo: "Novo dispositivo vinculado",
        mensagem: "Tablet do Lucas foi vinculado com sucesso.",
        severidade: "POSITIVO",
        criadoEm: isoDaysAgo(119, 9, 0),
        lido: true,
        dependente: "Lucas",
        pontuacaoRisco: null,
        emailEnviado: false,
        referencia: null,
        tipo: "NOVO_DISPOSITIVO",
      },
      {
        id: "al-4",
        titulo: "Resumo diário disponível",
        mensagem: "O resumo de atividades de ontem já está pronto para consulta.",
        severidade: "INFO",
        criadoEm: isoDaysAgo(1, 20, 0),
        lido: true,
        dependente: null,
        pontuacaoRisco: null,
        emailEnviado: true,
        referencia: null,
        tipo: "RESUMO_DIARIO",
      },
      {
        id: "al-5",
        titulo: "Possível risco de aliciamento",
        mensagem: "Conversa em chat-anonimo-exemplo.com sinalizada para revisão.",
        severidade: "CRITICO",
        criadoEm: isoDaysAgo(2, 22, 10),
        lido: true,
        dependente: "Sofia",
        pontuacaoRisco: 92,
        emailEnviado: true,
        referencia: "chat-anonimo-exemplo.com",
        tipo: "CONTEUDO_SENSIVEL",
      },
    ],
    preferenciasAlertas: {
      tentativasBloqueio: true,
      conteudoSensivel: true,
      resumoDiario: false,
      emailDestino: "responsavel@exemplo.com",
      emailHabilitado: true,
    },
  };

  const MOCK_ACTIVITY_TEMPLATE = [
    { host: "youtube.com", titulo: "Aula de matemática - Frações", tipo: "NAVIGATION", acao: "ALLOW", rotulo: "SAFE", risco: 5 },
    { host: "wikipedia.org", titulo: "Sistema Solar", tipo: "NAVIGATION", acao: "ALLOW", rotulo: "SAFE", risco: 2 },
    { host: "roblox.com", titulo: "Adopt Me!", tipo: "NAVIGATION", acao: "ALLOW", rotulo: "SAFE", risco: 8 },
    { host: "khanacademy.org", titulo: "Introdução à Álgebra", tipo: "NAVIGATION", acao: "ALLOW", rotulo: "SAFE", risco: 1 },
    { host: "tiktok.com", titulo: "Vídeo curto de dança", tipo: "NAVIGATION", acao: "ALLOW", rotulo: "SAFE", risco: 15 },
    { host: "youtube.com", titulo: "Cena de ação com violência intensa", tipo: "NAVIGATION", acao: "WARN", rotulo: "VIOLENCE", risco: 62, chave: "youtube.com/watch?v=violenta1", mista: true },
    { host: "instagram.com", titulo: "Stories de amigos", tipo: "NAVIGATION", acao: "ALLOW", rotulo: "SAFE", risco: 10 },
    { host: "apostas-online-exemplo.com", titulo: "Página inicial de apostas", tipo: "BLOCK_ATTEMPT", acao: "BLOCK", rotulo: "GAMBLING", risco: 90 },
    { host: "conteudo-adulto-exemplo.com", titulo: null, tipo: "BLOCK_ATTEMPT", acao: "BLOCK", rotulo: "EXPLICIT", risco: 95 },
    { host: "youtube.com", titulo: "Filme de terror - trailer", tipo: "NAVIGATION", acao: "WARN", rotulo: "HORROR", risco: 58, chave: "youtube.com/watch?v=terror1", mista: true },
    { host: "discord.com", titulo: "Chat com colegas de jogo", tipo: "NAVIGATION", acao: "ALLOW", rotulo: "SAFE", risco: 20 },
    { host: "chat-anonimo-exemplo.com", titulo: "Sala de bate-papo anônimo", tipo: "PERMISSION_REQUEST", acao: "BLOCK", rotulo: "GROOMING_RISK", risco: 88 },
    { host: "twitch.tv", titulo: "Live de jogos", tipo: "NAVIGATION", acao: "ALLOW", rotulo: "SAFE", risco: 12 },
    { host: "google.com", titulo: "Pesquisa: como fazer slime", tipo: "NAVIGATION", acao: "ALLOW", rotulo: "SAFE", risco: 3 },
    { host: "youtube.com", titulo: "Vlog de dia a dia", tipo: "NAVIGATION", acao: "ALLOW", rotulo: "SAFE", risco: 6 },
  ];

  function generateMockActivities(deviceId, dependentNickname) {
    const items = [];
    const days = 14;
    let counter = 0;
    for (let day = 0; day < days; day++) {
      const perDay = 3 + (day % 3);
      for (let i = 0; i < perDay; i++) {
        const template = MOCK_ACTIVITY_TEMPLATE[counter % MOCK_ACTIVITY_TEMPLATE.length];
        counter++;
        items.push({
          id: `${deviceId}-act-${day}-${i}`,
          ocorridoEm: isoDaysAgo(day, 7 + i * 2, (i * 13) % 60),
          urlHost: template.host,
          urlConteudo: template.chave || template.host,
          plataformaMista: Boolean(template.mista),
          titulo: template.titulo,
          pontuacaoRisco: template.risco,
          rotulo: template.rotulo,
          acao: template.acao,
          tipo: template.tipo,
          dependente: dependentNickname,
        });
      }
    }
    return items.sort((a, b) => new Date(b.ocorridoEm) - new Date(a.ocorridoEm));
  }

  const mockActivityCache = {};
  function getMockActivities(deviceId) {
    if (!mockActivityCache[deviceId]) {
      const device = mockDB.dispositivos.find((d) => d.id === deviceId);
      mockActivityCache[deviceId] = generateMockActivities(
        deviceId,
        device?.apelidoDependente || "Dependente",
      );
    }
    return mockActivityCache[deviceId];
  }

  function mockDelay(value, ms = 300) {
    return new Promise((resolve) => setTimeout(() => resolve(value), ms));
  }

  let mockCodeCounter = 1000;
  const mockPendingCodes = {};

  function mockRoute(method, endpoint) {
    const url = new URL(endpoint, window.location.origin);
    const path = url.pathname;
    const params = url.searchParams;
    const parts = path.split("/").filter(Boolean); // ["api", ...]

    // ---- Dependentes ----
    if (path === "/api/dependentes" && method === "GET") {
      return { status: 200, data: mockDB.dependentes };
    }
    if (parts[0] === "api" && parts[1] === "dependentes" && parts[2] && method === "GET") {
      const found = mockDB.dependentes.find((d) => d.id === parts[2]);
      return { status: found ? 200 : 404, data: found || { mensagem: "Dependente não encontrado" } };
    }

    // ---- Dispositivos ----
    if (path === "/api/dispositivos" && method === "GET") {
      return { status: 200, data: mockDB.dispositivos };
    }
    if (parts[0] === "api" && parts[1] === "dispositivos" && parts[2] === "gerar-codigo" && method === "POST") {
      const dependentId = parts[3];
      const code = String(mockCodeCounter++);
      mockPendingCodes[code] = dependentId;
      return { status: 200, data: { codigo: code } };
    }
    if (parts[0] === "api" && parts[1] === "dispositivos" && parts[2] && method === "DELETE") {
      mockDB.dispositivos = mockDB.dispositivos.filter((d) => d.id !== parts[2]);
      return { status: 200, data: null };
    }

    // ---- Política ----
    if (path === "/api/politica/atual" && method === "GET") {
      const deviceId = params.get("dispositivoId");
      const found = mockDB.politicas[deviceId] || {
        modo: "WARN",
        limiteRisco: 50,
        dominiosBloqueados: [],
        dominiosPermitidos: [],
        modoEscolaAtivo: false,
        escolaInicio: "07:00",
        escolaFim: "17:00",
      };
      return { status: 200, data: found };
    }
    if (path === "/api/politica" && method === "PUT") {
      const deviceId = params.get("dispositivoId");
      // corpo já vem tratado por apiPut via JSON.stringify; recuperado em mockFetch
      return { status: 200, data: mockDB.politicas[deviceId] };
    }

    // ---- Dashboard ----
    if (path === "/api/painel/resumo" && method === "GET") {
      return {
        status: 200,
        data: { totalEventos: 187, eventosSensiveis: 12, tentativasBloqueio: 4 },
      };
    }
    if (path === "/api/painel/top-dominios" && method === "GET") {
      return {
        status: 200,
        data: [
          ["youtube.com", 142],
          ["google.com", 98],
          ["wikipedia.org", 45],
          ["roblox.com", 37],
          ["instagram.com", 25],
          ["tiktok.com", 22],
          ["khanacademy.org", 18],
          ["discord.com", 14],
        ],
      };
    }
    if (path === "/api/painel/vulnerabilidade" && method === "GET") {
      const scores = [12, 18, 15, 30, 22, 45, 60, 38, 25, 20, 55, 33, 28, 19];
      const data = scores.map((score, i) => ({
        dia: isoDaysAgo(scores.length - 1 - i).slice(0, 10),
        pontuacao: score,
      }));
      return { status: 200, data };
    }

    // ---- Atividades ----
    if (path === "/api/painel/atividades" && method === "GET") {
      const deviceId = params.get("dispositivoId");
      const page = Number(params.get("pagina") || 0);
      const size = Number(params.get("tamanho") || 50);
      const search = (params.get("busca") || "").toLowerCase();
      const label = params.get("rotulo") || "";
      const type = params.get("tipo") || "";
      const minRisk = params.get("riscoMinimo");

      let all = getMockActivities(deviceId);
      if (search) {
        all = all.filter(
          (a) =>
            a.urlHost.toLowerCase().includes(search) ||
            (a.titulo || "").toLowerCase().includes(search),
        );
      }
      if (label) all = all.filter((a) => a.rotulo === label);
      if (type) all = all.filter((a) => a.tipo === type);
      if (minRisk) all = all.filter((a) => (a.pontuacaoRisco || 0) >= Number(minRisk));

      const start = page * size;
      const items = all.slice(start, start + size);

      return {
        status: 200,
        data: {
          itens: items,
          pagina: page,
          tamanho: size,
          totalItens: all.length,
          totalPaginas: Math.ceil(all.length / size) || 1,
          resumo: {
            totalAcessos: all.length,
            acessosRisco: all.filter((a) => (a.pontuacaoRisco || 0) >= 60).length,
            tentativasBloqueio: all.filter((a) => a.acao === "BLOCK").length,
            dominiosDistintos: new Set(all.map((a) => a.urlHost)).size,
          },
        },
      };
    }
    if (path === "/api/painel/atividades/rotulos" && method === "GET") {
      return {
        status: 200,
        data: ["SAFE", "VIOLENCE", "HORROR", "EXPLICIT", "GROOMING_RISK", "DRUGS", "GAMBLING"],
      };
    }

    // ---- Alertas ----
    if (path === "/api/alertas" && method === "GET") {
      const page = Number(params.get("pagina") || 0);
      const size = Number(params.get("tamanho") || 20);
      const unreadOnly = params.get("apenasNaoLidos") === "true";
      let all = mockDB.alertas;
      if (unreadOnly) all = all.filter((a) => !a.lido);

      const start = page * size;
      const items = all.slice(start, start + size);

      return {
        status: 200,
        data: {
          itens: items,
          pagina: page,
          tamanho: size,
          totalItens: all.length,
          totalPaginas: Math.ceil(all.length / size) || 1,
          naoLidos: mockDB.alertas.filter((a) => !a.lido).length,
        },
      };
    }
    if (parts[0] === "api" && parts[1] === "alertas" && parts[3] === "lido" && method === "PATCH") {
      const alert = mockDB.alertas.find((a) => a.id === parts[2]);
      if (alert) alert.lido = true;
      return { status: 200, data: null };
    }
    if (path === "/api/alertas/lidos" && method === "PATCH") {
      let count = 0;
      mockDB.alertas.forEach((a) => {
        if (!a.lido) {
          a.lido = true;
          count++;
        }
      });
      return { status: 200, data: { marcados: count } };
    }
    if (path === "/api/alertas/preferencias" && method === "GET") {
      return { status: 200, data: mockDB.preferenciasAlertas };
    }
    if (path === "/api/alertas/preferencias" && method === "PUT") {
      return { status: 200, data: mockDB.preferenciasAlertas };
    }
    if (path === "/api/alertas/preferencias/testar-email" && method === "POST") {
      return { status: 200, data: { enviado: true, mensagem: "Email de teste enviado (mock)." } };
    }
    if (path === "/api/alertas/preferencias/enviar-resumo" && method === "POST") {
      return { status: 200, data: { enviado: true, mensagem: "Resumo enviado (mock)." } };
    }

    return { status: 404, data: { mensagem: `Mock: rota não implementada ${method} ${path}` } };
  }

  async function mockFetch(endpoint, options = {}) {
    const method = (options.method || "GET").toUpperCase();
    let body = null;
    if (options.body) {
      try {
        body = JSON.parse(options.body);
      } catch {
        body = null;
      }
    }

    // Aplica updates de política antes de rotear, pra devolver o objeto já atualizado
    if (endpoint.startsWith("/api/politica") && method === "PUT" && body) {
      const url = new URL(endpoint, window.location.origin);
      const deviceId = url.searchParams.get("dispositivoId");
      mockDB.politicas[deviceId] = { ...mockDB.politicas[deviceId], ...body };
    }
    if (endpoint === "/api/alertas/preferencias" && method === "PUT" && body) {
      mockDB.preferenciasAlertas = { ...mockDB.preferenciasAlertas, ...body };
    }
    if (endpoint === "/api/dependentes" && method === "POST" && body) {
      const novo = {
        id: String(mockDB.dependentes.length + 1),
        apelido: body.apelido,
        dataNascimento: body.dataNascimento,
        sexo: body.sexo,
        criadoEm: new Date().toISOString(),
      };
      mockDB.dependentes.push(novo);
      await mockDelay(null, 200);
      return new Response(JSON.stringify(novo), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (endpoint === "/api/dispositivos/vincular" && method === "POST" && body) {
      const dependentId = mockPendingCodes[body.codigo] || mockDB.dependentes[0]?.id || "1";
      const dependent = mockDB.dependentes.find((d) => d.id === dependentId);
      const novo = {
        id: `mock-device-${Date.now()}`,
        nomeDispositivo: body.nomeDispositivo || "Novo Dispositivo",
        plataforma: "Desconhecida",
        dependenteId: dependentId,
        apelidoDependente: dependent?.apelido || "Dependente",
        vinculadoEm: new Date().toISOString(),
        ultimoAcessoEm: null,
      };
      mockDB.dispositivos.push(novo);
      await mockDelay(null, 200);
      return new Response(JSON.stringify(novo), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { status, data } = mockRoute(method, endpoint);
    await mockDelay(null, 250);

    return new Response(data === null || data === undefined ? null : JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ========== Base Fetch ==========
  async function apiFetch(endpoint, options = {}) {
    if (MOCK_MODE) {
      return mockFetch(endpoint, options);
    }

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
      if (MOCK_MODE) {
        await mockDelay(null, 300);
        const data = { token: `mock-token-${Date.now()}` };
        setToken(data.token);
        setEmail(email);
        return data;
      }

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
      if (MOCK_MODE) {
        await mockDelay(null, 300);
        return true;
      }

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

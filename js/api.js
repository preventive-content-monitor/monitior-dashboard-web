/**
 * Guardian Dashboard - API Client
 * Integração com o backend Guardian
 */

(function () {
  // URL vazia = URL relativa. nginx faz proxy /api/ → Spring Boot :8080
  const API_BASE_URL = "";

  // Modo demonstração: digitar "demo" no painel liga/desliga os dados simulados.
  const DEMO_KEY = "guardian_demo";
  const MOCK_MODE = localStorage.getItem(DEMO_KEY) === "1";

  function setDemo(on) {
    if (on) localStorage.setItem(DEMO_KEY, "1");
    else localStorage.removeItem(DEMO_KEY);
    window.location.reload();
  }

  (function setupDemoShortcut() {
    let typed = "";
    document.addEventListener("keydown", (e) => {
      const t = e.target;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
      typed = (typed + e.key.toLowerCase()).slice(-4);
      if (typed === "demo") {
        typed = "";
        setDemo(!MOCK_MODE);
      }
    });
  })();

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
      age: dependent.idade ?? null,
      adulthoodDate: dependent.maioridadeEm ?? null,
      daysToAdulthood: dependent.diasParaMaioridade ?? null,
      monitoringEnded: !!dependent.monitoramentoEncerrado,
      deletionDate: dependent.exclusaoAgendadaEm ?? null,
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
      heartbeatAt: device.ultimoSinalEm ?? null,
      incognitoAllowed: device.anonimoPermitido ?? null,
      removedAt: device.removidoEm ?? null,
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

  function localDay(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function birthDateYearsAgo(years, extraDays = 0) {
    const d = new Date();
    d.setFullYear(d.getFullYear() - years);
    d.setDate(d.getDate() + extraDays);
    return localDay(d);
  }

  function minutesAgoIso(minutes) {
    return new Date(Date.now() - minutes * 60000).toISOString();
  }

  const mockDB = {
    dependentes: [
      { id: "1", apelido: "Sofia", dataNascimento: birthDateYearsAgo(12, -140), sexo: "FEMININO", criadoEm: isoDaysAgo(180) },
      { id: "2", apelido: "Lucas", dataNascimento: birthDateYearsAgo(10, -75), sexo: "MASCULINO", criadoEm: isoDaysAgo(150) },
      { id: "3", apelido: "Ana", dataNascimento: birthDateYearsAgo(7, -200), sexo: "FEMININO", criadoEm: isoDaysAgo(90) },
      // Faz 18 anos em 21 dias: mostra o aviso de maioridade na demo.
      { id: "4", apelido: "Pedro", dataNascimento: birthDateYearsAgo(18, 21), sexo: "MASCULINO", criadoEm: isoDaysAgo(200) },
    ],
    dispositivos: [
      { id: "demo-sofia-notebook", nomeDispositivo: "Chrome - Notebook da Sofia", plataforma: "Windows", dependenteId: "1", apelidoDependente: "Sofia", vinculadoEm: isoDaysAgo(179), sinalMin: 1, anonimoPermitido: true },
      { id: "demo-sofia-pc-quarto", nomeDispositivo: "Chrome - PC do quarto", plataforma: "Windows", dependenteId: "1", apelidoDependente: "Sofia", vinculadoEm: isoDaysAgo(60), sinalMin: 4, anonimoPermitido: true },
      { id: "demo-lucas-chromebook", nomeDispositivo: "Chrome - Chromebook do Lucas", plataforma: "ChromeOS", dependenteId: "2", apelidoDependente: "Lucas", vinculadoEm: isoDaysAgo(149), sinalMin: 2, anonimoPermitido: true },
      { id: "demo-lucas-pc-sala", nomeDispositivo: "Chrome - PC da sala", plataforma: "Windows", dependenteId: "2", apelidoDependente: "Lucas", vinculadoEm: isoDaysAgo(45), sinalMin: 6, anonimoPermitido: false },
      { id: "demo-ana-notebook", nomeDispositivo: "Chrome - Notebook da Ana", plataforma: "Windows", dependenteId: "3", apelidoDependente: "Ana", vinculadoEm: isoDaysAgo(89), sinalMin: 3, anonimoPermitido: true },
      { id: "demo-pedro-notebook", nomeDispositivo: "Chrome - Notebook do Pedro", plataforma: "Windows", dependenteId: "4", apelidoDependente: "Pedro", vinculadoEm: isoDaysAgo(199), sinalMin: 2, anonimoPermitido: true },
      { id: "demo-pedro-pc-gamer", nomeDispositivo: "Chrome - PC gamer do Pedro", plataforma: "Windows", dependenteId: "4", apelidoDependente: "Pedro", vinculadoEm: isoDaysAgo(120), sinalMin: 8, anonimoPermitido: true },
    ],
    politicas: {
      "demo-sofia-notebook": { modo: "BLOCK", limiteRisco: 55, dominiosBloqueados: ["omegle-exemplo.com", "chat-anonimo-exemplo.com", "conteudo-adulto-exemplo.com"], dominiosPermitidos: ["khanacademy.org", "wikipedia.org", "escola.sp.gov.br"], modoEscolaAtivo: true, escolaInicio: "07:00", escolaFim: "12:30" },
      "demo-sofia-pc-quarto": { modo: "BLOCK", limiteRisco: 55, dominiosBloqueados: ["omegle-exemplo.com", "chat-anonimo-exemplo.com"], dominiosPermitidos: ["wikipedia.org"], modoEscolaAtivo: false, escolaInicio: "07:00", escolaFim: "12:30" },
      "demo-lucas-chromebook": { modo: "BLOCK", limiteRisco: 40, dominiosBloqueados: ["skins-aposta-exemplo.com", "conteudo-adulto-exemplo.com"], dominiosPermitidos: ["youtube.com", "khanacademy.org"], modoEscolaAtivo: true, escolaInicio: "13:00", escolaFim: "18:00" },
      "demo-lucas-pc-sala": { modo: "WARN", limiteRisco: 45, dominiosBloqueados: ["skins-aposta-exemplo.com"], dominiosPermitidos: ["youtube.com"], modoEscolaAtivo: false, escolaInicio: "13:00", escolaFim: "18:00" },
      "demo-ana-notebook": { modo: "BLOCK", limiteRisco: 30, dominiosBloqueados: ["conteudo-adulto-exemplo.com", "tiktok.com"], dominiosPermitidos: ["youtubekids.com", "discoverykidsplus.com", "escolagames.com.br"], modoEscolaAtivo: false, escolaInicio: "07:00", escolaFim: "12:00" },
      "demo-pedro-notebook": { modo: "WARN", limiteRisco: 70, dominiosBloqueados: ["bet-rapida-exemplo.com", "cassino-online-exemplo.com"], dominiosPermitidos: ["github.com", "stackoverflow.com"], modoEscolaAtivo: true, escolaInicio: "07:00", escolaFim: "12:30" },
      "demo-pedro-pc-gamer": { modo: "WARN", limiteRisco: 70, dominiosBloqueados: ["bet-rapida-exemplo.com", "cassino-online-exemplo.com"], dominiosPermitidos: ["store.steampowered.com"], modoEscolaAtivo: false, escolaInicio: "07:00", escolaFim: "12:30" },
    },
    alertas: [],
    preferenciasAlertas: {
      tentativasBloqueio: true,
      conteudoSensivel: true,
      resumoDiario: true,
      emailDestino: "responsavel@exemplo.com",
      emailHabilitado: true,
    },
  };

  const SAFE = { tipo: "NAVIGATION", acao: "ALLOW", rotulo: "SAFE" };
  // Cada perfil tem sites com peso (w). Os de risco aparecem pouco, como na vida real.
  const MOCK_PROFILES = {
    "1": {
      perDay: [10, 18],
      sites: [
        { host: "instagram.com", titulos: ["Stories de amigos", "Reels de dança", "Perfil da escola"], w: 14, ...SAFE, risco: 12 },
        { host: "tiktok.com", titulos: ["Trend de dança", "Receita de bolo de caneca", "Dicas de maquiagem"], w: 14, ...SAFE, risco: 14 },
        { host: "youtube.com", titulos: ["Clipe de K-pop", "Aula de inglês", "Vlog de viagem"], w: 12, ...SAFE, risco: 6 },
        { host: "pinterest.com", titulos: ["Ideias de desenho", "Decoração de quarto"], w: 6, ...SAFE, risco: 3 },
        { host: "wikipedia.org", titulos: ["Revolução Francesa", "Célula animal"], w: 5, ...SAFE, risco: 1 },
        { host: "spotify.com", titulos: ["Playlist para estudar"], w: 6, ...SAFE, risco: 2 },
        { host: "google.com", titulos: ["Pesquisa: trabalho de geografia", "Pesquisa: como fazer slime"], w: 8, ...SAFE, risco: 2 },
        { host: "chat-anonimo-exemplo.com", titulos: ["Sala de bate-papo anônimo"], w: 0.5, tipo: "PERMISSION_REQUEST", acao: "BLOCK", rotulo: "GROOMING_RISK", risco: 91 },
        { host: "omegle-exemplo.com", titulos: ["Conversar com estranhos"], w: 0.4, tipo: "BLOCK_ATTEMPT", acao: "BLOCK", rotulo: "GROOMING_RISK", risco: 88 },
        { host: "youtube.com", titulos: ["Desafio perigoso viral"], w: 0.6, tipo: "NAVIGATION", acao: "WARN", rotulo: "VIOLENCE", risco: 64, chave: "youtube.com/watch?v=desafio1", mista: true },
        { host: "tiktok.com", titulos: ["Vídeo sobre dietas extremas"], w: 0.4, tipo: "NAVIGATION", acao: "WARN", rotulo: "OTHER", risco: 58, chave: "tiktok.com/@perfil/video/123", mista: true },
        { host: "conteudo-adulto-exemplo.com", titulos: [null], w: 0.2, tipo: "BLOCK_ATTEMPT", acao: "BLOCK", rotulo: "EXPLICIT", risco: 96 },
      ],
    },
    "2": {
      perDay: [8, 15],
      sites: [
        { host: "roblox.com", titulos: ["Adopt Me!", "Brookhaven", "Blox Fruits"], w: 16, ...SAFE, risco: 8 },
        { host: "youtube.com", titulos: ["Gameplay de Minecraft", "Como desenhar dragões", "Aula de matemática - Frações"], w: 14, ...SAFE, risco: 5 },
        { host: "minecraft.net", titulos: ["Download de mapas"], w: 6, ...SAFE, risco: 4 },
        { host: "khanacademy.org", titulos: ["Multiplicação", "Introdução à Álgebra"], w: 5, ...SAFE, risco: 1 },
        { host: "twitch.tv", titulos: ["Live de jogos"], w: 5, ...SAFE, risco: 12 },
        { host: "google.com", titulos: ["Pesquisa: dinossauros", "Pesquisa: códigos do Roblox"], w: 6, ...SAFE, risco: 2 },
        { host: "discord.com", titulos: ["Chat com colegas de jogo"], w: 3, ...SAFE, risco: 20 },
        { host: "youtube.com", titulos: ["Cena de ação com violência intensa"], w: 0.8, tipo: "NAVIGATION", acao: "WARN", rotulo: "VIOLENCE", risco: 66, chave: "youtube.com/watch?v=violenta1", mista: true },
        { host: "skins-aposta-exemplo.com", titulos: ["Roleta de skins"], w: 0.6, tipo: "BLOCK_ATTEMPT", acao: "BLOCK", rotulo: "GAMBLING", risco: 87 },
        { host: "youtube.com", titulos: ["Jogo de terror - gameplay"], w: 0.6, tipo: "NAVIGATION", acao: "WARN", rotulo: "HORROR", risco: 57, chave: "youtube.com/watch?v=terror1", mista: true },
      ],
    },
    "3": {
      perDay: [5, 10],
      sites: [
        { host: "youtubekids.com", titulos: ["Galinha Pintadinha", "Mundo Bita", "Peppa Pig"], w: 18, ...SAFE, risco: 2 },
        { host: "discoverykidsplus.com", titulos: ["Desenhos educativos"], w: 6, ...SAFE, risco: 1 },
        { host: "escolagames.com.br", titulos: ["Jogo das vogais", "Contando até 100"], w: 6, ...SAFE, risco: 1 },
        { host: "roblox.com", titulos: ["Obby colorido"], w: 4, ...SAFE, risco: 6 },
        { host: "google.com", titulos: ["Pesquisa: desenhos para colorir"], w: 3, ...SAFE, risco: 2 },
        { host: "youtube.com", titulos: ["Trailer de filme de terror"], w: 0.3, tipo: "NAVIGATION", acao: "WARN", rotulo: "HORROR", risco: 61, chave: "youtube.com/watch?v=terror2", mista: true },
        { host: "tiktok.com", titulos: [null], w: 0.3, tipo: "BLOCK_ATTEMPT", acao: "BLOCK", rotulo: "OTHER", risco: 52 },
      ],
    },
    "4": {
      perDay: [14, 24],
      sites: [
        { host: "youtube.com", titulos: ["Review de placa de vídeo", "Cursinho - Química", "Podcast de futebol"], w: 14, ...SAFE, risco: 6 },
        { host: "twitch.tv", titulos: ["Live de CS2", "Live de Valorant"], w: 10, ...SAFE, risco: 14 },
        { host: "store.steampowered.com", titulos: ["Promoção de jogos"], w: 6, ...SAFE, risco: 4 },
        { host: "reddit.com", titulos: ["r/brasil", "r/gamesEcultura"], w: 7, ...SAFE, risco: 18 },
        { host: "github.com", titulos: ["Projeto da escola"], w: 3, ...SAFE, risco: 1 },
        { host: "instagram.com", titulos: ["Feed de amigos"], w: 8, ...SAFE, risco: 10 },
        { host: "google.com", titulos: ["Pesquisa: vestibular 2026", "Pesquisa: placar do jogo"], w: 6, ...SAFE, risco: 2 },
        { host: "bet-rapida-exemplo.com", titulos: ["Aposta esportiva"], w: 1.2, tipo: "BLOCK_ATTEMPT", acao: "BLOCK", rotulo: "GAMBLING", risco: 92 },
        { host: "cassino-online-exemplo.com", titulos: ["Jogo do tigrinho"], w: 0.8, tipo: "BLOCK_ATTEMPT", acao: "BLOCK", rotulo: "GAMBLING", risco: 94 },
        { host: "reddit.com", titulos: ["Fórum sobre substâncias"], w: 0.5, tipo: "NAVIGATION", acao: "WARN", rotulo: "DRUGS", risco: 72, chave: "reddit.com/r/substancias", mista: true },
        { host: "youtube.com", titulos: ["Briga de rua filmada"], w: 0.6, tipo: "NAVIGATION", acao: "WARN", rotulo: "VIOLENCE", risco: 68, chave: "youtube.com/watch?v=briga1", mista: true },
      ],
    },
  };

  function seededRandom(seedText) {
    let seed = 0;
    for (let i = 0; i < seedText.length; i++) seed = (seed * 31 + seedText.charCodeAt(i)) | 0;
    return function () {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const MOCK_DAYS = 35;

  function generateMockActivities(device) {
    const profile = MOCK_PROFILES[device.dependenteId] || MOCK_PROFILES["2"];
    const rand = seededRandom(device.id);
    const totalWeight = profile.sites.reduce((sum, s) => sum + s.w, 0);
    const pick = () => {
      let r = rand() * totalWeight;
      for (const site of profile.sites) {
        r -= site.w;
        if (r <= 0) return site;
      }
      return profile.sites[0];
    };

    const now = Date.now();
    const items = [];
    for (let day = 0; day < MOCK_DAYS; day++) {
      const [min, max] = profile.perDay;
      const count = Math.round(min + rand() * (max - min));
      for (let i = 0; i < count; i++) {
        const site = pick();
        const hour = 7 + Math.floor(rand() * 16);
        const when = isoDaysAgo(day, hour, Math.floor(rand() * 60));
        if (new Date(when).getTime() > now) continue;
        items.push({
          id: `${device.id}-act-${day}-${i}`,
          ocorridoEm: when,
          urlHost: site.host,
          urlConteudo: site.chave || site.host,
          plataformaMista: Boolean(site.mista),
          titulo: site.titulos[Math.floor(rand() * site.titulos.length)],
          pontuacaoRisco: Math.max(0, Math.min(100, site.risco + Math.round((rand() - 0.5) * 8))),
          rotulo: site.rotulo,
          acao: site.acao,
          tipo: site.tipo,
          dependente: device.apelidoDependente,
        });
      }
    }
    return items.sort((a, b) => new Date(b.ocorridoEm) - new Date(a.ocorridoEm));
  }

  const mockActivityCache = {};
  function getMockActivities(deviceId) {
    if (!mockActivityCache[deviceId]) {
      const device = mockDB.dispositivos.find((d) => d.id === deviceId);
      mockActivityCache[deviceId] = device ? generateMockActivities(device) : [];
    }
    return mockActivityCache[deviceId];
  }

  function filterByRange(items, params) {
    const from = params.get("from") ? new Date(params.get("from")).getTime() : NaN;
    const to = params.get("to") ? new Date(params.get("to")).getTime() : NaN;
    return items.filter((a) => {
      const t = new Date(a.ocorridoEm).getTime();
      return (Number.isNaN(from) || t >= from) && (Number.isNaN(to) || t <= to);
    });
  }

  function decorateMockDependent(dep) {
    const birth = new Date(`${dep.dataNascimento}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let idade = today.getFullYear() - birth.getFullYear();
    const birthdayThisYear = new Date(today.getFullYear(), birth.getMonth(), birth.getDate());
    if (today < birthdayThisYear) idade--;
    const adulthood = new Date(birth.getFullYear() + 18, birth.getMonth(), birth.getDate());
    return {
      ...dep,
      idade,
      maioridadeEm: localDay(adulthood),
      diasParaMaioridade: Math.max(0, Math.round((adulthood - today) / 86400000)),
      monitoramentoEncerrado: false,
    };
  }

  function decorateMockDevice(device) {
    const { sinalMin, ...rest } = device;
    const last = minutesAgoIso(sinalMin ?? 2);
    return { ...rest, ultimoSinalEm: last, ultimoAcessoEm: last };
  }

  function buildMockAlerts() {
    const list = [];
    let seq = 1;
    const add = (alert) => list.push({ id: `demo-al-${seq++}`, emailEnviado: false, pontuacaoRisco: null, referencia: null, ...alert });

    // Avisos de risco tirados das próprias atividades (no máx. 1 por site por dia).
    const seen = new Set();
    mockDB.dispositivos.forEach((device) => {
      getMockActivities(device.id).forEach((act) => {
        const ageDays = (Date.now() - new Date(act.ocorridoEm).getTime()) / 86400000;
        if (ageDays > 21) return;
        const blocked = act.acao === "BLOCK";
        if (!blocked && act.pontuacaoRisco < 55) return;
        const key = `${act.dependente}|${act.urlHost}|${act.rotulo}|${act.ocorridoEm.slice(0, 10)}`;
        if (seen.has(key)) return;
        seen.add(key);
        add(
          blocked
            ? {
                tipo: "TENTATIVA_BLOQUEIO",
                severidade: "CRITICO",
                titulo: "Tentativa de acesso bloqueado",
                mensagem: `${act.dependente} tentou acessar ${act.urlHost}, que está bloqueado pela política do dispositivo.`,
                criadoEm: act.ocorridoEm,
                dependente: act.dependente,
                pontuacaoRisco: act.pontuacaoRisco,
                referencia: act.urlHost,
                emailEnviado: true,
                lido: ageDays > 2,
              }
            : {
                tipo: "CONTEUDO_SENSIVEL",
                severidade: act.pontuacaoRisco >= 70 ? "CRITICO" : "ATENCAO",
                titulo: "Conteúdo sensível detectado",
                mensagem: `${act.dependente} acessou conteúdo classificado como ${act.rotulo} em ${act.urlHost}.`,
                criadoEm: act.ocorridoEm,
                dependente: act.dependente,
                pontuacaoRisco: act.pontuacaoRisco,
                referencia: act.urlHost,
                emailEnviado: act.pontuacaoRisco >= 70,
                lido: ageDays > 2,
              },
        );
      });
    });

    const pedro = decorateMockDependent(mockDB.dependentes.find((d) => d.id === "4"));
    const [y, m, d] = pedro.maioridadeEm.split("-");
    add({
      tipo: "MAIORIDADE",
      severidade: "INFO",
      titulo: `Pedro faz 18 anos em ${pedro.diasParaMaioridade} dia(s)`,
      mensagem: `Em ${d}/${m}/${y} Pedro deixa de ser menor de idade e o monitoramento será encerrado automaticamente.`,
      criadoEm: isoDaysAgo(0, 6, 0),
      dependente: "Pedro",
      emailEnviado: true,
      lido: false,
    });
    add({
      tipo: "PROTECAO",
      severidade: "ATENCAO",
      titulo: "Guia anônima sem proteção no computador de Lucas",
      mensagem: "A guia anônima do Chrome não está protegida. Ative \"Permitir no modo anônimo\" na extensão.",
      criadoEm: isoDaysAgo(1, 19, 12),
      dependente: "Lucas",
      referencia: "Chrome - PC da sala",
      emailEnviado: true,
      lido: false,
    });
    add({
      tipo: "PROTECAO",
      severidade: "CRITICO",
      titulo: "Palavra-chave errada no computador de Pedro",
      mensagem: "Alguém errou a palavra-chave 3 vezes tentando abrir as configurações do GuardIAn.",
      criadoEm: isoDaysAgo(3, 23, 41),
      dependente: "Pedro",
      referencia: "Chrome - PC gamer do Pedro",
      emailEnviado: true,
      lido: true,
    });
    add({
      tipo: "NOVO_DISPOSITIVO",
      severidade: "POSITIVO",
      titulo: "Novo dispositivo conectado",
      mensagem: "Chrome - PC da sala foi vinculado a Lucas.",
      criadoEm: isoDaysAgo(45, 18, 5),
      dependente: "Lucas",
      referencia: "Chrome - PC da sala",
      lido: true,
    });
    for (let day = 1; day <= 7; day++) {
      add({
        tipo: "RESUMO_DIARIO",
        severidade: "INFO",
        titulo: "Resumo diário disponível",
        mensagem: "O resumo das atividades da família já está pronto para consulta.",
        criadoEm: isoDaysAgo(day, 21, 0),
        dependente: null,
        emailEnviado: true,
        lido: day > 1,
      });
    }

    return list.sort((a, b) => new Date(b.criadoEm) - new Date(a.criadoEm));
  }

  mockDB.alertas = buildMockAlerts();

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
      return { status: 200, data: mockDB.dependentes.map(decorateMockDependent) };
    }
    if (parts[0] === "api" && parts[1] === "dependentes" && parts[2] && method === "GET") {
      const found = mockDB.dependentes.find((d) => d.id === parts[2]);
      return { status: found ? 200 : 404, data: found ? decorateMockDependent(found) : { mensagem: "Dependente não encontrado" } };
    }
    if (parts[0] === "api" && parts[1] === "dependentes" && parts[2] && method === "DELETE") {
      mockDB.dependentes = mockDB.dependentes.filter((d) => d.id !== parts[2]);
      mockDB.dispositivos = mockDB.dispositivos.filter((d) => d.dependenteId !== parts[2]);
      return { status: 204, data: null };
    }

    // ---- Dispositivos ----
    if (path === "/api/dispositivos" && method === "GET") {
      return { status: 200, data: mockDB.dispositivos.map(decorateMockDevice) };
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
      const items = filterByRange(getMockActivities(params.get("dispositivoId")), params);
      const blocked = items.filter((a) => a.acao === "BLOCK").length;
      const sensitive = items.filter((a) => a.acao !== "BLOCK" && a.rotulo !== "SAFE").length;
      return {
        status: 200,
        data: { totalEventos: items.length, eventosSensiveis: sensitive, tentativasBloqueio: blocked },
      };
    }
    if (path === "/api/painel/top-dominios" && method === "GET") {
      const counts = new Map();
      filterByRange(getMockActivities(params.get("dispositivoId")), params).forEach((a) => {
        counts.set(a.urlHost, (counts.get(a.urlHost) || 0) + 1);
      });
      return { status: 200, data: [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10) };
    }
    if (path === "/api/painel/vulnerabilidade" && method === "GET") {
      const dependentId = params.get("dependenteId");
      const byDay = new Map();
      mockDB.dispositivos
        .filter((d) => d.dependenteId === dependentId)
        .forEach((d) => {
          getMockActivities(d.id).forEach((a) => {
            const day = localDay(new Date(a.ocorridoEm));
            if (!byDay.has(day)) byDay.set(day, []);
            byDay.get(day).push(a.pontuacaoRisco || 0);
          });
        });
      const fromDay = (params.get("from") || "0000-00-00").slice(0, 10);
      const toDay = (params.get("to") || "9999-99-99").slice(0, 10);
      const data = [...byDay.entries()]
        .filter(([day]) => day >= fromDay && day <= toDay)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([day, scores]) => {
          const risky = scores.filter((s) => s >= 50);
          const peak = Math.max(...scores);
          const score = risky.length ? 10 + risky.length * 8 + peak * 0.35 : 4 + (scores.length % 9);
          return { dia: day, pontuacao: Math.min(95, Math.round(score)) };
        });
      return { status: 200, data };
    }

    // ---- Proteção ----
    if (path === "/api/protecao/palavra-chave") {
      return { status: 200, data: { definida: true } };
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

      let all = filterByRange(getMockActivities(deviceId), params);
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
      if (params.get("tipo")) all = all.filter((a) => a.tipo === params.get("tipo"));

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
    const depPut = endpoint.match(/^\/api\/dependentes\/([^/?]+)$/);
    if (depPut && method === "PUT" && body) {
      const dep = mockDB.dependentes.find((d) => d.id === depPut[1]);
      if (dep) Object.assign(dep, { apelido: body.apelido, dataNascimento: body.dataNascimento, sexo: body.sexo });
      return new Response(JSON.stringify(dep || { mensagem: "Dependente não encontrado" }), {
        status: dep ? 200 : 404,
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

    async logout() {
      try {
        await window.GuardianFlow.logout("login.html");
      } catch (error) {
        alert(error.message);
        clearToken();
        window.location.replace("login.html");
      }
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

    async update(id, { nickname, birthDate, sex }) {
      const data = await apiPut(`/api/dependentes/${id}`, {
        apelido: nickname,
        dataNascimento: birthDate,
        sexo: sex,
      });
      return normalizeDependent(data);
    },

    async remove(id) {
      return apiDelete(`/api/dependentes/${id}`);
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
    isDemo: () => MOCK_MODE,
    setDemo,
    mockFetch,
  };
})();

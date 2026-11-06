# monitor-dashboard-web — Painel Web do Responsável (GuardIAn)

Dashboard HTML/CSS/JS puro para o **responsável** (pai/tutor) configurar políticas, visualizar relatórios e gerenciar dispositivos. Servido pelo nginx na EC2.

---

## Visão Geral

| Atributo | Valor |
|----------|-------|
| Tecnologia | HTML5 / CSS3 / JavaScript (sem framework) |
| Hospedagem | nginx na EC2, por HTTPS |
| API Backend | `https://<EC2-IP>/api` (proxy para Spring Boot em `127.0.0.1:8080`) |
| Landing pública | `https://<EC2-IP>/` |
| Acesso ao painel | `https://<EC2-IP>/dashboard/` |
| Autenticação | JWT Bearer Token (armazenado em `localStorage`) |

> O deploy publica a landing e o painel na EC2 e exige um certificado HTTPS válido.

---

## Páginas

| Arquivo | Rota | Função |
|---------|------|--------|
| `login.html` | `/login.html` | Login do responsável — obtém JWT |
| `index.html` | `/` | Métricas gerais e gráficos de atividade |
| `dependents.html` | `/dependents.html` | Criar e gerenciar dependentes |
| `devices.html` | `/devices.html` | Gerenciar dispositivos, gerar código de vínculo |
| `policies.html` | `/policies.html` | Configurar políticas por dispositivo (modo, threshold, domínios bloqueados) |
| `alerts.html` | `/alerts.html` | Ver alertas gerados pela IA (conteúdo de alto risco) |
| `activity.html` | `/activity.html` | Histórico de navegação classificada por dispositivo |

---

## Fluxo de Uso

### 1. Primeiro acesso

1. Acesse `https://<EC2-IP>/dashboard/` ou clique em **Entrar no painel** na landing pública
2. Clique em "Criar conta" ou vá para `login.html`
3. Crie uma conta com e-mail e senha
4. Faça login — o JWT é armazenado localmente

### 2. Configuração inicial

1. Em `dependents.html`: crie um dependente (apelido, data de nascimento)
2. Em `devices.html`: registre um dispositivo para o dependente e gere o **código de vínculo**
3. No navegador do dependente: clique no ícone do Guardian, entre com a mesma conta do painel e insira o código na janelinha
4. Em `policies.html`: configure a política do dispositivo (modo BLOCK/WARN/EDUCATE, threshold de risco, domínios manuais)

### 3. Monitoramento

- `index.html`: resumo de eventos, classificações e riscos do dia
- `activity.html`: histórico completo de navegação com classificação da IA (SEGURO / SUSPEITO / NOCIVO)
- `alerts.html`: alertas enviados por SNS (conteúdo de alto risco detectado)

---

## Comunicação com o Backend

Todas as chamadas usam o caminho relativo `/api/` que o nginx redireciona para o Spring Boot:

```javascript
// Exemplos de chamadas do dashboard
GET  /api/dependentes          → lista dependentes do responsável logado
POST /api/dependentes          → cria novo dependente
GET  /api/dispositivos         → lista dispositivos
POST /api/dispositivos/gerar-codigo/{id} → gera código de vínculo (5 min)
GET  /api/politica/atual?dispositivoId={id} → obtém política do dispositivo
PUT  /api/politica             → atualiza política
GET  /api/metricas             → métricas para o painel
GET  /api/alertas              → lista alertas de risco alto
```

**Autenticação:** todas as requisições (exceto login/register) incluem:
```http
Authorization: Bearer <jwt-token>
```

---

## Onboarding por tipo de computador

Depois do login na landing, a escolha do computador define o tutorial:

| Escolha | O que acontece |
|---|---|
| Computador do menor | Baixa e instala a extensão; o painel não abre sem nova autenticação. Com a extensão detectada, o responsável escolhe o filho e vincula com um clique (ou usa um código gerado no próprio painel). Também oferece “usamos o mesmo computador” e “continuar no meu computador”. |
| Computador do responsável | Abre o painel em outra aba e destaca o cadastro do dependente. A extensão é opcional; o tutorial ensina a terminar no computador do filho. |
| Os dois no mesmo computador | Primeiro o painel (cadastrar o filho), depois baixar/instalar a extensão e vincular com um clique. |

Ao escolher “menor”, o servidor revoga todas as sessões do responsável, inclusive
as abertas em outros computadores, e concede apenas uma autorização temporária
sem acesso ao painel. O responsável precisa fazer login novamente no seu PC.
Para abrir o painel neste computador, é necessário confirmar e-mail e senha.
Após o vínculo, apenas a credencial limitada do dispositivo fica na extensão.

---

## Vincular outros dependentes ou computadores

O tutorial obrigatório termina após a primeira vinculação. Para os próximos
dependentes, o botão **Vincular** no cartão de cada filho continua mostrando um
guia: em qual computador fazer a configuração, como instalar a extensão, abrir
a janelinha pelo ícone do Guardian e entrar com a mesma conta do responsável.

O código é gerado no painel, não na extensão, e pode ser copiado ou digitado em
outro PC. Ele expira em cinco minutos; depois de instalar a extensão, gere outro
se necessário. O link de instalação abre o onboarding em outra aba, sem fechar o
painel. Em outro computador, acesse o endereço mostrado, faça login e escolha
**Instalar a extensão neste computador**. Esse guia também permite selecionar o
dependente e vincular automaticamente, sem digitar o código.

Cada perfil do navegador protege um dependente por vez. Para outro filho, use
outro computador ou um perfil separado; não desconecte o primeiro dispositivo.
Ao terminar no computador do filho, a autorização temporária é encerrada sem
desconectar o dispositivo. Em computador compartilhado, saia também do painel
após usá-lo; enquanto a sessão do responsável estiver aberta, ela permite acesso.

---

## Deploy

O deploy é feito pelo script `Infraetrutura/infra/8° - deploy-front-monitior-dashboard-web/deploy-front.ps1`.
Ele publica a landing em `/`, o dashboard em `/dashboard/` e o ZIP da extensão
em `/downloads/`. Instalações antigas precisam ser atualizadas e reautorizadas.

---

## Assets

```
monitor-dashboard-web/
├── index.html          ← Painel principal com métricas
├── login.html          ← Login do responsável
├── dependents.html     ← Gestão de dependentes
├── devices.html        ← Gestão de dispositivos e enrollment
├── policies.html       ← Configuração de políticas por dispositivo
├── alerts.html         ← Alertas de risco gerados pela IA
├── activity.html       ← Histórico de navegação classificada
├── assets/             ← Imagens e ícones
├── css/
│   ├── style.css       ← Estilos globais
│   └── variables.css   ← Variáveis CSS (cores, fontes)
└── js/
    ├── api.js          ← Funções de integração com a API REST
    └── utils.js        ← Utilitários compartilhados (formatação, datas, etc.)

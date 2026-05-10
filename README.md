# monitior-dashboard-web — Painel Web do Responsável (GuardIAn)

Dashboard HTML/CSS/JS puro para o **responsável** (pai/tutor) configurar políticas, visualizar relatórios e gerenciar dispositivos. Servido pelo nginx na EC2.

---

## Visão Geral

| Atributo | Valor |
|----------|-------|
| Tecnologia | HTML5 / CSS3 / JavaScript (sem framework) |
| Hospedagem | nginx na EC2 (porta 80), servido como arquivos estáticos |
| API Backend | `http://<EC2-IP>/api` (nginx faz proxy `/api/` → Spring Boot :8080) |
| Acesso | `http://<EC2-IP>` — ver `terraform output dashboard_url` |
| Autenticação | JWT Bearer Token (armazenado em `localStorage`) |

> Os arquivos são enviados para o S3 (`guardian-logs-<account>/dashboard/`) durante o deploy e baixados para `/usr/share/nginx/html/` pelo `ec2_userdata.sh` na inicialização da EC2.

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

1. Acesse `http://<EC2-IP>` (URL do `terraform output dashboard_url`)
2. Clique em "Criar conta" ou vá para `login.html`
3. Crie uma conta com e-mail e senha
4. Faça login — o JWT é armazenado localmente

### 2. Configuração inicial

1. Em `dependents.html`: crie um dependente (apelido, data de nascimento)
2. Em `devices.html`: registre um dispositivo para o dependente e gere o **código de vínculo**
3. No Chrome do dependente: abra as Opções da extensão, insira o código
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
POST /api/dispositivos/{id}/vincular → gera código de vínculo (5 min)
GET  /api/politica?dispositivoId={id} → obtém política do dispositivo
PUT  /api/politica             → atualiza política
GET  /api/metricas             → métricas para o painel
GET  /api/alertas              → lista alertas de risco alto
```

**Autenticação:** todas as requisições (exceto login/register) incluem:
```http
Authorization: Bearer <jwt-token>
```

---

## Deploy

Os arquivos do dashboard são enviados ao S3 durante o deploy:

```powershell
# Upload para S3 (feito pelo operador antes do terraform apply)
aws s3 sync monitior-dashboard-web/ s3://guardian-logs-750476866422/dashboard/ --delete
```

A EC2 baixa automaticamente esses arquivos no boot via `ec2_userdata.sh`:

```bash
aws s3 sync s3://${s3_bucket}/dashboard/ /usr/share/nginx/html/ --region ${aws_region}
```

---

## Assets

```
monitior-dashboard-web/
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

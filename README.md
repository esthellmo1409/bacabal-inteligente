# CidadeHub

Plataforma **multi-tenant** de cidade inteligente para prefeituras brasileiras.

> Vale a pena desenvolver? **Sim** — desde que seja produto escalável, não um sistema exclusivo de uma cidade.

Bacabal é o case piloto. O mesmo core serve qualquer município: cores, logo, secretarias, categorias e usuários em poucos passos.

## Arquitetura multi-tenant

```
data/
  platform.json          → super admin da plataforma
  municipios.json        → catálogo de clientes
  tenants/
    bacabal/             → dados isolados
    imperatriz/
    caxias/              → novo cliente = nova pasta
```

Cada tenant tem: config (marca/GPS), secretarias, categorias, usuários, chamados, obras.

## Como rodar

```bash
cd bacabal-inteligente
# limpar seed antigo (opcional, só na 1ª migração multi-tenant)
# Remove-Item -Recurse -Force data
node scripts/seed.js
node server.js
```

**http://localhost:4000**

| Rota | Função |
|------|--------|
| `/` | Escolher município + pitch do produto |
| `/admin.html` | Cadastrar nova prefeitura (`super` / `super123`) |
| `/cidadao.html?cidade=bacabal` | App do cidadão |
| `/secretaria.html?cidade=bacabal` | Fila por secretaria |
| `/prefeito.html?cidade=bacabal` | Painel executivo |
| `/obras.html?cidade=imperatriz` | Obras (outro tenant) |

## Demos no seed

- **Bacabal** (verde) — 48 chamados
- **Imperatriz** (azul) — 20 chamados

Logins por cidade: `obras`/`obras123`, `prefeito`/`prefeito123`

## Modelo de negócio

| | |
|--|--|
| Implantação | R$ 80–300 mil |
| Mensalidade | R$ 2–10 mil |
| Escala | Cada prefeitura = tenant, não projeto novo |

## Onboarding de um cliente

1. Entrar em `/admin.html`
2. Nome, UF, cores, bairros, coordenadas
3. Sistema cria secretarias, categorias e usuários
4. Enviar link `/?` → cidadão escolhe a cidade (ou subdomínio no futuro)

## Roadmap

1. ✅ Multi-tenant + onboarding
2. Subdomínio por cidade (`bacabal.cidadehub.app`)
3. WhatsApp + notificações
4. IA (agente + fiscalização)
5. Defesa Civil + coleta
6. Billing / planos por módulo

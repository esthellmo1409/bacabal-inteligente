// CidadeHub — plataforma multi-tenant para prefeituras (Node puro)
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const crypto = require('crypto');

const PORT = process.env.PORT || 4000;

/**
 * Dados persistentes:
 * - Local: ./data
 * - Railway: monte o Volume em /data (NÃO em /app — apaga o código)
 *   A variável RAILWAY_VOLUME_MOUNT_PATH vem automática.
 * Seed do código fica em ./data (imagem) e só é copiado se o volume estiver vazio.
 */
const SEED_DIR = path.join(__dirname, 'data');

function resolveDataDir() {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  // Railway injeta automaticamente quando há Volume no serviço
  if (process.env.RAILWAY_VOLUME_MOUNT_PATH) return process.env.RAILWAY_VOLUME_MOUNT_PATH;
  return SEED_DIR;
}

const DATA_DIR = resolveDataDir();
process.env.DATA_DIR = DATA_DIR; // seed.js e filhos leem daqui
const TENANTS_DIR = path.join(DATA_DIR, 'tenants');
const PUBLIC_DIR = path.join(__dirname, 'public');
const SESSIONS = new Map(); // legado em memória
const SESSION_SECRET = process.env.SESSION_SECRET || 'bacabal-inteligente-demo-secret-v1';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const USING_VOLUME = !!process.env.RAILWAY_VOLUME_MOUNT_PATH || !!process.env.RAILWAY_VOLUME_NAME;

function copyDirSync(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDirSync(from, to);
    else fs.copyFileSync(from, to);
  }
}

function bootstrapDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(TENANTS_DIR, { recursive: true });
  const marker = path.join(DATA_DIR, 'municipios.json');
  if (fs.existsSync(marker)) {
    return { ok: true, bootstrapped: false, reason: 'already-present' };
  }
  // Volume (ou pasta) vazia: copia o seed embutido no deploy
  if (SEED_DIR !== DATA_DIR && fs.existsSync(path.join(SEED_DIR, 'municipios.json'))) {
    copyDirSync(SEED_DIR, DATA_DIR);
    return { ok: true, bootstrapped: true, reason: 'copied-seed', from: SEED_DIR };
  }
  return { ok: true, bootstrapped: true, reason: 'needs-runSeed' };
}

/**
 * Volume Railway já populado: adiciona municípios novos do seed
 * sem sobrescrever tenants existentes (ex.: bacabal).
 * Também atualiza config.json de tenants ≠ bacabal (cores/logo).
 */
function syncMissingTenantsFromSeed() {
  if (SEED_DIR === DATA_DIR) return { added: [], updated: [] };
  const seedFile = path.join(SEED_DIR, 'municipios.json');
  if (!fs.existsSync(seedFile)) return { added: [], updated: [] };

  let seedList = [];
  let liveList = [];
  try {
    seedList = JSON.parse(fs.readFileSync(seedFile, 'utf8'));
    liveList = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'municipios.json'), 'utf8'));
  } catch {
    return { added: [], updated: [] };
  }
  if (!Array.isArray(seedList) || !Array.isArray(liveList)) return { added: [], updated: [] };

  const liveSlugs = new Set(liveList.map((m) => m.slug));
  const added = [];
  const updated = [];

  for (const m of seedList) {
    if (!m?.slug) continue;
    const from = path.join(SEED_DIR, 'tenants', m.slug);
    const to = path.join(TENANTS_DIR, m.slug);

    if (!liveSlugs.has(m.slug)) {
      if (!fs.existsSync(from)) continue;
      if (!fs.existsSync(to)) copyDirSync(from, to);
      liveList.push(m);
      liveSlugs.add(m.slug);
      added.push(m.slug);
      continue;
    }

    // Não mexe em Bacabal. Outras cidades: refresca branding do seed.
    if (m.slug === 'bacabal') continue;
    const fromCfg = path.join(from, 'config.json');
    const toCfg = path.join(to, 'config.json');
    if (fs.existsSync(fromCfg) && fs.existsSync(to)) {
      fs.copyFileSync(fromCfg, toCfg);
      const idx = liveList.findIndex((x) => x.slug === m.slug);
      if (idx >= 0) {
        liveList[idx] = {
          ...liveList[idx],
          produto: m.produto || liveList[idx].produto,
          tema: m.tema || liveList[idx].tema,
          logo: m.logo !== undefined ? m.logo : liveList[idx].logo,
          bairros: m.bairros || liveList[idx].bairros,
          lat: m.lat ?? liveList[idx].lat,
          lng: m.lng ?? liveList[idx].lng,
        };
      }
      updated.push(m.slug);
    }
  }

  if (added.length || updated.length) {
    fs.writeFileSync(path.join(DATA_DIR, 'municipios.json'), JSON.stringify(liveList, null, 2));
  }
  return { added, updated };
}

const bootInfo = bootstrapDataDir();
const syncInfo = syncMissingTenantsFromSeed();
if (syncInfo.added.length) {
  console.log(`  Tenants novos do seed → volume: ${syncInfo.added.join(', ')}`);
}
if (syncInfo.updated.length) {
  console.log(`  Branding atualizado do seed: ${syncInfo.updated.join(', ')}`);
}

const {
  runSeed, slugify, DEFAULT_CATEGORIAS, DEFAULT_SECRETARIAS, criarTenant,
} = require('./scripts/seed.js');
const {
  analisarFoto,
  analisarAprovacao,
  roteirizar,
  assistenteSecretaria,
  assistenteGabinete,
  gerarParecer,
  mensagemWhatsApp,
} = require('./lib/avancado.js');
const {
  normalizeStatus, normalizeChamado, isPendente, detectarDuplicidade, STATUS,
} = require('./lib/plataforma.js');
const { handleModulos, migrateTenant } = require('./lib/rotas-modulos.js');

// Seed se ainda não houver municípios (após bootstrap)
if (!fs.existsSync(path.join(DATA_DIR, 'municipios.json'))) {
  runSeed();
  bootInfo.reason = 'runSeed';
  bootInfo.bootstrapped = true;
}

if (bootInfo.bootstrapped) {
  console.log(`  Bootstrap dados: ${bootInfo.reason}${bootInfo.from ? ' ← ' + bootInfo.from : ''}`);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
};

function readJSON(file, fallback = []) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}

function writeJSON(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function tenantPath(slug, name) {
  return path.join(TENANTS_DIR, slug, name);
}

function readTenant(slug, name, fallback = []) {
  return readJSON(tenantPath(slug, name), fallback);
}

function writeTenant(slug, name, data) {
  writeJSON(tenantPath(slug, name), data);
}

// Migra tenants existentes (status + cadastros)
try {
  const muns = listMunicipios();
  for (const m of muns) {
    migrateTenant(m.slug, readTenant, writeTenant, fs, path, TENANTS_DIR);
  }
} catch (_) { /* ok */ }

/** Foto padrão de buraco — usada no demo e quando o cidadão abre chamado sem anexar foto. */
const FOTO_DEMO_BURACO = '/assets/buraco-demo-antes.jpg';

/** Garante chamado demo com foto de buraco (arquivo estático) — sobrevive a redeploy no Railway.
 *  Serve de base para a secretaria/campo testarem o assistente de IA. */
function ensureDemoChamado(slug = 'bacabal') {
  const fotoFile = path.join(PUBLIC_DIR, 'assets', 'buraco-demo-antes.jpg');
  if (!fs.existsSync(fotoFile)) return;
  if (!getMunicipio(slug) && !fs.existsSync(tenantPath(slug, 'chamados.json'))) return;

  const fotoUrl = FOTO_DEMO_BURACO;
  const chamados = readTenant(slug, 'chamados.json', []);
  const cfg = readTenant(slug, 'config.json', {});
  const cats = readTenant(slug, 'categorias.json', []);
  const cat = cats.find(c => c.id === 'buraco') || cats[0];
  if (!cat) return;

  const now = new Date().toISOString();
  const prefix = String(slug || 'bac').slice(0, 3).toUpperCase();
  const demoId = `${prefix}-DEMO-BURACO`;
  const idx = chamados.findIndex(x => x.demoFixo === 'buraco-foto' || x.id === demoId || x.id === 'BAC-DEMO-BURACO');

  const base = {
    id: idx >= 0 ? (chamados[idx].id || demoId) : demoId,
    protocolo: idx >= 0 && chamados[idx].protocolo ? chamados[idx].protocolo : `${new Date().getFullYear()}${String(9000 + (slug === 'bomlugar' ? 64 : 64)).slice(-4)}`,
    categoria: cat.id,
    secretaria: 'obras',
    titulo: cat.label || 'Buraco / Tapa-buraco',
    descricao: 'Buraco profundo na via pública, asfalto quebrado. Risco para veículos e pedestres.',
    bairro: 'Centro',
    endereco: 'Rua 11, próximo ao meio da quadra',
    lat: (cfg.lat || -4.2917) + 0.003,
    lng: (cfg.lng || -44.7917) - 0.002,
    prioridade: 'alta',
    cidadao: { nome: 'João Barbosa', telefone: '99987878787', email: '' },
    foto: fotoUrl,
    fotoAntes: fotoUrl,
    fotoDepois: null,
    anexos: [{ tipo: 'foto', url: fotoUrl, em: now }],
    demoFixo: 'buraco-foto',
    atualizadoEm: now,
  };

  if (idx < 0) {
    // Encaminhado: aparece na secretaria E na rota do campo
    chamados.unshift(normalizeChamado({
      ...base,
      status: 'encaminhado',
      historico: [
        { em: now, status: 'novo', nota: 'Chamado aberto pelo cidadão com foto' },
        { em: now, status: 'encaminhado', nota: 'Encaminhado à equipe de campo' },
      ],
      criadoEm: now,
    }));
  } else {
    const prev = chamados[idx];
    prev.foto = fotoUrl;
    prev.fotoAntes = fotoUrl;
    prev.fotoDepois = null;
    prev.aprovacaoSecretaria = null;
    prev.anexos = [{ tipo: 'foto', url: fotoUrl, em: now }];
    prev.secretaria = 'obras';
    prev.categoria = cat.id;
    prev.titulo = cat.label || prev.titulo || 'Buraco / Tapa-buraco';
    prev.descricao = base.descricao;
    prev.endereco = base.endereco;
    prev.prioridade = 'alta';
    prev.demoFixo = 'buraco-foto';
    // Mantém vivo para demo: se concluído/cancelado/aprovação, reabre encaminhado (só foto do problema)
    if (prev.status === 'concluido' || prev.status === 'cancelado' || prev.status === 'aguardando_aprovacao') {
      prev.status = 'encaminhado';
      prev.historico = prev.historico || [];
      prev.historico.push({
        em: now,
        status: 'encaminhado',
        nota: 'Chamado reaberto e encaminhado à equipe de campo',
      });
    } else if (prev.status === 'novo' || prev.status === 'aberto' || prev.status === 'em_analise') {
      prev.status = 'encaminhado';
      prev.historico = prev.historico || [];
      prev.historico.push({
        em: now,
        status: 'encaminhado',
        nota: 'Encaminhado à equipe de campo',
      });
    } else if (prev.status !== 'encaminhado' && prev.status !== 'em_execucao') {
      prev.status = 'encaminhado';
    }
    prev.atualizadoEm = now;
    chamados[idx] = normalizeChamado(prev);
    const [demo] = chamados.splice(idx, 1);
    chamados.unshift(demo);
  }
  writeTenant(slug, 'chamados.json', chamados);
}

/** Chamado demo aguardando aprovação (foto do depois) — secretaria testa a IA de conferência. */
function ensureDemoAprovacao(slug = 'bacabal') {
  const fotoAntesFile = path.join(PUBLIC_DIR, 'assets', 'buraco-demo-antes.jpg');
  const fotoDepoisFile = path.join(PUBLIC_DIR, 'assets', 'buraco-demo-depois.png');
  if (!fs.existsSync(fotoAntesFile) || !fs.existsSync(fotoDepoisFile)) return;
  if (!getMunicipio(slug) && !fs.existsSync(tenantPath(slug, 'chamados.json'))) return;

  const fotoAntes = FOTO_DEMO_BURACO;
  const fotoDepois = '/assets/buraco-demo-depois.png';
  const chamados = readTenant(slug, 'chamados.json', []);
  const cfg = readTenant(slug, 'config.json', {});
  const cats = readTenant(slug, 'categorias.json', []);
  const cat = cats.find(c => c.id === 'buraco') || cats[0];
  if (!cat) return;

  const now = new Date().toISOString();
  const prefix = String(slug || 'bac').slice(0, 3).toUpperCase();
  const demoId = `${prefix}-DEMO-APROV`;
  const idx = chamados.findIndex(x => x.demoFixo === 'buraco-aprov' || x.id === demoId);

  const base = {
    id: idx >= 0 ? (chamados[idx].id || demoId) : demoId,
    protocolo: idx >= 0 && chamados[idx].protocolo
      ? chamados[idx].protocolo
      : `${new Date().getFullYear()}9${slug === 'bomlugar' ? '165' : '065'}`,
    categoria: cat.id,
    secretaria: 'obras',
    titulo: cat.label || 'Buraco / Tapa-buraco',
    descricao: 'Buraco na via pública — equipe de campo enviou a foto do depois para conferência.',
    bairro: 'Centro',
    endereco: 'Rua 11, próximo ao meio da quadra',
    lat: (cfg.lat || -4.2917) + 0.004,
    lng: (cfg.lng || -44.7917) - 0.003,
    prioridade: 'alta',
    cidadao: { nome: 'Maria Souza', telefone: '99981112233', email: '' },
    foto: fotoAntes,
    fotoAntes,
    fotoDepois,
    anexos: [
      { tipo: 'foto', url: fotoAntes, em: now },
      { tipo: 'foto_depois', url: fotoDepois, em: now },
    ],
    demoFixo: 'buraco-aprov',
    aprovacaoSecretaria: null,
    atualizadoEm: now,
  };

  if (idx < 0) {
    const novo = normalizeChamado({
      ...base,
      status: 'aguardando_aprovacao',
      historico: [
        { em: now, status: 'novo', nota: 'Chamado aberto pelo cidadão com foto' },
        { em: now, status: 'encaminhado', nota: 'Encaminhado à equipe de campo' },
        { em: now, status: 'em_execucao', nota: 'Equipe aceitou o serviço' },
        { em: now, status: 'aguardando_aprovacao', nota: 'Campo enviou foto do depois — aguardando secretaria' },
      ],
      criadoEm: now,
    });
    const fotoIdx = chamados.findIndex((x) => x.demoFixo === 'buraco-foto');
    const insertAt = fotoIdx >= 0 ? fotoIdx + 1 : 0;
    chamados.splice(insertAt, 0, novo);
  } else {
    const prev = chamados[idx];
    Object.assign(prev, {
      foto: fotoAntes,
      fotoAntes,
      fotoDepois,
      descricao: base.descricao,
      endereco: base.endereco,
      prioridade: 'alta',
      demoFixo: 'buraco-aprov',
      status: 'aguardando_aprovacao',
      aprovacaoSecretaria: null,
      anexos: base.anexos,
      atualizadoEm: now,
    });
    chamados[idx] = normalizeChamado(prev);
    const [demo] = chamados.splice(idx, 1);
    // Fica logo abaixo do demo de material (foto do problema), não no topo
    const fotoIdx = chamados.findIndex((x) => x.demoFixo === 'buraco-foto');
    const insertAt = fotoIdx >= 0 ? fotoIdx + 1 : 0;
    chamados.splice(insertAt, 0, demo);
  }
  writeTenant(slug, 'chamados.json', chamados);
}

/** Zera a fila uma vez (apresentação) e deixa o seedDemosIa recriar só o demo do problema. */
function limparChamadosParaDemo(slug = 'bacabal') {
  if (!getMunicipio(slug) && !fs.existsSync(tenantPath(slug, 'chamados.json'))) return;
  const marker = path.join(DATA_DIR, `.limpar-chamados-${slug}-20260806c`);
  if (fs.existsSync(marker)) {
    // Remove demo de aprovação se ainda existir (alerta “Avaliar foto do campo”)
    const list = readTenant(slug, 'chamados.json', []);
    const limpa = list.filter((c) => c.demoFixo !== 'buraco-aprov' && !String(c.id || '').includes('DEMO-APROV'));
    if (limpa.length !== list.length) writeTenant(slug, 'chamados.json', limpa);
    return;
  }
  writeTenant(slug, 'chamados.json', []);
  try {
    fs.writeFileSync(marker, new Date().toISOString());
  } catch (_) { /* ok */ }
  console.log(`  Chamados zerados (${slug}) para apresentação`);
}

function seedDemosIa() {
  limparChamadosParaDemo('bacabal');
  limparChamadosParaDemo('bomlugar');
  // Só o demo da foto do problema → IA sugere material (sem alerta de aprovação)
  ensureDemoChamado('bacabal');
  ensureDemoChamado('bomlugar');
}

try {
  seedDemosIa();
} catch (e) {
  console.warn('ensureDemoChamado:', e.message);
}

function listMunicipios() {
  return readJSON(path.join(DATA_DIR, 'municipios.json'), []);
}

function getMunicipio(slug) {
  return listMunicipios().find(m => m.slug === slug && m.ativo !== false) || null;
}

function platform() {
  return readJSON(path.join(DATA_DIR, 'platform.json'), {
    produto: 'CidadeHub',
    usuarios: [],
  });
}

function sendJSON(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Cidade',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
  });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    const max = 12 * 1024 * 1024;
    req.on('data', chunk => {
      body += chunk;
      if (body.length > max) {
        reject(new Error('Payload muito grande'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function getToken(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}

function signSession(session) {
  const payload = {
    id: session.id,
    nome: session.nome,
    papel: session.papel,
    secretaria: session.secretaria || null,
    equipeId: session.equipeId || null,
    perfil: session.perfil || session.papel,
    cidade: session.cidade || null,
    exp: Date.now() + SESSION_TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  return `v1.${body}.${sig}`;
}

function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return null;
  // Token assinado (sobrevive a redeploy)
  if (token.startsWith('v1.')) {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [, body, sig] = parts;
    const expected = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    try {
      const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
      if (!data || !data.exp || data.exp < Date.now()) return null;
      return {
        id: data.id,
        nome: data.nome,
        papel: data.papel,
        secretaria: data.secretaria || null,
        equipeId: data.equipeId || null,
        perfil: data.perfil || data.papel,
        cidade: data.cidade || null,
      };
    } catch {
      return null;
    }
  }
  // Legado em memória
  if (SESSIONS.has(token)) return SESSIONS.get(token);
  return null;
}

function createSession(session) {
  const token = signSession(session);
  SESSIONS.set(token, session); // opcional p/ debug
  return token;
}

function currentUser(req) {
  const token = getToken(req);
  return verifySessionToken(token);
}

function resolveSlug(req, url) {
  return (
    url.searchParams.get('cidade') ||
    req.headers['x-cidade'] ||
    (currentUser(req) && currentUser(req).cidade) ||
    null
  );
}

function requireTenant(req, url, res) {
  const slug = resolveSlug(req, url);
  if (!slug) {
    sendJSON(res, 400, { error: 'Informe a cidade (?cidade=slug ou header X-Cidade)' });
    return null;
  }
  if (!getMunicipio(slug) && !fs.existsSync(tenantPath(slug, 'config.json'))) {
    sendJSON(res, 404, { error: 'Município não encontrado' });
    return null;
  }
  return slug;
}

function serveStatic(req, res, urlPath) {
  let filePath = urlPath === '/' ? '/index.html' : urlPath;
  filePath = path.join(PUBLIC_DIR, decodeURIComponent(filePath.split('?')[0]));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404); res.end('Not found'); return;
  }
  const ext = path.extname(filePath);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
}

/** Home já com marca da cidade — elimina flash de Bacabal no refresh. */
function brandHomeHtml(html, slug) {
  return brandHtmlForCity(html, slug, { isHome: true });
}

/** Marca genérica em qualquer HTML (login, cidadão, gabinete…) */
function brandHtmlForCity(html, slug, opts = {}) {
  if (slug !== 'bomlugar') {
    if (html.includes('<html lang="pt-BR">') && !html.includes('data-cidade=')) {
      return html.replace('<html lang="pt-BR">', '<html lang="pt-BR" data-cidade="bacabal">');
    }
    return html;
  }

  const replacements = [
    ['<html lang="pt-BR">', '<html lang="pt-BR" data-cidade="bomlugar" class="brand-ready">'],
    ['Bacabal Conecta', 'Bom Lugar Conecta'],
    ['Prefeitura Municipal de Bacabal', 'Prefeitura Municipal de Bom Lugar'],
    ['Prefeitura de Bacabal', 'Prefeitura de Bom Lugar'],
    ['Piloto · Prefeitura de Bacabal', 'Piloto · Prefeitura de Bom Lugar'],
    ['Brasão de Bacabal', 'Brasão de Bom Lugar'],
    ['href="/assets/logo-prefeitura.png"', 'href="/assets/logo-bomlugar.jpg"'],
    ['src="/assets/logo-prefeitura.png"', 'src="/assets/logo-bomlugar.jpg"'],
    ['cidade=bacabal', 'cidade=bomlugar'],
    ['Gabinete do Prefeito', 'Gabinete da Prefeita'],
    ['Gabinete do prefeito', 'Gabinete da prefeita'],
    ['Painel do prefeito', 'Painel da prefeita'],
    ['Entrar como prefeito', 'Entrar como prefeita'],
    ['Entrar como Prefeito', 'Entrar como prefeita'],
    ['TV do prefeito', 'TV da prefeita'],
    ['Observação do prefeito', 'Observação da prefeita'],
    ['Cobrança do prefeito', 'Cobrança da prefeita'],
    ['Carta ao prefeito', 'Carta à prefeita'],
    ['Pronto para o prefeito', 'Pronto para a prefeita'],
    ['com o prefeito', 'com a prefeita'],
    ['para o prefeito', 'para a prefeita'],
    ['do prefeito', 'da prefeita'],
    ['ao prefeito', 'à prefeita'],
    ['o prefeito', 'a prefeita'],
    ['O prefeito', 'A prefeita'],
    ['Prefeito,', 'Prefeita,'],
    ['>Prefeito<', '>Prefeita<'],
    ['o senhor já', 'a senhora já'],
    ['o senhor só', 'a senhora só'],
    ['o senhor não', 'a senhora não'],
    ['o senhor usa', 'a senhora usa'],
    ['o senhor já paga', 'a senhora já paga'],
    ['o senhor acompanha', 'a senhora acompanha'],
    ['para o senhor', 'para a senhora'],
    ['>Gabinete do Prefeito<', '>Gabinete da Prefeita<'],
    ['id="prefeitaSpotlight" hidden', 'id="prefeitaSpotlight"'],
    ['id="prefeitoSpotlight"', 'id="prefeitoSpotlight" hidden'],
    // Clipe TV: Bom Lugar usa página própria (sem misturar Bacabal)
    ['href="/tv.html?cidade=bomlugar"', 'href="/tv-bomlugar.html"'],
    ['href="/tv.html"', 'href="/tv-bomlugar.html"'],
    ['Clipe TV Bacabal', 'Clipe TV Bom Lugar'],
    // Fotos profissionais do fluxo (home + /fluxo.html)
    ['src="/assets/fluxo-abertura.jpg"', 'src="/assets/fluxo-bomlugar-abertura.jpg"'],
    ['src="/assets/fluxo-01-cidadao.jpg"', 'src="/assets/fluxo-bomlugar-cidadao.jpg"'],
    ['src="/assets/fluxo-02-secretaria.jpg"', 'src="/assets/fluxo-bomlugar-secretaria.jpg"'],
    ['src="/assets/fluxo-03-campo.jpg"', 'src="/assets/fluxo-bomlugar-campo.jpg"'],
    ['src="/assets/fluxo-05-saude.jpg"', 'src="/assets/fluxo-bomlugar-saude.jpg"'],
    ['src="/assets/fluxo-04-gabinete.jpg"', 'src="/assets/fluxo-bomlugar-gabinete.jpg"'],
    ['src="/assets/fluxo-fechamento.jpg"', 'src="/assets/fluxo-bomlugar-fechamento.jpg"'],
    // Tutoriais / páginas com mock da home
    ['src="/assets/slide-nova.png"', 'src="/assets/slide-bomlugar-hero.jpg"'],
    ['(99) 3621-0533 · Centro · Bacabal/MA', '(98) 9.9196-7607 · Centro · Bom Lugar/MA'],
    ['Centro, Bacabal/MA', 'Centro, Bom Lugar/MA'],
    ['Bacabal/MA', 'Bom Lugar/MA'],
    ['Nova Bacabal', 'Bom Lugar'],
    ['src="/assets/logo-bomlugar.jpg"', 'src="/assets/logo-oficial-bomlugar.png?v=3"'],
    ['href="/assets/logo-bomlugar.jpg"', 'href="/assets/logo-oficial-bomlugar.png?v=3"'],
  ];

  if (opts.isHome) {
    replacements.push(
      // Home: balão/logo oficial (admin continua com brasão acima)
      ['src="/assets/logo-bomlugar.jpg"', 'src="/assets/logo-oficial-bomlugar.png?v=3"'],
      ['href="/assets/logo-bomlugar.jpg"', 'href="/assets/logo-oficial-bomlugar.png?v=3"'],
      ['Brasão de Bom Lugar', 'Prefeitura Bom Lugar — início'],
      ['A cidade conectada de verdade', 'Construindo o presente e planejando o futuro'],
      ['https://www.bacabal.ma.gov.br/', 'https://www.bomlugar.ma.gov.br/'],
      ['(99) 3621-0533 · Centro · Bacabal/MA', '(98) 9.9196-7607 · Centro · Bom Lugar/MA'],
      ['src="/assets/slide-nova.png"', 'src="/assets/slide-bomlugar-hero.jpg"'],
      ['src="/assets/slide-gabinete.png"', 'src="/assets/card-bomlugar-gabinete.jpg?v=5"'],
      // Home usa os cards antigos; as fotos novas ficam so em /fluxo.html
      ['src="/assets/fluxo-bomlugar-cidadao.jpg"', 'src="/assets/card-bomlugar-cidadao.jpg?v=5"'],
      ['src="/assets/fluxo-bomlugar-secretaria.jpg"', 'src="/assets/card-bomlugar-secretaria.jpg?v=5"'],
      ['src="/assets/fluxo-bomlugar-gabinete.jpg"', 'src="/assets/card-bomlugar-gabinete.jpg?v=5"'],
      ['Ocorrências registradas em Bom Lugar.', 'Ocorrências registradas em Bom Lugar.'],
      ['Ocorrências registradas em Bacabal.', 'Ocorrências registradas em Bom Lugar.'],
      ['color:#2f7319">Bom Lugar Conecta</strong>', 'color:#03327A">Bom Lugar Conecta</strong>'],
      ['Travessa 15 de Novembro, 229, Centro · CEP 65700-000', 'Rua Manoel Severo, S/N - Centro · CEP 65.704-000'],
      ['bacabal.ma.gov.br', 'bomlugar.ma.gov.br'],
      ['(99) 3621-0533', '(98) 9.9196-7607'],
    );
  }

  let out = html;
  for (const [from, to] of replacements) {
    out = out.split(from).join(to);
  }

  // Cores: primary=azul nos botões (uma cor). Secundária só em acentos.
  const styleBoot = `<style id="bl-server-brand">:root{--home-accent:#03327A;--home-accent-deep:#022456;--home-green:#B71C1C;--home-green-deep:#8E1515;--brand:#03327A;--brand-dim:#022456;--royal-mid:#03327A;--royal:#03327A}html[data-cidade="bomlugar"] .eixo-tab.active{background:#03327A!important;border-color:transparent}html[data-cidade="bomlugar"] .unidade-rank .bar>i{background:#03327A!important}</style>`;
  if (!out.includes('id="bl-server-brand"')) {
    out = out.replace('</head>', `${styleBoot}</head>`);
  }

  out = out.replace(/root\.classList\.add\(['"]brand-pending['"]\);/g, '/* server-branded */');

  return out;
}

function serveHome(req, res, url) {
  const filePath = path.join(PUBLIC_DIR, 'index.html');
  let html = fs.readFileSync(filePath, 'utf8');
  const slug = (url.searchParams.get('cidade') || '').trim() || 'bacabal';
  html = brandHomeHtml(html, slug);
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store, max-age=0',
  });
  res.end(html);
}

function serveBrandedPage(req, res, url) {
  let rel = url.pathname === '/' ? '/index.html' : url.pathname;
  const filePath = path.join(PUBLIC_DIR, decodeURIComponent(rel.split('?')[0]));
  if (!filePath.startsWith(PUBLIC_DIR) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404); res.end('Not found'); return;
  }
  let html = fs.readFileSync(filePath, 'utf8');
  const slug = (url.searchParams.get('cidade') || '').trim() || 'bacabal';
  // Páginas Anselmo Carvalho / uso interno Bacabal — nunca rebrandear para Bom Lugar
  const keepBacabal = /ac-pitch|ac-script|ac-precos|ac-proposta|data-keep-bacabal/i.test(rel + html.slice(0, 800));
  if (!keepBacabal) {
    html = brandHtmlForCity(html, slug, { isHome: rel === '/index.html' || url.pathname === '/' });
  }
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store, max-age=0',
  });
  res.end(html);
}

function metrics(slug) {
  const chamados = readTenant(slug, 'chamados.json', []);
  const obras = readTenant(slug, 'obras.json', []);
  const secretarias = readTenant(slug, 'secretarias.json', []);
  const porStatus = {};
  const porSecretaria = {};
  const porBairro = {};
  let resolvidos = 0;
  let tempoTotal = 0;

  for (const c of chamados) {
    porStatus[c.status] = (porStatus[c.status] || 0) + 1;
    porSecretaria[c.secretaria] = (porSecretaria[c.secretaria] || 0) + 1;
    porBairro[c.bairro] = (porBairro[c.bairro] || 0) + 1;
    if (c.status === 'concluido') {
      resolvidos++;
      const t = new Date(c.atualizadoEm) - new Date(c.criadoEm);
      if (t > 0) tempoTotal += t;
    }
  }

  const diasMedio = resolvidos
    ? Math.round((tempoTotal / resolvidos) / (1000 * 60 * 60 * 24) * 10) / 10
    : 0;

  return {
    total: chamados.length,
    porStatus,
    porSecretaria,
    porBairro,
    tempoMedioDias: diasMedio,
    taxaResolucao: chamados.length ? Math.round((resolvidos / chamados.length) * 100) : 0,
    obras: {
      total: obras.length,
      concluidas: obras.filter(o => o.status === 'concluida').length,
      andamento: obras.filter(o => o.status === 'em_andamento').length,
      atrasadas: obras.filter(o => o.status === 'atrasada').length,
    },
    secretarias,
    heatmap: chamados.map(c => ({
      lat: c.lat, lng: c.lng, status: c.status, categoria: c.categoria, bairro: c.bairro,
    })),
  };
}

function criarMunicipioCompleto(body) {
  const nome = (body.nome || '').trim();
  if (!nome) throw new Error('Nome do município é obrigatório');
  const uf = (body.uf || '').trim().toUpperCase().slice(0, 2);
  if (uf.length !== 2) throw new Error('UF inválida');

  let slug = slugify(body.slug || nome);
  if (!slug) throw new Error('Slug inválido');

  const existentes = listMunicipios();
  if (existentes.some(m => m.slug === slug)) {
    throw new Error('Já existe município com este slug');
  }

  const tema = {
    primaria: body.tema?.primaria || body.corPrimaria || '#3dcf9a',
    secundaria: body.tema?.secundaria || body.corSecundaria || '#1f8f68',
    fundo: body.tema?.fundo || body.corFundo || '#0b1f1a',
  };

  const bairros = Array.isArray(body.bairros) && body.bairros.length
    ? body.bairros.map(b => String(b).trim()).filter(Boolean)
    : ['Centro'];

  const municipio = {
    slug,
    nome,
    uf,
    produto: body.produto || `${nome} Conecta`,
    lat: Number(body.lat) || -15.78,
    lng: Number(body.lng) || -47.93,
    tema,
    logo: body.logo || null,
    bairros,
    ativo: true,
    criadoEm: new Date().toISOString(),
  };

  const dir = path.join(TENANTS_DIR, slug);
  fs.mkdirSync(dir, { recursive: true });

  const secretarias = Array.isArray(body.secretarias) && body.secretarias.length
    ? body.secretarias
    : JSON.parse(JSON.stringify(DEFAULT_SECRETARIAS));

  const categorias = Array.isArray(body.categorias) && body.categorias.length
    ? body.categorias
    : JSON.parse(JSON.stringify(DEFAULT_CATEGORIAS));

  const config = {
    slug,
    cidade: nome,
    uf,
    produto: municipio.produto,
    versao: '2.0.0',
    lat: municipio.lat,
    lng: municipio.lng,
    zoom: 13,
    tema,
    logo: municipio.logo,
    bairros,
  };

  const senhaAdmin = body.senhaAdmin || 'admin123';
  const usuarios = [
    { id: 'admin', nome: 'Administrador Municipal', senha: senhaAdmin, papel: 'admin', secretaria: null },
    { id: 'prefeito', nome: 'Gabinete do Prefeito', senha: body.senhaPrefeito || 'prefeito123', papel: 'prefeito', secretaria: null },
  ];

  // Usuários por secretaria
  for (const s of secretarias) {
    usuarios.push({
      id: s.id,
      nome: s.nome,
      senha: body.senhaPadrao || 'secretaria123',
      papel: 'secretaria',
      secretaria: s.id,
    });
  }

  writeTenant(slug, 'config.json', config);
  writeTenant(slug, 'secretarias.json', secretarias);
  writeTenant(slug, 'categorias.json', categorias);
  writeTenant(slug, 'usuarios.json', usuarios);
  writeTenant(slug, 'chamados.json', []);
  writeTenant(slug, 'obras.json', Array.isArray(body.obras) ? body.obras : []);

  existentes.push(municipio);
  writeJSON(path.join(DATA_DIR, 'municipios.json'), existentes);

  return municipio;
}

async function handleAPI(req, res, pathname, url) {
  if (req.method === 'OPTIONS') return sendJSON(res, 204, {});

  if (pathname === '/api/health' && req.method === 'GET') {
    const municipios = listMunicipios().length;
    let chamadosBacabal = 0;
    try { chamadosBacabal = readTenant('bacabal', 'chamados.json', []).length; } catch (_) {}
    const volumeMount = process.env.RAILWAY_VOLUME_MOUNT_PATH || null;
    const warn = volumeMount && path.resolve(volumeMount) === path.resolve(SEED_DIR)
      ? 'Volume montado em cima do seed (/app/data). Prefira montar em /data.'
      : null;
    return sendJSON(res, 200, {
      ok: true,
      produto: 'Bacabal Conecta',
      dataDir: DATA_DIR,
      seedDir: SEED_DIR,
      volume: USING_VOLUME,
      volumeMount,
      volumeName: process.env.RAILWAY_VOLUME_NAME || null,
      bootstrap: bootInfo,
      municipios,
      chamadosBacabal,
      warning: warn,
    });
  }

  // Módulos 1–15 (dashboard, cadastros, IA, relatórios…)
  const handled = await handleModulos({
    req, res, pathname, url, sendJSON, readBody, requireTenant, readTenant, writeTenant, currentUser,
  });
  if (handled !== false) return;

  // Plataforma
  if (pathname === '/api/platform' && req.method === 'GET') {
    const p = platform();
    return sendJSON(res, 200, {
      produto: p.produto,
      tagline: p.tagline,
      versao: p.versao,
    });
  }

  if (pathname === '/api/municipios' && req.method === 'GET') {
    const list = listMunicipios()
      .filter(m => m.ativo !== false)
      .map(m => ({
        slug: m.slug,
        nome: m.nome,
        uf: m.uf,
        produto: m.produto,
        tema: m.tema,
        logo: m.logo,
        lat: m.lat,
        lng: m.lng,
      }));
    return sendJSON(res, 200, list);
  }

  // Criar município (super admin da plataforma)
  if (pathname === '/api/municipios' && req.method === 'POST') {
    const user = currentUser(req);
    if (!user || user.papel !== 'platform') {
      return sendJSON(res, 401, { error: 'Apenas super admin da plataforma' });
    }
    try {
      const body = await readBody(req);
      const m = criarMunicipioCompleto(body);
      return sendJSON(res, 201, m);
    } catch (e) {
      return sendJSON(res, 400, { error: e.message });
    }
  }

  // Login plataforma OU município
  if (pathname === '/api/login' && req.method === 'POST') {
    const body = await readBody(req);
    const cidade = body.cidade || null;

    // Super admin (sem cidade)
    if (!cidade || body.plataforma) {
      const p = platform();
      const u = (p.usuarios || []).find(x => x.id === body.usuario && x.senha === body.senha);
      if (u) {
        const session = { id: u.id, nome: u.nome, papel: 'platform', cidade: null };
        const token = createSession(session);
        return sendJSON(res, 200, { token, user: session });
      }
      if (body.plataforma) return sendJSON(res, 401, { error: 'Credenciais inválidas' });
    }

    if (!cidade) return sendJSON(res, 400, { error: 'Informe a cidade' });
    if (!getMunicipio(cidade)) return sendJSON(res, 404, { error: 'Município não encontrado' });

    const users = readTenant(cidade, 'usuarios.json', []);
    const u = users.find(x => x.id === body.usuario && x.senha === body.senha);
    if (!u) return sendJSON(res, 401, { error: 'Credenciais inválidas' });
    if (u.ativo === false) return sendJSON(res, 403, { error: 'Acesso desativado. Fale com o administrador.' });

    const session = {
      id: u.id,
      nome: u.nome,
      papel: u.papel,
      secretaria: u.secretaria,
      equipeId: u.equipeId || null,
      perfil: u.perfil || u.papel,
      cidade,
    };
    const token = createSession(session);
    return sendJSON(res, 200, { token, user: session });
  }

  if (pathname === '/api/me') {
    const u = currentUser(req);
    if (!u) return sendJSON(res, 401, { error: 'Não autenticado' });
    return sendJSON(res, 200, u);
  }

  // Config do município
  if (pathname === '/api/config' && req.method === 'GET') {
    const slug = requireTenant(req, url, res);
    if (!slug) return;
    const cfg = readTenant(slug, 'config.json', {});
    const mun = getMunicipio(slug) || {};
    return sendJSON(res, 200, {
      ...cfg,
      tema: cfg.tema || mun.tema,
      logo: cfg.logo || mun.logo,
      categorias: readTenant(slug, 'categorias.json', []),
      secretarias: readTenant(slug, 'secretarias.json', []),
    });
  }

  // Atualizar branding / config (admin municipal ou platform)
  if (pathname === '/api/config' && req.method === 'PUT') {
    const user = currentUser(req);
    if (!user || !['admin', 'platform'].includes(user.papel)) {
      return sendJSON(res, 401, { error: 'Não autorizado' });
    }
    const body = await readBody(req);
    const target = user.papel === 'platform'
      ? (body.cidade || url.searchParams.get('cidade'))
      : user.cidade;
    if (!target) return sendJSON(res, 400, { error: 'Cidade obrigatória' });

    const cfg = readTenant(target, 'config.json', {});
    if (body.tema) cfg.tema = { ...cfg.tema, ...body.tema };
    if (body.logo !== undefined) cfg.logo = body.logo;
    if (body.brasao !== undefined) cfg.brasao = body.brasao;
    if (body.produto) cfg.produto = body.produto;
    if (body.cidade) cfg.cidade = body.cidade;
    if (body.bairros) cfg.bairros = body.bairros;
    if (body.horarioFuncionamento) cfg.horarioFuncionamento = body.horarioFuncionamento;
    if (body.api) cfg.api = { ...(cfg.api || {}), ...body.api };
    if (body.lgpd) cfg.lgpd = { ...(cfg.lgpd || {}), ...body.lgpd };
    if (body.backup) cfg.backup = { ...(cfg.backup || {}), ...body.backup };
    if (body.lat != null) cfg.lat = Number(body.lat);
    if (body.lng != null) cfg.lng = Number(body.lng);
    writeTenant(target, 'config.json', cfg);

    const list = listMunicipios();
    const idx = list.findIndex(m => m.slug === target);
    if (idx >= 0) {
      if (body.tema) list[idx].tema = cfg.tema;
      if (body.logo !== undefined) list[idx].logo = cfg.logo;
      if (body.produto) list[idx].produto = cfg.produto;
      if (body.bairros) list[idx].bairros = cfg.bairros;
      writeJSON(path.join(DATA_DIR, 'municipios.json'), list);
    }

    if (Array.isArray(body.secretarias)) writeTenant(target, 'secretarias.json', body.secretarias);
    if (Array.isArray(body.categorias)) writeTenant(target, 'categorias.json', body.categorias);

    return sendJSON(res, 200, cfg);
  }

  // Chamados
  if (pathname === '/api/chamados' && req.method === 'GET') {
    const slug = requireTenant(req, url, res);
    if (!slug) return;
    let list = readTenant(slug, 'chamados.json', []).map(normalizeChamado);
    const protocolo = url.searchParams.get('protocolo');
    const secretaria = url.searchParams.get('secretaria');
    const status = url.searchParams.get('status');
    const bairro = url.searchParams.get('bairro');
    const prioridade = url.searchParams.get('prioridade');
    const de = url.searchParams.get('de');
    const ate = url.searchParams.get('ate');
    const telefone = (url.searchParams.get('telefone') || '').replace(/\D/g, '');

    if (protocolo) {
      const p = protocolo.trim();
      list = list.filter(c =>
        c.protocolo === p || c.id === p || String(c.protocolo).endsWith(p)
      );
    }
    if (secretaria) list = list.filter(c => c.secretaria === secretaria);
    if (status) list = list.filter(c => normalizeStatus(c.status) === normalizeStatus(status));
    if (bairro) list = list.filter(c => c.bairro === bairro);
    if (prioridade) list = list.filter(c => c.prioridade === prioridade);
    if (de) list = list.filter(c => new Date(c.criadoEm) >= new Date(de));
    if (ate) list = list.filter(c => new Date(c.criadoEm) <= new Date(ate + 'T23:59:59'));
    if (telefone) {
      list = list.filter(c =>
        String(c.cidadao?.telefone || '').replace(/\D/g, '').endsWith(telefone) ||
        String(c.cidadao?.telefone || '').replace(/\D/g, '') === telefone
      );
    }

    const user = currentUser(req);
    if (user && user.papel === 'secretaria' && user.secretaria && user.cidade === slug) {
      list = list.filter(c => c.secretaria === user.secretaria);
    }

    list.sort((a, b) => new Date(b.criadoEm) - new Date(a.criadoEm));
    return sendJSON(res, 200, list);
  }

  if (pathname === '/api/chamados' && req.method === 'POST') {
    const slug = requireTenant(req, url, res);
    if (!slug) return;
    const body = await readBody(req);
    const categorias = readTenant(slug, 'categorias.json', []);
    let cat = categorias.find(c => c.id === body.categoria);

    // Se veio "outros" (ou vazio) mas o texto/foto indica buraco etc., corrige a secretaria
    const { analisarFoto, inferCategoriaFromText } = require('./lib/avancado.js');
    const inferred = inferCategoriaFromText(body.descricao || '') ||
      (body.foto ? analisarFoto({ foto: body.foto, texto: body.descricao || '', categorias }) : null);
    const inferredId = inferred?.cat || inferred?.categoria;
    if (inferredId && (!cat || cat.id === 'outros' || cat.id !== inferredId)) {
      if (!body.categoria || body.categoria === 'outros' || inferred?.confianca >= 55 || inferred?.score >= 0.35) {
        const better = categorias.find(c => c.id === inferredId);
        if (better) cat = better;
      }
    }

    if (!cat) return sendJSON(res, 400, { error: 'Categoria inválida' });
    if (!body.descricao && !body.foto) {
      return sendJSON(res, 400, { error: 'Informe descrição ou foto' });
    }

    // Sem foto anexada: usa a foto padrão de buraco (base de teste do assistente)
    const fotoFile = path.join(PUBLIC_DIR, 'assets', 'buraco-demo-antes.jpg');
    const fotoPadrao = (!body.foto && fs.existsSync(fotoFile)) ? FOTO_DEMO_BURACO : null;
    const fotoFinal = body.foto || fotoPadrao;

    const chamados = readTenant(slug, 'chamados.json', []);
    const dups = detectarDuplicidade(chamados, {
      categoria: cat.id,
      lat: Number(body.lat),
      lng: Number(body.lng),
    });

    const n = 1000 + chamados.length + 1;
    const now = new Date().toISOString();
    const prefix = slug.slice(0, 3).toUpperCase();
    const cfg = readTenant(slug, 'config.json', {});
    const prioridade = ['baixa', 'media', 'alta', 'urgente'].includes(body.prioridade)
      ? body.prioridade
      : (body.urgencia === 'alta' || body.urgencia === 'urgente' ? 'alta' : body.urgencia === 'baixa' ? 'baixa' : 'media');

    const chamado = normalizeChamado({
      id: `${prefix}-${n}`,
      protocolo: `${new Date().getFullYear()}${n}`,
      categoria: cat.id,
      secretaria: cat.secretaria,
      titulo: cat.label,
      descricao: body.descricao || cat.label,
      bairro: body.bairro || 'Não informado',
      endereco: body.endereco || '',
      rua: body.rua || '',
      lat: Number(body.lat) || cfg.lat,
      lng: Number(body.lng) || cfg.lng,
      status: 'novo',
      prioridade,
      cidadao: { nome: body.nome || 'Cidadão', telefone: body.telefone || '', email: body.email || '' },
      foto: fotoFinal,
      fotoAntes: fotoFinal,
      fotoDepois: null,
      anexos: fotoFinal ? [{ tipo: 'foto', url: fotoFinal, em: now }] : [],
      posteId: body.posteId || null,
      historico: [{
        em: now,
        status: 'novo',
        nota: 'Chamado aberto pelo cidadão com foto',
      }],
      criadoEm: now,
      atualizadoEm: now,
      duplicidadeSuspeita: dups.map(d => d.protocolo),
    });
    chamados.push(chamado);
    writeTenant(slug, 'chamados.json', chamados);
    return sendJSON(res, 201, {
      ...chamado,
      duplicatas: dups,
      acompanhamento: `/cidadao.html?cidade=${slug}&protocolo=${chamado.protocolo}`,
    });
  }

  const patchMatch = pathname.match(/^\/api\/chamados\/([^/]+)$/);
  if (patchMatch && req.method === 'PATCH') {
    const slug = requireTenant(req, url, res);
    if (!slug) return;
    const user = currentUser(req);
    if (!user || !['admin', 'prefeito', 'secretaria', 'campo'].includes(user.papel)) {
      return sendJSON(res, 401, { error: 'Não autorizado' });
    }
    if (user.cidade && user.cidade !== slug) {
      return sendJSON(res, 403, { error: 'Sessão de outro município' });
    }

    const body = await readBody(req);
    const chamados = readTenant(slug, 'chamados.json', []);
    const idx = chamados.findIndex(c => c.id === patchMatch[1] || c.protocolo === patchMatch[1]);
    if (idx < 0) return sendJSON(res, 404, { error: 'Chamado não encontrado' });

    const c = normalizeChamado(chamados[idx]);
    if (user.papel === 'secretaria' && c.secretaria !== user.secretaria) {
      return sendJSON(res, 403, { error: 'Chamado de outra secretaria' });
    }

    const now = new Date().toISOString();
    const validStatus = STATUS.map(s => s.id);

    if (body.status) {
      const st = normalizeStatus(body.status);
      if (!validStatus.includes(st)) {
        return sendJSON(res, 400, { error: 'Status inválido', validos: validStatus });
      }
      const statusAnterior = c.status;
      c.status = st;
      c.historico.push({
        em: now, status: st,
        nota: body.nota || `Status: ${st}`,
        por: user.nome,
      });
      // Avisa a equipe de campo quando a secretaria encaminha
      if (st === 'encaminhado' && statusAnterior !== 'encaminhado') {
        const notifs = readTenant(slug, 'notificacoes.json', []);
        notifs.unshift({
          id: 'N-' + Date.now(),
          em: now,
          canal: 'app',
          tipo: 'os_campo',
          titulo: `Nova OS · ${c.protocolo}`,
          destino: 'campo',
          secretaria: c.secretaria,
          mensagem: `${c.titulo} · ${c.bairro || ''} — encaminhada à equipe`,
          chamadoId: c.id,
          lida: false,
        });
        writeTenant(slug, 'notificacoes.json', notifs.slice(0, 300));
      }
      if (st === 'concluido' && c.cidadao?.telefone) {
        c.historico.push({
          em: now, status: 'concluido',
          nota: 'Pronto para notificar o cidadão via WhatsApp',
          por: 'sistema',
        });
      }
      if (st === 'cancelado') {
        c.historico.push({
          em: now, status: 'cancelado',
          nota: body.motivoCancelamento || body.nota || 'Chamado cancelado',
          por: user.nome,
        });
      }
    }
    if (body.prioridade) c.prioridade = body.prioridade;
    if (body.descricao != null) c.descricao = body.descricao;
    if (body.bairro != null) c.bairro = body.bairro;
    if (body.endereco != null) c.endereco = body.endereco;
    if (body.titulo != null) c.titulo = body.titulo;
    if (body.equipeId != null) c.equipeId = body.equipeId;
    if (body.categoria) {
      const cats = readTenant(slug, 'categorias.json', []);
      const cat = cats.find(x => x.id === body.categoria);
      if (cat) {
        c.categoria = cat.id;
        c.secretaria = cat.secretaria;
        c.titulo = cat.label;
      }
    }
    if (body.nota && !body.status) {
      c.historico.push({ em: now, status: c.status, nota: body.nota, por: user.nome });
    }
    c.atualizadoEm = now;
    chamados[idx] = c;
    writeTenant(slug, 'chamados.json', chamados);
    return sendJSON(res, 200, c);
  }

  if (pathname === '/api/metricas' && req.method === 'GET') {
    const slug = requireTenant(req, url, res);
    if (!slug) return;
    const { metricsFull } = require('./lib/plataforma.js');
    return sendJSON(res, 200, metricsFull(slug, readTenant));
  }

  if (pathname === '/api/obras' && req.method === 'GET') {
    const slug = requireTenant(req, url, res);
    if (!slug) return;
    return sendJSON(res, 200, readTenant(slug, 'obras.json', []));
  }

  if (pathname === '/api/postes/report' && req.method === 'POST') {
    const slug = requireTenant(req, url, res);
    if (!slug) return;
    const body = await readBody(req);
    if (!body.posteId) return sendJSON(res, 400, { error: 'posteId obrigatório' });
    const chamados = readTenant(slug, 'chamados.json', []);
    const n = 1000 + chamados.length + 1;
    const now = new Date().toISOString();
    const cfg = readTenant(slug, 'config.json', {});
    const prefix = slug.slice(0, 3).toUpperCase();
    const chamado = {
      id: `${prefix}-${n}`,
      protocolo: `${new Date().getFullYear()}${n}`,
      categoria: 'lampada',
      secretaria: 'iluminacao',
      titulo: 'Lâmpada apagada',
      descricao: `Poste ${body.posteId} — lâmpada apagada (via QR Code)`,
      bairro: body.bairro || 'Não informado',
      endereco: body.endereco || `Poste ${body.posteId}`,
      lat: Number(body.lat) || cfg.lat,
      lng: Number(body.lng) || cfg.lng,
      status: 'novo',
      prioridade: 'media',
      cidadao: { nome: body.nome || 'Cidadão (QR)', telefone: body.telefone || '' },
      foto: body.foto || null,
      posteId: String(body.posteId),
      historico: [{ em: now, status: 'novo', nota: `QR Poste ${body.posteId}` }],
      criadoEm: now,
      atualizadoEm: now,
    };
    chamados.push(chamado);
    writeTenant(slug, 'chamados.json', chamados);
    return sendJSON(res, 201, chamado);
  }

  if (pathname === '/api/chat' && req.method === 'POST') {
    const slug = resolveSlug(req, url);
    const body = await readBody(req);
    const q = (body.message || '').toLowerCase();
    const cfg = slug ? readTenant(slug, 'config.json', {}) : {};
    const cidade = cfg.cidade || 'sua cidade';
    let reply = `Sou o Agente Virtual da Prefeitura de ${cidade}. Posso ajudar com IPTU, saúde, educação, protocolos e secretarias.`;
    if (q.includes('iptu')) {
      reply = `Para IPTU em ${cidade}: procure a Secretaria da Fazenda. Em breve este assistente emitirá 2ª via.`;
    } else if (q.includes('buraco') || q.includes('lâmpada') || q.includes('lampada') || q.includes('lixo')) {
      reply = 'Para reportar problemas urbanos, use o app Cidadão — tire uma foto e acompanhe o protocolo.';
    } else if (q.includes('obra')) {
      reply = 'Veja o mapa de Obras Transparentes. Verde = concluídas, amarelo = andamento, vermelho = atrasadas.';
    } else if (q.includes('município') || q.includes('prefeitura') || q.includes('cadastrar')) {
      reply = 'Novas prefeituras entram como módulos depois do piloto de Bacabal — sem copiar o que grandes plataformas já fazem.';
    }
    return sendJSON(res, 200, { reply });
  }

  // —— Módulos wedge (IA, rota, WhatsApp, parecer) ——

  if (pathname === '/api/ia/foto' && req.method === 'POST') {
    const slug = requireTenant(req, url, res);
    if (!slug) return;
    const body = await readBody(req);
    const categorias = readTenant(slug, 'categorias.json', []);
    const result = analisarFoto({
      foto: body.foto,
      texto: body.texto || body.descricao || '',
      categorias,
    });
    return sendJSON(res, 200, result);
  }

  if (pathname === '/api/ia/aprovacao' && req.method === 'POST') {
    const slug = requireTenant(req, url, res);
    if (!slug) return;
    const body = await readBody(req);
    const result = analisarAprovacao({
      fotoAntes: body.fotoAntes || body.foto || null,
      fotoDepois: body.fotoDepois || null,
      texto: body.texto || body.descricao || '',
      titulo: body.titulo || '',
    });
    return sendJSON(res, 200, result);
  }

  if (pathname === '/api/ia/secretaria' && req.method === 'POST') {
    const slug = requireTenant(req, url, res);
    if (!slug) return;
    const body = await readBody(req);
    const user = currentUser(req);
    const cfg = readTenant(slug, 'config.json', {});
    const chamados = readTenant(slug, 'chamados.json', []);
    const secretaria = body.secretaria || user?.secretaria || null;
    const out = assistenteSecretaria({
      mensagem: body.message,
      chamados,
      secretaria,
      cidade: cfg.cidade,
    });
    return sendJSON(res, 200, out);
  }

  if (pathname === '/api/ia/gabinete' && req.method === 'POST') {
    const slug = requireTenant(req, url, res);
    if (!slug) return;
    const body = await readBody(req);
    const cfg = readTenant(slug, 'config.json', {});
    const chamados = readTenant(slug, 'chamados.json', []).map(normalizeChamado);
    const obras = readTenant(slug, 'obras.json', []);
    let metricas = {};
    try {
      // reutiliza lógica leve: taxa de resolução
      const total = chamados.length || 1;
      const ok = chamados.filter((c) => c.status === 'concluido').length;
      metricas = { taxaResolucao: Math.round((ok / total) * 100) };
    } catch (_) {}
    const cargo = (cfg.prefeita || slug === 'bomlugar') ? 'prefeita' : 'prefeito';
    const out = assistenteGabinete({
      opcao: body.opcao || body.option || 'ajuda',
      chamados,
      obras,
      metricas,
      cidade: cfg.cidade || slug,
      cargo,
    });
    return sendJSON(res, 200, out);
  }

  if (pathname === '/api/rota' && req.method === 'GET') {
    const slug = requireTenant(req, url, res);
    if (!slug) return;
    const cfg = readTenant(slug, 'config.json', {});
    const secretaria = url.searchParams.get('secretaria') || '';
    let all = readTenant(slug, 'chamados.json', []).map(normalizeChamado);
    if (secretaria) all = all.filter((c) => c.secretaria === secretaria);
    // Fila de campo: só o que a secretaria já encaminhou / está em execução
    const STATUS_CAMPO = new Set([
      'encaminhado', 'em_execucao', 'aguardando_material',
    ]);
    let list = all.filter((c) => STATUS_CAMPO.has(c.status));
    const origem = {
      lat: Number(url.searchParams.get('lat')) || cfg.lat,
      lng: Number(url.searchParams.get('lng')) || cfg.lng,
    };
    const mapPonto = (c) => ({
      id: c.id,
      protocolo: c.protocolo,
      titulo: c.titulo,
      descricao: c.descricao || '',
      bairro: c.bairro,
      status: c.status,
      prioridade: c.prioridade,
      secretaria: c.secretaria,
      categoria: c.categoria,
      demoFixo: c.demoFixo || null,
      lat: c.lat,
      lng: c.lng,
      criadoEm: c.criadoEm,
      atualizadoEm: c.atualizadoEm,
      foto: c.fotoAntes || c.foto || null,
      fotoAntes: c.fotoAntes || c.foto || null,
      fotoDepois: c.fotoDepois || null,
      cidadao: c.cidadao || null,
    });
    const pontos = list.map(mapPonto);
    // Mais recentes primeiro na fila de campo (além da rota otimizada)
    const recentes = [...pontos].sort((a, b) =>
      String(b.atualizadoEm || b.criadoEm || '').localeCompare(String(a.atualizadoEm || a.criadoEm || ''))
    ).slice(0, 8);
    const concluidos = all
      .filter((c) => c.status === 'concluido')
      .sort((a, b) =>
        String(b.atualizadoEm || b.criadoEm || '').localeCompare(String(a.atualizadoEm || a.criadoEm || ''))
      )
      .slice(0, 12)
      .map(mapPonto);
    return sendJSON(res, 200, {
      origem,
      ...roteirizar({ origem, pontos }),
      recentes,
      concluidos,
      pendentes: pontos.length,
      totalConcluidos: all.filter((c) => c.status === 'concluido').length,
    });
  }

  if (pathname === '/api/whatsapp/mensagem' && req.method === 'POST') {
    const slug = requireTenant(req, url, res);
    if (!slug) return;
    const body = await readBody(req);
    const cfg = readTenant(slug, 'config.json', {});
    const chamados = readTenant(slug, 'chamados.json', []);
    const c = chamados.find((x) => x.id === body.chamadoId || x.protocolo === body.protocolo);
    if (!c) return sendJSON(res, 404, { error: 'Chamado não encontrado' });
    const msg = mensagemWhatsApp(c, cfg.cidade, body.tipo || 'status');
    const log = readTenant(slug, 'whatsapp-log.json', []);
    log.unshift({
      em: new Date().toISOString(),
      chamadoId: c.id,
      tipo: body.tipo || 'status',
      texto: msg.texto,
      link: msg.link,
    });
    writeTenant(slug, 'whatsapp-log.json', log.slice(0, 200));
    return sendJSON(res, 200, { ...msg, chamado: { id: c.id, protocolo: c.protocolo } });
  }

  if (pathname === '/api/whatsapp/log' && req.method === 'GET') {
    const slug = requireTenant(req, url, res);
    if (!slug) return;
    return sendJSON(res, 200, readTenant(slug, 'whatsapp-log.json', []));
  }

  const parecerMatch = pathname.match(/^\/api\/parecer\/([^/]+)$/);
  if (parecerMatch && req.method === 'GET') {
    const slug = requireTenant(req, url, res);
    if (!slug) return;
    const cfg = readTenant(slug, 'config.json', {});
    const chamados = readTenant(slug, 'chamados.json', []);
    const c = chamados.find((x) => x.id === parecerMatch[1] || x.protocolo === parecerMatch[1]);
    if (!c) return sendJSON(res, 404, { error: 'Chamado não encontrado' });
    return sendJSON(res, 200, gerarParecer(c, cfg.cidade));
  }

  return sendJSON(res, 404, { error: 'Rota não encontrada' });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith('/api/')) {
      await handleAPI(req, res, url.pathname, url);
    } else if (url.pathname === '/' || url.pathname === '/index.html' || url.pathname.endsWith('.html')) {
      serveBrandedPage(req, res, url);
    } else {
      serveStatic(req, res, url.pathname);
    }
  } catch (e) {
    console.error(e);
    sendJSON(res, 500, { error: e.message || 'Erro interno' });
  }
});

server.listen(PORT, () => {
  try {
    seedDemosIa();
  } catch (_) {}
  console.log(`\n  Bacabal Conecta v3 → http://localhost:${PORT}`);
  console.log(`  Dados: ${DATA_DIR}${USING_VOLUME ? ' (volume Railway)' : ''}`);
  if (USING_VOLUME) console.log(`  Volume: ${process.env.RAILWAY_VOLUME_NAME || '?'} → ${process.env.RAILWAY_VOLUME_MOUNT_PATH || DATA_DIR}`);
  console.log(`  Health: /api/health`);
  console.log(`  Módulos: /modulos.html · Dashboard · Chamados · Mapa · IA`);
  console.log(`  Roteiro: ROTEIRO-VALIDACAO.md\n`);
});

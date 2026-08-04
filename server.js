// CidadeHub — plataforma multi-tenant para prefeituras (Node puro)
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const crypto = require('crypto');

const PORT = process.env.PORT || 4000;
const DATA_DIR = fs.existsSync('/app/data') ? '/app/data' : path.join(__dirname, 'data');
const TENANTS_DIR = path.join(DATA_DIR, 'tenants');
const PUBLIC_DIR = path.join(__dirname, 'public');
const SESSIONS = new Map();

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(TENANTS_DIR)) fs.mkdirSync(TENANTS_DIR, { recursive: true });

const {
  runSeed, slugify, DEFAULT_CATEGORIAS, DEFAULT_SECRETARIAS, criarTenant,
} = require('./scripts/seed.js');
const {
  analisarFoto,
  roteirizar,
  assistenteSecretaria,
  gerarParecer,
  mensagemWhatsApp,
} = require('./lib/avancado.js');
const {
  normalizeStatus, normalizeChamado, isPendente, detectarDuplicidade, STATUS,
} = require('./lib/plataforma.js');
const { handleModulos, migrateTenant } = require('./lib/rotas-modulos.js');

// Seed se ainda não houver municípios
if (!fs.existsSync(path.join(DATA_DIR, 'municipios.json'))) {
  runSeed();
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

/** Garante chamado demo com foto de buraco (arquivo estático) — sobrevive a redeploy no Railway. */
function ensureDemoChamado(slug = 'bacabal') {
  const fotoFile = path.join(PUBLIC_DIR, 'assets', 'buraco-demo-antes.jpg');
  if (!fs.existsSync(fotoFile)) return;
  if (!getMunicipio(slug) && !fs.existsSync(tenantPath(slug, 'chamados.json'))) return;

  const fotoUrl = '/assets/buraco-demo-antes.jpg';
  const chamados = readTenant(slug, 'chamados.json', []);
  const cfg = readTenant(slug, 'config.json', {});
  const cats = readTenant(slug, 'categorias.json', []);
  const cat = cats.find(c => c.id === 'buraco') || cats[0];
  if (!cat) return;

  const now = new Date().toISOString();
  const idx = chamados.findIndex(x => x.demoFixo === 'buraco-foto' || x.id === 'BAC-DEMO-BURACO');
  const base = {
    id: 'BAC-DEMO-BURACO',
    protocolo: '20261064',
    categoria: cat.id,
    secretaria: 'obras',
    titulo: cat.label || 'Buraco / Tapa-buraco',
    descricao: 'buraco na rua 11 — demo com foto para Secretaria de Obras e equipe de campo',
    bairro: 'Centro',
    endereco: 'Rua 11 — ponto de demonstração',
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
    chamados.unshift(normalizeChamado({
      ...base,
      status: 'novo',
      historico: [{ em: now, status: 'novo', nota: 'Chamado demo fixo com foto (não some no redeploy)' }],
      criadoEm: now,
    }));
  } else {
    const prev = chamados[idx];
    // Não sobrescreve progresso (aprovação, foto depois, status)
    if (!prev.foto && !prev.fotoAntes) {
      prev.foto = fotoUrl;
      prev.fotoAntes = fotoUrl;
    }
    if (!prev.secretaria) prev.secretaria = 'obras';
    if (!prev.demoFixo) prev.demoFixo = 'buraco-foto';
    chamados[idx] = normalizeChamado(prev);
  }
  writeTenant(slug, 'chamados.json', chamados);
}

try {
  ensureDemoChamado('bacabal');
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

function currentUser(req) {
  const token = getToken(req);
  if (!token || !SESSIONS.has(token)) return null;
  return SESSIONS.get(token);
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
    produto: body.produto || `${nome} Inteligente`,
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
        const token = crypto.randomBytes(24).toString('hex');
        const session = { id: u.id, nome: u.nome, papel: 'platform', cidade: null };
        SESSIONS.set(token, session);
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

    const token = crypto.randomBytes(24).toString('hex');
    const session = {
      id: u.id,
      nome: u.nome,
      papel: u.papel,
      secretaria: u.secretaria,
      equipeId: u.equipeId || null,
      perfil: u.perfil || u.papel,
      cidade,
    };
    SESSIONS.set(token, session);
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
      foto: body.foto || null,
      fotoAntes: body.foto || null,
      fotoDepois: null,
      anexos: body.foto ? [{ tipo: 'foto', url: body.foto, em: now }] : [],
      posteId: body.posteId || null,
      historico: [{
        em: now,
        status: 'novo',
        nota: body.foto ? 'Chamado aberto pelo cidadão com foto' : 'Chamado aberto pelo cidadão',
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
      c.status = st;
      c.historico.push({
        em: now, status: st,
        nota: body.nota || `Status: ${st}`,
        por: user.nome,
      });
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

  if (pathname === '/api/rota' && req.method === 'GET') {
    const slug = requireTenant(req, url, res);
    if (!slug) return;
    const cfg = readTenant(slug, 'config.json', {});
    const secretaria = url.searchParams.get('secretaria') || '';
    let all = readTenant(slug, 'chamados.json', []).map(normalizeChamado);
    if (secretaria) all = all.filter((c) => c.secretaria === secretaria);
    let list = all.filter((c) => isPendente(c.status));
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
    } else {
      serveStatic(req, res, url.pathname);
    }
  } catch (e) {
    console.error(e);
    sendJSON(res, 500, { error: e.message || 'Erro interno' });
  }
});

server.listen(PORT, () => {
  try { ensureDemoChamado('bacabal'); } catch (_) {}
  console.log(`\n  Bacabal Inteligente v3 → http://localhost:${PORT}`);
  console.log(`  Dados: ${DATA_DIR}`);
  console.log(`  Módulos: /modulos.html · Dashboard · Chamados · Mapa · IA`);
  console.log(`  Roteiro: ROTEIRO-VALIDACAO.md\n`);
});

const CIDADE_PADRAO = 'bacabal';

function getCidade() {
  const params = new URLSearchParams(location.search);
  const fromUrl = params.get('cidade');
  if (fromUrl) {
    localStorage.setItem('ch_cidade', fromUrl);
    return fromUrl;
  }
  return localStorage.getItem('ch_cidade') || CIDADE_PADRAO;
}

function setCidade(slug) {
  localStorage.setItem('ch_cidade', slug || CIDADE_PADRAO);
}

function withCidade(path) {
  return cityLink(path);
}

function cityLink(href) {
  const slug = getCidade();
  if (!slug || !href) return href;
  try {
    const u = new URL(href, location.origin);
    // Só paths do app (não mailto/http externo)
    if (u.protocol === 'mailto:' || u.protocol === 'tel:') return href;
    if (u.origin !== location.origin && href.startsWith('http')) return href;
    u.searchParams.set('cidade', slug);
    if (href.startsWith('http')) return u.toString();
    return u.pathname + u.search + u.hash;
  } catch {
    const sep = href.includes('?') ? '&' : '?';
    if (/[?&]cidade=/.test(href)) {
      return href.replace(/([?&]cidade=)[^&]*/, `$1${encodeURIComponent(slug)}`);
    }
    return href + sep + 'cidade=' + encodeURIComponent(slug);
  }
}

/** Mantém a cidade atual em todos os links internos da página. */
function rewriteCityLinks(root) {
  const scope = root || document;
  const slug = getCidade();
  scope.querySelectorAll('a[href]').forEach((a) => {
    const href = a.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
    if (href.startsWith('http') && !href.includes(location.host)) return;
    try {
      const u = new URL(href, location.origin);
      const path = u.pathname || '/';
      const isApp =
        path === '/' ||
        path.endsWith('.html') ||
        path.startsWith('/api/');
      if (!isApp) return;
      u.searchParams.set('cidade', slug);
      a.setAttribute('href', u.pathname + u.search + u.hash);
    } catch (_) { /* ok */ }
  });
}

/** Lê ?cidade=, grava no storage e reescreve links. Chamar em toda página do app. */
function initCidade() {
  const slug = getCidade();
  setCidade(slug);
  rewriteCityLinks();
  return slug;
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initCidade());
  } else {
    initCidade();
  }
}

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  const tokenKey = (typeof authTokenKey === 'function') ? authTokenKey() : 'bi_token';
  const token = localStorage.getItem(tokenKey) || (!window.BI_AUTH_SLOT ? localStorage.getItem('bi_token') : null);
  if (token) headers.Authorization = `Bearer ${token}`;
  const slug = getCidade();
  if (slug) headers['X-Cidade'] = slug;

  const url = path.startsWith('/api/') ? withCidade(path) : path;
  const res = await fetch(url, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) {
      localStorage.removeItem(tokenKey);
      throw new Error(data.error || 'Não autorizado — faça login de novo nesta tela');
    }
    throw new Error(data.error || 'Erro na requisição');
  }
  return data;
}

/** Slot por tela: secretaria e campo podem ficar logados ao mesmo tempo (abas diferentes). */
function authTokenKey() {
  const slot = window.BI_AUTH_SLOT;
  if (slot === 'secretaria') return 'bi_token_secretaria';
  if (slot === 'campo') return 'bi_token_campo';
  if (slot === 'gabinete') return 'bi_token_gabinete';
  return 'bi_token';
}

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

/** Evita botão sumir: mostra "Enviando…" e mantém cor até terminar. */
async function withBusy(btn, busyLabel, fn) {
  if (!btn) return fn();
  if (btn.dataset.busy === '1') return;
  const original = btn.textContent;
  btn.dataset.busy = '1';
  btn.disabled = true;
  btn.classList.add('btn-busy');
  btn.setAttribute('aria-busy', 'true');
  btn.textContent = busyLabel || 'Aguarde…';
  try {
    return await fn();
  } finally {
    btn.dataset.busy = '0';
    btn.disabled = false;
    btn.classList.remove('btn-busy');
    btn.removeAttribute('aria-busy');
    btn.textContent = original;
  }
}

/** Reduz foto do celular para gravar no servidor (base64 leve). */
function compressImageDataUrl(dataUrl, maxW = 1280, quality = 0.72) {
  return new Promise((resolve) => {
    if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image')) {
      resolve(dataUrl);
      return;
    }
    const img = new Image();
    img.onload = () => {
      try {
        let w = img.naturalWidth || img.width;
        let h = img.naturalHeight || img.height;
        if (!w || !h) { resolve(dataUrl); return; }
        if (w > maxW) {
          h = Math.round(h * (maxW / w));
          w = maxW;
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch (_) {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

function statusLabel(s) {
  return ({
    novo: 'Novo',
    aberto: 'Novo',
    em_analise: 'Em análise',
    encaminhado: 'Encaminhado',
    em_execucao: 'Em execução',
    em_andamento: 'Em execução',
    aguardando_material: 'Aguardando material',
    aguardando_aprovacao: 'Aguardando aprovação',
    concluido: 'Concluído',
    cancelado: 'Cancelado',
  })[s] || s;
}

function badge(status) {
  const s = ({ aberto: 'novo', em_andamento: 'em_execucao' })[status] || status;
  return `<span class="badge badge-${s}">${statusLabel(status)}</span>`;
}

/** Antes (cidadão) x Depois (campo) — visível para cidadão, secretaria e gabinete */
function antesDepoisHtml(c) {
  const antes = c.fotoAntes || c.foto;
  const depois = c.fotoDepois;
  if (!antes && !depois) return '';
  return `
    <div class="antes-depois">
      <div class="antes-depois-item">
        <div class="antes-depois-label">Antes</div>
        ${antes
          ? `<img class="preview show foto-zoom" src="${antes}" alt="Foto antes" onclick="openFotoLightbox(this.src)" />`
          : `<div class="antes-depois-empty">Sem foto</div>`}
      </div>
      <div class="antes-depois-item">
        <div class="antes-depois-label">Depois</div>
        ${depois
          ? `<img class="preview show foto-zoom" src="${depois}" alt="Foto depois" onclick="openFotoLightbox(this.src)" />`
          : `<div class="antes-depois-empty">${
              c.status === 'concluido'
                ? 'Aguardando registro'
                : c.status === 'aguardando_aprovacao'
                  ? 'Enviado — secretaria avaliando'
                  : 'Equipe ainda não enviou'
            }</div>`}
      </div>
    </div>
  `;
}

function openFotoLightbox(src) {
  if (!src) return;
  let box = document.getElementById('fotoLightbox');
  if (!box) {
    box = document.createElement('div');
    box.id = 'fotoLightbox';
    box.className = 'foto-lightbox';
    box.innerHTML = `
      <button type="button" class="foto-lightbox-close" aria-label="Fechar">×</button>
      <img alt="Foto ampliada" />
    `;
    box.addEventListener('click', (e) => {
      if (e.target === box || e.target.classList.contains('foto-lightbox-close')) {
        box.classList.remove('open');
      }
    });
    document.body.appendChild(box);
  }
  box.querySelector('img').src = src;
  box.classList.add('open');
}
window.openFotoLightbox = openFotoLightbox;

function prioridadeLabel(p) {
  return ({ baixa: 'Baixa', media: 'Média', alta: 'Alta' })[p] || p || 'Média';
}

function timelineHtml(historico) {
  if (!historico?.length) return '<p class="muted">Sem histórico.</p>';
  return `<div class="timeline">${historico.map(h => `
    <div class="timeline-item">
      <div class="timeline-dot badge-${h.status || 'aberto'}"></div>
      <div>
        <strong>${statusLabel(h.status)}</strong>
        <div class="meta">${fmtDate(h.em)}${h.por ? ' · ' + h.por : ''}</div>
        <div class="muted">${h.nota || ''}</div>
      </div>
    </div>
  `).join('')}</div>`;
}

function saveMeuProtocolo(protocolo) {
  const key = 'bi_protocolos_' + getCidade();
  const list = JSON.parse(localStorage.getItem(key) || '[]');
  if (!list.includes(protocolo)) list.unshift(protocolo);
  localStorage.setItem(key, JSON.stringify(list.slice(0, 12)));
}

function meusProtocolos() {
  return JSON.parse(localStorage.getItem('bi_protocolos_' + getCidade()) || '[]');
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copiado: ' + text);
  } catch {
    toast(text);
  }
}

function money(n) {
  return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function applyTheme(tema, slug) {
  if (!tema) return;
  const root = document.documentElement;
  if (tema.primaria) {
    root.style.setProperty('--brand', tema.primaria);
    root.style.setProperty('--royal-mid', tema.primaria);
  }
  if (tema.secundaria) {
    root.style.setProperty('--brand-dim', tema.secundaria);
    root.style.setProperty('--royal', tema.secundaria);
  }
  // Landing: Bacabal mantém laranja/verde do portal.
  // Outras cidades (ou tema.homeAccent) usam as cores do brasão/config.
  const accent = tema.homeAccent || (slug && slug !== 'bacabal' ? tema.primaria : null);
  if (accent) {
    root.style.setProperty('--home-accent', accent);
    root.style.setProperty('--home-accent-deep', tema.homeAccentDeep || tema.secundaria || accent);
  }
  if (tema.homeGreen) {
    root.style.setProperty('--home-green', tema.homeGreen);
    root.style.setProperty('--home-green-deep', tema.homeGreenDeep || tema.homeGreen);
  } else if (slug && slug !== 'bacabal' && tema.secundaria) {
    root.style.setProperty('--home-green', tema.secundaria);
    root.style.setProperty('--home-green-deep', tema.secundaria);
  }
}

/** Troca textos/logo "Bacabal" pela cidade ativa (cidadão, login, gabinete, etc.). */
function brandText(text, cfg) {
  if (!text || !cfg) return text;
  const produto = cfg.produto || 'Cidade Conecta';
  const cidade = cfg.cidade || '';
  let out = String(text)
    .replace(/Bacabal Conecta/g, produto)
    .replace(/Prefeitura Municipal de Bacabal/g, `Prefeitura Municipal de ${cidade}`)
    .replace(/Prefeitura de Bacabal/g, `Prefeitura de ${cidade}`)
    .replace(/Hospital Municipal de Bacabal/g, `Hospital Municipal de ${cidade}`)
    .replace(/gestor de Bacabal/g, `gestor de ${cidade}`)
    .replace(/\bBacabal\b/g, cidade);

  // Bom Lugar: prefeita (Marlene Silva Miranda)
  if ((cfg.slug || getCidade()) === 'bomlugar') {
    out = out
      .replace(/Gabinete do Prefeito/g, 'Gabinete da Prefeita')
      .replace(/Entrar como prefeito/g, 'Entrar como prefeita')
      .replace(/Logado: Prefeito/g, 'Logado: Prefeita')
      .replace(/Observação do prefeito/g, 'Observação da prefeita')
      .replace(/TV do prefeito/g, 'TV da prefeita')
      .replace(/Cobrança do prefeito/g, 'Cobrança da prefeita')
      .replace(/Carta ao prefeito/g, 'Carta à prefeita')
      .replace(/Piloto · Prefeitura de Bom Lugar/g, 'Piloto · Prefeitura de Bom Lugar')
      .replace(/Gabinete do Prefeito/gi, 'Gabinete da Prefeita');
  }
  return out;
}

function applyPageBrand(cfg) {
  if (!cfg) return cfg;
  const slug = cfg.slug || getCidade();
  const logo = cfg.logo || '/assets/logo-prefeitura.png';
  const produto = cfg.produto || 'Cidade Conecta';
  const cidade = cfg.cidade || '';

  document.documentElement.dataset.cidade = slug;
  document.title = brandText(document.title, cfg);

  const meta = document.querySelector('meta[name="description"]');
  if (meta) meta.setAttribute('content', brandText(meta.getAttribute('content') || '', cfg));

  const fav = document.querySelector('link[rel="icon"]');
  if (fav) fav.href = logo;

  const walk = (root) => {
    const nodes = root.querySelectorAll(
      'h1,h2,h3,h4,p,span,strong,b,label,li,a,button,td,th,.page-kicker,.pitch-kicker,.carta-kicker,.eyebrow,.muted,.display'
    );
    nodes.forEach((el) => {
      if (el.closest('script,style,code,pre,textarea,input,select')) return;
      // Evita páginas internas de venda fixas em Bacabal
      if (el.closest('[data-keep-bacabal]')) return;
      if (!/Bacabal/i.test(el.textContent || '')) return;

      if (el.childElementCount === 0) {
        el.textContent = brandText(el.textContent, cfg);
        return;
      }
      el.childNodes.forEach((n) => {
        if (n.nodeType === 3 && /Bacabal/i.test(n.nodeValue || '')) {
          n.nodeValue = brandText(n.nodeValue, cfg);
        }
      });
      el.querySelectorAll('strong,b,span,em').forEach((c) => {
        if (c.childElementCount === 0 && /Bacabal/i.test(c.textContent || '')) {
          c.textContent = brandText(c.textContent, cfg);
        }
      });
    });
  };
  walk(document.body || document);

  if (slug !== 'bacabal' && logo) {
    document.querySelectorAll('img').forEach((img) => {
      const src = img.getAttribute('src') || '';
      const alt = img.getAttribute('alt') || '';
      if (/logo-prefeitura|Brasão de Bacabal|Brasao de Bacabal/i.test(src + alt)) {
        img.src = logo;
        img.alt = brandText(alt || `Brasão de ${cidade}`, cfg);
      }
    });
  }

  // Login / headers comuns
  const loginLogo = document.querySelector('.login-box img');
  if (loginLogo && slug !== 'bacabal' && logo) {
    loginLogo.src = logo;
    loginLogo.alt = `Brasão de ${cidade}`;
  }

  window.__CITY_CFG = cfg;
  window.__CITY_PRODUTO = produto;
  window.__CITY_NOME = cidade;
  return cfg;
}

async function loadCityBrand() {
  const slug = getCidade();
  if (!slug) return null;
  try {
    const cfg = await api('/api/config');
    applyTheme(cfg.tema, slug);
    applyPageBrand(cfg);
    return cfg;
  } catch {
    return null;
  }
}

function requireCidade() {
  setCidade(getCidade() || CIDADE_PADRAO);
  return true;
}

function setSession(token, user) {
  const key = authTokenKey();
  if (token) localStorage.setItem(key, token);
  // Compat: mantém bi_token se não houver slot (páginas antigas)
  if (token && !window.BI_AUTH_SLOT) localStorage.setItem('bi_token', token);
  if (user) localStorage.setItem(key + '_user', JSON.stringify(user));
}

function clearSession() {
  const key = authTokenKey();
  localStorage.removeItem(key);
  localStorage.removeItem(key + '_user');
  if (!window.BI_AUTH_SLOT) {
    localStorage.removeItem('bi_token');
    localStorage.removeItem('bi_user');
  }
}

function getSessionUser() {
  try {
    return JSON.parse(localStorage.getItem(authTokenKey() + '_user') || localStorage.getItem('bi_user') || 'null');
  } catch {
    return null;
  }
}

function logout() {
  clearSession();
  location.href = cityLink('/login.html');
}

function topbar(active, cfg) {
  const nome = cfg?.produto || window.__CITY_PRODUTO || 'Cidade Conecta';
  const sub = cfg?.tagline
    || `${cfg?.cidade || window.__CITY_NOME || ''} · ${cfg?.uf || 'MA'}`;
  const user = getSessionUser();

  // Público: só o essencial. Áreas internas só após login.
  let links = [
    [cityLink('/'), 'Início'],
    [cityLink('/fluxo.html'), 'Como funciona'],
    [cityLink('/cidadao.html'), 'Cidadão'],
    [cityLink('/mapa.html'), 'Mapa'],
  ];

  if (!user) {
    links.push([cityLink('/login.html'), 'Área administrativa']);
  } else {
    const papel = user.papel;
    if (papel === 'prefeito' || papel === 'admin') {
      links.push([cityLink('/prefeito.html'), 'Gabinete']);
    }
    if (papel === 'secretaria' || papel === 'admin') {
      links.push([cityLink('/secretaria.html'), 'Minha secretaria']);
    }
    if (papel === 'campo' || papel === 'admin' || papel === 'secretaria') {
      links.push([cityLink('/equipes.html'), 'Campo']);
    }
    if (papel === 'prefeito' || papel === 'admin') {
      links.push([cityLink('/acessos.html'), 'Acessos']);
    }
    if (papel === 'admin') {
      links.push([cityLink('/admin-sistema.html'), 'Sistema']);
    }
  }

  const userBit = user
    ? `<span class="nav-user">${user.nome || user.id}</span>
       <button type="button" class="nav-logout" onclick="logout()">Sair</button>`
    : '';

  return `
  <div class="topbar">
    <a class="brand" href="${cityLink('/')}">
      <div class="brand-mark"><img src="${cfg?.logo || '/assets/logo-prefeitura.png'}" alt="Brasão de ${cfg?.cidade || ''}" /></div>
      <div>
        <strong>${nome}</strong>
        <span>${sub}</span>
      </div>
    </a>
    <nav class="nav">
      ${links.map(([href, label]) =>
        `<a href="${href}" class="${active === label ? 'active' : ''}">${label}</a>`
      ).join('')}
      ${userBit}
    </nav>
  </div>`;
}

function downloadText(nome, conteudo, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([conteudo], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  a.click();
  URL.revokeObjectURL(a.href);
}

function statusOptions(selected) {
  const all = [
    ['novo', 'Novo'],
    ['em_analise', 'Em análise'],
    ['encaminhado', 'Encaminhado'],
    ['em_execucao', 'Em execução'],
    ['aguardando_material', 'Aguardando material'],
    ['concluido', 'Concluído'],
    ['cancelado', 'Cancelado'],
  ];
  return all.map(([v, l]) =>
    `<option value="${v}" ${selected === v ? 'selected' : ''}>${l}</option>`
  ).join('');
}

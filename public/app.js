const CIDADE_PADRAO = 'bacabal';

function getCidade() {
  const params = new URLSearchParams(location.search);
  const slug = params.get('cidade') || localStorage.getItem('ch_cidade') || CIDADE_PADRAO;
  if (!localStorage.getItem('ch_cidade')) localStorage.setItem('ch_cidade', slug);
  return slug;
}

function setCidade(slug) {
  localStorage.setItem('ch_cidade', slug || CIDADE_PADRAO);
}

function withCidade(path) {
  const slug = getCidade();
  if (!slug) return path;
  const sep = path.includes('?') ? '&' : '?';
  return path + sep + 'cidade=' + encodeURIComponent(slug);
}

function cityLink(href) {
  const slug = getCidade();
  if (!slug) return href;
  if (href.includes('?')) return href + '&cidade=' + encodeURIComponent(slug);
  return href + '?cidade=' + encodeURIComponent(slug);
}

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  const token = localStorage.getItem('bi_token');
  if (token) headers.Authorization = `Bearer ${token}`;
  const slug = getCidade();
  if (slug) headers['X-Cidade'] = slug;

  const url = path.startsWith('/api/') ? withCidade(path) : path;
  const res = await fetch(url, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Erro na requisição');
  return data;
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
          : `<div class="antes-depois-empty">${c.status === 'concluido' ? 'Aguardando registro' : 'Equipe ainda não enviou'}</div>`}
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

function applyTheme(tema) {
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
}

async function loadCityBrand() {
  const slug = getCidade();
  if (!slug) return null;
  try {
    const cfg = await api('/api/config');
    applyTheme(cfg.tema);
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
  if (token) localStorage.setItem('bi_token', token);
  if (user) localStorage.setItem('bi_user', JSON.stringify(user));
}

function clearSession() {
  localStorage.removeItem('bi_token');
  localStorage.removeItem('bi_user');
}

function getSessionUser() {
  try {
    return JSON.parse(localStorage.getItem('bi_user') || 'null');
  } catch {
    return null;
  }
}

function logout() {
  clearSession();
  location.href = cityLink('/login.html');
}

function topbar(active, cfg) {
  const nome = cfg?.produto || 'Bacabal Inteligente';
  const sub = `${cfg?.cidade || 'Bacabal'} · ${cfg?.uf || 'MA'}`;
  const user = getSessionUser();

  // Público: só o essencial. Áreas internas só após login.
  let links = [
    ['/', 'Início'],
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
    if (papel === 'campo' || papel === 'admin') {
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
    <a class="brand" href="/">
      <div class="brand-mark"><img src="/assets/logo-prefeitura.png" alt="Brasão de Bacabal" /></div>
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

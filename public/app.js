const CIDADE_PADRAO = 'bacabal';

function getCidade() {
  const params = new URLSearchParams(location.search);
  const fromUrl = params.get('cidade');
  if (fromUrl) {
    const slug = String(fromUrl).trim().toLowerCase();
    localStorage.setItem('ch_cidade', slug);
    return slug;
  }
  const stored = localStorage.getItem('ch_cidade');
  return (stored ? String(stored).trim().toLowerCase() : '') || CIDADE_PADRAO;
}

function setCidade(slug) {
  localStorage.setItem('ch_cidade', String(slug || CIDADE_PADRAO).trim().toLowerCase());
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
  const isLogin = typeof path === 'string' && path.includes('/api/login');
  if (!isLogin && !opts.skipAuth) {
    const tokenKey = (typeof authTokenKey === 'function') ? authTokenKey() : 'bi_token';
    // Só o slot atual + legado bi_token — NÃO misturar gabinete/campo/secretaria
    const token = localStorage.getItem(tokenKey) || localStorage.getItem('bi_token');
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const slug = getCidade();
  if (slug) headers['X-Cidade'] = slug;

  const url = path.startsWith('/api/') ? withCidade(path) : path;
  const res = await fetch(url, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && !isLogin) {
      const tokenKey = (typeof authTokenKey === 'function') ? authTokenKey() : 'bi_token';
      localStorage.removeItem(tokenKey);
      localStorage.removeItem(tokenKey + '_user');
      // Limpa legado inválido se era ele que estava em uso
      if (!localStorage.getItem(tokenKey)) {
        localStorage.removeItem('bi_token');
        localStorage.removeItem('bi_user');
      }
      throw new Error(data.error || 'Não autorizado — faça login de novo nesta tela');
    }
    throw new Error(data.error || data.message || ('Erro na requisição (' + res.status + ')'));
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

/** Status “público” — esconde jargão interno (material / aprovação). */
function statusPublicoId(s) {
  const n = ({ aberto: 'novo', em_andamento: 'em_execucao' })[s] || s;
  return ({
    novo: 'novo',
    em_analise: 'em_analise',
    encaminhado: 'encaminhado',
    em_execucao: 'em_execucao',
    aguardando_material: 'em_execucao',
    aguardando_aprovacao: 'em_execucao',
    concluido: 'concluido',
    cancelado: 'cancelado',
  })[n] || n;
}

function statusLabelPublico(s) {
  return ({
    novo: 'Recebido',
    aberto: 'Recebido',
    em_analise: 'Em análise',
    encaminhado: 'Encaminhado à equipe',
    em_execucao: 'Em execução',
    em_andamento: 'Em execução',
    aguardando_material: 'Em execução',
    aguardando_aprovacao: 'Quase pronto',
    concluido: 'Concluído',
    cancelado: 'Cancelado',
  })[s] || statusLabel(s);
}

function badge(status) {
  const s = ({ aberto: 'novo', em_andamento: 'em_execucao' })[status] || status;
  return `<span class="badge badge-${s}">${statusLabel(status)}</span>`;
}

/** Badge do portal do cidadão / mapa público. */
function badgePublico(status) {
  const css = statusPublicoId(status);
  return `<span class="badge badge-${css}">${statusLabelPublico(status)}</span>`;
}

/** Galeria de miniaturas (clique amplia). */
function fotoGaleriaHtml(urls, label) {
  const list = (urls || []).filter(Boolean);
  if (!list.length) {
    return `<div class="antes-depois-empty">Sem foto</div>`;
  }
  const capa = list[0];
  const extras = list.slice(1);
  return `
    <img class="preview show foto-zoom" src="${capa}" alt="${label}" onclick="openFotoLightbox(this.src)" />
    ${extras.length ? `
      <div class="foto-thumbs">
        ${list.map((u, i) => `
          <button type="button" class="foto-thumb ${i === 0 ? 'on' : ''}" data-foto-src="${String(u).replace(/"/g, '&quot;')}" title="Foto ${i + 1}">
            <img src="${u}" alt="" />
          </button>
        `).join('')}
      </div>
      <div class="foto-count muted">${list.length} fotos</div>
    ` : ''}
  `;
}

/** Quando a equipe de campo enviou a foto do depois (histórico ou atualização). */
function campoEnviouEm(c) {
  if (!c) return null;
  if (c.fotoDepois || c.status === 'aguardando_aprovacao' || c.status === 'concluido') {
    const hist = [...(c.historico || [])].reverse();
    const hit = hist.find((h) =>
      h.status === 'aguardando_aprovacao' ||
      /foto|depois|campo|prova|enviou/i.test(String(h.nota || ''))
    );
    return hit?.em || c.atualizadoEm || null;
  }
  const hist = [...(c.historico || [])].reverse();
  const hit = hist.find((h) =>
    h.status === 'em_execucao' || h.status === 'encaminhado' || /campo|check-?in/i.test(String(h.nota || ''))
  );
  return hit?.em || null;
}

/**
 * Conteúdo do "Detalhar" — organizado para operar:
 * 1) linha do tempo  2) fotos antes/depois  3) IA  4) ações
 */
/** Formata item de material (kg, un, m³…) para secretarias/gabinete. */
function fmtMaterialLinha(m) {
  if (typeof m === 'string') return { nome: m, qtdTxt: '', detalhe: '' };
  const nome = m.nome || m.id || 'Item';
  let qtdTxt = '';
  if (m.qtd != null) {
    const n = Number(m.qtd);
    const q = Number.isFinite(n)
      ? (n % 1 === 0 ? String(n) : n.toLocaleString('pt-BR', { maximumFractionDigits: 1 }))
      : String(m.qtd);
    qtdTxt = `${q}${m.unidade ? ' ' + m.unidade : ''}`;
  }
  return { nome, qtdTxt, detalhe: m.detalhe || '' };
}

/** Escapa texto pra HTML simples. */
function escHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Chat rápido campo ↔ secretaria (por OS).
 * modo: 'campo' | 'secretaria'
 */
function chatCampoSecHtml(c, { tituloPrefix, modo } = {}) {
  if (!c || !c.id) return '';
  const msgs = Array.isArray(c.comentarios) ? c.comentarios.filter((m) => m && m.texto) : [];
  const placeholder = modo === 'secretaria'
    ? 'Responder à equipe em campo…'
    : 'Mensagem rápida pra secretaria…';
  const dePadrao = modo === 'secretaria' ? 'secretaria' : 'campo';
  const bolhas = msgs.length
    ? msgs.slice(-12).map((m) => {
        const lado = (m.de === 'campo' || m.papel === 'campo') ? 'campo' : 'secretaria';
        const quando = m.em && typeof fmtDate === 'function' ? fmtDate(m.em) : (m.em || '');
        return `
          <div class="chat-os-bubble ${lado}">
            <span class="who">${escHtml(m.por || lado)}${lado === 'campo' ? ' · campo' : ' · secretaria'}</span>
            <span class="txt">${escHtml(m.texto)}</span>
            <span class="when">${escHtml(quando)}</span>
          </div>`;
      }).join('')
    : '<p class="muted" style="margin:0;font-size:.82rem">Nenhuma mensagem ainda. Escreva abaixo.</p>';
  const titulo = `${tituloPrefix || ''}Chat com a ${modo === 'secretaria' ? 'equipe em campo' : 'secretaria'}`.trim();
  return `
    <div class="detalhe-ops-sec chat-os-wrap" data-chat-os="${escHtml(c.id)}">
      <h4 class="detalhe-ops-title">${titulo}</h4>
      <p class="muted" style="margin:0 0 .45rem;font-size:.78rem">Conversa interna desta OS — não aparece pro cidadão.</p>
      <div class="chat-os-msgs">${bolhas}</div>
      <div class="chat-os-compose">
        <input type="text" maxlength="500" data-chat-os-input placeholder="${placeholder}" />
        <button type="button" class="btn btn-sm btn-primary" data-chat-os-send data-de="${dePadrao}">Enviar</button>
      </div>
    </div>`;
}

/** Liga envio do chat campo ↔ secretaria. */
function bindChatCampoSec(root, { onSent } = {}) {
  const el = root || document;
  el.querySelectorAll('[data-chat-os-send]').forEach((btn) => {
    if (btn._chatBound) return;
    btn._chatBound = true;
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const wrap = btn.closest('[data-chat-os]');
      if (!wrap) return;
      const id = wrap.getAttribute('data-chat-os');
      const input = wrap.querySelector('[data-chat-os-input]');
      const texto = (input?.value || '').trim();
      if (!texto) {
        if (typeof toast === 'function') toast('Escreva a mensagem');
        return;
      }
      try {
        await withBusy(btn, 'Enviando…', async () => {
          const c = await api('/api/chamados/' + id + '/comentario', {
            method: 'POST',
            body: JSON.stringify({
              texto,
              interno: true,
              de: btn.getAttribute('data-de') || 'campo',
            }),
          });
          if (input) input.value = '';
          if (typeof toast === 'function') toast('Mensagem enviada');
          if (typeof onSent === 'function') onSent(c);
          else if (wrap && typeof chatCampoSecHtml === 'function') {
            const modo = btn.getAttribute('data-de') === 'secretaria' ? 'secretaria' : 'campo';
            const fresh = chatCampoSecHtml(c, { modo });
            const tmp = document.createElement('div');
            tmp.innerHTML = fresh;
            const novo = tmp.firstElementChild;
            if (novo) {
              wrap.replaceWith(novo);
              bindChatCampoSec(novo.parentElement || document, { onSent });
            }
          }
        });
      } catch (err) {
        if (typeof toast === 'function') toast(err.message || 'Falha ao enviar');
      }
    });
  });
  el.querySelectorAll('[data-chat-os-input]').forEach((input) => {
    if (input._chatEnter) return;
    input._chatEnter = true;
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.closest('[data-chat-os]')?.querySelector('[data-chat-os-send]')?.click();
      }
    });
  });
}

/** Bloco operacional (materiais, pessoas, tempo) — só secretarias/gabinete. */
function execucaoOpsHtml(c, { tituloPrefix } = {}) {
  if (!c) return '';
  const ex = c.execucao || {};
  const mats = Array.isArray(c.materiais) ? c.materiais : [];
  const pessoas = ex.pessoas != null ? ex.pessoas : null;
  const tempo = ex.tempoServicoHoras != null ? ex.tempoServicoHoras : (c.horasTrabalhadas || null);
  const tempoMedio = ex.tempoMedioHistoricoHoras != null ? ex.tempoMedioHistoricoHoras : null;
  const dias = ex.diasAteConclusao != null ? ex.diasAteConclusao : null;
  const temAlgo = mats.length || pessoas || tempo || ex.equipeNome;
  if (!temAlgo) return '';

  const cards = [];
  if (pessoas != null) {
    cards.push(`<div class="ops-metric"><span class="ops-metric-val">${pessoas}</span><span class="ops-metric-lbl">pessoa${pessoas === 1 ? '' : 's'} no serviço</span></div>`);
  }
  if (tempo != null && Number(tempo) > 0) {
    cards.push(`<div class="ops-metric"><span class="ops-metric-val">${Number(tempo).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}h</span><span class="ops-metric-lbl">tempo de execução</span></div>`);
  }
  if (tempoMedio != null) {
    cards.push(`<div class="ops-metric"><span class="ops-metric-val">${Number(tempoMedio).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}h</span><span class="ops-metric-lbl">tempo médio (histórico)</span></div>`);
  }
  if (dias != null) {
    cards.push(`<div class="ops-metric"><span class="ops-metric-val">${dias}d</span><span class="ops-metric-lbl">abertura → conclusão</span></div>`);
  }

  const metaLinhas = [];
  if (ex.equipeNome) metaLinhas.push(`<div class="meta"><strong>Equipe:</strong> ${ex.equipeNome}${ex.lider ? ' · líder ' + ex.lider : ''}</div>`);
  if (ex.veiculo) metaLinhas.push(`<div class="meta"><strong>Veículo:</strong> ${ex.veiculo}</div>`);
  if (Array.isArray(ex.ferramentas) && ex.ferramentas.length) {
    metaLinhas.push(`<div class="meta"><strong>Ferramentas:</strong> ${ex.ferramentas.join(', ')}</div>`);
  }
  if (ex.resumo) metaLinhas.push(`<div class="meta"><strong>Resumo:</strong> ${ex.resumo}</div>`);

  const titulo = `${tituloPrefix || ''}Execução do serviço`.trim();
  return `
    <div class="detalhe-ops-sec detalhe-ops-exec">
      <h4 class="detalhe-ops-title">${titulo} <span class="ops-interno-tag">interno · secretaria/gabinete</span></h4>
      ${cards.length ? `<div class="ops-metrics">${cards.join('')}</div>` : ''}
      ${metaLinhas.join('')}
      ${mats.length ? `
        <div class="meta" style="margin-top:.55rem;font-weight:700;color:#334155">Materiais utilizados</div>
        <ul class="detalhe-ops-mats">
          ${mats.map((m) => {
            const { nome, qtdTxt, detalhe } = fmtMaterialLinha(m);
            return `<li><strong>${nome}</strong>${qtdTxt ? ' — <span class="ops-qtd">' + qtdTxt + '</span>' : ''}${detalhe ? ' <span class="muted">(' + detalhe + ')</span>' : ''}</li>`;
          }).join('')}
        </ul>` : ''}
    </div>`;
}

function detalheOperacaoHtml(c, { acoesHtml } = {}) {
  if (!c) return '';
  const cidadaoEm = c.criadoEm ? fmtDate(c.criadoEm) : '—';
  const campoEm = campoEnviouEm(c);
  const campoTxt = campoEm
    ? fmtDate(campoEm)
    : (c.status === 'encaminhado' || c.status === 'em_execucao'
      ? 'Equipe em campo — foto do depois ainda não chegou'
      : 'Ainda não enviou a foto do depois');
  let n = 1;
  const tit = () => `${n++} ·`;
  const secs = [];
  secs.push(`
      <div class="detalhe-ops-sec">
        <h4 class="detalhe-ops-title">${tit()} Linha do tempo</h4>
        <div class="detalhe-ops-timeline">
          <div><strong>Cidadão chamou</strong><span>${cidadaoEm}</span></div>
          <div><strong>Equipe em campo</strong><span>${campoTxt}</span></div>
          <div><strong>Status agora</strong><span>${statusLabel(c.status)}</span></div>
        </div>
      </div>`);
  secs.push(`
      <div class="detalhe-ops-sec">
        <h4 class="detalhe-ops-title">${tit()} Fotos (antes / depois)</h4>
        ${antesDepoisHtml(c, { forcarDupla: true }) || '<p class="muted" style="margin:0">Sem foto anexada ainda.</p>'}
      </div>`);
  secs.push(`
      <div class="detalhe-ops-sec">
        <h4 class="detalhe-ops-title">${tit()} Relato</h4>
        <p class="muted" style="margin:0 0 .35rem">${c.descricao || 'Sem descrição.'}</p>
        <div class="meta">${c.cidadao?.nome || 'Cidadão'}${c.cidadao?.telefone ? ' · ' + c.cidadao.telefone : ''}
          ${c.endereco ? ' · ' + c.endereco : ''} · ${c.bairro || ''}</div>
      </div>`);
  const blocoExec = execucaoOpsHtml(c, { tituloPrefix: `${tit()} ` });
  if (blocoExec) secs.push(blocoExec);
  else n -= 1; // desfaz número reservado se não houver execução
  secs.push(chatCampoSecHtml(c, { tituloPrefix: `${tit()} `, modo: 'secretaria' }));
  secs.push(`
      <div class="detalhe-ops-sec">
        <h4 class="detalhe-ops-title">${tit()} Analisar obra (IA)</h4>
        <p class="muted" style="margin:0 0 .45rem;font-size:.82rem">A IA sugere material, quantidade, tempo e ferramentas para a equipe.</p>
        ${typeof iaObraAssistHtml === 'function' ? iaObraAssistHtml(c) : ''}
      </div>`);
  if (acoesHtml) {
    secs.push(`
      <div class="detalhe-ops-sec">
        <h4 class="detalhe-ops-title">${tit()} Ações</h4>
        <div class="actions">${acoesHtml}</div>
      </div>`);
  }
  return `<div class="detalhe-ops">${secs.join('')}</div>`;
}

/** IDs de Detalhar abertos — sobrevivem ao poll/re-render. */
window.__opsDetalheAbertos = window.__opsDetalheAbertos || new Set();

/** Liga botões Detalhar (abre/fecha e dispara a IA na caixa). */
function bindDetalharToggle(root, getChamado) {
  const el = root || document;
  el.querySelectorAll('[data-detalhar]').forEach((btn) => {
    if (btn._detBound) return;
    btn._detBound = true;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = btn.getAttribute('data-detalhar');
      const box = document.getElementById('detalhe-' + id);
      if (!box) return;
      const open = !box.classList.contains('open');
      box.classList.toggle('open', open);
      btn.classList.toggle('open', open);
      const label = btn.querySelector('[data-detalhar-label]') || btn.querySelector('span:first-child');
      if (label) label.textContent = open ? 'Ocultar detalhes' : 'Detalhar';
      try {
        if (open) window.__opsDetalheAbertos.add(id);
        else window.__opsDetalheAbertos.delete(id);
      } catch (_) {}
      if (open) {
        if (typeof bindFotoThumbs === 'function') bindFotoThumbs(box);
        if (typeof bindChatCampoSec === 'function') bindChatCampoSec(box);
        if (typeof bindIaObraAssist === 'function') {
          bindIaObraAssist(box, getChamado || ((cid) => null));
        }
      }
    });
  });
  // Após re-render, reabre o que o usuário deixou aberto
  opsRestaurarDetalhesAbertos(el, getChamado);
}

/**
 * True quando o usuário está com Detalhar aberto ou a IA analisando/digitando.
 * Usado para o poll NÃO re-renderizar a lista e fechar o painel sozinho.
 */
function opsUiDetalheEmUso(root) {
  try {
    if (window.__opsDetalheAbertos && window.__opsDetalheAbertos.size > 0) return true;
  } catch (_) {}
  const el = root || document;
  try {
    return !!(
      el.querySelector('.detalhe-box.open') ||
      el.querySelector('[data-ia-obra][data-typing="1"]') ||
      el.querySelector('.ia-analisando') ||
      el.querySelector('[data-ia-obra][data-ia-phase="plano"]') ||
      el.querySelector('[data-ia-obra][data-ia-phase="aprovacao-resultado"]')
    );
  } catch (_) {
    return false;
  }
}

/** Reabre painéis Detalhar após innerHTML/poll. */
function opsRestaurarDetalhesAbertos(root, getChamado) {
  const el = root || document;
  let ids = [];
  try {
    ids = Array.from(window.__opsDetalheAbertos || []);
  } catch (_) {
    ids = [];
  }
  // Também captura o que ainda está aberto no DOM (antes de um wipe perdido)
  el.querySelectorAll('.detalhe-box.open').forEach((box) => {
    const id = (box.id || '').replace(/^detalhe-/, '');
    if (id && !ids.includes(id)) ids.push(id);
  });
  if (!ids.length) return;
  ids.forEach((id) => {
    const box = document.getElementById('detalhe-' + id);
    const btn = el.querySelector(`[data-detalhar="${id}"]`) || document.querySelector(`[data-detalhar="${id}"]`);
    if (!box) return;
    box.classList.add('open');
    if (btn) {
      btn.classList.add('open');
      const label = btn.querySelector('[data-detalhar-label]') || btn.querySelector('span:first-child');
      if (label) label.textContent = 'Ocultar detalhes';
    }
    try { window.__opsDetalheAbertos.add(id); } catch (_) {}
    if (typeof bindFotoThumbs === 'function') bindFotoThumbs(box);
    if (typeof bindChatCampoSec === 'function') bindChatCampoSec(box);
    if (typeof bindIaObraAssist === 'function') {
      bindIaObraAssist(box, getChamado || ((cid) => null));
    }
  });
}

/** Foto do problema (cidadão) — ou Antes/Depois quando o campo já enviou a prova. */
function antesDepoisHtml(c, { forcarDupla } = {}) {
  const fotosAntes = (c.fotosAntes && c.fotosAntes.length)
    ? c.fotosAntes
    : ((c.fotoAntes || c.foto) ? [c.fotoAntes || c.foto] : []);
  const fotosDepois = (c.fotosDepois && c.fotosDepois.length)
    ? c.fotosDepois
    : (c.fotoDepois ? [c.fotoDepois] : []);
  const antes = fotosAntes[0];
  const depois = fotosDepois[0];
  if (!antes && !depois && !forcarDupla) return '';

  const faseProva =
    forcarDupla ||
    !!depois ||
    c.status === 'aguardando_aprovacao' ||
    c.status === 'concluido';

  if (!faseProva) {
    return `
    <div class="antes-depois antes-depois-problema">
      <div class="antes-depois-item antes-depois-item-full">
        <div class="antes-depois-label">Foto do problema${fotosAntes.length > 1 ? ` (${fotosAntes.length})` : ''}</div>
        ${fotoGaleriaHtml(fotosAntes, 'Foto do problema')}
      </div>
    </div>
  `;
  }

  return `
    <div class="antes-depois">
      <div class="antes-depois-item">
        <div class="antes-depois-label">Antes${fotosAntes.length > 1 ? ` (${fotosAntes.length})` : ''}</div>
        ${fotosAntes.length
          ? fotoGaleriaHtml(fotosAntes, 'Foto antes')
          : '<div class="antes-depois-empty">Sem foto do cidadão</div>'}
      </div>
      <div class="antes-depois-item">
        <div class="antes-depois-label">Depois${fotosDepois.length > 1 ? ` (${fotosDepois.length})` : ''}</div>
        ${fotosDepois.length
          ? fotoGaleriaHtml(fotosDepois, 'Foto depois')
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

function bindFotoThumbs(root) {
  (root || document).querySelectorAll('.foto-thumb[data-foto-src]').forEach((btn) => {
    if (btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openFotoLightbox(btn.getAttribute('data-foto-src'));
    });
  });
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
  const labelFn = (typeof window !== 'undefined' && window.BI_PUBLIC_STATUS && typeof statusLabelPublico === 'function')
    ? statusLabelPublico
    : statusLabel;
  const cssFn = (typeof window !== 'undefined' && window.BI_PUBLIC_STATUS && typeof statusPublicoId === 'function')
    ? statusPublicoId
    : (s) => ({ aberto: 'novo', em_andamento: 'em_execucao' })[s] || s;
  return `<div class="timeline">${historico.map(h => `
    <div class="timeline-item">
      <div class="timeline-dot badge-${cssFn(h.status || 'aberto')}"></div>
      <div>
        <strong>${labelFn(h.status)}</strong>
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
  const primary = tema.primaria || tema.homeAccent;
  const secondary = tema.secundaria || tema.homeAccentDeep;
  if (primary) {
    root.style.setProperty('--brand', primary);
    root.style.setProperty('--royal-mid', primary);
    // Botões / UI principal: uma cor só (não misturar com a secundária)
    root.style.setProperty('--royal', primary);
  }
  if (tema.homeAccentDeep || secondary) {
    root.style.setProperty('--brand-dim', tema.homeAccentDeep || primary || secondary);
  }
  // Landing accents
  const accent = tema.homeAccent || (slug && slug !== 'bacabal' ? primary : null);
  if (accent) {
    root.style.setProperty('--home-accent', accent);
    root.style.setProperty('--home-accent-deep', tema.homeAccentDeep || secondary || accent);
  }
  if (tema.homeGreen) {
    root.style.setProperty('--home-green', tema.homeGreen);
    root.style.setProperty('--home-green-deep', tema.homeGreenDeep || tema.homeGreen);
  } else if (slug && slug !== 'bacabal' && secondary) {
    root.style.setProperty('--home-green', secondary);
    root.style.setProperty('--home-green-deep', secondary);
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

  // Bom Lugar: prefeita (Marlene) — só textos visíveis (nunca Anselmo Carvalho)
  if ((cfg.slug || getCidade()) === 'bomlugar') {
    out = out
      .replace(/Gabinete do Prefeito/gi, 'Gabinete da Prefeita')
      .replace(/Gabinete do prefeito/gi, 'Gabinete da prefeita')
      .replace(/Painel do prefeito/gi, 'Painel da prefeita')
      .replace(/Entrar como prefeito/gi, 'Entrar como prefeita')
      .replace(/Logado: Prefeito/g, 'Logado: Prefeita')
      .replace(/Observação do prefeito/gi, 'Observação da prefeita')
      .replace(/TV do prefeito/gi, 'TV da prefeita')
      .replace(/Cobrança do prefeito/gi, 'Cobrança da prefeita')
      .replace(/Carta ao prefeito/gi, 'Carta à prefeita')
      .replace(/Pronto para o prefeito/gi, 'Pronto para a prefeita')
      .replace(/com o prefeito/gi, 'com a prefeita')
      .replace(/para o prefeito/gi, 'para a prefeita')
      .replace(/Roteiro de 5 minutos com a prefeita/gi, 'Roteiro de 5 minutos com a prefeita')
      .replace(/o senhor já/gi, 'a senhora já')
      .replace(/o senhor só/gi, 'a senhora só')
      .replace(/o senhor não/gi, 'a senhora não')
      .replace(/o senhor usa/gi, 'a senhora usa')
      .replace(/o senhor já paga/gi, 'a senhora já paga')
      .replace(/para o senhor/gi, 'para a senhora')
      .replace(/\bPrefeito(a)?\b/g, (m) => (m.toLowerCase() === 'prefeita' ? m : 'Prefeita'))
      .replace(/\bprefeito\b/g, 'prefeita');
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
  if (fav) fav.href = (slug === 'bomlugar' ? '/assets/logo-oficial-bomlugar.png?v=3' : logo);

  const needsBrand = (t) => {
    if (!t) return false;
    if (/Bacabal/i.test(t)) return true;
    if (slug === 'bomlugar' && /prefeito|o senhor/i.test(t) && !/prefeita/i.test(t)) return true;
    return false;
  };

  const walk = (root) => {
    const nodes = root.querySelectorAll(
      'h1,h2,h3,h4,p,span,strong,b,label,li,a,button,td,th,div.carta-kicker,div.pitch-kicker,div.ap-kicker,div.kit-kicker,div.man-kicker,.page-kicker,.eyebrow,.muted,.display'
    );
    nodes.forEach((el) => {
      if (el.closest('script,style,code,pre,textarea,input,select')) return;
      // Páginas internas Anselmo Carvalho / Bacabal-only — não rebrandear
      if (el.closest('[data-keep-bacabal]')) return;
      if (!needsBrand(el.textContent || '')) return;

      if (el.childElementCount === 0) {
        el.textContent = brandText(el.textContent, cfg);
        return;
      }
      el.childNodes.forEach((n) => {
        if (n.nodeType === 3 && needsBrand(n.nodeValue || '')) {
          n.nodeValue = brandText(n.nodeValue, cfg);
        }
      });
      el.querySelectorAll('strong,b,span,em').forEach((c) => {
        if (c.childElementCount === 0 && needsBrand(c.textContent || '')) {
          c.textContent = brandText(c.textContent, cfg);
        }
      });
    });
  };
  walk(document.body || document);

  // Links e clipe TV: Bom Lugar não usa materiais do Anselmo nem TV de Bacabal
  if (slug === 'bomlugar') {
    document.querySelectorAll('a[href*="ac-pitch"], a[href*="ac-script"]').forEach((a) => {
      a.remove();
    });
    document.querySelectorAll('a[href*="tv.html"]').forEach((a) => {
      const href = a.getAttribute('href') || '';
      if (href.includes('tv-bomlugar')) return;
      a.href = cityLink('/tv-bomlugar.html');
      // Não sobrescreve rótulos da home (ex.: "Veja na prática")
      if (a.id === 'ctaVejaPratica' || a.classList.contains('btn-pratica') || a.classList.contains('cta-veja-pratica') || a.classList.contains('landing-pratica-card')) return;
      if (/Bacabal|TV|Clipe/i.test(a.textContent || '')) a.textContent = 'Clipe TV Bom Lugar';
    });
  }

  if (slug !== 'bacabal' && logo) {
    document.querySelectorAll('img').forEach((img) => {
      const src = img.getAttribute('src') || '';
      const alt = img.getAttribute('alt') || '';
      if (/logo-prefeitura|logo-bomlugar|logo-oficial-bomlugar|Brasão de Bacabal|Brasao de Bacabal/i.test(src + alt)) {
        img.src = slug === 'bomlugar' ? '/assets/logo-oficial-bomlugar.png?v=3' : logo;
        img.alt = brandText(alt || `Brasão de ${cidade}`, cfg);
      }
    });
  }

  // Login / headers comuns
  const loginLogo = document.querySelector('.login-box img');
  if (loginLogo && slug !== 'bacabal' && logo) {
    loginLogo.src = slug === 'bomlugar' ? '/assets/logo-oficial-bomlugar.png?v=3' : logo;
    loginLogo.alt = `Brasão de ${cidade}`;
  }

  window.__CITY_CFG = cfg;
  window.__CITY_PRODUTO = produto;
  window.__CITY_NOME = cidade;
  return cfg;
}

/** Marca completa para tutoriais (logos, hero, textos e STEPS). */
function applyTutorialBrand(cfg, steps) {
  if (!cfg) return cfg;
  applyTheme(cfg.tema, cfg.slug || getCidade());
  applyPageBrand(cfg);
  const slug = cfg.slug || getCidade();
  const produto = cfg.produto || 'Cidade Conecta';
  const cidade = cfg.cidade || '';
  const logo = slug === 'bomlugar'
    ? '/assets/logo-oficial-bomlugar.png?v=3'
    : (cfg.logo || '/assets/logo-prefeitura.png');
  const hero = slug === 'bomlugar'
    ? '/assets/slide-bomlugar-hero.jpg'
    : '/assets/slide-nova.png';

  document.querySelectorAll(
    '#introGate img, .tut-brand img, .landing-brand img, #logo, #logoGate, link[rel="icon"]'
  ).forEach((el) => {
    if (el.tagName === 'LINK') el.href = logo;
    else {
      el.src = logo;
      if (el.alt != null) el.alt = `Brasão de ${cidade}`;
    }
  });

  document.querySelectorAll('.tut-brand strong, .landing-brand strong, #produtoNome').forEach((el) => {
    el.textContent = produto;
  });

  document.querySelectorAll('.carousel-visual img, img[src*="slide-nova"], img[src*="slide-bomlugar-hero"]').forEach((img) => {
    img.src = hero;
    img.alt = produto;
  });

  // Contato / GPS de exemplo no mock
  document.querySelectorAll('.pmb-topbar-inner, #gpsHint').forEach((el) => {
    if (!el) return;
    el.innerHTML = brandText(el.innerHTML, cfg);
    if (slug === 'bomlugar') {
      el.innerHTML = el.innerHTML
        .replace(/\(99\)\s*3621-0533/g, '(98) 9.9196-7607')
        .replace(/Bacabal\/MA/gi, 'Bom Lugar/MA')
        .replace(/bacabal\.ma\.gov\.br/gi, 'bomlugar.ma.gov.br');
    }
  });

  if (Array.isArray(steps)) {
    steps.forEach((s) => {
      if (s.title) s.title = brandText(s.title, cfg);
      if (s.text) s.text = brandText(s.text, cfg);
    });
  }

  document.querySelectorAll('[data-city-href]').forEach((a) => {
    a.href = cityLink(a.getAttribute('data-city-href'));
  });
  rewriteCityLinks();
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
  if (token) {
    localStorage.setItem(key, token);
    // Legado: páginas antigas ainda leem bi_token
    localStorage.setItem('bi_token', token);
  }
  if (user) {
    localStorage.setItem(key + '_user', JSON.stringify(user));
    localStorage.setItem('bi_user', JSON.stringify(user));
  }
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

/** Encerra todas as áreas (gabinete / secretaria / campo) — evita misturar sessões. */
function clearAllSessions() {
  [
    'bi_token', 'bi_user',
    'bi_token_secretaria', 'bi_token_secretaria_user',
    'bi_token_campo', 'bi_token_campo_user',
    'bi_token_gabinete', 'bi_token_gabinete_user',
  ].forEach((k) => localStorage.removeItem(k));
}

function getSessionUser() {
  try {
    const key = authTokenKey() + '_user';
    let raw = localStorage.getItem(key);
    if (raw) {
      const u = JSON.parse(raw);
      if (u && (u.nome || u.id || u.papel)) return u;
    }
    // Compat legado: só aceita bi_user se bater com a área atual
    raw = localStorage.getItem('bi_user');
    if (!raw) return null;
    const u = JSON.parse(raw);
    if (!u) return null;
    const slot = window.BI_AUTH_SLOT;
    if (!slot) return u;
    if (slot === 'gabinete') {
      return (u.papel === 'prefeito' || u.papel === 'admin') ? u : null;
    }
    if (slot === 'secretaria') {
      return (u.papel === 'secretaria' || u.papel === 'admin') ? u : null;
    }
    if (slot === 'campo') {
      return u.papel === 'campo' ? u : null;
    }
    return u;
  } catch {
    return null;
  }
}

function hasOpsToken() {
  const key = authTokenKey();
  if (localStorage.getItem(key)) return true;
  if (!localStorage.getItem('bi_token')) return false;
  // Legado: bi_token só vale se o usuário for da área atual
  let u = null;
  try { u = JSON.parse(localStorage.getItem('bi_user') || 'null'); } catch (_) {}
  if (!window.BI_AUTH_SLOT) return true;
  if (window.BI_AUTH_SLOT === 'gabinete') {
    return !!(u && (u.papel === 'prefeito' || u.papel === 'admin'));
  }
  if (window.BI_AUTH_SLOT === 'secretaria') {
    return !!(u && (u.papel === 'secretaria' || u.papel === 'admin'));
  }
  if (window.BI_AUTH_SLOT === 'campo') {
    return !!(u && u.papel === 'campo');
  }
  return !!u;
}

/** Migra token legado (bi_token) para o slot atual e devolve o usuário. */
function ensureOpsUser() {
  const key = authTokenKey();
  if (!localStorage.getItem(key) && localStorage.getItem('bi_token')) {
    let user = null;
    try { user = JSON.parse(localStorage.getItem('bi_user') || 'null'); } catch (_) {}
    const slot = window.BI_AUTH_SLOT;
    const okMigrate =
      !slot
      || (slot === 'gabinete' && user && (user.papel === 'prefeito' || user.papel === 'admin'))
      || (slot === 'secretaria' && user && (user.papel === 'secretaria' || user.papel === 'admin'))
      || (slot === 'campo' && user && user.papel === 'campo');
    if (okMigrate) setSession(localStorage.getItem('bi_token'), user);
  }
  return getSessionUser();
}

function logout() {
  _opsBackLock.allowLeave = true;
  opsLiberarVoltar();
  clearAllSessions();
  location.href = cityLink('/login.html');
}

/** Sair da área administrativa — único caminho para sair da página travada. */
function logoutOps(dest) {
  _opsBackLock.allowLeave = true;
  opsLiberarVoltar();
  clearAllSessions();
  location.href = cityLink(dest || '/login.html');
}

/**
 * Trava saída da página (todas as áreas ops/admin).
 * Só libera ao clicar em Sair (logoutOps / logout).
 * Cobre Voltar 1x, 2x, 3x… em sequência rápida.
 */
const _opsBackLock = {
  on: false,
  allowLeave: false,
  handler: null,
  clickHandler: null,
  pageShowHandler: null,
  unloadHandler: null,
  pulse: null,
  burst: null,
  burstUntil: 0,
  lastToast: 0,
  msg: 'Para sair, clique em Sair no topo',
  patchedHistory: false,
};

function opsLiberarVoltar() {
  _opsBackLock.on = false;
  _opsBackLock.burstUntil = 0;
  if (_opsBackLock.handler) {
    window.removeEventListener('popstate', _opsBackLock.handler);
    _opsBackLock.handler = null;
  }
  if (_opsBackLock.clickHandler) {
    document.removeEventListener('click', _opsBackLock.clickHandler, true);
    _opsBackLock.clickHandler = null;
  }
  if (_opsBackLock.pageShowHandler) {
    window.removeEventListener('pageshow', _opsBackLock.pageShowHandler);
    _opsBackLock.pageShowHandler = null;
  }
  if (_opsBackLock.unloadHandler) {
    window.removeEventListener('beforeunload', _opsBackLock.unloadHandler);
    _opsBackLock.unloadHandler = null;
  }
  if (_opsBackLock.pulse) {
    clearInterval(_opsBackLock.pulse);
    _opsBackLock.pulse = null;
  }
  if (_opsBackLock.burst) {
    clearInterval(_opsBackLock.burst);
    _opsBackLock.burst = null;
  }
}

/** Libera a trava sem limpar sessão (Sair customizado de uma página). */
function opsPermitirSaida() {
  _opsBackLock.allowLeave = true;
  opsLiberarVoltar();
}

function opsPushBackLock(n) {
  const times = Math.max(1, n || 1);
  for (let i = 0; i < times; i++) {
    try {
      history.pushState({ biOpsLock: 1, t: Date.now(), i }, '', location.href);
    } catch (_) { /* ok */ }
  }
}

/** Após Voltar: dispara rajada rápida para cobrir 2º/3º clique. */
function opsBackLockBurst(ms) {
  _opsBackLock.burstUntil = Date.now() + (ms || 2500);
  opsPushBackLock(40);
  try { queueMicrotask(() => opsPushBackLock(20)); } catch (_) { opsPushBackLock(20); }
  setTimeout(() => opsPushBackLock(20), 0);
  setTimeout(() => opsPushBackLock(20), 30);
  setTimeout(() => opsPushBackLock(20), 80);
  setTimeout(() => opsPushBackLock(20), 160);
  if (_opsBackLock.burst) return;
  _opsBackLock.burst = setInterval(() => {
    if (!_opsBackLock.on || _opsBackLock.allowLeave) {
      clearInterval(_opsBackLock.burst);
      _opsBackLock.burst = null;
      return;
    }
    if (Date.now() > _opsBackLock.burstUntil) {
      clearInterval(_opsBackLock.burst);
      _opsBackLock.burst = null;
      return;
    }
    opsPushBackLock(8);
  }, 40);
}

function opsBackLockToast() {
  const now = Date.now();
  if (now - _opsBackLock.lastToast < 900) return;
  _opsBackLock.lastToast = now;
  if (typeof toast === 'function') toast(_opsBackLock.msg);
}

function opsPatchHistoryApi() {
  if (_opsBackLock.patchedHistory) return;
  _opsBackLock.patchedHistory = true;
  const origBack = history.back.bind(history);
  const origGo = history.go.bind(history);
  history.back = function () {
    if (_opsBackLock.on && !_opsBackLock.allowLeave) {
      opsBackLockBurst(2500);
      opsBackLockToast();
      return;
    }
    return origBack();
  };
  history.go = function (delta) {
    if (_opsBackLock.on && !_opsBackLock.allowLeave && typeof delta === 'number' && delta < 0) {
      opsBackLockBurst(2500);
      opsBackLockToast();
      return;
    }
    return origGo(delta);
  };
}

function opsTravarVoltar(opts = {}) {
  if (window.BI_ALLOW_BACK) return;
  if (opts.msg) _opsBackLock.msg = opts.msg;
  _opsBackLock.allowLeave = false;
  opsPatchHistoryApi();

  // Já ativo: reforça
  if (_opsBackLock.on) {
    opsPushBackLock(opts.force ? 30 : 12);
    return;
  }
  _opsBackLock.on = true;

  // Pilha inicial grossa
  opsPushBackLock(50);

  _opsBackLock.handler = () => {
    if (!_opsBackLock.on || _opsBackLock.allowLeave) return;
    // Primeiro: reempilha na hora (antes de qualquer await/toast)
    opsBackLockBurst(3000);
    opsBackLockToast();
  };
  window.addEventListener('popstate', _opsBackLock.handler);

  _opsBackLock.pageShowHandler = (e) => {
    if (!_opsBackLock.on || _opsBackLock.allowLeave) return;
    // Voltou do bfcache / outro doc — reconstrói a pilha
    opsBackLockBurst(e && e.persisted ? 3000 : 1500);
  };
  window.addEventListener('pageshow', _opsBackLock.pageShowHandler);

  _opsBackLock.unloadHandler = (e) => {
    if (!_opsBackLock.on || _opsBackLock.allowLeave) return;
    e.preventDefault();
    e.returnValue = '';
    return '';
  };
  window.addEventListener('beforeunload', _opsBackLock.unloadHandler);

  // Pulso contínuo (cobre clique duplo entre popstates)
  _opsBackLock.pulse = setInterval(() => {
    if (!_opsBackLock.on || _opsBackLock.allowLeave) return;
    const hot = Date.now() < _opsBackLock.burstUntil;
    if (!history.state || !history.state.biOpsLock) opsPushBackLock(hot ? 20 : 10);
    else opsPushBackLock(hot ? 4 : 1);
  }, 280);

  _opsBackLock.clickHandler = (e) => {
    if (!_opsBackLock.on || _opsBackLock.allowLeave) return;
    const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    if (a.classList.contains('nav-logout') || /^\s*sair\s*$/i.test((a.textContent || '').trim())) return;
    const href = a.getAttribute('href') || '';
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
    let url;
    try { url = new URL(href, location.href); } catch (_) { return; }
    if (url.pathname === location.pathname) return;
    e.preventDefault();
    e.stopPropagation();
    opsBackLockToast();
  };
  document.addEventListener('click', _opsBackLock.clickHandler, true);
}

/** Só Sair libera a trava — não use para navegar sem logout. */
function opsGoto(href) {
  if (typeof toast === 'function') toast(_opsBackLock.msg || 'Para sair, clique em Sair no topo');
}

// Liga a trava cedo em qualquer página ops
(function opsBackLockBoot() {
  function arm() {
    if (window.BI_ALLOW_BACK) return;
    if (window.BI_OPS_LOCK || window.BI_AUTH_SLOT) opsTravarVoltar({ force: true });
  }
  arm();
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arm);
    else arm();
    window.addEventListener('load', () => arm());
  }
})();

/* ── Alarme ops: bip + banner (Gabinete / chat do prefeito) ── */
const _opsAlarm = { ctx: null, timer: null, active: false, storageKey: 'bi_som_on' };

function opsSomLigado(storageKey) {
  return localStorage.getItem(storageKey || _opsAlarm.storageKey || 'bi_som_on') !== '0';
}

function opsPlayBeep(urgent, storageKey) {
  if (!opsSomLigado(storageKey)) return;
  try {
    _opsAlarm.ctx = _opsAlarm.ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (_opsAlarm.ctx.state === 'suspended') _opsAlarm.ctx.resume().catch(() => {});
    const o = _opsAlarm.ctx.createOscillator();
    const g = _opsAlarm.ctx.createGain();
    o.type = urgent ? 'square' : 'sine';
    o.frequency.value = urgent ? 740 : 880;
    g.gain.value = urgent ? 0.08 : 0.06;
    o.connect(g);
    g.connect(_opsAlarm.ctx.destination);
    o.start();
    setTimeout(() => { o.frequency.value = urgent ? 980 : 1175; }, urgent ? 160 : 120);
    setTimeout(() => { try { o.stop(); } catch (_) {} }, urgent ? 420 : 280);
  } catch (_) {}
}

function opsStartAlarm(storageKey) {
  _opsAlarm.storageKey = storageKey || _opsAlarm.storageKey || 'bi_som_on';
  if (_opsAlarm.active) return;
  _opsAlarm.active = true;
  opsPlayBeep(true, _opsAlarm.storageKey);
  _opsAlarm.timer = setInterval(() => opsPlayBeep(true, _opsAlarm.storageKey), 4500);
}

function opsStopAlarm() {
  _opsAlarm.active = false;
  if (_opsAlarm.timer) clearInterval(_opsAlarm.timer);
  _opsAlarm.timer = null;
}
window.opsStopAlarm = opsStopAlarm;

function opsEnsureAlertaBanner() {
  let box = document.getElementById('alertaGabinete');
  if (box) return box;
  box = document.createElement('div');
  box.id = 'alertaGabinete';
  box.className = 'alerta-gabinete';
  box.style.display = 'none';
  box.innerHTML = `
    <div class="alerta-gabinete-pulse"></div>
    <div class="alerta-gabinete-content">
      <strong id="alertaTitulo">Alerta do Gabinete</strong>
      <p class="muted" id="alertaTexto" style="margin:0.35rem 0 0.65rem"></p>
      <div class="cta-row" id="alertaAcoes"></div>
    </div>`;
  const top = document.getElementById('top');
  if (top && top.parentNode) top.parentNode.insertBefore(box, top.nextSibling);
  else document.body.insertBefore(box, document.body.firstChild);
  return box;
}

function opsShowAlerta(titulo, texto, acoesHtml) {
  const box = opsEnsureAlertaBanner();
  const t = document.getElementById('alertaTitulo');
  const p = document.getElementById('alertaTexto');
  const a = document.getElementById('alertaAcoes');
  if (t) t.textContent = titulo || 'Alerta';
  if (p) p.textContent = texto || '';
  if (a) a.innerHTML = acoesHtml || '';
  box.style.display = 'block';
  box.classList.toggle('alerta-urgente', !!acoesHtml);
}

function opsHideAlerta() {
  const box = document.getElementById('alertaGabinete');
  if (box) {
    box.style.display = 'none';
    box.classList.remove('alerta-urgente');
  }
}
window.opsHideAlerta = opsHideAlerta;

function opsTemCobrancaPendente(c) {
  if (!c) return false;
  if (c.alertaGabineteAtivo && !c.cienteGabineteEm) return true;
  return (c.cobrancas || []).some((x) => Object.prototype.hasOwnProperty.call(x, 'cienteEm') && !x.cienteEm);
}

function opsChatFingerprint(msgs) {
  const gab = (msgs || []).filter((m) => m.de === 'gabinete');
  if (!gab.length) return '';
  const last = gab[gab.length - 1];
  return [last.id || '', last.criadoEm || last.em || '', gab.length, String(last.texto || '').slice(0, 48)].join('|');
}

/**
 * Detecta mensagem nova do prefeito no chat e dispara bip + banner.
 * Na 1ª carga só grava fingerprint (não alarma).
 */
function opsCheckChatAlerta(msgs, { storageKey, label, goChat } = {}) {
  const fp = opsChatFingerprint(msgs);
  const key = 'bi_chat_fp_' + (storageKey || 'ops');
  const prev = sessionStorage.getItem(key) || '';
  if (!fp) return false;
  if (!prev) {
    sessionStorage.setItem(key, fp);
    return false;
  }
  if (fp === prev) return false;
  sessionStorage.setItem(key, fp);
  const go = typeof goChat === 'function'
    ? goChat
    : `try{if(typeof goPane==='function')goPane('chat');}catch(_){ }opsHideAlerta();opsStopAlarm();`;
  opsShowAlerta(
    'Gabinete no chat',
    `O prefeito mandou mensagem${label ? ' para ' + label : ''}. Abra o chat e responda.`,
    `<button class="btn btn-sm btn-primary" type="button" onclick="${go.replace(/"/g, '&quot;')}">Abrir chat</button>
     <button class="btn btn-sm" type="button" onclick="opsHideAlerta();opsStopAlarm();">Silenciar agora</button>`
  );
  opsStartAlarm(storageKey);
  if (window.Notification && Notification.permission === 'granted') {
    try {
      new Notification('Gabinete no chat', {
        body: label ? `Nova mensagem para ${label}` : 'Nova mensagem do prefeito',
        tag: 'gabinete-chat-' + (storageKey || 'ops'),
        renotify: true,
      });
    } catch (_) {}
  }
  return true;
}

function opsCheckCobrancasAlerta(list, { storageKey, onCiencia } = {}) {
  const pend = (list || []).filter(opsTemCobrancaPendente);
  if (!pend.length) return false;
  const nomes = pend.slice(0, 3).map((c) => c.protocolo || c.id).join(', ');
  const extra = pend.length > 3 ? ` +${pend.length - 3}` : '';
  const acoes = pend.map((c) => {
    const id = c.id;
    if (typeof onCiencia === 'string') {
      return `<button class="btn btn-sm btn-primary" type="button" onclick="${onCiencia}('${id}')">Estou ciente · ${c.protocolo || id}</button>`;
    }
    return `<button class="btn btn-sm btn-primary" type="button" data-ops-ciencia="${id}">Estou ciente · ${c.protocolo || id}</button>`;
  }).join('');
  opsShowAlerta(
    'Alerta do Gabinete — ação obrigatória',
    `${pend.length} chamado(s) com cobrança (${nomes}${extra}). O alarme continua até confirmar ciência.`,
    acoes + ` <button class="btn btn-sm" type="button" onclick="opsHideAlerta();opsStopAlarm();">Silenciar agora</button>`
  );
  opsStartAlarm(storageKey);
  document.querySelectorAll('[data-ops-ciencia]').forEach((btn) => {
    if (btn._opsBound) return;
    btn._opsBound = true;
    btn.onclick = async () => {
      const id = btn.getAttribute('data-ops-ciencia');
      try {
        await api('/api/chamados/' + id + '/ciencia', { method: 'POST', body: '{}' });
        toast('Ciência registrada');
        if (typeof onCiencia === 'function') onCiencia(id);
      } catch (e) { toast(e.message); }
    };
  });
  return true;
}

function opsWireSomToggle(storageKey) {
  const btn = document.getElementById('somToggleTop') || document.getElementById('somToggle');
  if (!btn) return;
  const key = storageKey || 'bi_som_on';
  const sync = () => {
    const on = opsSomLigado(key);
    btn.classList.toggle('on', on);
    btn.classList.toggle('off', !on);
    btn.textContent = on ? '🔔 Som ligado' : '🔕 Som mudo';
  };
  if (!btn._opsSomBound) {
    btn._opsSomBound = true;
    btn.addEventListener('click', () => {
      const on = !(localStorage.getItem(key) !== '0');
      localStorage.setItem(key, on ? '0' : '1');
      if (!opsSomLigado(key)) opsStopAlarm();
      sync();
      toast(opsSomLigado(key) ? 'Som ligado — bip do Gabinete ativo' : 'Som mudo');
    });
  }
  sync();
}

/** Nota curta: onde fica a IA e para que serve. */
function opsIaHelpNoteHtml(contexto) {
  const ctx = contexto || 'serviço';
  return `<div class="hint-box" style="margin:0 0 .85rem;background:#eff6ff;border-color:#bfdbfe;color:#1e3a8a">
    <strong>Ajuda da IA</strong> — abra <em>Detalhar</em> no chamado: a IA analisa a foto/relato e sugere material, quantidade, tempo e ferramentas para o ${ctx}.
    Se o campo enviar a foto do depois, a IA também ajuda a conferir antes de aprovar.
  </div>`;
}

function opsBuscaNorm(s) {
  try {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  } catch (_) {
    return String(s || '').toLowerCase();
  }
}

/**
 * Lupa de busca no topo das secretarias / gabinete.
 * Digite para achar abas, estoque, postes, materiais etc. sem caçar botões.
 *
 * opts: {
 *   mount?: '#opsBuscaMount' | HTMLElement,
 *   placeholder?: string,
 *   items: [{ id, title, hint?, keywords?, pane?, jump?, go? }],
 *   getExtraItems?: () => items[],
 *   onGo?: (item) => void,
 * }
 */
function opsInitBusca(opts = {}) {
  const mountSel = opts.mount || '#opsBuscaMount';
  const mount = typeof mountSel === 'string' ? document.querySelector(mountSel) : mountSel;
  if (!mount) return null;

  let root = mount.querySelector('.ops-busca');
  if (!root) {
    root = document.createElement('div');
    root.className = 'ops-busca';
    root.innerHTML = `
      <div class="ops-busca-bar" role="search">
        <span class="ops-busca-lupa" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="7"></circle>
            <path d="M20 20l-3.5-3.5"></path>
          </svg>
        </span>
        <input type="search" class="ops-busca-input" autocomplete="off" spellcheck="false"
          placeholder="${opts.placeholder || 'Buscar nesta secretaria…'}"
          aria-label="Buscar nesta área" />
        <kbd class="ops-busca-kbd">/</kbd>
      </div>
      <div class="ops-busca-drop" hidden role="listbox"></div>`;
    mount.appendChild(root);
  }

  const input = root.querySelector('.ops-busca-input');
  const drop = root.querySelector('.ops-busca-drop');
  if (opts.placeholder) input.placeholder = opts.placeholder;

  let activeIdx = 0;
  let currentList = [];

  function allItems() {
    const base = Array.isArray(opts.items) ? opts.items.slice() : [];
    let extra = [];
    try {
      if (typeof opts.getExtraItems === 'function') extra = opts.getExtraItems() || [];
    } catch (_) { extra = []; }
    const seen = new Set();
    return [...base, ...extra].filter((it) => {
      const id = it.id || it.title;
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }

  function matchItems(q) {
    const items = allItems();
    const nq = opsBuscaNorm(q).trim();
    if (!nq) {
      return items.filter((it) => it.group !== 'dado').slice(0, 12);
    }
    const tokens = nq.split(/\s+/).filter(Boolean);
    return items
      .map((it) => {
        const hay = opsBuscaNorm([it.title, it.hint, it.keywords, it.pane, it.jump].filter(Boolean).join(' '));
        let score = 0;
        for (const t of tokens) {
          if (!hay.includes(t)) return null;
          score += hay.startsWith(t) ? 3 : hay.includes(' ' + t) ? 2 : 1;
          if ((it.title && opsBuscaNorm(it.title).includes(t))) score += 2;
        }
        return { it, score };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, 14)
      .map((x) => x.it);
  }

  function renderDrop(list, { open } = {}) {
    currentList = list;
    activeIdx = 0;
    if (!open && !input.value.trim()) {
      drop.hidden = true;
      drop.innerHTML = '';
      return;
    }
    if (!list.length) {
      drop.hidden = false;
      drop.innerHTML = '<div class="ops-busca-empty">Nada encontrado — tente “estoque”, “rota”, “frota”…</div>';
      return;
    }
    drop.hidden = false;
    drop.innerHTML = list.map((it, i) => `
      <button type="button" class="ops-busca-item ${i === 0 ? 'active' : ''}" role="option" data-idx="${i}">
        <strong>${it.title}</strong>
        ${it.hint ? `<span>${it.hint}</span>` : ''}
      </button>`).join('');
    drop.querySelectorAll('.ops-busca-item').forEach((btn) => {
      btn.onmousedown = (e) => e.preventDefault();
      btn.onclick = () => choose(Number(btn.dataset.idx));
    });
  }

  function setActive(i) {
    if (!currentList.length) return;
    activeIdx = (i + currentList.length) % currentList.length;
    drop.querySelectorAll('.ops-busca-item').forEach((el, idx) => {
      el.classList.toggle('active', idx === activeIdx);
    });
    const el = drop.querySelector('.ops-busca-item.active');
    if (el) el.scrollIntoView({ block: 'nearest' });
  }

  function choose(idx) {
    const it = currentList[idx];
    if (!it) return;
    drop.hidden = true;
    input.blur();
    try {
      if (typeof it.go === 'function') it.go(it);
      else if (typeof opts.onGo === 'function') opts.onGo(it);
      else if (it.pane && typeof window.goPane === 'function') window.goPane(it.pane);
      else if (it.jump) {
        const el = document.getElementById(it.jump);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } catch (e) {
      if (typeof toast === 'function') toast(e.message || 'Não foi possível abrir');
    }
    input.value = '';
  }

  function refresh() {
    const q = input.value;
    renderDrop(matchItems(q), { open: document.activeElement === input || !!q.trim() });
  }

  if (!input._opsBuscaBound) {
    input._opsBuscaBound = true;
    input.addEventListener('focus', () => refresh());
    input.addEventListener('input', () => refresh());
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(activeIdx + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(activeIdx - 1); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        if (!drop.hidden && currentList.length) choose(activeIdx);
      } else if (e.key === 'Escape') {
        drop.hidden = true;
        input.blur();
      }
    });
    document.addEventListener('click', (e) => {
      if (!root.contains(e.target)) drop.hidden = true;
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const tag = (e.target && e.target.tagName) || '';
        if (/^(INPUT|TEXTAREA|SELECT)$/i.test(tag) || e.target?.isContentEditable) return;
        e.preventDefault();
        input.focus();
        refresh();
      }
    });
  }

  root._opsBuscaApi = { refresh, input, setItems(items) { opts.items = items; } };
  return root._opsBuscaApi;
}

/**
 * Topbar.
 * - Área ops (opts.lock / BI_OPS_LOCK / BI_AUTH_SLOT): sem Início/Cidadão/Mapa —
 *   só status da área logada + Sair (evita confusão na secretaria).
 * - Páginas públicas: topo de visitante (ignora sessão administrativa).
 */
function topbar(active, cfg, opts = {}) {
  const nome = cfg?.produto || window.__CITY_PRODUTO || 'Cidade Conecta';
  const sub = cfg?.tagline
    || `${cfg?.cidade || window.__CITY_NOME || ''} · ${cfg?.uf || 'MA'}`;
  const opsLock = !!(opts.lock || window.BI_OPS_LOCK || window.BI_AUTH_SLOT);
  if (opsLock && typeof ensureOpsUser === 'function') ensureOpsUser();
  if (opsLock && typeof opsTravarVoltar === 'function') opsTravarVoltar();
  const user = opsLock ? (opts.user || getSessionUser()) : null;
  const logged = !!(user || (opsLock && hasOpsToken()));

  const SEC_LABEL = {
    obras: 'Secretaria de Obras',
    iluminacao: 'Iluminação Pública',
    limpeza: 'Limpeza Urbana',
    meio_ambiente: 'Meio Ambiente',
    transito: 'Trânsito',
    defesa_civil: 'Defesa Civil',
    ouvidoria: 'Ouvidoria',
    saude: 'Secretaria de Saúde',
    eventos: 'Cultura e Eventos',
  };

  function opsStatusLine(u, area) {
    if (!u && logged) return `${area || 'Área administrativa'} · sessão ativa`;
    if (!u) return `${area || 'Área administrativa'} · entre para continuar`;
    if (u.papel === 'prefeito') return 'Gabinete · sessão ativa';
    if (u.papel === 'admin' || u.papel === 'platform') return 'Administração · sessão ativa';
    if (u.papel === 'campo') return 'Campo · sessão ativa';
    if (u.secretaria && SEC_LABEL[u.secretaria]) {
      return `${SEC_LABEL[u.secretaria]} · sessão ativa`;
    }
    if (u.secretaria) return `Secretaria · ${u.secretaria} · sessão ativa`;
    return `${area || 'Área administrativa'} · sessão ativa`;
  }

  // Área administrativa: nunca mostrar Início / Cidadão / Mapa
  if (opsLock) {
    const area = active || 'Área administrativa';
    const status = opsStatusLine(user, area);
    const displayName = (user && (user.nome || user.id))
      || (logged ? 'Sessão ativa' : '');
    // Já logado: usuário + Som (opcional) + Sair — nunca "Entrar" se há token
    const somBtn = opts.som
      ? `<button type="button" class="btn btn-sm som-toggle on" id="somToggleTop" title="Alarme do Gabinete">🔔 Som</button>`
      : '';
    const who = logged
      ? `${somBtn}<span class="nav-user" title="${displayName}">${displayName}</span>
         <button type="button" class="nav-logout" onclick="logoutOps('/login.html')">Sair</button>`
      : `<a class="nav-logout" href="${cityLink('/login.html')}">Entrar</a>`;
    return `
  <div class="topbar topbar-ops">
    <div class="brand" title="Para trocar de área, use Sair">
      <div class="brand-mark"><img src="${cfg?.logo || '/assets/logo-prefeitura.png'}" alt="Brasão de ${cfg?.cidade || ''}" /></div>
      <div>
        <strong>${nome}</strong>
        <span>${status}</span>
      </div>
    </div>
    <nav class="nav">
      ${who}
    </nav>
  </div>`;
  }

  // Visitante / página pública
  const links = [
    [cityLink('/'), 'Início'],
    [cityLink('/fluxo.html'), 'Como funciona'],
    [cityLink('/cidadao.html'), 'Cidadão'],
    [cityLink('/mapa.html'), 'Mapa'],
    [cityLink('/login.html'), 'Área administrativa'],
  ];

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

/** Nome da assistente de IA conforme a cidade (Bacabal Conecta / Bom Lugar Conecta). */
function iaAssistenteNome() {
  const cfg = window.__CITY_CFG || {};
  const produto = cfg.produto || window.__CITY_PRODUTO || 'Cidade Conecta';
  return produto;
}

function iaSaudacaoCurta() {
  return `Oi! Sou a ${iaAssistenteNome()}, sua assistente de IA.`;
}

/** Estado do assistente de serviço (secretaria/campo) — demo como se a IA já estivesse integrada. */
const _iaObraState = Object.create(null);
const _iaTypeTimers = Object.create(null);

function iaObraEsc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

function iaStopTyping(id) {
  if (id && _iaTypeTimers[id]) {
    clearTimeout(_iaTypeTimers[id]);
    delete _iaTypeTimers[id];
  }
}

function iaStopAllTypingFor(chamadoId) {
  const prefix = String(chamadoId || '');
  Object.keys(_iaTypeTimers).forEach((k) => {
    if (!prefix || k === prefix || k.startsWith(prefix + '-')) iaStopTyping(k);
  });
}

/** Digita texto em um elemento (efeito máquina de escrever). Para se o nó sumir do DOM. */
function iaTypeInto(el, text, { speed = 28, id } = {}) {
  return new Promise((resolve) => {
    if (!el) return resolve();
    const full = String(text || '');
    iaStopTyping(id);
    el.textContent = '';
    el.classList.add('ia-typing');
    let i = 0;
    const finish = () => {
      el.classList.remove('ia-typing');
      if (id) delete _iaTypeTimers[id];
      resolve();
    };
    const step = () => {
      // Lista da secretaria/campo re-renderiza e remove o nó — não continua “fantasma”
      if (!el.isConnected) {
        finish();
        return;
      }
      if (i >= full.length) {
        finish();
        return;
      }
      el.textContent += full.charAt(i++);
      _iaTypeTimers[id || 'x'] = setTimeout(step, speed);
    };
    step();
  });
}

/** Preenche o plano/parecer de uma vez (sem travar no meio). */
function iaRevealStream(box) {
  if (!box) return;
  const intro = box.querySelector('.ia-type-intro');
  if (intro) {
    intro.textContent = intro.getAttribute('data-full') || intro.textContent || '';
    intro.classList.remove('ia-typing');
  }
  box.querySelectorAll('.ia-stream-line').forEach((line) => {
    const full = line.getAttribute('data-full') || '';
    const v = line.querySelector('.ia-stream-v') || line;
    const hasKey = !!line.querySelector('.ia-stream-k');
    const colon = full.indexOf(': ');
    if (hasKey && colon >= 0) v.textContent = full.slice(colon + 2);
    else v.textContent = full;
  });
  const head = box.querySelector('.ia-obra-plano-head');
  const stream = box.querySelector('.ia-obra-stream');
  const foot = box.querySelector('.ia-obra-foot');
  if (head) {
    head.hidden = false;
    head.classList.add('ia-fade-in');
  }
  if (stream) {
    stream.hidden = false;
    stream.classList.add('ia-fade-in');
  }
  if (foot) {
    foot.hidden = false;
    foot.classList.add('ia-fade-in');
  }
}

function iaObraAskShell(id, { empty } = {}) {
  const saudacao = iaSaudacaoCurta();
  const sub =
    'Posso te ajudar com esse serviço? Analiso a foto e sugiro material, quantidade, tempo e ferramentas.';
  return `
    <div class="ia-obra-box" data-ia-obra="${iaObraEsc(id)}" data-ia-phase="ask">
      <div class="ia-obra-ask">
        <div class="ia-obra-avatar-row">
          <img class="ia-obra-avatar" src="/assets/ia-assistente-servico.png?v=3" alt="" width="56" height="56" />
          <div class="ia-obra-copy">
            <strong class="ia-type-title" data-full="${iaObraEsc(saudacao)}">${empty ? '' : iaObraEsc(saudacao)}</strong>
            <p class="muted ia-type-sub" data-full="${iaObraEsc(sub)}">${empty ? '' : iaObraEsc(sub)}</p>
          </div>
        </div>
        <div class="actions ia-obra-actions" ${empty ? 'hidden' : ''}>
          <button type="button" class="btn btn-sm btn-primary" data-ia-sim="${iaObraEsc(id)}">Sim, analisar</button>
          <button type="button" class="btn btn-sm" data-ia-nao="${iaObraEsc(id)}">Agora não</button>
        </div>
      </div>
    </div>`;
}

/** Assistente na conferência da foto do depois (secretaria). */
function iaAprovacaoAskShell(id, { empty } = {}) {
  const saudacao = iaSaudacaoCurta();
  const sub = 'Quer que eu analise com você esse serviço se ficou tudo certo?';
  return `
    <div class="ia-obra-box" data-ia-obra="${iaObraEsc(id)}" data-ia-phase="aprovacao">
      <div class="ia-obra-ask">
        <div class="ia-obra-avatar-row">
          <img class="ia-obra-avatar" src="/assets/ia-assistente-servico.png?v=3" alt="" width="56" height="56" />
          <div class="ia-obra-copy">
            <strong class="ia-type-title" data-full="${iaObraEsc(saudacao)}">${empty ? '' : iaObraEsc(saudacao)}</strong>
            <p class="muted ia-type-sub" data-full="${iaObraEsc(sub)}">${empty ? '' : iaObraEsc(sub)}</p>
          </div>
        </div>
        <div class="actions ia-obra-actions" ${empty ? 'hidden' : ''}>
          <button type="button" class="btn btn-sm btn-primary" data-ia-aprov-sim="${iaObraEsc(id)}">Sim</button>
          <button type="button" class="btn btn-sm" data-ia-aprov-nao="${iaObraEsc(id)}">Não</button>
        </div>
      </div>
    </div>`;
}

function iaAprovacaoParecerShell(id, parecer, { empty } = {}) {
  const intro = `${iaSaudacaoCurta()} Compareci o antes e o depois. Veja o que encontrei:`;
  const pontos = (parecer.pontos || []).map((p, i) =>
    `<div class="ia-stream-line" data-full="${iaObraEsc(p)}"><span class="ia-stream-v">${empty ? '' : iaObraEsc(p)}</span></div>`
  ).join('');
  const ok = parecer.parecer === 'ok';
  return `
    <div class="ia-obra-box" data-ia-obra="${iaObraEsc(id)}" data-ia-phase="aprovacao-resultado">
      <div class="ia-obra-plano">
        <div class="ia-obra-avatar-row">
          <img class="ia-obra-avatar" src="/assets/ia-assistente-servico.png?v=3" alt="" width="56" height="56" />
          <div class="ia-obra-copy">
            <p class="ia-type-intro" data-full="${iaObraEsc(intro)}">${empty ? '' : iaObraEsc(intro)}</p>
          </div>
        </div>
        <div class="ia-obra-plano-head" ${empty ? 'hidden' : ''}>
          <strong>${iaObraEsc(parecer.label || 'Parecer')}</strong>
          <span class="muted">${parecer.confianca || '—'}% de confiança</span>
        </div>
        <div class="ia-obra-stream" ${empty ? 'hidden' : ''}>
          ${pontos}
          <div class="ia-stream-line ia-stream-obs" data-full="${iaObraEsc(parecer.recomendacao || '')}">
            <span class="ia-stream-v">${empty ? '' : iaObraEsc(parecer.recomendacao || '')}</span>
          </div>
        </div>
        <p class="muted ia-obra-foot" style="font-size:0.72rem;margin:0.5rem 0 0" ${empty ? 'hidden' : ''}>
          ${ok ? 'Sugestão: pode usar Aprovar e finalizar abaixo.' : 'Sugestão: use Não aprovo — devolver se precisar de ajuste.'}
        </p>
      </div>
    </div>`;
}

function iaObraPlanoShell(id, plano, { empty } = {}) {
  const conf = plano.confianca || '—';
  const lines = [
    { k: 'Tipo', v: plano.tipo },
    { k: 'Material', v: plano.material },
    { k: 'Quantidade', v: plano.quantidade },
    { k: 'Tempo médio', v: plano.tempoMedio },
    { k: 'Equipe', v: plano.equipe },
  ];
  const tools = (plano.ferramentas || []).join(', ');
  const intro = `${iaSaudacaoCurta()} Aqui está o que sugiro para este serviço:`;
  const rows = lines.map((l, i) =>
    `<div class="ia-stream-line" data-i="${i}" data-full="${iaObraEsc(l.k + ': ' + l.v)}"><span class="ia-stream-k">${iaObraEsc(l.k)}</span> <span class="ia-stream-v">${empty ? '' : iaObraEsc(l.v)}</span></div>`
  ).join('');
  return `
    <div class="ia-obra-box" data-ia-obra="${iaObraEsc(id)}" data-ia-phase="plano">
      <div class="ia-obra-plano">
        <div class="ia-obra-avatar-row">
          <img class="ia-obra-avatar" src="/assets/ia-assistente-servico.png?v=3" alt="" width="56" height="56" />
          <div class="ia-obra-copy">
            <p class="ia-type-intro" data-full="${iaObraEsc(intro)}">${empty ? '' : iaObraEsc(intro)}</p>
          </div>
        </div>
        <div class="ia-obra-plano-head" ${empty ? 'hidden' : ''}>
          <strong>Plano de serviço sugerido</strong>
          <span class="muted">${conf}% de confiança</span>
        </div>
        <div class="ia-obra-stream" ${empty ? 'hidden' : ''}>
          ${rows}
          <div class="ia-stream-line ia-stream-tools" data-full="${iaObraEsc('Ferramentas: ' + tools)}">
            <span class="ia-stream-k">Ferramentas</span>
            <span class="ia-stream-v">${empty ? '' : iaObraEsc(tools)}</span>
          </div>
          ${plano.observacao
            ? `<div class="ia-stream-line ia-stream-obs" data-full="${iaObraEsc(plano.observacao)}"><span class="ia-stream-v">${empty ? '' : iaObraEsc(plano.observacao)}</span></div>`
            : ''}
        </div>
        <p class="muted ia-obra-foot" style="font-size:0.72rem;margin:0.5rem 0 0" ${empty ? 'hidden' : ''}>Sugestão — confirme no local antes de executar.</p>
      </div>
    </div>`;
}

function iaObraPlanoHtml(plano) {
  return iaObraPlanoShell('x', plano, { empty: false }).replace('data-ia-obra="x"', '');
}

/**
 * Bloco de cortesia + análise (só secretaria/campo).
 * @param {{ id: string, status?: string, foto?: string, fotoAntes?: string, fotoDepois?: string, descricao?: string, titulo?: string }} c
 */
function iaObraAssistHtml(c) {
  const id = c && c.id;
  if (!id) return '';

  const st = _iaObraState[id];
  if (st === 'dismissed') return '';

  // Conferência da foto do campo (secretaria)
  if (c.status === 'aguardando_aprovacao') {
    if (st && st.aprovacaoParecer) {
      return iaAprovacaoParecerShell(id, st.aprovacaoParecer, { empty: !st.aprovacaoTyped });
    }
    return iaAprovacaoAskShell(id, { empty: !(st && st.aprovacaoGreeted) });
  }

  const foto = c.fotoAntes || c.foto;
  if (!foto && !(c.descricao || c.titulo)) return '';

  if (st && st.plano) {
    return iaObraPlanoShell(id, st.plano, { empty: !st.planoTyped });
  }

  return iaObraAskShell(id, { empty: !(st && st.greeted) });
}

async function iaRunAskTyping(box, id) {
  if (!box || box.dataset.typing === '1') return;
  const st = _iaObraState[id];
  const phase = box.getAttribute('data-ia-phase');
  const greetedKey = phase === 'aprovacao' ? 'aprovacaoGreeted' : 'greeted';
  if (st && st[greetedKey]) return;
  box.dataset.typing = '1';
  _iaObraState[id] = Object.assign(
    {},
    typeof st === 'object' && st ? st : {},
    { [greetedKey]: true }
  );
  const title = box.querySelector('.ia-type-title');
  const sub = box.querySelector('.ia-type-sub');
  const actions = box.querySelector('.ia-obra-actions');
  if (actions) actions.hidden = true;
  await iaTypeInto(title, title?.getAttribute('data-full') || iaSaudacaoCurta(), { speed: 22, id: id + '-t' });
  if (!box.isConnected) {
    box.dataset.typing = '0';
    return;
  }
  await iaTypeInto(sub, sub?.getAttribute('data-full') || '', { speed: 18, id: id + '-s' });
  if (actions && box.isConnected) {
    actions.hidden = false;
    actions.classList.add('ia-fade-in');
  }
  box.dataset.typing = '0';
}

async function iaRunParecerTyping(box, id, parecer) {
  if (!box || box.dataset.typing === '1') return;
  if (_iaObraState[id] && _iaObraState[id].aprovacaoTyped) {
    iaRevealStream(box);
    return;
  }
  box.dataset.typing = '1';
  iaStopAllTypingFor(id);
  // Intro rápida + plano completo de uma vez (evita “travadinha” no refresh da lista)
  const intro = box.querySelector('.ia-type-intro');
  const head = box.querySelector('.ia-obra-plano-head');
  const stream = box.querySelector('.ia-obra-stream');
  const foot = box.querySelector('.ia-obra-foot');
  if (head) head.hidden = true;
  if (stream) stream.hidden = true;
  if (foot) foot.hidden = true;
  await iaTypeInto(
    intro,
    intro?.getAttribute('data-full') || `${iaSaudacaoCurta()} Compareci o antes e o depois. Veja o que encontrei:`,
    { speed: 16, id: id + '-ai' }
  );
  if (box.isConnected) iaRevealStream(box);
  _iaObraState[id] = Object.assign({}, _iaObraState[id] || {}, {
    aprovacaoParecer: parecer,
    aprovacaoTyped: true,
    aprovacaoGreeted: true,
  });
  box.dataset.typing = '0';
}

async function iaRunPlanoTyping(box, id, plano) {
  if (!box || box.dataset.typing === '1') return;
  if (_iaObraState[id] && _iaObraState[id].planoTyped) {
    iaRevealStream(box);
    return;
  }
  box.dataset.typing = '1';
  iaStopAllTypingFor(id);
  const intro = box.querySelector('.ia-type-intro');
  const head = box.querySelector('.ia-obra-plano-head');
  const stream = box.querySelector('.ia-obra-stream');
  const foot = box.querySelector('.ia-obra-foot');
  if (head) head.hidden = true;
  if (stream) stream.hidden = true;
  if (foot) foot.hidden = true;

  await iaTypeInto(
    intro,
    intro?.getAttribute('data-full') || `${iaSaudacaoCurta()} Aqui está o que sugiro para este serviço:`,
    { speed: 16, id: id + '-i' }
  );
  if (box.isConnected) iaRevealStream(box);
  _iaObraState[id] = { plano, planoTyped: true, greeted: true };
  box.dataset.typing = '0';
}

async function iaObraAnalisar(id, foto, texto) {
  const box = document.querySelector(`[data-ia-obra="${id}"]`);
  if (box) {
    box.dataset.typing = '1';
    box.innerHTML = `
      <div class="ia-obra-avatar-row">
        <img class="ia-obra-avatar" src="/assets/ia-assistente-servico.png?v=3" alt="" width="56" height="56" />
        <div class="ia-obra-copy">
          <p class="muted ia-analisando">Analisando a foto<span class="ia-dots"></span></p>
        </div>
      </div>`;
  }
  try {
    const r = await api('/api/ia/foto', {
      method: 'POST',
      body: JSON.stringify({ foto: foto || null, texto: texto || '' }),
    });
    const plano = r.planoObra || null;
    if (!plano) throw new Error('Sem plano de serviço na resposta');
    _iaObraState[id] = { plano, planoTyped: false, greeted: true };
    if (box) {
      box.outerHTML = iaObraPlanoShell(id, plano, { empty: true });
      const novo = document.querySelector(`[data-ia-obra="${id}"]`);
      if (novo) novo.dataset.typing = '1';
      await iaRunPlanoTyping(novo, id, plano);
    }
    toast('Plano de serviço sugerido');
    return plano;
  } catch (e) {
    if (box) {
      box.dataset.typing = '0';
      box.innerHTML = `
        <div class="ia-obra-ask">
          <strong>Não consegui analisar agora</strong>
          <p class="muted">${iaObraEsc(e.message || 'Erro')}</p>
          <div class="actions">
            <button type="button" class="btn btn-sm btn-primary" data-ia-sim="${iaObraEsc(id)}">Tentar de novo</button>
            <button type="button" class="btn btn-sm" data-ia-nao="${iaObraEsc(id)}">Fechar</button>
          </div>
        </div>`;
      bindIaObraAssist(box.parentElement || document, null);
    }
    toast(e.message || 'Falha na análise');
    return null;
  }
}

async function iaAprovacaoAnalisar(id, c) {
  const box = document.querySelector(`[data-ia-obra="${id}"]`);
  if (box) {
    box.dataset.typing = '1';
    box.innerHTML = `
      <div class="ia-obra-avatar-row">
        <img class="ia-obra-avatar" src="/assets/ia-assistente-servico.png?v=3" alt="" width="56" height="56" />
        <div class="ia-obra-copy">
          <p class="muted ia-analisando">Comparando antes e depois<span class="ia-dots"></span></p>
        </div>
      </div>`;
  }
  try {
    const r = await api('/api/ia/aprovacao', {
      method: 'POST',
      body: JSON.stringify({
        fotoAntes: c?.fotoAntes || c?.foto || null,
        fotoDepois: c?.fotoDepois || null,
        titulo: c?.titulo || '',
        texto: c?.descricao || '',
      }),
    });
    _iaObraState[id] = {
      aprovacaoParecer: r,
      aprovacaoTyped: false,
      aprovacaoGreeted: true,
    };
    if (box) {
      box.outerHTML = iaAprovacaoParecerShell(id, r, { empty: true });
      const novo = document.querySelector(`[data-ia-obra="${id}"]`);
      if (novo) novo.dataset.typing = '1';
      await iaRunParecerTyping(novo, id, r);
    }
    toast(r.parecer === 'ok' ? 'Parecer: serviço aparenta ok' : 'Parecer: revisar antes de aprovar');
    return r;
  } catch (e) {
    if (box) {
      box.dataset.typing = '0';
      box.innerHTML = `
        <div class="ia-obra-ask">
          <strong>Não consegui analisar agora</strong>
          <p class="muted">${iaObraEsc(e.message || 'Erro')}</p>
          <div class="actions">
            <button type="button" class="btn btn-sm btn-primary" data-ia-aprov-sim="${iaObraEsc(id)}">Tentar de novo</button>
            <button type="button" class="btn btn-sm" data-ia-aprov-nao="${iaObraEsc(id)}">Fechar</button>
          </div>
        </div>`;
      bindIaObraAssist(box.parentElement || document, null);
    }
    toast(e.message || 'Falha na análise');
    return null;
  }
}

function iaObraDismiss(id) {
  iaStopTyping(id);
  iaStopTyping(id + '-t');
  iaStopTyping(id + '-s');
  iaStopTyping(id + '-i');
  iaStopTyping(id + '-ai');
  _iaObraState[id] = 'dismissed';
  const box = document.querySelector(`[data-ia-obra="${id}"]`);
  if (box) box.remove();
}

/** Liga botões e dispara digitação das caixas visíveis. */
function bindIaObraAssist(root, getChamado) {
  const el = root || document;
  el.querySelectorAll('[data-ia-sim]').forEach((btn) => {
    if (btn._iaBound) return;
    btn._iaBound = true;
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = btn.getAttribute('data-ia-sim');
      const c = typeof getChamado === 'function' ? await getChamado(id) : null;
      const foto = c ? (c.fotoAntes || c.foto) : null;
      const texto = c
        ? [c.categoria, c.titulo, c.descricao].filter(Boolean).join(' — ')
        : 'buraco em via pública';
      await iaObraAnalisar(id, foto, texto);
      if (typeof getChamado === 'function') {
        bindIaObraAssist(el, getChamado);
      }
    });
  });
  el.querySelectorAll('[data-ia-nao]').forEach((btn) => {
    if (btn._iaBound) return;
    btn._iaBound = true;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      iaObraDismiss(btn.getAttribute('data-ia-nao'));
    });
  });

  el.querySelectorAll('[data-ia-aprov-sim]').forEach((btn) => {
    if (btn._iaBound) return;
    btn._iaBound = true;
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = btn.getAttribute('data-ia-aprov-sim');
      const c = typeof getChamado === 'function' ? await getChamado(id) : null;
      await iaAprovacaoAnalisar(id, c);
      if (typeof getChamado === 'function') bindIaObraAssist(el, getChamado);
    });
  });
  el.querySelectorAll('[data-ia-aprov-nao]').forEach((btn) => {
    if (btn._iaBound) return;
    btn._iaBound = true;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      iaObraDismiss(btn.getAttribute('data-ia-aprov-nao'));
    });
  });

  el.querySelectorAll('[data-ia-obra][data-ia-phase="ask"], [data-ia-obra][data-ia-phase="aprovacao"]').forEach((box) => {
    const id = box.getAttribute('data-ia-obra');
    const st = _iaObraState[id];
    const phase = box.getAttribute('data-ia-phase');
    const greetedKey = phase === 'aprovacao' ? 'aprovacaoGreeted' : 'greeted';
    if (st && st[greetedKey]) return;
    if (box.dataset.typing === '1') return;
    iaRunAskTyping(box, id).then(() => bindIaObraAssist(el, getChamado));
  });

  el.querySelectorAll('[data-ia-obra][data-ia-phase="plano"]').forEach((box) => {
    const id = box.getAttribute('data-ia-obra');
    const st = _iaObraState[id];
    if (!st || !st.plano || st.planoTyped) {
      if (st && st.plano && st.planoTyped) {
        box.querySelectorAll('.ia-stream-line').forEach((line) => {
          const full = line.getAttribute('data-full') || '';
          const v = line.querySelector('.ia-stream-v');
          if (!v) return;
          const colon = full.indexOf(': ');
          v.textContent = colon >= 0 ? full.slice(colon + 2) : full;
        });
      }
      return;
    }
    if (box.dataset.typing === '1') return;
    iaRunPlanoTyping(box, id, st.plano);
  });

  el.querySelectorAll('[data-ia-obra][data-ia-phase="aprovacao-resultado"]').forEach((box) => {
    const id = box.getAttribute('data-ia-obra');
    const st = _iaObraState[id];
    if (!st || !st.aprovacaoParecer || st.aprovacaoTyped) {
      if (st && st.aprovacaoParecer && st.aprovacaoTyped) {
        box.querySelectorAll('.ia-stream-line').forEach((line) => {
          const full = line.getAttribute('data-full') || '';
          const v = line.querySelector('.ia-stream-v');
          if (v) v.textContent = full;
        });
      }
      return;
    }
    if (box.dataset.typing === '1') return;
    iaRunParecerTyping(box, id, st.aprovacaoParecer);
  });
}

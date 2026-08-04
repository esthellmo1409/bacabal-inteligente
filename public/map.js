/* Mapa Bacabal Conecta — satélite + ruas + popups com prova */
const MapBI = (() => {
  const STATUS_COLOR = {
    novo: '#2163e8',
    aberto: '#2163e8',
    em_analise: '#c99700',
    encaminhado: '#8e44ad',
    em_execucao: '#f07800',
    em_andamento: '#f07800',
    aguardando_material: '#e67e22',
    aguardando_aprovacao: '#0ea5e9',
    concluido: '#2f8a28',
    cancelado: '#e74c3c',
  };

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

  function statusAction(s) {
    return ({
      novo: 'Aguardando a secretaria pegar o chamado.',
      aberto: 'Aguardando a secretaria pegar o chamado.',
      em_analise: 'Secretaria está analisando o caso.',
      encaminhado: 'Já foi encaminhado para a equipe de campo.',
      em_execucao: 'Equipe na rua executando o serviço agora.',
      em_andamento: 'Equipe na rua executando o serviço agora.',
      aguardando_material: 'Serviço pausado — aguardando material.',
      aguardando_aprovacao: 'Campo enviou a foto do depois — secretaria confere.',
      concluido: 'Serviço concluído e registrado no protocolo.',
      cancelado: 'Chamado cancelado.',
    })[s] || 'Situação em acompanhamento.';
  }

  function esc(v) {
    return String(v ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function fotoUrl(p) {
    return p.fotoAntes || p.foto || p.fotoDepois || null;
  }

  /** Camadas base: Ruas, Satélite, Híbrido */
  function basemaps(map, defaultKey = 'hybrid') {
    const streets = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      maxZoom: 20,
      subdomains: 'abcd',
    });

    const sat = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { attribution: 'Imagem &copy; Esri', maxZoom: 19 }
    );

    const roads = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}',
      { attribution: 'Ruas &copy; Esri', maxZoom: 19, opacity: 0.95 }
    );

    const places = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      { attribution: 'Nomes &copy; Esri', maxZoom: 19, opacity: 0.95 }
    );

    const labelsCarto = L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png',
      {
        attribution: '&copy; CARTO',
        maxZoom: 20,
        subdomains: 'abcd',
        pane: 'overlayPane',
        opacity: 1,
      }
    );

    const hybrid = L.layerGroup([sat, roads, places, labelsCarto]);

    const layers = {
      'Ruas (nomes)': streets,
      'Satélite': sat,
      'Híbrido (realista)': hybrid,
    };

    const initial = defaultKey === 'streets' ? streets : defaultKey === 'sat' ? sat : hybrid;
    initial.addTo(map);

    L.control.layers(layers, {}, { position: 'topright', collapsed: true }).addTo(map);

    return { streets, sat, hybrid, layers };
  }

  function create(elId, opts = {}) {
    const center = opts.center || [-4.2917, -44.7917];
    const zoom = opts.zoom || 14;
    const map = L.map(elId, {
      zoomControl: false,
      attributionControl: true,
    }).setView(center, zoom);

    L.control.zoom({ position: 'bottomright' }).addTo(map);
    basemaps(map, opts.basemap || 'hybrid');

    const layer = L.layerGroup().addTo(map);
    const state = {
      map, layer, points: [],
      filterStatus: '', filterBairro: '', filterQuery: '',
      markersById: {}, onSelect: opts.onSelect || null,
    };

    L.marker(center, {
      icon: L.divIcon({
        className: 'bi-pin-city',
        html: '<div class="bi-pin-city-inner"></div>',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      }),
    }).addTo(map).bindPopup('<strong>Bacabal · MA</strong><br>Bacabal Conecta');

    return state;
  }

  function popupHtml(p) {
    const titulo = esc(p.titulo || p.categoria || 'Ocorrência');
    const bairro = esc(p.bairro || '—');
    const protocolo = p.protocolo ? esc(p.protocolo) : '';
    const desc = p.descricao ? esc(String(p.descricao).slice(0, 160)) : '';
    const acao = esc(statusAction(p.status));
    const sec = p.secretaria ? esc(p.secretaria) : '';
    const pri = p.prioridade && p.prioridade !== 'media' ? esc(p.prioridade) : '';
    const foto = fotoUrl(p);
    const link = p.id
      ? `<a class="bi-popup-link" href="/cidadao.html?cidade=${encodeURIComponent(getCidade?.() || 'bacabal')}&protocolo=${encodeURIComponent(p.protocolo || p.id)}">Ver protocolo</a>`
      : '';
    return `
      <div class="bi-popup">
        ${foto ? `<div class="bi-popup-foto"><img src="${esc(foto)}" alt="Foto da ocorrência" /></div>` : ''}
        <div class="bi-popup-badge" style="background:${STATUS_COLOR[p.status] || '#2163e8'}">${statusLabel(p.status)}</div>
        ${pri ? `<span class="bi-popup-pri">${pri}</span>` : ''}
        <strong>${titulo}</strong>
        <div class="bi-popup-meta">${bairro}${protocolo ? ' · Prot. ' + protocolo : ''}${sec ? ' · ' + sec : ''}</div>
        <div class="bi-popup-acao"><b>Andamento:</b> ${acao}</div>
        ${desc ? `<p>${desc}</p>` : ''}
        ${link}
      </div>
    `;
  }

  function markerIcon(p, enlarged) {
    const color = STATUS_COLOR[p.status] || '#2163e8';
    const urgent = p.prioridade === 'urgente' || p.prioridade === 'alta';
    const size = enlarged ? 18 : (urgent ? 14 : 11);
    const pulse = urgent && p.status !== 'concluido' && p.status !== 'cancelado';
    return L.divIcon({
      className: 'bi-marker' + (pulse ? ' bi-marker-pulse' : ''),
      html: `<span class="bi-marker-dot" style="--c:${color};width:${size}px;height:${size}px"></span>`,
      iconSize: [size + 8, size + 8],
      iconAnchor: [(size + 8) / 2, (size + 8) / 2],
    });
  }

  function matchQuery(p, q) {
    if (!q) return true;
    const hay = [
      p.protocolo, p.titulo, p.categoria, p.bairro, p.descricao, p.secretaria, p.id, statusLabel(p.status),
    ].join(' ').toLowerCase();
    return hay.includes(q);
  }

  function render(state) {
    state.layer.clearLayers();
    state.markersById = {};
    const q = (state.filterQuery || '').trim().toLowerCase();
    const filtered = state.points.filter((p) => {
      if (state.filterStatus && p.status !== state.filterStatus) return false;
      if (state.filterBairro && p.bairro !== state.filterBairro) return false;
      if (!matchQuery(p, q)) return false;
      return p.lat != null && p.lng != null;
    });

    const bounds = [];
    const focus = !!(state.filterStatus || state.filterBairro || q);

    filtered.forEach((p) => {
      const m = L.marker([p.lat, p.lng], {
        icon: markerIcon(p, focus),
        riseOnHover: true,
      }).bindPopup(popupHtml(p), { maxWidth: 300, className: 'bi-popup-wrap' });

      m.on('click', () => {
        if (typeof state.onSelect === 'function') state.onSelect(p);
      });

      m.addTo(state.layer);
      if (p.id || p.protocolo) state.markersById[p.id || p.protocolo] = m;
      bounds.push([p.lat, p.lng]);
    });

    if (bounds.length && focus) {
      try {
        if (bounds.length === 1) state.map.setView(bounds[0], 16);
        else state.map.fitBounds(bounds, { padding: [48, 48], maxZoom: 16 });
      } catch (_) {}
      if (bounds.length === 1) {
        const first = filtered[0];
        const mk = state.markersById[first.id || first.protocolo];
        if (mk) setTimeout(() => mk.openPopup(), 220);
      }
    }

    return filtered.length;
  }

  function setPoints(state, points) {
    state.points = points || [];
    return render(state);
  }

  function setFilters(state, { status, bairro, q } = {}) {
    if (status !== undefined) state.filterStatus = status || '';
    if (bairro !== undefined) state.filterBairro = bairro || '';
    if (q !== undefined) state.filterQuery = q || '';
    return render(state);
  }

  function search(state, query) {
    state.filterQuery = (query || '').trim();
    return render(state);
  }

  function focusPoint(state, idOrProto) {
    const m = state.markersById[idOrProto];
    if (!m) return false;
    const ll = m.getLatLng();
    state.map.setView(ll, Math.max(state.map.getZoom(), 16), { animate: true });
    m.openPopup();
    return true;
  }

  function legendHtml() {
    return `
      <div class="bi-legend">
        <span><i style="background:#2163e8"></i> Novo</span>
        <span><i style="background:#c99700"></i> Análise</span>
        <span><i style="background:#f07800"></i> Execução</span>
        <span><i style="background:#0ea5e9"></i> Aprovação</span>
        <span><i style="background:#2f8a28"></i> Concluído</span>
      </div>
    `;
  }

  return {
    create, basemaps, setPoints, setFilters, search, focusPoint,
    legendHtml, STATUS_COLOR, statusLabel, statusAction, popupHtml, fotoUrl,
  };
})();

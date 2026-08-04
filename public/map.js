/* Mapa realista — satélite + nomes de ruas (híbrido) */
const MapBI = (() => {
  const STATUS_COLOR = {
    novo: '#2163e8',
    aberto: '#2163e8',
    em_analise: '#c99700',
    encaminhado: '#8e44ad',
    em_execucao: '#f7c32e',
    em_andamento: '#f7c32e',
    aguardando_material: '#e67e22',
    concluido: '#0cbc87',
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
      concluido: 'Serviço concluído e registrado no protocolo.',
      cancelado: 'Chamado cancelado.',
    })[s] || 'Situação em acompanhamento.';
  }

  /** Camadas base: Ruas, Satélite, Híbrido (satélite + nomes) */
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

    L.control.layers(layers, {}, { position: 'topright', collapsed: false }).addTo(map);

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
    const state = { map, layer, points: [], filterStatus: '', filterBairro: '', filterQuery: '', markersById: {} };

    L.marker(center, {
      icon: L.divIcon({
        className: 'bi-pin-city',
        html: '<div class="bi-pin-city-inner"></div>',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      }),
    }).addTo(map).bindPopup('<strong>Bacabal · MA</strong><br>Centro administrativo');

    return state;
  }

  function popupHtml(p) {
    const esc = (v) => String(v ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const titulo = esc(p.titulo || p.categoria || 'Ocorrência');
    const bairro = esc(p.bairro || '—');
    const protocolo = p.protocolo ? esc(p.protocolo) : '';
    const desc = p.descricao ? esc(String(p.descricao).slice(0, 140)) : '';
    const acao = esc(statusAction(p.status));
    const sec = p.secretaria ? esc(p.secretaria) : '';
    return `
      <div class="bi-popup">
        <div class="bi-popup-badge" style="background:${STATUS_COLOR[p.status] || '#2163e8'}">${statusLabel(p.status)}</div>
        <strong>${titulo}</strong>
        <div class="bi-popup-meta">${bairro}${protocolo ? ' · Prot. ' + protocolo : ''}${sec ? ' · ' + sec : ''}</div>
        <div class="bi-popup-acao"><b>O que está sendo feito:</b> ${acao}</div>
        ${desc ? `<p>${desc}</p>` : ''}
      </div>
    `;
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
    filtered.forEach((p) => {
      const color = STATUS_COLOR[p.status] || '#2163e8';
      const m = L.circleMarker([p.lat, p.lng], {
        radius: state.filterStatus || state.filterBairro || q ? 9 : 7,
        color: '#fff',
        weight: 2,
        fillColor: color,
        fillOpacity: 0.88,
        className: 'bi-dot',
      }).bindPopup(popupHtml(p), { maxWidth: 280 });

      m.on('mouseover', function () { this.setStyle({ radius: 11 }); });
      m.on('mouseout', function () {
        this.setStyle({ radius: state.filterStatus || state.filterBairro || q ? 9 : 7 });
      });

      m.addTo(state.layer);
      if (p.id || p.protocolo) state.markersById[p.id || p.protocolo] = m;
      bounds.push([p.lat, p.lng]);
    });

    if (bounds.length && (state.filterStatus || state.filterBairro || q)) {
      try {
        if (bounds.length === 1) state.map.setView(bounds[0], 16);
        else state.map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
      } catch (_) {}
      if (bounds.length === 1) {
        const first = filtered[0];
        const mk = state.markersById[first.id || first.protocolo];
        if (mk) setTimeout(() => mk.openPopup(), 200);
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

  function legendHtml() {
    return `
      <div class="bi-legend">
        <span><i style="background:#2163e8"></i> Novo</span>
        <span><i style="background:#c99700"></i> Análise</span>
        <span><i style="background:#f7c32e"></i> Execução</span>
        <span><i style="background:#0cbc87"></i> Concluído</span>
      </div>
    `;
  }

  return { create, basemaps, setPoints, setFilters, search, legendHtml, STATUS_COLOR, statusLabel, statusAction, popupHtml };
})();

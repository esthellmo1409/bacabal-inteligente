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
    const state = { map, layer, points: [], filterStatus: '', filterBairro: '' };

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
    return `
      <div class="bi-popup">
        <div class="bi-popup-badge" style="background:${STATUS_COLOR[p.status] || '#2163e8'}">${statusLabel(p.status)}</div>
        <strong>${p.titulo || p.categoria || 'Ocorrência'}</strong>
        <div class="bi-popup-meta">${p.bairro || '—'}${p.protocolo ? ' · ' + p.protocolo : ''}</div>
        ${p.descricao ? `<p>${String(p.descricao).slice(0, 120)}</p>` : ''}
      </div>
    `;
  }

  function render(state) {
    state.layer.clearLayers();
    const filtered = state.points.filter((p) => {
      if (state.filterStatus && p.status !== state.filterStatus) return false;
      if (state.filterBairro && p.bairro !== state.filterBairro) return false;
      return p.lat != null && p.lng != null;
    });

    const bounds = [];
    filtered.forEach((p) => {
      const color = STATUS_COLOR[p.status] || '#2163e8';
      const m = L.circleMarker([p.lat, p.lng], {
        radius: state.filterStatus || state.filterBairro ? 9 : 7,
        color: '#fff',
        weight: 2,
        fillColor: color,
        fillOpacity: 0.88,
        className: 'bi-dot',
      }).bindPopup(popupHtml(p), { maxWidth: 260 });

      m.on('mouseover', function () { this.setStyle({ radius: 11 }); });
      m.on('mouseout', function () {
        this.setStyle({ radius: state.filterStatus || state.filterBairro ? 9 : 7 });
      });

      m.addTo(state.layer);
      bounds.push([p.lat, p.lng]);
    });

    if (bounds.length > 2 && (state.filterStatus || state.filterBairro)) {
      try { state.map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 }); } catch (_) {}
    }

    return filtered.length;
  }

  function setPoints(state, points) {
    state.points = points || [];
    return render(state);
  }

  function setFilters(state, { status, bairro } = {}) {
    if (status !== undefined) state.filterStatus = status || '';
    if (bairro !== undefined) state.filterBairro = bairro || '';
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

  return { create, basemaps, setPoints, setFilters, legendHtml, STATUS_COLOR, statusLabel };
})();

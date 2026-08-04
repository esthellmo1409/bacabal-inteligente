/* Mapa premium — MapLibre GL (vetorial 3D) + satélite Esri
 * Visual bem mais próximo do Google Maps, sem chave paga.
 */
const MapGL = (() => {
  const STYLES = {
    streets: 'https://tiles.openfreemap.org/styles/liberty',
    bright: 'https://tiles.openfreemap.org/styles/bright',
  };

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
    return (typeof MapBI !== 'undefined' && MapBI.statusLabel)
      ? MapBI.statusLabel(s)
      : (s || '');
  }

  function fotoUrl(p) {
    return p.fotoAntes || p.foto || p.fotoDepois || null;
  }

  function popupHtml(p) {
    if (typeof MapBI !== 'undefined' && MapBI.popupHtml) return MapBI.popupHtml(p);
    return `<strong>${p.titulo || p.categoria || ''}</strong>`;
  }

  function create(containerId, opts = {}) {
    const center = opts.center || [-44.7917, -4.2917]; // lng, lat
    const zoom = opts.zoom ?? 14;
    const map = new maplibregl.Map({
      container: containerId,
      style: STYLES.streets,
      center,
      zoom,
      pitch: opts.pitch ?? 52,
      bearing: opts.bearing ?? -18,
      antialias: true,
      maxPitch: 65,
      maxZoom: 20,
      minZoom: 10,
      attributionControl: true,
      dragRotate: true,
      pitchWithRotate: true,
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottomright');
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 120 }), 'bottomleft');
    map.addControl(new maplibregl.FullscreenControl(), 'topright');

    const state = {
      map,
      mode: '3d',
      markers: [],
      points: [],
      onSelect: opts.onSelect || null,
    };

    map.on('load', () => {
      try {
        map.setFog({
          color: 'rgb(186, 210, 235)',
          'high-color': 'rgb(36, 92, 223)',
          'horizon-blend': 0.08,
          'space-color': 'rgb(11, 11, 25)',
          'star-intensity': 0.15,
        });
      } catch (_) {}
    });

    // Se algo zerar o pitch no modo 3D/híbrido, recupera a inclinação
    map.on('zoomend', () => {
      if (state.mode === 'sat') return;
      const want = cameraForMode(state.mode).pitch;
      if (map.getPitch() < want - 15) {
        map.easeTo({ pitch: want, duration: 350 });
      }
    });

    return state;
  }

  function ensureSatLayers(map) {
    if (map.getSource('bi-sat')) return;
    map.addSource('bi-sat', {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      maxzoom: 16,
      attribution: 'Satélite © Esri',
    });
    map.addLayer({
      id: 'bi-sat-layer',
      type: 'raster',
      source: 'bi-sat',
      layout: { visibility: 'none' },
      paint: { 'raster-opacity': 1 },
    }, firstSymbolLayerId(map));
  }

  function firstSymbolLayerId(map) {
    const layers = map.getStyle()?.layers || [];
    const sym = layers.find(l => l.type === 'symbol');
    return sym ? sym.id : undefined;
  }

  function cameraForMode(mode) {
    if (mode === 'sat') return { pitch: 0, bearing: 0 };
    if (mode === 'hybrid') return { pitch: 42, bearing: -12 };
    return { pitch: 52, bearing: -18 }; // 3d
  }

  function setMode(state, mode) {
    const map = state.map;
    const apply = () => {
      ensureSatLayers(map);
      state.mode = mode;
      const cam = cameraForMode(mode);
      if (mode === '3d') {
        map.setLayoutProperty('bi-sat-layer', 'visibility', 'none');
      } else {
        map.setLayoutProperty('bi-sat-layer', 'visibility', 'visible');
      }
      map.easeTo({ pitch: cam.pitch, bearing: cam.bearing, duration: 700 });
    };
    if (map.isStyleLoaded()) apply();
    else map.once('load', apply);
  }

  function clearMarkers(state) {
    (state.markers || []).forEach(m => m.remove());
    state.markers = [];
  }

  function setPoints(state, points, opts = {}) {
    state.points = points || [];
    clearMarkers(state);
    const bounds = new maplibregl.LngLatBounds();
    let n = 0;

    state.points.forEach((p) => {
      if (p.lat == null || p.lng == null) return;
      const color = STATUS_COLOR[p.status] || '#f07800';
      const urgent = p.prioridade === 'urgente' || p.prioridade === 'alta';
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'gl-marker' + (urgent ? ' gl-marker-urgent' : '');
      el.style.setProperty('--c', color);
      el.title = (p.titulo || '') + ' · ' + (p.protocolo || '');
      el.innerHTML = '<span></span>';

      const popup = new maplibregl.Popup({ offset: 18, maxWidth: '300px', className: 'gl-popup' })
        .setHTML(popupHtml(p));

      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([Number(p.lng), Number(p.lat)])
        .setPopup(popup)
        .addTo(state.map);

      el.addEventListener('click', () => {
        if (typeof state.onSelect === 'function') state.onSelect(p);
      });

      marker.__cid = p.id;
      state.markers.push(marker);
      bounds.extend([Number(p.lng), Number(p.lat)]);
      n++;
    });

    if (n && opts.fit !== false) {
      const cam = cameraForMode(state.mode || '3d');
      try {
        if (n === 1) {
          const p = state.points.find(x => x.lat != null);
          state.map.easeTo({
            center: [Number(p.lng), Number(p.lat)],
            zoom: Math.max(state.map.getZoom(), 15.2),
            pitch: cam.pitch,
            bearing: cam.bearing,
            duration: 700,
          });
        } else {
          // fitBounds sem pitch “achata” o 3D — forçamos a câmera inclinada
          state.map.fitBounds(bounds, {
            padding: 70,
            maxZoom: 15.2,
            duration: 800,
            pitch: cam.pitch,
            bearing: cam.bearing,
          });
        }
      } catch (_) {}
    }
    return n;
  }

  function focusPoint(state, id) {
    const m = state.markers.find(x => x.__cid === id);
    if (!m) return false;
    const ll = m.getLngLat();
    const cam = cameraForMode(state.mode || '3d');
    state.map.easeTo({
      center: ll,
      zoom: Math.max(state.map.getZoom(), 16),
      pitch: cam.pitch,
      bearing: cam.bearing,
      duration: 700,
    });
    m.togglePopup();
    return true;
  }

  function drawRoute(state, latlngs) {
    const map = state.map;
    const geo = {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: (latlngs || []).map(([lat, lng]) => [lng, lat]),
      },
    };
    if (map.getSource('bi-route')) {
      map.getSource('bi-route').setData(geo);
    } else {
      map.addSource('bi-route', { type: 'geojson', data: geo });
      map.addLayer({
        id: 'bi-route-line',
        type: 'line',
        source: 'bi-route',
        paint: {
          'line-color': '#2f8a28',
          'line-width': 4,
          'line-opacity': 0.9,
        },
      });
    }
  }

  function clearRoute(state) {
    const map = state.map;
    if (map.getLayer('bi-route-line')) map.removeLayer('bi-route-line');
    if (map.getSource('bi-route')) map.removeSource('bi-route');
  }

  return {
    create, setMode, setPoints, focusPoint, drawRoute, clearRoute,
    STATUS_COLOR, statusLabel, fotoUrl, STYLES,
  };
})();

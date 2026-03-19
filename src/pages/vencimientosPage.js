const state = window.appState;
const sheets = window.sheetsService;

async function abrirVencimientos() {
  window.toggleSidebar?.(false);
  const contenedor = document.getElementById('vencimientosTabla');

  if (!contenedor) return;

  window.setActiveView?.('vencimientos');
  contenedor.innerHTML = 'Cargando vencimientos...';

  try {
    const data = await sheets.obtenerVencimientos();

    if (!data.ok || !Array.isArray(data.vencimientos)) {
      contenedor.innerHTML = 'No hay datos';
      return;
    }

    const vencimientos = [...data.vencimientos].sort(
      (a, b) => a.diasRestantes - b.diasRestantes
    );

    const filtrados =
      state.estadoFiltroGlobal === 'TODOS'
        ? vencimientos
        : vencimientos.filter((item) => item.estado === state.estadoFiltroGlobal);

    let html = `
      <div class="vencimientos-header">
        <div class="badge-total">${vencimientos.length} vencimientos</div>
        <div class="tabs-filtro">
          <button class="tab-btn ${state.estadoFiltroGlobal === 'TODOS' ? 'active' : ''}" onclick="cambiarFiltro('TODOS')">Todos</button>
          <button class="tab-btn ${state.estadoFiltroGlobal === 'VENCIDA' ? 'active' : ''}" onclick="cambiarFiltro('VENCIDA')">Vencidas</button>
          <button class="tab-btn ${state.estadoFiltroGlobal === 'POR_VENCER' ? 'active' : ''}" onclick="cambiarFiltro('POR_VENCER')">Por vencer</button>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Nombre</th>
            <th>Cliente</th>
            <th>Plataforma</th>
            <th>Vence</th>
            <th>Dias</th>
            <th>Estado</th>
            <th>Accion</th>
          </tr>
        </thead>
        <tbody>
    `;

    filtrados.forEach((item) => {
      const telefono = String(item.telefono || '').replace(/\D/g, '');
      const nombre = (item.clienteNombre || '').replace(/'/g, '');
      const plataforma = (item.plataforma || '').replace(/'/g, '');

      let botonWhats = `
        <button class="btn-whatsapp disabled" disabled title="Cliente sin telefono registrado">
          Sin telefono
        </button>
      `;

      if (telefono.length >= 8 && item.estado === 'VENCIDA') {
        botonWhats = `
          <button class="btn-whatsapp vencida" onclick="abrirWhatsApp('${telefono}','VENCIDA','${plataforma}','${nombre}')">
            Wh-VENCIDA
          </button>
        `;
      }

      if (telefono.length >= 8 && item.estado === 'POR_VENCER') {
        botonWhats = `
          <button class="btn-whatsapp por-vencer" onclick="abrirWhatsApp('${telefono}','POR_VENCER','${plataforma}','${nombre}')">
            Wh-Por Vencer
          </button>
        `;
      }

      html += `
        <tr>
          <td>${item.idSuscripcion}</td>
          <td>${item.clienteNombre || '-'}</td>
          <td>${item.clienteId}</td>
          <td>${item.plataforma}</td>
          <td style="text-align:center">${item.fechaVencimiento}</td>
          <td style="color:${item.diasRestantes < 0 ? '#ef4444' : '#22c55e'};font-weight:700;text-align:right">
            ${item.diasRestantes}
          </td>
          <td><span class="estado ${item.estado}">${item.estado}</span></td>
          <td style="display:flex; gap:6px; flex-wrap:wrap;">
            <button class="btn-renew" onclick="abrirRenovar('${item.idSuscripcion}')">Renovar</button>
            ${botonWhats}
          </td>
        </tr>
      `;
    });

    contenedor.innerHTML = `${html}</tbody></table>`;
  } catch (error) {
    console.error(error);
    contenedor.innerHTML = 'Error de conexion';
  }
}

function cambiarFiltro(estado) {
  state.estadoFiltroGlobal = estado;
  abrirVencimientos();
}

function cerrarVencimientos() {
  window.setActiveView?.('home');
}

function abrirWhatsApp(telefono, tipo, plataforma, nombre) {
  let mensaje = '';

  if (tipo === 'VENCIDA') {
    mensaje =
      `Hola ${nombre}, tu suscripcion de ${plataforma} esta vencida.\n\n` +
      'Si deseas renovarla podemos activarla de inmediato.';
  }

  if (tipo === 'POR_VENCER') {
    mensaje =
      `Hola ${nombre}, tu suscripcion de ${plataforma} esta proxima a vencer.\n\n` +
      'Si deseas renovarla antes del vencimiento estamos listos para ayudarte.';
  }

  const url = `https://wa.me/505${telefono}?text=${encodeURIComponent(mensaje)}`;
  window.open(url, '_blank');
}

window.vencimientosPage = {
  init() {},
  abrirVencimientos,
};
window.abrirVencimientos = abrirVencimientos;
window.cambiarFiltro = cambiarFiltro;
window.cerrarVencimientos = cerrarVencimientos;
window.abrirWhatsApp = abrirWhatsApp;

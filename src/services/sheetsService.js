const API_URL =
  'https://script.google.com/macros/s/AKfycbyprdukWnburSn2zPmigdee1S7fD6lwCY5FQ_FbUmFTp1wUwQe6FMcjFk6vTAs_Qdw/exec';

function buildUrl(action, params = {}) {
  const url = new URL(API_URL);
  url.searchParams.set('action', action);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value);
    }
  });

  return url.toString();
}

async function getJson(action, params = {}) {
  const response = await fetch(buildUrl(action, params));
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function postForm(payload = {}) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(payload),
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

window.sheetsService = {
  API_URL,
  buildUrl,
  getJson,
  postForm,
  obtenerClientes: () => getJson('obtenerClientes'),
  buscarCliente: (q) => getJson('buscarCliente', { q }),
  buscarSuscripciones: (idCliente) => getJson('buscarSuscripciones', { idCliente }),
  renovarSuscripcion: (idSuscripcion, meses) => postForm({ action: 'renovarSuscripcion', idSuscripcion, meses }),
  agregarCliente: (nombre, telefono) => getJson('agregarCliente', { nombre, telefono }),
  listarPlataformas: () => getJson('listarPlataformas'),
  crearSuscripcion: (payload) => postForm({ action: 'crearSuscripcion', ...payload }),
  obtenerSuscripcionParaEditar: (idSuscripcion) => getJson('obtenerSuscripcionParaEditar', { idSuscripcion }),
  guardarEdicionSuscripcion: (payload) => postForm({ action: 'guardarEdicionSuscripcion', ...payload }),
  obtenerCuentaParaEditar: (idSuscripcion) => getJson('obtenerCuentaParaEditar', { idSuscripcion }),
  guardarCuenta: (payload) => getJson('guardarCuenta', payload),
  darDeBajaSuscripcion: (idSuscripcion) => postForm({ action: 'darDeBajaSuscripcion', idSuscripcion }),
  editarCliente: (payload) => postForm({ action: 'editarCliente', ...payload }),
  obtenerVencimientos: () => getJson('obtenerVencimientos'),
};

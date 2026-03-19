function normalizarFechaISO(fechaStr) {
  if (!fechaStr) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(fechaStr)) {
    return fechaStr;
  }

  const partes = fechaStr.split(/[\/\-]/);
  if (partes.length !== 3) return null;

  const dia = partes[0].padStart(2, '0');
  const mes = partes[1].padStart(2, '0');
  const anio = partes[2];

  if (anio.length !== 4) return null;

  return `${anio}-${mes}-${dia}`;
}

function showToast(message, type = 'success', duration = 2500) {
  const toast = document.getElementById('toast');
  if (!toast) return;

  toast.textContent = message;
  toast.className = 'toast';
  toast.classList.add(type);
  toast.classList.add('show');

  window.clearTimeout(showToast.timeoutId);
  showToast.timeoutId = window.setTimeout(() => {
    toast.classList.remove('show');
  }, duration);
}

function setButtonLoading(btn, loading, label = 'Guardar') {
  if (!btn) return;

  if (loading) {
    btn.disabled = true;
    btn.classList.add('btn-loading');
    btn.dataset.label = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span> Guardando';
    return;
  }

  btn.disabled = false;
  btn.classList.remove('btn-loading');
  btn.innerHTML = btn.dataset.label || label;
}

window.appUtils = {
  normalizarFechaISO,
  showToast,
  setButtonLoading,
};

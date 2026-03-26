const normalizeNumber = (value) => Number(value || 0) || 0;

function getEstadoCuenta(cuenta) {
  const perfilesUsados = normalizeNumber(cuenta?.perfilesUsados ?? cuenta?.perfiles_usados);
  const perfilesMax = normalizeNumber(cuenta?.perfilesMax ?? cuenta?.perfiles_max);

  if (perfilesMax > 0 && perfilesUsados >= perfilesMax) return 'LLENA';
  if (perfilesMax > 0 && perfilesMax - perfilesUsados === 1) return 'CRITICA';
  return 'DISPONIBLE';
}

window.cuentasUtils = {
  getEstadoCuenta,
};

export { getEstadoCuenta };

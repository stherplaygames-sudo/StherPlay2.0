function calcularOcupacion(cuentas) {
  let total = 0;
  let usados = 0;

  (Array.isArray(cuentas) ? cuentas : []).forEach((cuenta) => {
    total += Number(cuenta?.perfilesMax ?? 0) || 0;
    usados += Number(cuenta?.perfilesUsados ?? 0) || 0;
  });

  const porcentaje = total === 0 ? 0 : (usados / total) * 100;

  return {
    total,
    usados,
    porcentaje: Number(porcentaje.toFixed(1)),
  };
}

window.plataformasMetrics = {
  calcularOcupacion,
};

export { calcularOcupacion };

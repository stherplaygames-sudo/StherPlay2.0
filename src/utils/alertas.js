function getNivelOcupacion(porcentaje) {
  const p = Number(porcentaje || 0);

  if (p >= 95) {
    return { nivel: 'CRITICO', color: 'red', msg: 'Saturacion alta' };
  }

  if (p >= 90) {
    return { nivel: 'ALTO', color: 'orange', msg: 'Casi lleno' };
  }

  if (p >= 70) {
    return { nivel: 'MEDIO', color: 'yellow', msg: 'En crecimiento' };
  }

  return { nivel: 'BAJO', color: 'green', msg: 'Saludable' };
}

function getMensajeAlerta(plataformaNombre, porcentaje) {
  const { nivel } = getNivelOcupacion(porcentaje);

  if (nivel === 'CRITICO') {
    return `${plataformaNombre} esta al ${porcentaje}% - accion inmediata`;
  }

  if (nivel === 'ALTO') {
    return `${plataformaNombre} al ${porcentaje}% - planifica expansion`;
  }

  return null;
}

window.alertasUtils = {
  getNivelOcupacion,
  getMensajeAlerta,
};

export { getNivelOcupacion, getMensajeAlerta };

/**
 * Descripciones en español de los códigos de falla OBD2 genéricos más frecuentes.
 * Para los que no están en la lista se genera una descripción por categoría.
 */
const DTC_ES: Record<string, string> = {
  P0010: 'Circuito del actuador de posición del árbol de levas "A" (banco 1)',
  P0011: 'Tiempo del árbol de levas "A" demasiado adelantado (banco 1)',
  P0016: 'Correlación cigüeñal / árbol de levas (banco 1 sensor A)',
  P0030: 'Circuito del calefactor del sensor de oxígeno (banco 1 sensor 1)',
  P0087: 'Presión del riel / sistema de combustible demasiado baja',
  P0100: 'Falla en el circuito del sensor MAF (flujo de aire)',
  P0101: 'Rango/funcionamiento del sensor MAF',
  P0102: 'Sensor MAF: señal baja',
  P0103: 'Sensor MAF: señal alta',
  P0106: 'Rango/funcionamiento del sensor MAP (presión absoluta del múltiple)',
  P0107: 'Sensor MAP: señal baja',
  P0108: 'Sensor MAP: señal alta',
  P0110: 'Circuito del sensor de temperatura del aire de admisión (IAT)',
  P0112: 'Sensor IAT: señal baja',
  P0113: 'Sensor IAT: señal alta',
  P0115: 'Circuito del sensor de temperatura del refrigerante (ECT)',
  P0116: 'Rango/funcionamiento del sensor de temperatura del refrigerante',
  P0117: 'Sensor de temperatura del refrigerante: señal baja',
  P0118: 'Sensor de temperatura del refrigerante: señal alta',
  P0120: 'Circuito del sensor de posición del acelerador (TPS) "A"',
  P0121: 'Rango/funcionamiento del sensor TPS "A"',
  P0122: 'Sensor TPS "A": señal baja',
  P0123: 'Sensor TPS "A": señal alta',
  P0125: 'Temperatura del refrigerante insuficiente para control en lazo cerrado',
  P0128: 'Termostato: temperatura del refrigerante por debajo de la de regulación',
  P0130: 'Circuito del sensor de oxígeno (banco 1 sensor 1)',
  P0131: 'Sensor de oxígeno (B1S1): voltaje bajo',
  P0132: 'Sensor de oxígeno (B1S1): voltaje alto',
  P0133: 'Sensor de oxígeno (B1S1): respuesta lenta',
  P0134: 'Sensor de oxígeno (B1S1): sin actividad',
  P0135: 'Calefactor del sensor de oxígeno (B1S1)',
  P0136: 'Circuito del sensor de oxígeno (banco 1 sensor 2)',
  P0137: 'Sensor de oxígeno (B1S2): voltaje bajo',
  P0138: 'Sensor de oxígeno (B1S2): voltaje alto',
  P0141: 'Calefactor del sensor de oxígeno (B1S2)',
  P0171: 'Mezcla demasiado pobre (banco 1)',
  P0172: 'Mezcla demasiado rica (banco 1)',
  P0174: 'Mezcla demasiado pobre (banco 2)',
  P0175: 'Mezcla demasiado rica (banco 2)',
  P0200: 'Circuito de inyectores',
  P0201: 'Circuito del inyector, cilindro 1',
  P0202: 'Circuito del inyector, cilindro 2',
  P0203: 'Circuito del inyector, cilindro 3',
  P0204: 'Circuito del inyector, cilindro 4',
  P0217: 'Sobrecalentamiento del motor',
  P0230: 'Circuito primario de la bomba de combustible',
  P0234: 'Sobrealimentación del turbo (overboost)',
  P0299: 'Baja presión del turbo (underboost)',
  P0300: 'Falla de encendido aleatoria / múltiples cilindros',
  P0301: 'Falla de encendido en el cilindro 1',
  P0302: 'Falla de encendido en el cilindro 2',
  P0303: 'Falla de encendido en el cilindro 3',
  P0304: 'Falla de encendido en el cilindro 4',
  P0305: 'Falla de encendido en el cilindro 5',
  P0306: 'Falla de encendido en el cilindro 6',
  P0325: 'Circuito del sensor de detonación 1 (banco 1)',
  P0335: 'Circuito del sensor de posición del cigüeñal (CKP)',
  P0336: 'Rango/funcionamiento del sensor CKP',
  P0340: 'Circuito del sensor de posición del árbol de levas (CMP)',
  P0341: 'Rango/funcionamiento del sensor CMP',
  P0351: 'Circuito de la bobina de encendido "A"',
  P0352: 'Circuito de la bobina de encendido "B"',
  P0353: 'Circuito de la bobina de encendido "C"',
  P0354: 'Circuito de la bobina de encendido "D"',
  P0380: 'Circuito de bujías de precalentamiento (diésel)',
  P0400: 'Flujo de recirculación de gases de escape (EGR)',
  P0401: 'Flujo EGR insuficiente',
  P0402: 'Flujo EGR excesivo',
  P0420: 'Eficiencia del catalizador por debajo del umbral (banco 1)',
  P0430: 'Eficiencia del catalizador por debajo del umbral (banco 2)',
  P0440: 'Sistema de control de emisiones evaporativas (EVAP)',
  P0441: 'EVAP: flujo de purga incorrecto',
  P0442: 'EVAP: fuga pequeña detectada',
  P0443: 'Circuito de la válvula de purga EVAP',
  P0446: 'Circuito de control de ventilación EVAP',
  P0455: 'EVAP: fuga grande detectada (revise el tapón de gasolina)',
  P0456: 'EVAP: fuga muy pequeña detectada',
  P0460: 'Circuito del sensor de nivel de combustible',
  P0480: 'Circuito de control del ventilador de enfriamiento 1',
  P0500: 'Sensor de velocidad del vehículo (VSS)',
  P0505: 'Sistema de control de marcha mínima (IAC)',
  P0506: 'Marcha mínima más baja de lo esperado',
  P0507: 'Marcha mínima más alta de lo esperado',
  P0562: 'Voltaje del sistema bajo',
  P0563: 'Voltaje del sistema alto',
  P0600: 'Falla en el enlace de comunicación serial (ECU)',
  P0601: 'Error de memoria interna de la computadora (ECU)',
  P0606: 'Falla del procesador de la computadora (ECU)',
  P0700: 'Falla en el sistema de control de la transmisión (ver códigos TCM)',
  P0705: 'Circuito del sensor de rango de la transmisión',
  P0715: 'Circuito del sensor de velocidad de entrada / turbina',
  P0720: 'Circuito del sensor de velocidad de salida',
  P0740: 'Circuito del embrague del convertidor de par',
  P0750: 'Solenoide de cambios "A"',
  P0755: 'Solenoide de cambios "B"',
  P2096: 'Ajuste de combustible posterior demasiado pobre (banco 1)',
  P2097: 'Ajuste de combustible posterior demasiado rico (banco 1)',
  P2101: 'Rango/funcionamiento del motor del cuerpo de aceleración',
  P2135: 'Correlación de voltaje de los sensores TPS A/B',
  P2187: 'Mezcla pobre en marcha mínima (banco 1)',
  P2188: 'Mezcla rica en marcha mínima (banco 1)',
  P242F: 'Restricción por acumulación de ceniza en el filtro de partículas (DPF)',
  P2463: 'Acumulación de hollín en el filtro de partículas (DPF)',
  U0100: 'Pérdida de comunicación con la computadora del motor (ECM/PCM)',
  U0101: 'Pérdida de comunicación con la computadora de la transmisión (TCM)',
  U0121: 'Pérdida de comunicación con el módulo ABS',
  U0140: 'Pérdida de comunicación con el módulo de carrocería (BCM)',
  U0155: 'Pérdida de comunicación con el tablero de instrumentos',
};

const SYSTEMS: Record<string, string> = {
  P: 'Tren motriz (motor/transmisión)',
  C: 'Chasis (frenos, suspensión, dirección)',
  B: 'Carrocería (bolsas de aire, confort, luces)',
  U: 'Red de comunicación entre módulos',
};

const P_SUBSYSTEMS: Record<string, string> = {
  '0': 'medición de combustible y aire / emisiones auxiliares',
  '1': 'medición de combustible y aire',
  '2': 'medición de combustible y aire (inyectores)',
  '3': 'sistema de encendido o falla de encendido',
  '4': 'controles auxiliares de emisiones',
  '5': 'velocidad del vehículo, marcha mínima y entradas auxiliares',
  '6': 'computadora y circuitos de salida',
  '7': 'transmisión',
  '8': 'transmisión',
  '9': 'transmisión',
  A: 'propulsión híbrida',
  B: 'propulsión híbrida',
  C: 'propulsión híbrida',
};

export function normalizeDtc(code: string): string | null {
  const c = code.trim().toUpperCase();
  return /^[PCBU][0-3][0-9A-F]{3}$/.test(c) ? c : null;
}

export function describeDtc(code: string): string {
  const c = normalizeDtc(code);
  if (!c) return `Código no válido: ${code}`;
  if (DTC_ES[c]) return DTC_ES[c];
  const system = SYSTEMS[c[0]];
  const manufacturer = c[1] === '1' || c[1] === '3' ? 'específico del fabricante' : 'genérico';
  const sub = c[0] === 'P' ? P_SUBSYSTEMS[c[2]] : undefined;
  return `${system}${sub ? ` - ${sub}` : ''} (código ${manufacturer})`;
}

/** Fallas que conviene marcar como críticas (riesgo de daño al motor). */
export function dtcSeverity(code: string): 'warning' | 'critical' {
  const c = normalizeDtc(code) ?? '';
  if (/^P03\d\d$/.test(c) || ['P0217', 'P0118', 'P0335', 'P0087', 'U0100'].includes(c)) return 'critical';
  return 'warning';
}

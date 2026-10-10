import { DeviceAlarm, NormalizedEvent } from '../telemetry/normalized-event';

/**
 * Decodificador del protocolo TK103 en sus dos variantes más comunes de GPS chinos:
 *
 *  - Coban / GPS103 (TK103A/B, TK303, GPS-103):
 *      login:     ##,imei:359586015829802,A;            -> responder "LOAD"
 *      latido:    359586015829802;                      -> responder "ON"
 *      posición:  imei:359586015829802,tracker,0809231929,,F,112909.397,A,2234.4669,N,11354.3287,E,0.11,;
 *
 *  - Xexun / Shenzhen TK103-2 (mensajes entre paréntesis):
 *      (027028641389BR00080612A2232.9828N11404.9297E000.0022828000.0000000000L000230AA)
 *      login BP05 -> responder (ID AP05); latido BP00 -> responder (ID AP01HSO)
 *
 * Los campos opcionales varían según firmware; el decodificador es tolerante.
 */

export type Tk103Variant = 'coban' | 'xexun';

export interface Tk103Message {
  variant: Tk103Variant;
  kind: 'login' | 'heartbeat' | 'position' | 'alarm' | 'unknown';
  uniqueId?: string;
  /** Respuesta que hay que mandar al GPS (sin ella muchos equipos se desconectan). */
  reply?: string;
  event?: NormalizedEvent;
}

const KNOTS_TO_KMH = 1.852;

/** Separa un buffer TCP en tramas completas. Devuelve las tramas y el resto sin terminar. */
export function splitFrames(buffer: string): { frames: string[]; rest: string } {
  const frames: string[] = [];
  let i = 0;
  while (i < buffer.length) {
    const ch = buffer[i];
    if (ch === '\r' || ch === '\n' || ch === ' ' || ch === '\0') {
      i++;
      continue;
    }
    if (ch === '(') {
      const end = buffer.indexOf(')', i);
      if (end < 0) break;
      frames.push(buffer.slice(i, end + 1));
      i = end + 1;
    } else {
      const semi = buffer.indexOf(';', i);
      const nl = buffer.indexOf('\n', i);
      let end = semi;
      if (end < 0 || (nl >= 0 && nl < end)) end = nl;
      if (end < 0) break;
      const frame = buffer.slice(i, end + (buffer[end] === ';' ? 1 : 0)).trim();
      if (frame) frames.push(frame);
      i = end + 1;
    }
  }
  return { frames, rest: buffer.slice(i) };
}

/** Convierte ddmm.mmmm / dddmm.mmmm + hemisferio a grados decimales. */
export function nmeaToDecimal(value: string, hemisphere: string): number {
  const v = parseFloat(value);
  if (!Number.isFinite(v)) return NaN;
  const degrees = Math.floor(v / 100);
  const minutes = v - degrees * 100;
  let result = degrees + minutes / 60;
  if (hemisphere === 'S' || hemisphere === 'W') result = -result;
  return Math.round(result * 1e6) / 1e6;
}

export function decodeTk103(raw: string): Tk103Message {
  const frame = raw.trim();
  if (frame.startsWith('(')) return decodeXexun(frame);
  return decodeCoban(frame);
}

// ---------------------------------------------------------------- Coban / GPS103

const COBAN_ALARMS: Record<string, DeviceAlarm> = {
  'help me': 'sos',
  'low battery': 'lowBattery',
  'ac alarm': 'powerCut',
  'power alarm': 'powerCut',
  move: 'vibration',
  'sensor alarm': 'vibration',
  speed: 'overspeed',
  'door alarm': 'door',
  stockade: 'geofence',
  accident: 'accident',
};

function decodeCoban(frame: string): Tk103Message {
  const body = frame.replace(/;$/, '');

  const login = /^##,imei:(\d+),A$/.exec(body);
  if (login) return { variant: 'coban', kind: 'login', uniqueId: login[1], reply: 'LOAD' };

  if (/^\d{10,17}$/.test(body)) return { variant: 'coban', kind: 'heartbeat', uniqueId: body, reply: 'ON' };

  if (!body.startsWith('imei:')) return { variant: 'coban', kind: 'unknown' };

  const f = body.split(',');
  const uniqueId = f[0].slice(5);
  const keyword = (f[1] ?? '').trim().toLowerCase();
  const localDateTime = f[2] ?? ''; // YYMMDDhhmm[ss]
  const fixType = f[4]; // F = GPS, L = solo antenas celulares (sin coordenadas)
  const utcTime = f[5] ?? ''; // hhmmss.sss
  const validity = f[6];

  const event: NormalizedEvent = {
    deviceUid: uniqueId,
    source: 'tk103_coban',
    time: cobanTime(localDateTime, utcTime),
    attributes: { keyword },
  };

  if (fixType !== 'L' && f[7] && f[9]) {
    event.lat = nmeaToDecimal(f[7], f[8]);
    event.lng = nmeaToDecimal(f[9], f[10]);
    event.valid = validity === 'A';
    const knots = parseFloat(f[11] ?? '');
    event.speed = Number.isFinite(knots) ? Math.round(knots * KNOTS_TO_KMH * 10) / 10 : 0;
    const course = parseFloat(f[12] ?? '');
    if (Number.isFinite(course)) event.course = course;
    const altitude = parseFloat(f[13] ?? '');
    if (Number.isFinite(altitude)) event.altitude = altitude;
    if (f[14] === '0' || f[14] === '1') event.ignition = f[14] === '1';
  } else {
    event.valid = false;
  }

  if (keyword === 'acc on') event.ignition = true;
  if (keyword === 'acc off') event.ignition = false;

  const alarm = COBAN_ALARMS[keyword];
  if (alarm) event.alarms = [alarm];

  return {
    variant: 'coban',
    kind: alarm ? 'alarm' : 'position',
    uniqueId,
    event,
  };
}

function cobanTime(localDateTime: string, utcTime: string): Date {
  const d = /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?/.exec(localDateTime);
  const t = /^(\d{2})(\d{2})(\d{2})/.exec(utcTime);
  if (d && t) {
    return new Date(Date.UTC(2000 + +d[1], +d[2] - 1, +d[3], +t[1], +t[2], +t[3]));
  }
  if (d) {
    // Sin hora UTC: el campo local depende de la zona configurada ("time zone123456 0" = UTC).
    return new Date(Date.UTC(2000 + +d[1], +d[2] - 1, +d[3], +d[4], +d[5], +(d[6] ?? 0)));
  }
  return new Date();
}

// ---------------------------------------------------------------- Xexun / TK103-2

const XEXUN_POSITION =
  /(\d{2})(\d{2})(\d{2})([AV])(\d{4}\.\d+)([NS])(\d{5}\.\d+)([EW])(\d{3}\.\d)(\d{2})(\d{2})(\d{2})(\d{3}\.\d{2})(\d{8})?(?:L([0-9A-Fa-f]+))?/;

/** Tipo de alarma en mensajes BO01 (primer dígito después del comando). */
const XEXUN_ALARMS: Record<string, DeviceAlarm> = {
  '0': 'powerCut',
  '1': 'accident',
  '2': 'sos',
  '3': 'vibration',
  '5': 'overspeed',
  '6': 'geofence',
};

function decodeXexun(frame: string): Tk103Message {
  const m = /^\((\d{12})(B[A-Z]\d{2})(.*)\)$/.exec(frame);
  if (!m) return { variant: 'xexun', kind: 'unknown' };
  const [, id, command, data] = m;

  if (command === 'BP00') {
    return { variant: 'xexun', kind: 'heartbeat', uniqueId: id, reply: `(${id}AP01HSO)` };
  }

  const reply = command === 'BP05' ? `(${id}AP05)` : command === 'BO01' ? `(${id}AS01)` : undefined;
  const event = parseXexunPosition(id, data);
  let kind: Tk103Message['kind'] = command === 'BP05' ? 'login' : event ? 'position' : 'unknown';

  if (event && command === 'BO01') {
    const alarm = XEXUN_ALARMS[data[0]] ?? 'other';
    event.alarms = [alarm];
    kind = 'alarm';
  }
  if (event) event.attributes = { ...event.attributes, command };

  return { variant: 'xexun', kind, uniqueId: id, reply, event };
}

function parseXexunPosition(id: string, data: string): NormalizedEvent | undefined {
  const p = XEXUN_POSITION.exec(data);
  if (!p) return undefined;
  const [, yy, mo, dd, validity, lat, ns, lng, ew, speed, hh, mi, ss, course, status, mileage] = p;
  const attributes: Record<string, unknown> = {};
  // El significado de cada bit de estado varía por firmware: se guarda crudo.
  if (status) attributes.status = status;
  if (mileage) attributes.mileageRaw = mileage;
  return {
    deviceUid: id,
    source: 'tk103_xexun',
    time: new Date(Date.UTC(2000 + +yy, +mo - 1, +dd, +hh, +mi, +ss)),
    lat: nmeaToDecimal(lat, ns),
    lng: nmeaToDecimal(lng, ew),
    valid: validity === 'A',
    speed: parseFloat(speed),
    course: parseFloat(course),
    attributes,
  };
}

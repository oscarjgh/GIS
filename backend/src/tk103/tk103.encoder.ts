import { CommandType } from '../entities';
import { Tk103Variant } from './tk103.decoder';

/**
 * Comandos que se mandan al GPS por la conexión TCP (GPRS).
 * Para la variante Xexun el id es el de 12 dígitos que el equipo reporta.
 */
export function encodeTk103Command(
  variant: Tk103Variant,
  id: string,
  type: CommandType,
  options: { intervalSec?: number; text?: string } = {},
): string | null {
  if (type === 'custom') return options.text ?? null;
  const interval = Math.max(10, Math.min(options.intervalSec ?? 30, 9999));

  if (variant === 'coban') {
    switch (type) {
      case 'engineStop':
        return `**,imei:${id},J`;
      case 'engineResume':
        return `**,imei:${id},K`;
      case 'positionSingle':
        return `**,imei:${id},B`;
      case 'positionPeriodic':
        return `**,imei:${id},C,${interval}s`;
    }
  } else {
    switch (type) {
      case 'engineStop':
        return `(${id}AV011)`;
      case 'engineResume':
        return `(${id}AV010)`;
      case 'positionSingle':
        return `(${id}AP00)`;
      case 'positionPeriodic':
        return `(${id}AR00${interval.toString(16).toUpperCase().padStart(4, '0')}0000)`;
    }
  }
  return null;
}

/**
 * SMS típicos para dejar un GPS Coban/TK103 reportando a nuestro servidor.
 * La contraseña de fábrica suele ser 123456. Puede variar por firmware.
 */
export function cobanSetupSms(opts: {
  host: string;
  port: number;
  apn: string;
  apnUser?: string;
  apnPassword?: string;
  password?: string;
  intervalSec?: number;
}): { sms: string; description: string }[] {
  const pw = opts.password ?? '123456';
  const interval = String(Math.max(10, Math.min(opts.intervalSec ?? 30, 255))).padStart(3, '0');
  const list = [
    { sms: `begin${pw}`, description: 'Inicializa el equipo (responde "begin ok")' },
    { sms: `apn${pw} ${opts.apn}`, description: 'APN de la SIM' },
  ];
  if (opts.apnUser) list.push({ sms: `apnuser${pw} ${opts.apnUser}`, description: 'Usuario del APN' });
  if (opts.apnPassword) list.push({ sms: `apnpasswd${pw} ${opts.apnPassword}`, description: 'Contraseña del APN' });
  list.push(
    { sms: `adminip${pw} ${opts.host} ${opts.port}`, description: 'IP/dominio y puerto del servidor' },
    { sms: `gprs${pw}`, description: 'Activa el modo GPRS (envío por datos)' },
    { sms: `time zone${pw} 0`, description: 'Hora en UTC (la plataforma la convierte a hora local)' },
    { sms: `fix${interval}s***n${pw}`, description: `Reporta cada ${+interval} s sin límite` },
  );
  return list;
}

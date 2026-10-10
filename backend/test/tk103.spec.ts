import { decodeTk103, nmeaToDecimal, splitFrames } from '../src/tk103/tk103.decoder';
import { cobanSetupSms, encodeTk103Command } from '../src/tk103/tk103.encoder';

describe('TK103 Coban / GPS103', () => {
  it('login responde LOAD', () => {
    const m = decodeTk103('##,imei:359586015829802,A;');
    expect(m).toMatchObject({ variant: 'coban', kind: 'login', uniqueId: '359586015829802', reply: 'LOAD' });
  });

  it('latido responde ON', () => {
    const m = decodeTk103('359586015829802;');
    expect(m).toMatchObject({ kind: 'heartbeat', uniqueId: '359586015829802', reply: 'ON' });
  });

  it('posición normal', () => {
    const m = decodeTk103(
      'imei:359586015829802,tracker,0809231929,13554900601,F,112909.397,A,2234.4669,N,11354.3287,E,0.11,;',
    );
    expect(m.kind).toBe('position');
    const e = m.event!;
    expect(e.deviceUid).toBe('359586015829802');
    expect(e.lat).toBeCloseTo(22.574448, 5);
    expect(e.lng).toBeCloseTo(113.905478, 5);
    expect(e.valid).toBe(true);
    expect(e.speed).toBeCloseTo(0.2, 1);
    expect(e.time.toISOString()).toBe('2008-09-23T11:29:09.000Z');
  });

  it('coordenadas del hemisferio occidental (México)', () => {
    const m = decodeTk103(
      'imei:868683020235846,tracker,231015083000,,F,143000.000,A,1925.9560,N,09907.9920,W,32.40,180.5,2240,1;',
    );
    const e = m.event!;
    expect(e.lat).toBeCloseTo(19.4326, 4);
    expect(e.lng).toBeCloseTo(-99.1332, 4);
    expect(e.speed).toBeCloseTo(60, 0);
    expect(e.course).toBe(180.5);
    expect(e.altitude).toBe(2240);
    expect(e.ignition).toBe(true);
  });

  it('alarma SOS', () => {
    const m = decodeTk103('imei:868683020235846,help me,231015083000,,F,143000.000,A,1925.9560,N,09907.9920,W,0.00,0;');
    expect(m.kind).toBe('alarm');
    expect(m.event!.alarms).toEqual(['sos']);
  });

  it('acc off marca ignición apagada', () => {
    const m = decodeTk103('imei:868683020235846,acc off,231015083000,,F,143000.000,A,1925.9560,N,09907.9920,W,0.00,0;');
    expect(m.event!.ignition).toBe(false);
  });

  it('posición LBS (sin GPS) no trae coordenadas', () => {
    const m = decodeTk103('imei:868683020235846,tracker,231015083000,,L,,,1a2b,,3c4d,,,;');
    expect(m.event!.lat).toBeUndefined();
    expect(m.event!.valid).toBe(false);
  });
});

describe('TK103 Xexun / Shenzhen', () => {
  it('posición BR00', () => {
    const m = decodeTk103('(027028641389BR00080612A2232.9828N11404.9297E000.0022828000.0000000000L000230AA)');
    expect(m).toMatchObject({ variant: 'xexun', kind: 'position', uniqueId: '027028641389' });
    const e = m.event!;
    expect(e.lat).toBeCloseTo(22.54971, 4);
    expect(e.lng).toBeCloseTo(114.08216, 4);
    expect(e.time.toISOString()).toBe('2008-06-12T02:28:28.000Z');
    expect(e.attributes).toMatchObject({ status: '00000000', mileageRaw: '000230AA', command: 'BR00' });
  });

  it('login BP05 responde AP05', () => {
    const m = decodeTk103(
      '(013632651491BP05000013632651491080524A2232.9806N11404.9355E000.1101241323.8700000000L000450AC)',
    );
    expect(m.kind).toBe('login');
    expect(m.reply).toBe('(013632651491AP05)');
    expect(m.event!.speed).toBeCloseTo(0.1);
    expect(m.event!.course).toBeCloseTo(323.87);
  });

  it('latido BP00', () => {
    const m = decodeTk103('(013632651491BP00000013632651491HSO)');
    expect(m).toMatchObject({ kind: 'heartbeat', reply: '(013632651491AP01HSO)' });
  });

  it('alarma BO01 SOS', () => {
    const m = decodeTk103('(013632651491BO012080524A2232.9806N11404.9355E000.1101241323.8700000000L000450AC)');
    expect(m.kind).toBe('alarm');
    expect(m.event!.alarms).toEqual(['sos']);
  });
});

describe('utilidades', () => {
  it('splitFrames separa tramas mezcladas y conserva el resto', () => {
    const { frames, rest } = splitFrames('##,imei:1,A;\r\n(027028641389BP00HSO)359586015829802;imei:12');
    expect(frames).toEqual(['##,imei:1,A;', '(027028641389BP00HSO)', '359586015829802;']);
    expect(rest).toBe('imei:12');
  });

  it('nmeaToDecimal', () => {
    expect(nmeaToDecimal('09907.9920', 'W')).toBeCloseTo(-99.1332, 4);
  });

  it('comandos de corte de motor', () => {
    expect(encodeTk103Command('coban', '868683020235846', 'engineStop')).toBe('**,imei:868683020235846,J');
    expect(encodeTk103Command('xexun', '027028641389', 'engineResume')).toBe('(027028641389AV010)');
    expect(encodeTk103Command('xexun', '027028641389', 'positionPeriodic', { intervalSec: 30 })).toBe(
      '(027028641389AR00001E0000)',
    );
  });

  it('SMS de configuración', () => {
    const sms = cobanSetupSms({ host: '1.2.3.4', port: 5001, apn: 'internet.itelcel.com' }).map((s) => s.sms);
    expect(sms).toContain('adminip123456 1.2.3.4 5001');
    expect(sms).toContain('fix030s***n123456');
  });
});

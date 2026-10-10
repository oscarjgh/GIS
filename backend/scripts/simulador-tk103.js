#!/usr/bin/env node
/**
 * Simulador de un GPS TK103 (variante Coban) para probar la plataforma sin hardware.
 * Uso: node scripts/simulador-tk103.js [host] [puerto] [imei] [segundos_entre_reportes]
 * Ej.: node scripts/simulador-tk103.js localhost 5001 868683020235846 5
 */
const net = require('net');

const [host = 'localhost', port = '5001', imei = '868683020235846', every = '5'] = process.argv.slice(2);

// Recorrido circular alrededor del Zócalo de la CDMX.
const center = { lat: 19.4326, lng: -99.1332 };
let step = 0;

function toNmea(value, isLat) {
  const abs = Math.abs(value);
  const deg = Math.floor(abs);
  const min = (abs - deg) * 60;
  const degStr = String(deg).padStart(isLat ? 2 : 3, '0');
  const hemi = isLat ? (value >= 0 ? 'N' : 'S') : value >= 0 ? 'E' : 'W';
  return [`${degStr}${min.toFixed(4).padStart(7, '0')}`, hemi];
}

function frame(keyword = 'tracker') {
  const angle = (step * Math.PI) / 30;
  const lat = center.lat + 0.01 * Math.sin(angle);
  const lng = center.lng + 0.01 * Math.cos(angle);
  const now = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const date = `${p(now.getUTCFullYear() % 100)}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}${p(now.getUTCHours())}${p(now.getUTCMinutes())}${p(now.getUTCSeconds())}`;
  const time = `${p(now.getUTCHours())}${p(now.getUTCMinutes())}${p(now.getUTCSeconds())}.000`;
  const [la, ns] = toNmea(lat, true);
  const [lo, ew] = toNmea(lng, false);
  const knots = (step % 20 === 10 ? 60 : 25 + (step % 7)).toFixed(2); // a veces excede la velocidad
  const course = (((angle * 180) / Math.PI + 90) % 360).toFixed(1);
  return `imei:${imei},${keyword},${date},,F,${time},A,${la},${ns},${lo},${ew},${knots},${course},2240,1;`;
}

const socket = net.connect(Number(port), host, () => {
  console.log(`Conectado a ${host}:${port} como ${imei}`);
  socket.write(`##,imei:${imei},A;`);
  const timer = setInterval(() => {
    step++;
    const keyword = step === 15 ? 'help me' : 'tracker';
    const f = frame(keyword);
    socket.write(f);
    console.log('->', f);
    if (step % 6 === 0) socket.write(`${imei};`); // latido
  }, Number(every) * 1000);
  socket.on('close', () => clearInterval(timer));
});
socket.setEncoding('latin1');
socket.on('data', (d) => console.log('<-', d));
socket.on('error', (e) => console.error('Error:', e.message));
socket.on('close', () => console.log('Conexión cerrada'));

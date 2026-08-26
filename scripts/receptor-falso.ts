import { createServer } from 'node:http';

/**
 * Receptor de notificaciones para pruebas locales. Falla las primeras N
 * peticiones con 503 y despues responde 200, para poder observar el backoff.
 *
 *   pnpm receptor          -> falla 2 veces, luego acepta
 *   FALLOS=3 pnpm receptor -> falla 3 veces (agota los reintentos)
 *   FALLOS=0 pnpm receptor -> acepta siempre
 */
const PUERTO = Number(process.env.PUERTO ?? 4000);
const FALLOS = Number(process.env.FALLOS ?? 2);

let recibidas = 0;

createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/webhook') {
    res.writeHead(404).end();
    return;
  }

  let cuerpo = '';
  req.on('data', (trozo) => { cuerpo += trozo; });
  req.on('end', () => {
    recibidas += 1;
    const hora = new Date().toISOString().slice(11, 23);
    if (recibidas <= FALLOS) {
      console.log(`${hora}  #${recibidas}  -> 503 (fallo simulado)  ${cuerpo}`);
      res.writeHead(503).end('servicio no disponible');
    } else {
      console.log(`${hora}  #${recibidas}  -> 200 ACEPTADA           ${cuerpo}`);
      res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"ok":true}');
    }
  });
}).listen(PUERTO, () => {
  console.log(`[receptor] escuchando en http://localhost:${PUERTO}/webhook`);
  console.log(`[receptor] fallara las primeras ${FALLOS} peticiones\n`);
});
#!/usr/bin/env node
/**
 * Validador de manifiestos de publicación — GeoGatos
 * =================================================
 *
 * Puerta de calidad entre "OpenCode genera el contenido" y "el runner lo
 * publica". Se ejecuta en local ANTES de hacer push, y el workflow lo vuelve a
 * invocar como segunda barrera.
 *
 * Por qué un validador si publicar.mjs ya podría fallar solo:
 *   - Publicar es irreversible. Si Instagram rechaza a las 10:00, el tweet ya
 *     salió y el post de LinkedIn se queda sin publicar. El validador comprueba
 *     los límites ANTES de que nada salga.
 *   - Los límites son distintos por red y cambian sin aviso. Centralizarlos en
 *     rrss.config.yaml y comprobarlos en un sitio evita que un texto válido en
 *     Facebook reviente en Instagram.
 *
 * Uso:
 *   node scripts/validar-manifiesto.mjs <manifiesto.yaml> [--json]
 *   node scripts/validar-manifiesto.mjs --todos
 *
 * Códigos de salida:
 *   0  sin errores (puede haber avisos)
 *   1  hay errores
 *   2  error de uso o no se pudo leer el fichero
 */

import { readdirSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cargarConfig, cargarManifiesto, validarManifiestoCompleto } from './lib/nucleo.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

function usage() {
  console.error(`
Uso:
  node scripts/validar-manifiesto.mjs <manifiesto.yaml> [--json]
  node scripts/validar-manifiesto.mjs --todos

--todos valida todos los manifiestos de manifiestos/ salvo los que empiezan
por guion bajo (-plantilla.yaml).
`);
  process.exit(2);
}

const args = process.argv.slice(2);
if (args.length === 0) usage();

const comoJson = args.includes('--json');
const rutas = [];

if (args.includes('--todos')) {
  const dir = join(RAIZ, 'manifiestos');
  if (!existsSync(dir)) usage();
  for (const f of readdirSync(dir)) {
    if (f.startsWith('_') || !/\.ya?ml$/i.test(f)) continue;
    rutas.push(join(dir, f));
  }
  if (rutas.length === 0) {
    console.error('No hay manifiestos que validar en manifiestos/');
    process.exit(2);
  }
} else {
  const ruta = args.find((a) => !a.startsWith('--'));
  if (!ruta) usage();
  rutas.push(ruta);
}

let cfg;
try {
  cfg = cargarConfig(RAIZ);
} catch (e) {
  console.error(e.message);
  process.exit(2);
}

const errores = [];
const avisos = [];

for (const ruta of rutas) {
  if (!existsSync(ruta)) {
    console.error(`No existe el manifiesto: ${ruta}`);
    process.exit(2);
  }
  let manifiesto;
  try {
    manifiesto = cargarManifiesto(ruta);
  } catch (e) {
    console.error(`${ruta} no es YAML válido: ${e.message}`);
    process.exit(2);
  }
  const r = validarManifiestoCompleto(manifiesto, ruta, cfg, RAIZ);
  errores.push(...r.errores);
  avisos.push(...r.avisos);
}

if (comoJson) {
  console.log(JSON.stringify({ errores, avisos }, null, 2));
} else {
  const titulo = `Manifiesto(s): ${rutas.map((r) => basename(r)).join(', ')}`;
  console.log(`\n${titulo}\n${'='.repeat(titulo.length)}`);

  if (errores.length) {
    console.log(`\nERRORES (${errores.length}) — no se puede publicar:`);
    for (const e of errores) console.log(`  ✗ ${e.donde}: ${e.msg}`);
  }
  if (avisos.length) {
    console.log(`\nAVISOS (${avisos.length}):`);
    for (const a of avisos) console.log(`  ! ${a.donde}: ${a.msg}`);
  }
  if (!errores.length) {
    console.log('\n✓ Sin errores. Ya puedes marcar el manifiesto como `listo` y hacer push.');
  }
  console.log('');
}

process.exit(errores.length ? 1 : 0);

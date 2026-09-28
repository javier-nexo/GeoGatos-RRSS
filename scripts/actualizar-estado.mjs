#!/usr/bin/env node
/**
 * Escribe el resultado de la publicación de vuelta en el manifiesto.
 *
 * Existe porque el estado vive en el repositorio y es la única memoria que
 * sobrevive entre ejecuciones. El runner es efímero, así que lo que no se
 * escriba en el fichero no existe para la siguiente vuelta.
 *
 * Usa `parseDocument` y no `parse` a propósito: `parse` devuelve un objeto
 * plano y al volver a serializarlo se pierde todo el commentary. Los
 * manifiestos son documentos con comentarios que explican cada campo, y un
 * runner automático que los reescribe cada día no puede borrar esas
 * notas para que el siguiente push salga limpio.
 *
 * Aviso: reescribir el documento lo reformatea. Los arrays en línea pasan de
 * `["a", "b"]` a lo mismo sinpadding, y las cadenas nuevas salen sin comillas.
 * El contenido no cambia y el validador lo sigue leyendo igual, pero el diff
 * de cada publicación tiene ruido de formato. Se acepta: prefiero un diff
 * con ruido a una edición por regex sobre YAML, que es donde de verdad se
 * corrompen los ficheros.
 *
 * Uso:
 *   node scripts/actualizar-estado.mjs --slug=<slug> --estado=publicado
 *   node scripts/actualizar-estado.mjs --slug=<slug> --estado=error
 *   node scripts/actualizar-estado.mjs --manifiesto=<ruta> --estado=listo
 *
 * Opciones:
 *   --slug=<slug>      Manifiesto a tocar, sin la extensión.
 *   --manifiesto=<r>   Ruta al manifiesto. Alternativa a --slug, y la que
 *                      usan los tests para no escribir en manifiestos/.
 *   --estado=<estado>  Uno de ESTADOS. Ver nucleo.mjs.
 *   --resultados=<f>   JSON con [{red, url, id, ok, error}]. Si se omite, se
 *                      deducen del registro de publicaciones.
 *   --json             Salida en JSON.
 *
 * Códigos de salida:
 *   0  escrito (o no había nada que escribir)
 *   1  no se pudo leer o guardar el manifiesto
 *   2  error de uso
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, basename, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseDocument } from 'yaml';

import { cargarConfig, ESTADOS, redesYaPublicadas } from './lib/nucleo.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------------
// Argumentos
// ---------------------------------------------------------------------------
const args = { json: false };
for (const a of process.argv.slice(2)) {
  if (a === '--json') args.json = true;
  else if (a.startsWith('--slug=')) args.slug = a.slice(7);
  else if (a.startsWith('--manifiesto=')) args.manifiesto = a.slice(13);
  else if (a.startsWith('--estado=')) args.estado = a.slice(9);
  else if (a.startsWith('--resultados=')) args.resultados = a.slice(13);
}

function die(mensaje, codigo = 2) {
  console.error(`✗ ${mensaje}\n`);
  process.exit(codigo);
}

if (!args.estado) die('Falta --estado=<estado>.');
if (!ESTADOS.includes(args.estado)) {
  die(`--estado inválido: "${args.estado}". Vale: ${ESTADOS.join(', ')}.`);
}
if (!args.manifiesto && !args.slug) die('Falta --slug=<slug> o --manifiesto=<ruta>.');

// ---------------------------------------------------------------------------
// Manifiesto
// ---------------------------------------------------------------------------
const ruta = args.manifiesto
  ? (isAbsolute(args.manifiesto) ? args.manifiesto : join(RAIZ, args.manifiesto))
  : join(RAIZ, 'manifiestos', `${args.slug}.yaml`);
if (!existsSync(ruta)) die(`No existe el manifiesto: ${ruta}`);
if (!args.slug) args.slug = basename(ruta).replace(/\.ya?ml$/, '');

let doc;
try {
  doc = parseDocument(readFileSync(ruta, 'utf8'));
} catch (e) {
  die(`No se puede leer ${ruta}: ${e.message}`, 1);
}
if (doc.errors.length) {
  die(`${ruta} no es YAML válido: ${doc.errors[0].message}`, 1);
}

// La clave de la que deducir sale de la config, no de aquí: duplicar la ruta
// es como se rompe una de las dos.
function rutaRegistro() {
  try {
    return join(RAIZ, cargarConfig(RAIZ).salida?.registro ?? 'registro/publicaciones.jsonl');
  } catch {
    return join(RAIZ, 'registro', 'publicaciones.jsonl');
  }
}

const pub = doc.get('publicacion');
if (!pub || typeof pub !== 'object') {
  die(`${ruta} no tiene el bloque "publicacion".`, 1);
}

const antes = pub.get('estado') ?? null;
pub.set('estado', args.estado);
pub.set('publicado_en', new Date().toISOString());

// Las URLs se guardan por red para que el manifiesto sea el historial
// legible, y porque es lo que permite reconstruir a mano lo que pasó.
let resultados = [];
if (args.resultados) {
  try {
    resultados = JSON.parse(args.resultados);
  } catch (e) {
    die(`--resultados no es JSON válido: ${e.message}`);
  }
} else {
  const hechas = redesYaPublicadas(rutaRegistro(), args.slug);
  resultados = [...hechas.keys()].map((red) => ({ red, url: null }));
}

if (resultados.length) {
  pub.set(
    'resultados',
    resultados.map((r) => ({ red: r.red, ok: r.ok !== false, url: r.url ?? null, id: r.id ?? null })),
  );
}

let texto;
try {
  texto = doc.toString({ flowCollectionPadding: false });
} catch (e) {
  die(`No se puede serializar ${ruta}: ${e.message}`, 1);
}

try {
  writeFileSync(ruta, texto, 'utf8');
} catch (e) {
  die(`No se puede escribir ${ruta}: ${e.message}`, 1);
}

if (args.json) {
  console.log(JSON.stringify({ slug: args.slug, estadoAntes: antes, estado: args.estado, resultados }));
} else {
  const cambio = antes === args.estado ? 'sin cambio' : `${antes ?? '(sin estado)'} -> ${args.estado}`;
  console.log(`${args.slug}: ${cambio}`);
}

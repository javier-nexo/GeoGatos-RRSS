#!/usr/bin/env node
/**
 * Completar la carpeta de medios desde la bandeja de entrada — GeoGatos
 * ======================================================================
 *
 * LA REGLA DEL REPARTO (la decidió el usuario, no es una heurística)
 * ------------------------------------------------------------------
 * Las imágenes se cogen **en el orden en que se han subido** a `entrada/`
 * y se asignan por posición:
 *
 *     1ª imagen subida -> facebook-01.jpg   e   instagram-01.jpg
 *     2ª imagen subida -> instagram-02.jpg
 *     3ª imagen subida -> instagram-03.jpg
 *
 * Es decir: el índice del hueco dentro de la lista `medios` de cada red es el
 * índice de la imagen de entrada. La misma foto sirve para varias redes, que
 * es la intención: no hay que subir una imagen distinta por red.
 *
 * Uso:
 *   node scripts/preparar-medios.mjs --slug=2026-10-05-color-de-las-colonias
 *   node scripts/preparar-medios.mjs --slug=<slug> --simular
 *   node scripts/preparar-medios.mjs --slug=<slug> --incluir-standby
 *   node scripts/preparar-medios.mjs --listar
 *
 * `--simular` no toca el disco: imprime el reparto y los avisos para
 * revisarlos antes de copiar nada.
 *
 * NO pone `estado: listo` ni hace commit. Eso es del usuario.
 */

import { readFileSync, readdirSync, statSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { cargarConfig, cargarManifiesto, estadoRed, extensionDe } from './lib/nucleo.mjs';
import { inspeccionarImagen, proporcionesCompatibles, FORMATOS_Instagram } from './lib/imagenes.mjs';

const RAIZ = join(fileURLToPath(new URL('.', import.meta.url)), '..');

const EXT_ENTRADA = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif'];

/**
 * Lista las imágenes de la bandeja en **orden de subida**.
 *
 * El orden de subida no existe como tal en un sistema de ficheros: lo que hay
 * es la fecha de modificación. Es un proxy fiable cuando las descargas van
 * seguidas, que es el caso normal. Se desempata por nombre para que dos
 * ficheros con la misma marca de tiempo no cambien de posición entre dos
 * ejecuciones y produzcan publicaciones distintas.
 */
export function listarEntrada(dirEntrada) {
  if (!existsSync(dirEntrada)) return [];

  const entradas = [];
  for (const nombre of readdirSync(dirEntrada)) {
    if (nombre.startsWith('.')) continue;
    if (extname(nombre).slice(1).toLowerCase() === 'md') continue;

    const completa = join(dirEntrada, nombre);
    let st;
    try {
      st = statSync(completa);
    } catch {
      continue; // se borró mientras mirábamos
    }
    if (!st.isFile()) continue;
    if (!EXT_ENTRADA.includes(extensionDe(nombre))) continue;

    entradas.push({ nombre, ruta: completa, mtimeMs: st.mtimeMs, bytes: st.size });
  }

  entradas.sort((a, b) => a.mtimeMs - b.mtimeMs || a.nombre.localeCompare(b.nombre, 'es'));
  return entradas;
}

/**
 * Monta el reparto a partir de las redes que van a publicar y las imágenes
 * que hay. Puro: no toca el disco, para poder testearlo.
 *
 * @param {Array<{nombre: string, medios: string[]}>} redesPublicables
 * @param {Array<{nombre: string}>} imagenes  en orden de subida
 * @returns {{asignaciones: Array, avisos: Array<string>}}
 */
export function planearReparto(redesPublicables, imagenes) {
  const avisos = [];
  const asignaciones = [];
  const destinosVistos = new Map();

  if (imagenes.length === 0) {
    return { asignaciones, avisos: ['la bandeja `entrada/` está vacía'] };
  }

  const maximo = Math.max(...redesPublicables.map((r) => r.medios.length), 0);
  if (maximo > imagenes.length) {
    avisos.push(
      `hacen falta ${maximo} imágenes distintas y solo hay ${imagenes.length}: ` +
      `las que falten se van a repetir. Sube ${maximo - imagenes.length} más o ` +
      `reduce el carrusel de Instagram en el manifiesto.`
    );
  }

  for (const red of redesPublicables) {
    red.medios.forEach((destino, indice) => {
      // La regla: el índice del hueco ES el índice de la imagen de entrada.
      // Si no hay suficientes, se repite la última y se avisa arriba.
      const elegida = imagenes[Math.min(indice, imagenes.length - 1)];
      const repetida = indice >= imagenes.length;

      if (destinosVistos.has(destino)) {
        avisos.push(`"${destino}" lo piden dos redes; se usa la primera asignación`);
      }
      destinosVistos.set(destino, elegida.nombre);

      asignaciones.push({
        destino,
        red: red.nombre,
        origen: elegida.nombre,
        origenRuta: elegida.ruta,
        repetida,
        indiceImagen: indice + 1,
      });
    });
  }

  // No se avisa de que una misma imagen acabe en varias redes: es el
  // comportamiento pedido, no un problema. El aviso que sí importa es el de
  // arriba, el de quedarse sin imágenes distintas.
  return { asignaciones, avisos };
}

/**
 * Comprueba el formato real y la proporción de lo que se va a copiar.
 *
 * Estas dos comprobaciones existen porque fallan tarde y mal: un PNG en un
 * hueco de Instagram o un carrusel con mezclas de vertical y horizontal no dan
 * error aquí, dan error en Meta, después de que ya no se pueda arreglar.
 */
function inspeccionarAsignaciones(asignaciones) {
  const errores = [];
  const avisos = [];
  const porOrigen = new Map();

  for (const a of asignaciones) {
    const buf = readFileSync(a.origenRuta);
    const info = inspeccionarImagen(buf);
    porOrigen.set(a.origen, { ...info, bytes: buf.length });

    if (info.formato === 'desconocido') {
      errores.push(`${a.destino} <- ${a.origen}: no es un formato de imagen reconocible`);
    }

    if (a.red === 'instagram' && !FORMATOS_Instagram.includes(info.formato)) {
      errores.push(
        `${a.destino} <- ${a.origen}: es ${info.formato} y Instagram solo acepta JPEG. ` +
        `Exporta a JPEG; renombrar el fichero no lo convierte.`
      );
    }
  }

  // El carrusel se recorta al formato de la primera: el resto se avisa.
  const ig = asignaciones.filter((a) => a.red === 'instagram');
  if (ig.length > 1) {
    const ref = porOrigen.get(ig[0].origen);
    for (const a of ig.slice(1)) {
      const info = porOrigen.get(a.origen);
      if (!ref?.ancho || !info?.ancho) continue;
      if (!proporcionesCompatibles(ref.ancho, ref.alto, info.ancho, info.alto)) {
        avisos.push(
          `${a.destino} (${info.ancho}x${info.alto}) tiene otra proporción que ` +
          `${ig[0].destino} (${ref.ancho}x${ref.alto}): Instagram la recortará al centro. ` +
          `Si no es lo que quieres, cambia el orden en \`entrada/\`.`
        );
      }
    }
  }

  return { errores, avisos, porOrigen };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parsearArgs(argv) {
  const args = { simular: false, listar: false, incluirStandby: false, json: false };
  for (const a of argv) {
    if (a === '--simular') args.simular = true;
    else if (a === '--listar') args.listar = true;
    else if (a === '--incluir-standby') args.incluirStandby = true;
    else if (a === '--json') args.json = true;
    else if (a.startsWith('--slug=')) args.slug = a.slice(7);
    else if (a.startsWith('--entrada=')) args.entrada = a.slice(10);
  }
  return args;
}

function listar(dirEntrada) {
  const imgs = listarEntrada(dirEntrada);
  if (!imgs.length) {
    console.log(`No hay imágenes en ${dirEntrada}`);
    return 0;
  }
  console.log(`Imágenes en ${dirEntrada}, en orden de subida:\n`);
  imgs.forEach((im, i) => {
    const info = inspeccionarImagen(readFileSync(im.ruta));
    const dim = info.ancho ? `${info.ancho}x${info.alto}` : 'dimensiones desconocidas';
    console.log(`  ${i + 1}. ${im.nombre.padEnd(30)} ${info.formato.padEnd(6)} ${dim.padEnd(22)} ${(im.bytes / 1024).toFixed(0)} KB`);
  });
  console.log(`\n${imgs.length} imagen(es). La 1ª es facebook-01 e instagram-01; la 2ª, instagram-02; la 3ª, instagram-03.`);
  return 0;
}

function main() {
  const args = parsearArgs(process.argv.slice(2));
  const cfg = cargarConfig(RAIZ);

  if (args.listar) return listar(join(RAIZ, args.entrada ?? cfg.medios.entrada ?? 'entrada'));

  if (!args.slug) {
    console.error('Falta --slug=<slug>. Usa --listar para ver la bandeja.');
    return 2;
  }

  const rutaManifiesto = join(RAIZ, 'manifiestos', `${args.slug}.yaml`);
  if (!existsSync(rutaManifiesto)) {
    console.error(`No encuentro el manifiesto: ${rutaManifiesto}`);
    return 2;
  }
  const manifiesto = cargarManifiesto(rutaManifiesto);

  const dirEntrada = join(RAIZ, args.entrada ?? cfg.medios.entrada ?? 'entrada');
  const dirDestino = join(RAIZ, cfg.medios.carpeta, args.slug);
  const imagenes = listarEntrada(dirEntrada);

  // Solo las redes que van a publicar de verdad. Las de standby no necesitan
  // fichero: pedir su imagen sería el trabajo inútil que el standby evita.
  const redesPublicables = [];
  const enStandby = [];
  for (const [nombre, plataforma] of Object.entries(manifiesto.plataformas ?? {})) {
    const cfgRed = cfg.redes?.[nombre];
    if (!cfgRed) continue;
    const { estado } = estadoRed(nombre, cfg, plataforma);
    if (estado === 'inactiva') continue;
    if (estado === 'standby' && !args.incluirStandby) { enStandby.push(nombre); continue; }
    const medios = Array.isArray(plataforma.medios) ? plataforma.medios : [];
    if (medios.length) redesPublicables.push({ nombre, medios });
  }

  const { asignaciones, avisos } = planearReparto(redesPublicables, imagenes);
  const { errores, avisos: avisosImg, porOrigen } = inspeccionarAsignaciones(asignaciones);
  const todosAvisos = [...avisos, ...avisosImg];

  if (args.json) {
    console.log(JSON.stringify({
      slug: args.slug, origen: dirEntrada, destino: dirDestino,
      asignaciones, avisos: todosAvisos, errores, enStandby,
    }, null, 2));
    return errores.length ? 1 : 0;
  }

  console.log(`Bandeja: ${dirEntrada}`);
  console.log(`Publicación: ${dirDestino}\n`);

  if (!asignaciones.length) {
    console.log('No hay nada que copiar: la publicación no declara medios, o la bandeja está vacía.');
    for (const a of avisos) console.log(`  ! ${a}`);
    return todosAvisos.length ? 1 : 0;
  }

  console.log('Reparto (posición de la imagen de entrada -> fichero destino):\n');
  for (const a of asignaciones) {
    const info = porOrigen.get(a.origen);
    const dim = info?.ancho ? `${info.ancho}x${info.alto}` : '?';
    const marca = a.repetida ? '  <- REPETIDA' : '';
    console.log(`  ${String(a.indiceImagen).padStart(2)}. ${a.origen.padEnd(28)} -> ${a.destino.padEnd(18)} ${(info?.formato ?? '?').padEnd(6)} ${dim.padEnd(12)} [${a.red}]${marca}`);
  }

  if (enStandby.length) {
    console.log(`\nEn standby, sin preparar: ${enStandby.join(', ')}`);
    console.log('  (sus medios son opcionales; usa --incluir-standby si también los quieres)');
  }

  for (const a of todosAvisos) console.log(`\n  ! ${a}`);
  for (const e of errores) console.log(`\n  x ${e}`);

  if (errores.length) {
    console.log('\nNo se copia nada: corrige lo de arriba.');
    return 1;
  }

  if (args.simular) {
    console.log('\n--simular: no se ha copiado nada.');
    return 0;
  }

  mkdirSync(dirDestino, { recursive: true });
  for (const a of asignaciones) {
    copyFileSync(a.origenRuta, join(dirDestino, a.destino));
  }
  console.log(`\nCopiados ${asignaciones.length} ficheros en ${dirDestino}`);

  // La URL pública es lo que consumirán Instagram y TikTok. Se muestra porque
  // es el paso que falla en silencio si GitHub Pages no ha republished.
  const base = String(cfg.medios.base_url ?? '').replace(/\/+$/, '');
  console.log('\nComprueba que esto responde antes de dar la publicación por buena:');
  for (const a of asignaciones.slice(0, 1)) {
    console.log(`  curl -I ${base}/${args.slug}/${a.destino}`);
  }
  console.log('\nRecuerda: esto NO publica. Falta que pongas `estado: listo` y hagas push.');

  return 0;
}

/**
 * La guarda importa: `preparar-medios.test.mjs` importa `planearReparto` de
 * aquí. Sin esto, importar el fichero ejecutaría el CLI entero contra el
 * manifiesto real cada vez que se lanzan los tests.
 */
const ejecutadoDirectamente =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (ejecutadoDirectamente) {
  process.exitCode = main();
}

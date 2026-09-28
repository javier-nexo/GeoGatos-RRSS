/**
 * Tests de la preparación de medios y de la lectura de imágenes — GeoGatos
 * ========================================================================
 *
 * Lo que se testea aquí es la parte que falla *tarde*: un PNG disfrazado de
 * JPEG y un carrusel con mezclas de proportions no dan error hasta que Meta
 * los rechaza, cuando ya no se pueden arreglar. Esas dos cosas tienen que
 * detectarse antes de copiar nada.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, utimesSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { parse } from 'yaml';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

import {
  inspeccionarImagen, leerDimensionesJpeg, leerDimensionesPng,
  proporcion, proporcionesCompatibles,
} from './lib/imagenes.mjs';
import { urlBasePublicacion, resolverUrlMedio, redesYaPublicadas } from './lib/nucleo.mjs';
import { planearReparto, listarEntrada, limpiarEntrada } from './preparar-medios.mjs';

// ---------------------------------------------------------------------------
// Utilidades para construir ficheros de prueba
// ---------------------------------------------------------------------------

/**
 * JPEG sintético: cabecera SOI + APP0 + SOF0 + EOI. No es una imagen
 * decodificable, pero tiene exactamente la estructura que el parser recorre,
 * y eso es lo que se quiere comprobar.
 *
 * Ojo con `Buffer.write`: la firma es (texto, offset, longitud, codificación).
 * Si se omite la longitud, el tercer argumento se interpreta como longitud y
 * la escritura revienta.
 */
function jpegDe(ancho, alto) {
  const app0 = Buffer.alloc(18);
  app0[0] = 0xff; app0[1] = 0xe0;
  app0.writeUInt16BE(16, 2);
  app0.write('JFIF\0', 4, 5, 'latin1');

  const sof = Buffer.alloc(19);
  sof[0] = 0xff; sof[1] = 0xc0;
  sof.writeUInt16BE(17, 2);   // la longitud incluye estos 2 bytes
  sof[4] = 8;                 // precisión
  sof.writeUInt16BE(alto, 5);
  sof.writeUInt16BE(ancho, 7);
  sof[9] = 3;                 // componentes

  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), app0, sof, Buffer.from([0xff, 0xd9])]);
}

function pngDe(ancho, alto) {
  const buf = Buffer.alloc(33);
  // Buffer.from + copy, no write: la sobrecarga de write con un array no
  // acepta codificación en el tercer argumento.
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(13, 8);
  buf.write('IHDR', 12, 4, 'latin1');
  buf.writeUInt32BE(ancho, 16);
  buf.writeUInt32BE(alto, 20);
  return buf;
}

// ---------------------------------------------------------------------------
// Lectura de imágenes
// ---------------------------------------------------------------------------

test('lee las dimensiones de un JPEG por sus marcadores', () => {
  assert.deepEqual(leerDimensionesJpeg(jpegDe(1080, 1350)), { ancho: 1080, alto: 1350 });
});

test('lee las dimensiones de un PNG por su IHDR', () => {
  assert.deepEqual(leerDimensionesPng(pngDe(1200, 630)), { ancho: 1200, alto: 630 });
});

test('un JPEG renombrado sigue siendo JPEG, y uno disfrazado de PNG se delata', () => {
  // Este es el fallo que motivó el módulo: la extensión dice .jpg, los bytes
  // dicen PNG. Por la extensión passaría; por los bytes no.
  const info = inspeccionarImagen(pngDe(1080, 1350));
  assert.equal(info.formato, 'png');
  assert.ok(!['jpeg'].includes(info.formato));
});

test('identifica HEIC, que Instagram no acepta aunque sea una foto', () => {
  const buf = Buffer.alloc(24);
  Buffer.from([0, 0, 0, 0x18]).copy(buf, 0);
  buf.write('ftypheic', 4, 8, 'latin1');
  assert.equal(inspeccionarImagen(buf).formato, 'heic');
});

test('un fichero corrupto no cuelga el parser', () => {
  // Marcador SOF con longitud absurda: sin el corte, esto es un bucle infinito.
  const buf = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x00, 0x08, 0x00]);
  assert.equal(leerDimensionesJpeg(buf), null);
  assert.equal(inspeccionarImagen(buf).formato, 'jpeg');
});

test('un JPEG sin SOF devuelve null en vez de inventar dimensiones', () => {
  assert.equal(leerDimensionesJpeg(Buffer.from([0xff, 0xd8, 0xff, 0xd9])), null);
});

test('la comparación de proporciones tolera lo equivalente y separa lo distinto', () => {
  assert.equal(proporcion(1080, 1350), 0.8);
  // 4:5 y 1080x1349 son la misma foto con un píxel de diferencia.
  assert.equal(proporcionesCompatibles(1080, 1350, 1080, 1349), true);
  // 4:5 frente a 16:9: Instagram recortaría casi la mitad de la segunda.
  assert.equal(proporcionesCompatibles(1080, 1350, 1920, 1080), false);
});

test('sin dimensiones no se inventa un problema de proporción', () => {
  assert.equal(proporcionesCompatibles(null, null, 1080, 1350), true);
});

// ---------------------------------------------------------------------------
// La regla del reparto
// ---------------------------------------------------------------------------

const REDES = [
  { nombre: 'facebook', medios: ['facebook-01.jpg'] },
  { nombre: 'instagram', medios: ['instagram-01.jpg', 'instagram-02.jpg', 'instagram-03.jpg'] },
  { nombre: 'x', medios: ['x-01.jpg'] },
];

function imagenes(nombres) {
  return nombres.map((nombre, i) => ({ nombre, ruta: `/tmp/${nombre}`, mtimeMs: i }));
}

test('la 1ª imagen va a facebook-01 y a instagram-01, la 2ª a instagram-02', () => {
  const { asignaciones } = planearReparto(REDES, imagenes(['a.jpg', 'b.jpg', 'c.jpg']));
  const mapa = Object.fromEntries(asignaciones.map((a) => [a.destino, a.origen]));

  assert.equal(mapa['facebook-01.jpg'], 'a.jpg');
  assert.equal(mapa['instagram-01.jpg'], 'a.jpg');
  assert.equal(mapa['instagram-02.jpg'], 'b.jpg');
  assert.equal(mapa['instagram-03.jpg'], 'c.jpg');
  assert.equal(mapa['x-01.jpg'], 'a.jpg');
});

test('el orden de las asignaciones sigue el orden de las redes y de los huecos', () => {
  const { asignaciones } = planearReparto(REDES, imagenes(['a.jpg', 'b.jpg', 'c.jpg']));
  assert.deepEqual(
    asignaciones.map((a) => a.destino),
    ['facebook-01.jpg', 'instagram-01.jpg', 'instagram-02.jpg', 'instagram-03.jpg', 'x-01.jpg']
  );
});

test('si faltan imágenes se repite la última y se avisa', () => {
  const { asignaciones, avisos } = planearReparto(REDES, imagenes(['a.jpg', 'b.jpg']));
  const repetidas = asignaciones.filter((a) => a.repetida);

  // instagram-03 se queda sin imagen propia y repite la 2ª.
  assert.equal(repetidas.length, 1);
  assert.equal(repetidas[0].destino, 'instagram-03.jpg');
  assert.equal(repetidas[0].origen, 'b.jpg');
  assert.ok(avisos.some((a) => a.includes('se van a repetir')));
});

test('una sola imagen cubre las cinco ranuras y lo dice', () => {
  const { asignaciones, avisos } = planearReparto(REDES, imagenes(['unico.jpg']));
  assert.equal(asignaciones.length, 5);
  assert.ok(asignaciones.every((a) => a.origen === 'unico.jpg'));
  // Solo hacen falta 3 imágenes DISTINTAS: facebook y x reutilizan la primera,
  // así que el mínimo real es el tamaño del carrusel, no el número de huecos.
  assert.ok(
    avisos.some((a) => a.includes('hacen falta 3') && a.includes('solo hay 1')),
    `avisos: ${JSON.stringify(avisos)}`
  );
});

test('la bandeja vacía no inventa un reparto', () => {
  const { asignaciones, avisos } = planearReparto(REDES, []);
  assert.equal(asignaciones.length, 0);
  assert.ok(avisos.some((a) => a.includes('vacía')));
});

test('las redes sin medios declarados no aparecen en el reparto', () => {
  const { asignaciones } = planearReparto(
    [{ nombre: 'facebook', medios: [] }, REDES[1]],
    imagenes(['a.jpg', 'b.jpg', 'c.jpg'])
  );
  assert.ok(asignaciones.every((a) => a.red === 'instagram'));
});

// ---------------------------------------------------------------------------
// La URL pública de los medios
// ---------------------------------------------------------------------------

test('la URL de un medio incluye el slug, que es donde vive el fichero', () => {
  // Regresión de un fallo real: componiendo solo `base_url` salía
  // `.../medios/facebook-01.jpg` y el fichero está en `medios/<slug>/`. Meta
  // se descargaba un 404 sin dar ninguna pista de que la culpa era la ruta.
  const base = 'https://javier-nexo.github.io/GeoGatos-RRSS/medios';
  const slug = '2026-10-05-color-de-las-colonias';

  assert.equal(
    resolverUrlMedio('facebook-01.jpg', urlBasePublicacion(base, slug)),
    `${base}/${slug}/facebook-01.jpg`
  );
});

test('la base pública no duplica barras ni se rompe con espacios', () => {
  assert.equal(
    urlBasePublicacion('https://ejemplo.com/medios/', 'mi-slug'),
    'https://ejemplo.com/medios/mi-slug'
  );
  assert.equal(
    urlBasePublicacion('  https://ejemplo.com/medios  ', '  mi-slug  '),
    'https://ejemplo.com/medios/mi-slug'
  );
});

test('sin slug no se compone una URL: es mejor fallar aquí que en Meta', () => {
  assert.throws(() => urlBasePublicacion('https://ejemplo.com/medios', ''), /slug/);
  assert.throws(() => urlBasePublicacion('https://ejemplo.com/medios', undefined), /slug/);
});

test('un base_url con espacios o sin esquema se rechaza al montar, no al publicar', () => {
  // Un espacio pegado al copiar la config produce una URL que Instagram no
  // puede descargar. Se avisa ahora, no en el último paso del pipeline.
  assert.throws(() => urlBasePublicacion('https://ejemplo.com /medios', 's'), /espacios/);
  assert.throws(() => urlBasePublicacion('ejemplo.com/medios', 's'), /https/);
  assert.throws(() => urlBasePublicacion('https://ejemplo.com/m', 'con espacio'), /slug/);
});

// ---------------------------------------------------------------------------
// Orden de subida
// ---------------------------------------------------------------------------

test('las imágenes se leen en orden de modificación, no alfabético', () => {
  // Es lo que hace que "la segunda que subí" sea la segunda y no la que
  // alfabéticamente toca: el caso real es zorro.jpg y alfa.jpg.
  const dir = mkdtempSync(join(tmpdir(), 'geogatos-entrada-'));

  const escribir = (nombre, mtime) => {
    const p = join(dir, nombre);
    writeFileSync(p, jpegDe(100, 100));
    const st = new Date(mtime);
    utimesSync(p, st, st);
  };

  escribir('zorro.jpg', 3_000);
  escribir('alfa.jpg', 1_000);
  escribir('milo.jpg', 2_000);

  const lista = listarEntrada(dir);
  assert.deepEqual(lista.map((i) => i.nombre), ['alfa.jpg', 'milo.jpg', 'zorro.jpg']);
});

test('la bandeja ignora el README y los ficheros que no son imágenes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'geogatos-entrada-'));
  writeFileSync(join(dir, 'README.md'), '# no soy una imagen');
  writeFileSync(join(dir, 'notas.txt'), 'tampoco');
  writeFileSync(join(dir, 'foto.jpg'), jpegDe(50, 50));

  assert.deepEqual(listarEntrada(dir).map((i) => i.nombre), ['foto.jpg']);
});

// ---------------------------------------------------------------------------
// Idempotencia: qué redes ya se publicaron
//
// El caso que justifica todo esto: Facebook se publica, Instagram falla. El
// manifiesto sigue en `listo` porque su estado es único para la publicación
// entera. Sin esto, la siguiente vuelta volvería a postear en Facebook.
// ---------------------------------------------------------------------------

/** Escribe un registro JSONL de prueba y devuelve su ruta. */
function registroDe(lineas) {
  const dir = mkdtempSync(join(tmpdir(), 'geogatos-registro-'));
  const ruta = join(dir, 'publicaciones.jsonl');
  writeFileSync(ruta, lineas.map((o) => JSON.stringify(o)).join('\n') + '\n');
  return ruta;
}

const entradaReal = (slug, redes, ts = '2026-10-05T10:00:00.000Z') => ({
  timestamp: ts, slug, modo: 'real',
  publicadas: redes.map((red) => ({ red, url: `https://ejemplo/${red}` })),
});

test('el registro dice qué redes ya se publicaron de verdad', () => {
  const ruta = registroDe([entradaReal('2026-10-05-tema', ['facebook', 'x'])]);
  const hechas = redesYaPublicadas(ruta, '2026-10-05-tema');

  assert.deepEqual([...hechas.keys()].sort(), ['facebook', 'x']);
  assert.equal(hechas.get('facebook'), '2026-10-05T10:00:00.000Z');
});

test('una simulacion no cuenta como publicacion', () => {
  // Este es el fallo que daria: en local se hace --dry-run un par de veces, se
  // versiona el registro, y luego la publicacion real se saltaria todo.
  const ruta = registroDe([
    { ...entradaReal('2026-10-05-tema', ['facebook', 'instagram']), modo: 'dry-run' },
  ]);

  assert.equal(redesYaPublicadas(ruta, '2026-10-05-tema').size, 0);
});

test('un registro de otra publicacion no afecta a esta', () => {
  const ruta = registroDe([
    entradaReal('2026-10-05-tema', ['facebook']),
    entradaReal('2026-10-12-otro', ['facebook', 'instagram', 'x']),
  ]);

  assert.deepEqual([...redesYaPublicadas(ruta, '2026-10-05-tema').keys()], ['facebook']);
});

test('una entrada solo parcialmente publicada solo marca lo que salio', () => {
  // El caso real: Facebook si, Instagram no. Hay que devolver solo Facebook,
  // o Instagram se saltaria para siempre.
  const ruta = registroDe([{
    timestamp: '2026-10-05T10:00:00.000Z',
    slug: '2026-10-05-tema',
    modo: 'real',
    ok: false,
    publicadas: [{ red: 'facebook', url: 'https://ejemplo/fb' }],
    fallos: [{ red: 'instagram', error: 'Meta 500' }],
  }]);

  const hechas = redesYaPublicadas(ruta, '2026-10-05-tema');
  assert.deepEqual([...hechas.keys()], ['facebook']);
  assert.equal(hechas.has('instagram'), false);
});

test('un registro inexistente no inventa redes publicadas', () => {
  const hechas = redesYaPublicadas(join(tmpdir(), 'no-existe-este-registro.jsonl'), 'x');
  assert.equal(hechas.size, 0);
});

test('una linea corrupta no tira el resto del registro', () => {
  const dir = mkdtempSync(join(tmpdir(), 'geogatos-registro-roto-'));
  const ruta = join(dir, 'publicaciones.jsonl');
  writeFileSync(
    ruta,
    [
      JSON.stringify(entradaReal('t', ['facebook'])),
      '{esto no es json',
      '',
      '   ',
      JSON.stringify(entradaReal('t', ['x'])),
    ].join('\n'),
  );

  assert.deepEqual([...redesYaPublicadas(ruta, 't').keys()].sort(), ['facebook', 'x']);
});

test('si una red se publico dos veces se queda la primera marca', () => {
  // Un reintento manual duplica la linea. Da igual: lo que importa es que la
  // red consta, y que conste con la fecha del primer intento.
  const ruta = registroDe([
    entradaReal('t', ['facebook'], '2026-10-05T10:00:00.000Z'),
    entradaReal('t', ['facebook'], '2026-10-05T11:00:00.000Z'),
  ]);

  assert.equal(redesYaPublicadas(ruta, 't').get('facebook'), '2026-10-05T10:00:00.000Z');
});

// ---------------------------------------------------------------------------
// Devolver el estado al manifiesto
//
// El manifiesto es la única memoria que sobrevive entre ejecuciones. El
// registro evita duplicados, pero sin escribir el estado el documento se
// queda en `listo` para siempre y la siguiente vuelta parece una publicación
// nueva.
// ---------------------------------------------------------------------------

/** Escribe un manifiesto de prueba con comentarios, como los de verdad. */
function manifiestoDePrueba() {
  const dir = mkdtempSync(join(tmpdir(), 'geogatos-estado-'));
  const ruta = join(dir, 'manifiesto.yaml');
  writeFileSync(ruta, [
    '# Comentario de cabecera que explica el fichero.',
    '',
    'slug: "2026-10-05-tema"',
    '',
    'publicacion:',
    '  fecha: "2026-10-05"',
    '  # El estado lo cambia el runner, nunca el agente.',
    '  estado: "listo"',
    '  hora: "10:00"',
    '',
    'plataformas:',
    '',
    '  # --- Facebook ---',
    '  facebook:',
    '    texto: "Hola"',
    '    hashtags: ["GeoGatos"]',
    '    medios: ["facebook-01.jpg"]',
    '',
  ].join('\n'));
  return ruta;
}

/** Ejecuta actualizar-estado.mjs y devuelve {codigo, salida}. */
function actualizar(ruta, ...extra) {
  try {
    const salida = execFileSync('node', [
      join(RAIZ, 'scripts', 'actualizar-estado.mjs'),
      `--manifiesto=${ruta}`, ...extra,
    ], { encoding: 'utf8' });
    return { codigo: 0, salida };
  } catch (e) {
    return { codigo: e.status, salida: (e.stdout ?? '') + (e.stderr ?? '') };
  }
}

test('escribir el estado conserva los comentarios del manifiesto', () => {
  // Si esto falla, un runner automático que publica a diario va borrando
  // poco a poco las notas de un documento que alguien escribe a mano.
  const ruta = manifiestoDePrueba();
  const antesDe = readFileSync(ruta, 'utf8');
  const r = actualizar(ruta, '--estado=publicado', '--json');
  assert.equal(r.codigo, 0, r.salida);

  const despues = readFileSync(ruta, 'utf8');
  for (const linea of antesDe.split('\n').filter((l) => l.trim().startsWith('#'))) {
    assert.ok(despues.includes(linea), `se perdió el comentario: ${linea}`);
  }
  assert.match(despues, /estado: "publicado"/);
  assert.match(despues, /publicado_en: \d{4}-\d{2}-\d{2}T/);
});

test('escribir el estado no toca el texto de las plataformas', () => {
  const ruta = manifiestoDePrueba();
  actualizar(ruta, '--estado=publicado');

  // Se comparan valores parseados, no el texto: reescribir reformatea el
  // documento, y un test que compruebe el formato fallaría sin que hubiera
  // cambiado nada de lo que importa.
  const m = parse(readFileSync(ruta, 'utf8'));
  assert.equal(m.plataformas.facebook.texto, 'Hola');
  assert.deepEqual(m.plataformas.facebook.hashtags, ['GeoGatos']);
  assert.deepEqual(m.plataformas.facebook.medios, ['facebook-01.jpg']);
  assert.equal(m.publicacion.hora, '10:00');
  assert.equal(m.publicacion.fecha, '2026-10-05');
});

test('escribir el estado deja constancia de las urls por red', () => {
  const ruta = manifiestoDePrueba();
  const r = actualizar(
    ruta, '--estado=publicado',
    '--resultados=[{"red":"facebook","ok":true,"url":"https://fb/1","id":"77"}]',
  );
  assert.equal(r.codigo, 0, r.salida);

  const m = parse(readFileSync(ruta, 'utf8'));
  assert.equal(m.publicacion.resultados.length, 1);
  assert.deepEqual(m.publicacion.resultados[0], {
    red: 'facebook', ok: true, url: 'https://fb/1', id: '77',
  });
});

test('un estado que no existe se rechaza sin escribir nada', () => {
  // Publicar por error en un estado inventado movería el manifiesto a un
  // estado que ni el validador ni el publicador reconocen.
  const ruta = manifiestoDePrueba();
  const antes = readFileSync(ruta, 'utf8');
  const r = actualizar(ruta, '--estado=inventado');

  assert.notEqual(r.codigo, 0);
  assert.match(r.salida, /inv/i);
  assert.equal(readFileSync(ruta, 'utf8'), antes, 'el manifiesto no debía cambiar');
});

test('un manifiesto ilegible se rechaza sin escribir nada', () => {
  const dir = mkdtempSync(join(tmpdir(), 'geogatos-estado-roto-'));
  const ruta = join(dir, 'm.yaml');
  writeFileSync(ruta, 'slug: "x"\n  estado: roto\n\tno soy yaml');

  const r = actualizar(ruta, '--estado=publicado');
  assert.notEqual(r.codigo, 0);
  assert.equal(readFileSync(ruta, 'utf8'), 'slug: "x"\n  estado: roto\n\tno soy yaml');
});

test('un manifiesto sin bloque publicacion se rechaza', () => {
  const dir = mkdtempSync(join(tmpdir(), 'geogatos-estado-sin-bloque-'));
  const ruta = join(dir, 'm.yaml');
  writeFileSync(ruta, 'slug: "x"\nplataformas: {}\n');

  const r = actualizar(ruta, '--estado=publicado');
  assert.notEqual(r.codigo, 0);
  assert.match(r.salida, /publicacion/);
});

// ---------------------------------------------------------------------------
// Vaciado de la bandeja
// ---------------------------------------------------------------------------

/** Bandeja con `n` JPEGs, con mtimes escalonados para que el orden sea claro. */
function bandejaCon(nombres) {
  const dir = mkdtempSync(join(tmpdir(), 'geogatos-bandeja-'));
  nombres.forEach((nombre, i) => {
    writeFileSync(join(dir, nombre), jpegDe(800, 600));
    // mtime creciente: el reparto posicional ordena por esto.
    const t = new Date(1_700_000_000_000 + i * 60_000);
    utimesSync(join(dir, nombre), t, t);
  });
  return dir;
}

test('limpiarEntrada borra solo las imágenes consumidas', () => {
  const dir = bandejaCon(['a.jpg', 'b.jpg', 'c.jpg']);
  const imgs = listarEntrada(dir);
  assert.equal(imgs.length, 3);

  // Se "consumen" la primera y la segunda: la tercera sobró.
  const asignaciones = imgs.slice(0, 2).map((im) => ({ origenRuta: im.ruta, origen: im.nombre }));
  const r = limpiarEntrada(dir, asignaciones);

  assert.deepEqual(r.borradas.sort(), ['a.jpg', 'b.jpg']);
  assert.deepEqual(r.sobrantes, ['c.jpg']);
  assert.equal(existsSync(join(dir, 'a.jpg')), false);
  assert.equal(existsSync(join(dir, 'c.jpg')), true);
  assert.equal(r.fallidas.length, 0);
});

test('limpiarEntrada con vaciar borra también las sobrantes', () => {
  const dir = bandejaCon(['a.jpg', 'b.jpg', 'c.jpg']);
  const imgs = listarEntrada(dir);
  const asignaciones = imgs.slice(0, 1).map((im) => ({ origenRuta: im.ruta, origen: im.nombre }));

  const r = limpiarEntrada(dir, asignaciones, { vaciar: true });

  assert.equal(r.borradas.length, 3);
  assert.deepEqual(r.sobrantes, []);
  assert.deepEqual(listarEntrada(dir), []);
});

test('limpiarEntrada no toca el README de la bandeja', () => {
  const dir = bandejaCon(['a.jpg', 'b.jpg']);
  writeFileSync(join(dir, 'README.md'), '# no borrar\n');
  const imgs = listarEntrada(dir);
  const asignaciones = imgs.map((im) => ({ origenRuta: im.ruta, origen: im.nombre }));

  const r = limpiarEntrada(dir, asignaciones, { vaciar: true });

  assert.equal(r.borradas.length, 2);
  assert.equal(existsSync(join(dir, 'README.md')), true);
});

test('limpiarEntrada deduplica cuando la misma imagen va a varias redes', () => {
  // Es el caso normal: la 1ª imagen es facebook-01 e instagram-01, así que
  // aparece dos veces en el reparto y solo hay un fichero que borrar.
  const dir = bandejaCon(['a.jpg', 'b.jpg', 'c.jpg']);
  const imgs = listarEntrada(dir);
  const [primera, segunda, tercera] = imgs;
  const asignaciones = [
    { origenRuta: primera.ruta, origen: primera.nombre, destino: 'facebook-01.jpg' },
    { origenRuta: primera.ruta, origen: primera.nombre, destino: 'instagram-01.jpg' },
    { origenRuta: segunda.ruta, origen: segunda.nombre, destino: 'instagram-02.jpg' },
    { origenRuta: tercera.ruta, origen: tercera.nombre, destino: 'instagram-03.jpg' },
  ];

  const r = limpiarEntrada(dir, asignaciones);

  assert.equal(r.borradas.length, 3);
  assert.deepEqual(listarEntrada(dir), []);
});

test('limpiarEntrada sobre una bandeja ya vacía no falla', () => {
  const dir = mkdtempSync(join(tmpdir(), 'geogatos-bandeja-vacia-'));
  const r = limpiarEntrada(dir, [{ origenRuta: join(dir, 'nunca.jpg'), origen: 'nunca.jpg' }]);
  assert.deepEqual(r.borradas, []);
  assert.deepEqual(r.fallidas, []);
});

test('el CLI con --vaciar-entrada y sin --slug vacía la bandeja', () => {
  const dir = bandejaCon(['a.jpg', 'b.jpg', 'c.jpg']);
  const r = execFileSync(
    process.execPath,
    [join(RAIZ, 'scripts', 'preparar-medios.mjs'), `--entrada=${dir}`, '--vaciar-entrada'],
    { encoding: 'utf8' },
  );
  assert.match(r, /Borradas 3 imagen/);
  assert.deepEqual(listarEntrada(dir), []);
});

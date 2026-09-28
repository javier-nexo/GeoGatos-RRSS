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
import { mkdtempSync, writeFileSync, mkdirSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  inspeccionarImagen, leerDimensionesJpeg, leerDimensionesPng,
  proporcion, proporcionesCompatibles,
} from './lib/imagenes.mjs';
import { urlBasePublicacion, resolverUrlMedio } from './lib/nucleo.mjs';
import { planearReparto, listarEntrada } from './preparar-medios.mjs';

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

/**
 * Tests del verificador de prosa — GeoGatos
 * ==========================================
 *
 * Qué se testea y por qué: la clase de fallo que este script existe para
 * cazar son los caracteres y palabras de otros alfabetos que se cuelan al
 * redactar castellano largo. No se puede probar "el texto de este post está
 * bien escrito", pero sí que el detector marca un cirílico disfrazado de
 * vocal, y que NO marca lo que no debe.
 *
 * La segunda mitad de los tests importa más: los falsos positivos. Un
 * verificador que salta con cada hashtag, cada sigla y cada nombre propio
 * acaba ignorándose, y entonces no sirve de nada.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  revisarTexto, revisarFicheros, recogerFicheros, main,
} from './verificar-prosa.mjs';

// ---------------------------------------------------------------------------
// Alfabetos que no tocaban
// ---------------------------------------------------------------------------

test('marca un cirílico disfrazado de palabra castellana', () => {
  // "esanta." con la "anta" en cirílico. Es exactamente lo que paso.
  const texto = 'La consecuencia no es una intoxicación: esанта.';
  const h = revisarTexto(texto, 'x.md');
  assert.equal(h.length, 1);
  assert.match(h[0].que, /cir[ií]lico/);
});

test('marca cada familia de alfabetos raros por separado', () => {
  const casos = [
    ['el texto tiene 桌子 aquí', /CJK|japonés|coreano/],
    ['la palabra es שלום aquí', /[aá]rabe|hebreo/],
    ['algo en АБВГ aquí', /cir[ií]lico/],
    ['el fichero esta roto \uFFFD aquí', /U\+FFFD/],
  ];
  for (const [texto, patron] of casos) {
    const h = revisarTexto(texto, 'x.md');
    assert.ok(h.length >= 1, `no marca: ${texto}`);
    assert.match(h[0].que, patron);
  }
});

test('da el número de línea real, no 1', () => {
  const texto = ['una línea normal', 'otra normal', 'una con 桌子 aquí'].join('\n');
  const h = revisarTexto(texto, 'x.md');
  assert.equal(h.length, 1);
  assert.equal(h[0].linea, 3);
});

test('no marca castellano normal', () => {
  const texto = 'La_ENUM la colonia se alimenta de pienso seco completo y agua limpia.';
  assert.deepEqual(revisarTexto(texto, 'x.md'), []);
});

// ---------------------------------------------------------------------------
// Falsos positivos: lo que el script tiene que dejar pasar
// ---------------------------------------------------------------------------

test('ignora los identificadores de fichero de medios', () => {
  const texto = [
    'La 1a foto va a `facebook-01.jpg` y la 2a a instagram-02.jpg.',
    'Tambien Revisar x/y.md y algo.mp4, más un .mjs y un .yaml.',
  ].join('\n');
  assert.deepEqual(revisarTexto(texto, 'x.md'), []);
});

test('ignora los hashtags', () => {
  assert.deepEqual(revisarTexto('#GeoGatos #ColoniasFelinas', 'x.md'), []);
});

test('ignora las siglas en mayúsculas', () => {
  // "make" esta en la lista de inglés, pero en mayúsculas es una sigla.
  assert.deepEqual(revisarTexto('El API, la RSS y el GPS del CER', 'x.md'), []);
});

test('ignora las URLs', () => {
  assert.deepEqual(
    revisarTexto('Mas info en https://geogatos.com/que-es-cer para el que', 'x.md'),
    [],
  );
});

test('ignora los bloques de código', () => {
  const texto = ['```bash', 'the quick brown fox with left and from', '```'].join('\n');
  assert.deepEqual(revisarTexto(texto, 'x.md'), []);
});

test('ignora "and" y "make", que salen legitimamente', () => {
  // "and" en citas de papers; "make" es un resto de la era Make de este repo.
  assert.deepEqual(revisarTexto('Piyarungsri et al. (2020) and Kennedy and White', 'x.md'), []);
  assert.deepEqual(revisarTexto('El manifiesto lo lee Make, no el agente.', 'x.md'), []);
});

test('ignora los rótulos de interfaz citados en inglés', () => {
  // Vienen literales de las pantallas de GitHub y de Make. Si se marcaran,
  // --todo no podría usarse como barrera: siempre saldria con código 1.
  const casos = [
    'GitHub Pages con "Deploy from a branch" SOLO admite dos carpetas',
    '#### Modulo 1 - Webhooks - Custom webhook',
    '| Events | *Just the push event* |',
    '- **Working directory**: `/tmp/GeoGatos-RRSS`.',
  ];
  for (const texto of casos) {
    assert.deepEqual(revisarTexto(texto, 'x.md'), [], `marca: ${texto}`);
  }
});

test('no ignora una palabra inglesa que no sea de un rótulo', () => {
  // El filtro de rótulos no puede comerse prosa de verdad.
  assert.ok(revisarTexto('The colony was fed that morning.', 'x.md').length >= 1);
});

test('detecta la palabra inglesa suelta en medio de la frase', () => {
  const h = revisarTexto('Un plato de caldo y una saucer de leche.', 'x.md');
  assert.equal(h.length, 1);
  assert.match(h[0].que, /saucer/);
});

// ---------------------------------------------------------------------------
// Recogida de ficheros y CLI
// ---------------------------------------------------------------------------

test('--archivo= revisa solo ese fichero', () => {
  const dir = mkdtempSync(join(tmpdir(), 'geogatos-prosa-'));
  const bueno = join(dir, 'bueno.md');
  const malo = join(dir, 'malo.md');
  writeFileSync(bueno, 'Texto en castellano normal y limpio.', 'utf8');
  writeFileSync(malo, 'Texto con una palabra 桌子 dentro.', 'utf8');

  const soloBueno = recogerFicheros([`--archivo=${bueno}`]);
  assert.deepEqual(soloBueno, [bueno]);
  assert.deepEqual(revisarFicheros(soloBueno), []);

  const soloMalo = recogerFicheros([`--archivo=${malo}`]);
  assert.equal(revisarFicheros(soloMalo).length, 1);
});

test('--archivo= no se rompe con una ruta que lleva espacios', () => {
  const dir = mkdtempSync(join(tmpdir(), 'geogatos prosa-'));
  const ruta = join(dir, 'con espacios.md');
  writeFileSync(ruta, 'Una saucer de leche.', 'utf8');
  assert.deepEqual(recogerFicheros([`--archivo=${ruta}`]), [ruta]);
});

test('main devuelve 0 sin hallazgos y 1 con ellos', () => {
  const dir = mkdtempSync(join(tmpdir(), 'geogatos-prosa-'));
  const bueno = join(dir, 'bueno.md');
  const malo = join(dir, 'malo.md');
  writeFileSync(bueno, 'Todo en castellano por aquí.', 'utf8');
  writeFileSync(malo, 'Una palabra con 桌子 mezclada.', 'utf8');

  const limpio = [];
  const sucio = [];
  assert.equal(main([`--archivo=${bueno}`], (s) => limpio.push(s)), 0);
  assert.equal(main([`--archivo=${malo}`], (s) => sucio.push(s)), 1);
  assert.match(limpio.join('\n'), /Nada sospechoso/);
  assert.match(sucio.join('\n'), /1 hallazgo/);
});

test('revisarFicheros ordena por fichero y luego por línea', () => {
  const dir = mkdtempSync(join(tmpdir(), 'geogatos-prosa-'));
  const a = join(dir, 'a.md');
  const b = join(dir, 'b.md');
  writeFileSync(a, 'primera 桌子\nsegunda 桌子\n', 'utf8');
  writeFileSync(b, 'una 桌子 aquí\n', 'utf8');

  const h = revisarFicheros([b, a]);
  assert.equal(h.length, 3);
  assert.deepEqual(h.map((x) => [x.fichero, x.linea]), [[a, 1], [a, 2], [b, 1]]);
});

test('un fichero que no existe no rompe la revisión', () => {
  assert.deepEqual(revisarFicheros(['no/existe.md']), []);
});

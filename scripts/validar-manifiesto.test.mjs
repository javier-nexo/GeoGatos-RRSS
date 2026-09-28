/**
 * Tests del validador de manifiestos — GeoGatos
 * ============================================
 *
 * El validador es la última barrera antes de publicar en cuentas reales. Si
 * un test falla, no es un problema de estilo: significa que una publicación
 * inválida podría llegar a Instagram a las 10:00.
 *
 * Se ejecuta como proceso aparte porque el script termina con process.exit().
 *
 *   node --test scripts/
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(RAIZ, 'scripts', 'validar-manifiesto.mjs');
const MEDIOS = join(RAIZ, 'medios');
const TMP = join(tmpdir(), 'geogatos-test-manifiestos');

/** Bytes de relleno: al validador solo le interesa la extensión y que exista. */
const CONTENIDO_FAKE = Buffer.from('contenido de prueba');

/**
 * Carpetas de medios creadas por los tests.
 *
 * El validador exige que los ficheros existan dentro de `medios/<slug>/`, así
 * que los tests no pueden usar un directorio temporal: tienen que escribir ahí.
 * Se apunta todo lo creado para borrarlo al terminar, porque `medios/` se
 * sirve por GitHub Pages y unos ficheros de prueba ahí son basura publicada.
 */
const creados = new Set();

function escribirMedios(slug, ficheros) {
  const dir = join(MEDIOS, slug);
  creados.add(dir);
  mkdirSync(dir, { recursive: true });
  for (const f of ficheros) {
    mkdirSync(join(dir, ...f.split('/').slice(0, -1)), { recursive: true });
    writeFileSync(join(dir, ...f.split('/')), CONTENIDO_FAKE);
  }
  return dir;
}

function base({ slug, fecha, estado = 'listo', extra = {} } = {}) {
  const s = slug ?? '2026-01-01-tema-prueba';
  return `slug: "${s}"
publicacion:
  fecha: "${fecha ?? '2026-01-01'}"
  tema: "1.1 Qué es GeoGatos"
  subtema: "Prueba"
  autor: "GeoGatos"
  estado: "${estado}"
  hora: "10:00"
plataformas:
${extra.contenido ?? `  facebook:
    activo: true
    texto: |-
      Un párrafo.
    hashtags: ["GeoGatos"]
    medios: []`}
opciones:
  permitir_sin_medios: true
`;
}

/**
 * Escribe el manifiesto en un temporal y lo valida.
 * Por defecto el temporal se llama como el slug, porque el validador comprueba
 * que el nombre del fichero y el slug coincidan; si no, cada test arrastraría
 * un error ajeno y las aserciones reales pasarían desapercibidas.
 */
function validar(yaml, nombreFichero) {
  mkdirSync(TMP, { recursive: true });
  const nombre = nombreFichero ?? `${(yaml.match(/^slug:\s*"([^"]+)"/m)?.[1] ?? 'manifiesto')}.yaml`;
  const ruta = join(TMP, nombre);
  writeFileSync(ruta, yaml, 'utf8');
  try {
    const salida = execFileSync('node', [SCRIPT, ruta], {
      encoding: 'utf8',
      cwd: RAIZ,
    });
    return { codigo: 0, salida };
  } catch (e) {
    return { codigo: e.status ?? 1, salida: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

before(() => mkdirSync(MEDIOS, { recursive: true }));

after(() => {
  rmSync(TMP, { recursive: true, force: true });
  for (const dir of creados) {
    // rmSync recursivo: cada slug es una carpeta propia, no hay riesgo de
    // borrar medios reales porque solo se borra lo que este fichero creó.
    rmSync(dir, { recursive: true, force: true });
  }
  creados.clear();
});

// ---------------------------------------------------------------------------
describe('casos que deben PASAR la validación', () => {
  test('un manifiesto limpio y sin medios no da errores', () => {
    const r = validar(base());
    assert.equal(r.codigo, 0, r.salida);
  });

  test('acepta un carrusel de Instagram con todas las imágenes en JPEG', () => {
    const slug = '2026-01-02-carrusel-valido';
    escribirMedios(slug, [
      'instagram-01.jpg', 'instagram-02.jpg', 'instagram-03.jpg',
      'facebook-01.jpg',
    ]);
    const r = validar(base({
      slug,
      fecha: '2026-01-02',
      extra: { contenido: `  facebook:
    activo: true
    texto: |-
      Texto.
    hashtags: ["GeoGatos"]
    medios: ["facebook-01.jpg"]
  instagram:
    activo: true
    tipo: "carrusel"
    texto: |-
      Caption.
    hashtags: ["GeoGatos", "CER"]
    medios: ["instagram-01.jpg", "instagram-02.jpg", "instagram-03.jpg"]` },
    }));
    assert.equal(r.codigo, 0, r.salida);
  });

  test('acepta un texto de X con peso justo por debajo de 280', () => {
    const texto = 'a'.repeat(200);
    const r = validar(base({
      slug: '2026-01-03-x-corto',
      fecha: '2026-01-03',
      extra: { contenido: `  x:
    activo: true
    texto: |-
      ${texto}
    hashtags: ["GeoGatos"]
    medios: []` },
    }));
    assert.equal(r.codigo, 0, r.salida);
  });

  test('acepta que una red bloqueada venga marcada activo: false', () => {
    const r = validar(base({
      slug: '2026-01-04-red-bloqueada',
      fecha: '2026-01-04',
      extra: { contenido: `  tiktok:
    activo: false
    texto: |-
      Dos frases.
    hashtags: ["GeoGatos"]
    medios: []` },
    }));
    assert.equal(r.codigo, 0, r.salida);
  });
});

// ---------------------------------------------------------------------------
describe('X: límite de 1 hashtag en self-serve', () => {
  test('rechaza 3 hashtags', () => {
    const r = validar(base({
      slug: '2026-01-10-x-tres-hashtags',
      fecha: '2026-01-10',
      extra: { contenido: `  x:
    activo: true
    texto: |-
      Hola.
    hashtags: ["GeoGatos", "ColoniasFelinas", "CER"]
    medios: []` },
    }));
    assert.equal(r.codigo, 1);
    assert.match(r.salida, /X limita a 1 por post en cuentas self-serve/);
  });

  test('rechaza 2 hashtags', () => {
    const r = validar(base({
      slug: '2026-01-11-x-dos-hashtags',
      fecha: '2026-01-11',
      extra: { contenido: `  x:
    activo: true
    texto: |-
      Hola.
    hashtags: ["GeoGatos", "CER"]
    medios: []` },
    }));
    assert.equal(r.codigo, 1);
    assert.match(r.salida, /X limita a 1/);
  });

  test('acepta 1 hashtag con o sin almohadilla', () => {
    const r = validar(base({
      slug: '2026-01-12-x-un-hashtag',
      fecha: '2026-01-12',
      extra: { contenido: `  x:
    activo: true
    texto: |-
      Hola.
    hashtags: ["#GeoGatos"]
    medios: []` },
    }));
    assert.equal(r.codigo, 0, r.salida);
  });
});

// ---------------------------------------------------------------------------
describe('X: longitud ponderada', () => {
  test('rechaza texto que cabe en 280 caracteres pero no en peso', () => {
    // Cada carácter CJK ocupa 1 unidad en .length pero pesa 2 en X, que es
    // justo la divergencia que hace que medir con .length dé un falso positivo.
    // Con 200 caracteres: 200 de longitud, 400 de peso.
    const texto = '猫'.repeat(200);
    assert.ok(texto.length < 280, 'el texto debe caber por número de caracteres');
    const r = validar(base({
      slug: '2026-01-13-x-peso',
      fecha: '2026-01-13',
      extra: { contenido: `  x:
    activo: true
    texto: |-
      ${texto}
    hashtags: []
    medios: []` },
    }));
    assert.equal(r.codigo, 1);
    assert.match(r.salida, /supera el máximo de 280/);
  });

  test('los emojis ZWJ no inflan la longitud como hace .length', () => {
    // 🐈‍⬛ son 5 unidades UTF-16 pero X lo cuenta como un solo emoji de peso 2.
    // Medir con .length daría 250 y haría rechazar un post que X acepta.
    const texto = '🐈‍⬛'.repeat(50);
    const r = validar(base({
      slug: '2026-01-15-x-zwj',
      fecha: '2026-01-15',
      extra: { contenido: `  x:
    activo: true
    texto: |-
      ${texto}
    hashtags: []
    medios: []` },
    }));
    assert.equal(r.codigo, 0, r.salida);
  });

  test('cuenta una URL como 23 caracteres, no como su longitud real', () => {
    const relleno = 'b'.repeat(200);
    const texto = `${relleno} https://ejemplo-una-url-muy-larga.example.com/una/ruta/larga`;
    const r = validar(base({
      slug: '2026-01-14-x-url',
      fecha: '2026-01-14',
      extra: { contenido: `  x:
    activo: true
    texto: |-
      ${texto}
    hashtags: []
    medios: []` },
    }));
    // 200 + 1 + 23 = 224 de peso: válido.
    assert.equal(r.codigo, 0, r.salida);
  });
});

// ---------------------------------------------------------------------------
describe('Instagram: solo JPEG', () => {
  test('rechaza una imagen PNG en Instagram', () => {
    const slug = '2026-01-20-instagram-png';
    escribirMedios(slug, ['instagram-01.png']);
    const r = validar(base({
      slug,
      fecha: '2026-01-20',
      extra: { contenido: `  instagram:
    activo: true
    tipo: "carrusel"
    texto: |-
      Caption.
    hashtags: ["GeoGatos"]
    medios: ["instagram-01.png"]` },
    }));
    assert.equal(r.codigo, 1);
    assert.match(r.salida, /no se admite "png"; instagram solo acepta jpg, jpeg/);
  });

  test('rechaza un carrusel de más de 10 elementos', () => {
    const slug = '2026-01-21-instagram-carrusel-largo';
    const medios = Array.from({ length: 11 }, (_, i) =>
      `instagram-${String(i + 1).padStart(2, '0')}.jpg`);
    escribirMedios(slug, medios);
    const r = validar(base({
      slug,
      fecha: '2026-01-21',
      extra: { contenido: `  instagram:
    activo: true
    tipo: "carrusel"
    texto: |-
      Caption.
    hashtags: ["GeoGatos"]
    medios: [${medios.map((m) => `"${m}"`).join(', ')}]` },
    }));
    assert.equal(r.codigo, 1);
    assert.match(r.salida, /carrusel de 11 elementos, el máximo es 10/);
  });
});

// ---------------------------------------------------------------------------
describe('medios: rutas y existencia', () => {
  test('detecta un fichero que falta', () => {
    const r = validar(base({
      slug: '2026-01-30-sin-fichero',
      fecha: '2026-01-30',
      extra: { contenido: `  facebook:
    activo: true
    texto: |-
      Texto.
    hashtags: ["GeoGatos"]
    medios: ["no-existe.jpg"]` },
    }));
    assert.equal(r.codigo, 1);
    assert.match(r.salida, /falta el fichero: no-existe\.jpg/);
  });

  test('rechaza salida del directorio con ..', () => {
    const r = validar(base({
      slug: '2026-01-31-path-traversal',
      fecha: '2026-01-31',
      extra: { contenido: `  facebook:
    activo: true
    texto: |-
      Texto.
    hashtags: ["GeoGatos"]
    medios: ["../../secreto.jpg"]` },
    }));
    assert.equal(r.codigo, 1);
    assert.match(r.salida, /sale del directorio de la publicación/);
  });

  test('rechaza una URL absoluta en lugar de una ruta', () => {
    const r = validar(base({
      slug: '2026-02-01-url-absoluta',
      fecha: '2026-02-01',
      extra: { contenido: `  facebook:
    activo: true
    texto: |-
      Texto.
    hashtags: ["GeoGatos"]
    medios: ["https://otro-sitio.example.com/foto.jpg"]` },
    }));
    assert.equal(r.codigo, 1);
    assert.match(r.salida, /no absoluta ni una URL/);
  });
});

// ---------------------------------------------------------------------------
describe('coherencia del manifiesto', () => {
  test('detecta que el slug no coincide con el nombre del fichero', () => {
    const r = validar(
      base({ slug: '2026-02-10-slug-distinto', fecha: '2026-02-10' }),
      'otro-nombre.yaml',
    );
    assert.equal(r.codigo, 1);
    assert.match(r.salida, /deben coincidir/);
  });

  test('detecta un estado desconocido', () => {
    const r = validar(base({ slug: '2026-02-11-estado-malo', fecha: '2026-02-11', estado: 'pendiente' }));
    assert.equal(r.codigo, 1);
    assert.match(r.salida, /no es un estado válido/);
  });

  test('detecta una fecha mal formada', () => {
    const r = validar(base({ slug: '2026-02-12-fecha', fecha: '12/02/2026' }));
    assert.equal(r.codigo, 1);
    assert.match(r.salida, /no es una fecha ISO/);
  });

  test('la configuración manda sobre el manifiesto: TikTok en standby no es un error', () => {
    // Antes, `activo: true` en el manifiesto con la red apagada en la config
    // era un error. Ahora la config manda y solo se avisa: el contenido se
    // escribe igual y no se publica. Es la diferencia entre "inactiva" (error
    // de coherencia) y "standby" (decisión operativa).
    const r = validar(base({
      slug: '2026-02-13-tiktok-activo',
      fecha: '2026-02-13',
      extra: { contenido: `  tiktok:
    texto: |-
      Dos frases.
    hashtags: ["GeoGatos"]
    medios: []` },
    }));
    assert.equal(r.codigo, 0, r.salida);
    assert.match(r.salida, /en standby/);
  });

  test('Medium se limita a 3 tags', () => {
    const r = validar(base({
      slug: '2026-02-14-medium-tags',
      fecha: '2026-02-14',
      extra: { contenido: `  medium:
    activo: false
    titulo: "Título"
    texto: |-
      Cuerpo.
    hashtags: ["Uno", "Dos", "Tres", "Cuatro"]
    medios: []` },
    }));
    assert.equal(r.codigo, 1);
    assert.match(r.salida, /4 tags, pero medium solo usa los 3 primeros/);
  });
});

// ---------------------------------------------------------------------------
describe('standby: se valida el contenido pero no se exige medios', () => {
  test('una red en standby no falla por falta de ficheros', () => {
    // linkedin está en standby en rrss.config.yaml. El manifiesto declara sus
    // medios, pero los ficheros no existen: no debe impedir publicar.
    const r = validar(base({
      slug: '2026-02-20-standby-sin-medios',
      fecha: '2026-02-20',
      extra: { contenido: `  facebook:
    activo: true
    texto: |-
      Texto.
    hashtags: ["GeoGatos"]
    medios: []
  linkedin:
    texto: |-
      Texto institucional.
    hashtags: ["GeoGatos"]
    medios: ["linkedin-01.jpg", "linkedin-02.png"]` },
    }));
    assert.equal(r.codigo, 0, r.salida);
    assert.match(r.salida, /falta el fichero: linkedin-01\.jpg.*opcional mientras esté en standby/);
  });

  test('una red activa sí falla por falta de ficheros', () => {
    const r = validar(base({
      slug: '2026-02-21-activa-sin-medios',
      fecha: '2026-02-21',
      extra: { contenido: `  facebook:
    texto: |-
      Texto.
    hashtags: ["GeoGatos"]
    medios: ["facebook-01.jpg"]` },
    }));
    assert.equal(r.codigo, 1);
    assert.match(r.salida, /falta el fichero: facebook-01\.jpg/);
    assert.doesNotMatch(r.salida, /opcional mientras esté en standby/);
  });

  test('una red en standby sigue validando su contenido', () => {
    // En standby no se publica, pero el texto tiene que estar bien escrito
    // para el día que salga. Por eso los límites se comprueban igual.
    const r = validar(base({
      slug: '2026-02-22-standby-texto-malo',
      fecha: '2026-02-22',
      extra: { contenido: `  medium:
    titulo: "Título"
    texto: |-
      Cuerpo.
    hashtags: ["Uno", "Dos", "Tres", "Cuatro"]
    medios: []` },
    }));
    assert.equal(r.codigo, 1);
    assert.match(r.salida, /4 tags, pero medium solo usa los 3 primeros/);
  });

  test('resume qué redes están en standby', () => {
    const r = validar(base({
      slug: '2026-02-23-resumen-standby',
      fecha: '2026-02-23',
      extra: { contenido: `  linkedin:
    texto: |-
      Texto.
    hashtags: ["GeoGatos"]
    medios: []` },
    }));
    assert.match(r.salida, /no se publica en: linkedin/);
  });
});

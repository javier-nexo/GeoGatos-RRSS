#!/usr/bin/env node
/**
 * Publicador — GeoGatos
 * =====================
 *
 * Lee un manifiesto, lo valida, y publica en cada red activa. Lo dispara el
 * workflow de `.github/workflows/publicar.yml` cuando un manifiesto llega a
 * `estado: listo`, y se puede invocar a mano desde local; el script no sabe
 * quién lo llamó.
 *
 * Por qué toda la lógica vive aquí y no repartida por pasos en el workflow:
 *   - Se puede probar en local antes de tocar ninguna cuenta real.
 *   - La lógica queda versionada y revisable en el repositorio, con sus
 *     tests, en vez de viva en el log de una ejecución que ya no existe.
 *   - El workflow solo tiene que saber cuándo disparar y cómo leer el
 *     resultado. Cambiar la lógica de una red no obliga a tocar el workflow.
 *
 * En `docs/publicacion-automatica.md` está el montaje paso a paso, los límites
 * reales de cada API y los bloqueos de cada red.
 *
 * Uso:
 *   node scripts/publicar.mjs --manifiesto=manifiestos/2026-10-05-tema.yaml
 *   node scripts/publicar.mjs --slug=2026-10-05-tema --dry-run
 *   node scripts/publicar.mjs --slug=2026-10-05-tema --redes=facebook,x
 *   node scripts/publicar.mjs --slug=2026-10-05-tema --dry-run --json
 *
 * Opciones:
 *   --dry-run        No hace ninguna petición. Imprime lo que haría.(default si no hay credenciales)
 *   --redes=a,b      Limita la publicación a esas redes.
 *   --json           Salida en JSON, para que el runner la consuma.
 *   --forzar-estado  Publica aunque el manifiesto no esté en `listo`.
 *   --reintentar     Vuelve a publicar lo que ya figure en el registro.
 *
 * Idempotencia:
 *   Una red que ya consta en `salida.registro` para este slug no se repite,
 *   porque el estado del manifiesto es de la publicación entera y no sabe
 *   decir "Facebook salió, Instagram no". Por eso el registro tiene que estar
 *   versionado. Con `--reintentar` se ignora esa protección.
 *
 * Códigos de salida:
 *   0  todo correcto (puede haber redes saltadas)
 *   1  alguna red falló
 *   2  error de uso, manifiesto ilegible o validación fallida
 */

import { readFileSync, existsSync, mkdirSync, appendFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  cargarConfig, cargarManifiesto, validarManifiestoCompleto,
  componerTextoConHashtags, normalizarHashtags, resolverUrlMedio, estadoRed,
  urlBasePublicacion, redesYaPublicadas,
} from './lib/nucleo.mjs';
import { REDES, ORDEN_PUBLICACION } from './lib/redes.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------------
// Argumentos
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const out = { dryRun: false, json: false, forzar: false, reintentar: false };
  for (const a of argv) {
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--json') out.json = true;
    else if (a === '--forzar-estado') out.forzar = true;
    else if (a === '--reintentar') out.reintentar = true;
    else if (a.startsWith('--manifiesto=')) out.manifiesto = a.slice(13);
    else if (a.startsWith('--slug=')) out.slug = a.slice(7);
    else if (a.startsWith('--redes=')) out.redes = a.slice(8).split(',').map((s) => s.trim()).filter(Boolean);
  }
  return out;
}

function die(mensaje, codigo = 2) {
  console.error(`\n✗ ${mensaje}\n`);
  process.exit(codigo);
}

// ---------------------------------------------------------------------------
// Registro de ejecuciones
// ---------------------------------------------------------------------------
/**
 * Un JSONL: una línea por publicación/red. El runner lo lee para saber qué
 * pasó y para no volver a publicar lo ya publicado.
 */
function registrar(cfg, entrada) {
  const rel = cfg.salida?.registro ?? 'registro/publicaciones.jsonl';
  const ruta = join(RAIZ, rel);
  mkdirSync(dirname(ruta), { recursive: true });
  appendFileSync(ruta, `${JSON.stringify(entrada)}\n`, 'utf8');
  return ruta;
}

// ---------------------------------------------------------------------------
// Programa principal
// ---------------------------------------------------------------------------
const args = parseArgs(process.argv.slice(2));

if (!args.manifiesto && !args.slug) {
  die('Falta --manifiesto=<ruta> o --slug=<slug>.\n\nEjemplo:\n  node scripts/publicar.mjs --slug=2026-10-05-tema --dry-run');
}

let cfg;
try {
  cfg = cargarConfig(RAIZ);
} catch (e) {
  die(e.message);
}

let rutaManifiesto = args.manifiesto;
if (!rutaManifiesto) {
  if (!args.slug.endsWith('.yaml') && !args.slug.endsWith('.yml')) {
    const encontrado = readdirSync(join(RAIZ, 'manifiestos'))
      .find((f) => (f.endsWith('.yaml') || f.endsWith('.yml')) && f.replace(/\.ya?ml$/, '') === args.slug);
    if (!encontrado) die(`No hay ningún manifiesto con slug "${args.slug}" en manifiestos/.`);
    rutaManifiesto = join('manifiestos', encontrado);
  } else {
    rutaManifiesto = join('manifiestos', args.slug);
  }
}

if (!existsSync(rutaManifiesto)) die(`No existe el manifiesto: ${rutaManifiesto}`);

let manifiesto;
try {
  manifiesto = cargarManifiesto(rutaManifiesto);
} catch (e) {
  die(`${rutaManifiesto} no es YAML válido: ${e.message}`);
}

const slug = manifiesto.slug;
const pub = manifiesto.publicacion ?? {};

// ---------------------------------------------------------------------------
// Validación previa: no se publica nada que el validador rechace.
// ---------------------------------------------------------------------------
const { errores, avisos } = validarManifiestoCompleto(manifiesto, rutaManifiesto, cfg, RAIZ);

for (const a of avisos) {
  if (!args.json) console.log(`  ! ${a.donde}: ${a.msg}`);
}

if (errores.length) {
  if (args.json) {
    console.log(JSON.stringify({ ok: false, fase: 'validacion', errores, avisos, resultados: [] }, null, 2));
  } else {
    console.error(`\nERRORES DE VALIDACIÓN (${errores.length}) — no se publica nada:`);
    for (const e of errores) console.error(`  ✗ ${e.donde}: ${e.msg}`);
    console.error('');
  }
  registrar(cfg, {
    timestamp: new Date().toISOString(),
    slug,
    fase: 'validacion',
    ok: false,
    errores: errores.map((e) => `${e.donde}: ${e.msg}`),
  });
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------
if (pub.estado !== 'listo' && !args.forzar && !args.dryRun) {
  die(
    `El manifiesto está en estado "${pub.estado}" y solo se publica en "listo".\n` +
    '  Si es intencionado, usa --forzar-estado. En dry-run se permite cualquier estado.',
    2,
  );
}

// ---------------------------------------------------------------------------
// Credenciales
// ---------------------------------------------------------------------------
/**
 * Se leen del entorno. En el runner llegan como secrets; en local, exporta las
 * variables o usa --dry-run. Nunca se guardan en el repo.
 */
const CREDENCIALES = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => /^(FACEBOOK|INSTAGRAM|LINKEDIN|X_|YOUTUBE|TIKTOK|MEDIUM)_/.test(k)),
);

const dryRun = args.dryRun;

/**
 * En simulación no hay credenciales, y exigir configurarlas para hacer un
 * dry-run sería hacer inútil la única forma de probar el pipeline sin tocar
 * cuentas reales. Se sustituye por un proxy que devuelve un marcador para
 * cualquier clave: los adaptadores siguen pidiendo sus credenciales
 * normalmente y cortan antes de usarlas, en su rama de `dryRun`.
 */
const credenciales = dryRun
  ? new Proxy(CREDENCIALES, {
      get(objetivo, clave) {
        if (typeof clave !== 'string') return objetivo[clave];
        return objetivo[clave] ?? '<dry-run>';
      },
    })
  : CREDENCIALES;

const redesAEjecutar = [];
const saltadas = [];

for (const nombre of ORDEN_PUBLICACION) {
  const plataforma = manifiesto.plataformas?.[nombre];
  if (!plataforma) continue;

  if (args.redes && !args.redes.includes(nombre)) {
    saltadas.push({ red: nombre, motivo: 'no seleccionada en esta ejecución' });
    continue;
  }

  const { estado, motivo } = estadoRed(nombre, cfg, plataforma);

  if (estado === 'standby') {
    // Se escribió el contenido y no se publica. No es un fallo: es la decisión
    // registrada en rrss.config.yaml.
    saltadas.push({ red: nombre, motivo: `standby — ${motivo}` });
    continue;
  }
  if (estado === 'inactiva') {
    saltadas.push({ red: nombre, motivo });
    continue;
  }

  const adapter = REDES[nombre];
  if (!adapter) {
    saltadas.push({ red: nombre, motivo: 'sin adaptador implementado' });
    continue;
  }

  redesAEjecutar.push(nombre);
}

// ---------------------------------------------------------------------------
// Idempotencia: no repetir lo que ya salió
// ---------------------------------------------------------------------------
/**
 * Publicar es irreversible. Si una ejecución publica Facebook y falla en
 * Instagram, el manifiesto sigue en `listo` y la siguiente vuelta publicaría
 * Facebook otra vez. El estado del manifiesto no distingue "publicado a medias"
 * de "sin publicar", así que quien decide es el registro, que sí guarda el
 * detalle por red.
 *
 * Solo aplica a ejecuciones reales: una simulación no publicó nada, aunque haya
 * entradas suyas en el registro.
 */
const rutasRegistro = join(RAIZ, cfg.salida?.registro ?? 'registro/publicaciones.jsonl');
const yaHechas = dryRun || args.reintentar
  ? new Map()
  : redesYaPublicadas(rutasRegistro, slug);

if (yaHechas.size) {
  const pendientes = redesAEjecutar.filter((r) => !yaHechas.has(r));
  for (const hecha of yaHechas.keys()) {
    // Solo se salta si esta red iba a publicarse ahora: si el usuario la
    // seleccionó a mano, su decisión manda sobre el registro.
    if (redesAEjecutar.includes(hecha)) {
      saltadas.push({
        red: hecha,
        motivo: `ya publicada el ${yaHechas.get(hecha) || 'anterior'} — no se repite`,
      });
    }
  }
  redesAEjecutar.length = 0;
  redesAEjecutar.push(...pendientes);
  if (!args.json) {
    for (const hecha of yaHechas.keys()) {
      if (!redesAEjecutar.includes(hecha)) {
        console.log(`  · ${hecha}: ya estaba publicada, se salta (--reintentar para repetirla)`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Preparación de medios
// ---------------------------------------------------------------------------
const medDir = join(RAIZ, cfg.medios.carpeta, slug);
// El slug forma parte de la URL: los ficheros viven en medios/<slug>/, así que
// la base pública de esta publicación es base_url + slug. Sin esto, Instagram
// recibe .../medios/facebook-01.jpg en vez de .../medios/<slug>/facebook-01.jpg.
const baseUrl = urlBasePublicacion(cfg.medios.base_url, slug);

const leerMedio = (rel) => {
  const partes = String(rel).replace(/\\/g, '/').split('/');
  if (partes.includes('..')) throw new Error(`Ruta no permitida: ${rel}`);
  return readFileSync(join(medDir, ...partes));
};

function prepararMedios(nombre, plataforma) {
  const rutas = Array.isArray(plataforma.medios) ? plataforma.medios : [];
  const urls = [];
  for (const r of rutas) {
    try {
      urls.push(resolverUrlMedio(r, baseUrl));
    } catch (e) {
      // Si una URL no se puede construir, la red no puede publicarse.
      throw new Error(`medio "${r}": ${e.message}`);
    }
  }
  return { rutas, urls };
}

// ---------------------------------------------------------------------------
// Ejecución
// ---------------------------------------------------------------------------
const resultados = [];
const lineas = [];

function log(nivel, mensaje) {
  lineas.push({ nivel, mensaje });
  if (!args.json) {
    const prefijo = nivel === 'borrador' ? '  ·' : nivel === 'aviso' ? '  !' : '  ✗';
    console.log(`${prefijo} ${mensaje}`);
  }
}

if (!args.json) {
  console.log(`\n${'='.repeat(64)}`);
  console.log(`${slug}  ·  ${pub.tema ?? ''}`);
  console.log(`${dryRun ? 'SIMULACIÓN (--dry-run): no se hace ninguna petición' : 'PUBLICACIÓN REAL'}`);
  console.log('='.repeat(64));
}

for (const nombre of redesAEjecutar) {
  const plataforma = manifiesto.plataformas[nombre];
  const adapter = REDES[nombre];
  const texto = componerTextoConHashtags(plataforma);
  const titulo = plataforma.titulo ?? null;
  const hashtags = normalizarHashtags(plataforma.hashtags);

  if (!args.json) console.log(`\n[${nombre}]`);

  // En dry-run no hay credenciales y no se toca el disco de medios: se
  // muestran las URLs tal y como quedarían.
  let rutasMedio = [];
  let urls = [];
  try {
    if (Array.isArray(plataforma.medios)) {
      rutasMedio = plataforma.medios;
      urls = dryRun
        ? plataforma.medios.map((r) => {
            try { return resolverUrlMedio(r, baseUrl); } catch { return `[URL INVÁLIDA: ${r}]`; }
          })
        : prepararMedios(nombre, plataforma).urls;
    }
  } catch (e) {
    resultados.push({ red: nombre, ok: false, error: e.message });
    log('error', e.message);
    continue;
  }

  // Comprobación de credenciales antes de empezar (salvo en simulación).
  if (!dryRun && adapter.requiere?.length) {
    const faltan = adapter.requiere.filter((k) => !CREDENCIALES[k]);
    if (faltan.length) {
      const msg = `Faltan credenciales: ${faltan.join(', ')}`;
      resultados.push({ red: nombre, ok: false, error: msg });
      log('error', msg);
      continue;
    }
  }

  try {
    const r = await adapter.publicar({
      texto, titulo, hashtags, urls, rutasMedio,
      leerMedio, dryRun, credenciales, log,
    });
    resultados.push({ red: nombre, ok: true, url: r.url, id: r.id, detalle: r.detalle });
    if (!args.json) console.log(`  ✓ ${r.url ?? 'publicado'}`);
  } catch (e) {
    resultados.push({ red: nombre, ok: false, error: e.message });
    log('error', e.message);
  }
}

// ---------------------------------------------------------------------------
// Resumen
// ---------------------------------------------------------------------------
const ok = resultados.filter((r) => r.ok).length;
const fallos = resultados.filter((r) => !r.ok);

const entrada = {
  timestamp: new Date().toISOString(),
  slug,
  tema: pub.tema ?? null,
  fecha: pub.fecha ?? null,
  modo: dryRun ? 'dry-run' : 'real',
  ok: fallos.length === 0,
  publicadas: resultados.filter((r) => r.ok).map((r) => ({ red: r.red, url: r.url, id: r.id })),
  fallos: fallos.map((r) => ({ red: r.red, error: r.error })),
  saltadas: saltadas.map((s) => `${s.red}: ${s.motivo}`),
};
registrar(cfg, entrada);

if (args.json) {
  console.log(JSON.stringify({
    ok: entrada.ok,
    modo: entrada.modo,
    resultados,
    saltadas,
    avisos: avisos.map((a) => `${a.donde}: ${a.msg}`),
  }, null, 2));
} else {
  console.log(`\n${'-'.repeat(64)}`);
  console.log(`${dryRun ? 'Simulado' : 'Publicado'}: ${ok}/${resultados.length} redes`);
  if (saltadas.length) {
    console.log(`\nSaltadas (${saltadas.length}):`);
    for (const s of saltadas) console.log(`  – ${s.red}: ${s.motivo}`);
  }
  if (fallos.length) {
    console.log(`\nFallidas (${fallos.length}):`);
    for (const f of fallos) console.log(`  ✗ ${f.red}: ${f.error}`);
  }
  console.log(`\nRegistro: ${cfg.salida?.registro ?? 'registro/publicaciones.jsonl'}`);

  if (dryRun) {
    console.log('\nEsto NO ha publicado nada. Para publicar de verdad, quita --dry-run y define las credenciales.');
  } else if (fallos.length === 0) {
    console.log('\nTodo correcto. No queda nada pendiente.');
  }
  console.log('');
}

process.exit(fallos.length ? 1 : 0);

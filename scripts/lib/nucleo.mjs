/**
 * Núcleo del pipeline de publicaciones — GeoGatos
 * =============================================
 *
 * Funciones compartidas por el validador (CLI) y el publicador (CLI).
 * La idea es que ambos partan exactamente del mismo cálculo: si el validador
 * dice que un texto cabe y el publicador compone el texto de otra manera, la
 * validación no sirve de nada.
 *
 * Exporta:
 *   cargarConfig, cargarManifiesto
 *   componerTexto, componerTextoConHashtags, normalizarHashtags
 *   longitudPonderadaX
 *   resolverUrlMedio
 *   validarManifiestoCompleto
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, extname, isAbsolute, sep } from 'node:path';
import { parse as parseYaml } from 'yaml';

export const ESTADOS = ['borrador', 'esperando_medios', 'listo', 'publicado', 'error'];

// ---------------------------------------------------------------------------
// Carga
// ---------------------------------------------------------------------------
export function cargarConfig(raiz) {
  const ruta = join(raiz, 'rrss.config.yaml');
  if (!existsSync(ruta)) throw new Error(`No encuentro la configuración: ${ruta}`);
  return parseYaml(readFileSync(ruta, 'utf8'));
}

export function cargarManifiesto(ruta) {
  return parseYaml(readFileSync(ruta, 'utf8'));
}

// ---------------------------------------------------------------------------
// Composición del texto
// ---------------------------------------------------------------------------
/**
 * Lo que se publica es `texto` + hashtags. Todo lo que mida límites debe
 * medir ESTA cadena, no el campo `texto` suelto.
 *
 * Separador: línea en blanco y los hashtags unidos por espacio. Es el formato
 * que mejor rinden todas las redes. Ajustar aquí obliga a revisar los tests
 * de longitud.
 */
export function componerTextoConHashtags(plataforma) {
  const texto = (plataforma?.texto ?? '').toString().trim();
  const hashtags = normalizarHashtags(plataforma?.hashtags);
  if (!texto) return texto;
  if (!hashtags.length) return texto;
  return `${texto}\n\n${hashtags.map((h) => `#${h}`).join(' ')}`;
}

export const componerTexto = componerTextoConHashtags;

/** Acepta ["GeoGatos"] o ["#GeoGatos"] y devuelve siempre sin almohadilla. */
export function normalizarHashtags(brutos) {
  if (!Array.isArray(brutos)) return [];
  return brutos
    .filter((h) => typeof h === 'string' && h.trim())
    .map((h) => h.trim().replace(/^#+/, ''));
}

// ---------------------------------------------------------------------------
// Longitud ponderada al estilo de X
// ---------------------------------------------------------------------------
const RANGOS_PESO_2 = [
  [0x1100, 0x115f], [0x2e80, 0x303e], [0x3041, 0x33ff], [0x3400, 0x4dbf],
  [0x4e00, 0x9fff], [0xa000, 0xa4cf], [0xa960, 0xa97f], [0xac00, 0xd7a3],
  [0xf900, 0xfaff], [0xfe10, 0xfe19], [0xfe30, 0xfe6f], [0xff00, 0xff60],
  [0xffe0, 0xffe6], [0x1f300, 0x1f64f], [0x1f900, 0x1f9ff],
  [0x20000, 0x2fffd], [0x30000, 0x3fffd],
];
const RE_URL = /https?:\/\/[^\s]+/g;
const RE_EMOJI = /\p{Extended_Pictographic}/u;

function pesoCaracter(c) {
  if (RE_EMOJI.test(c)) return 2;
  const cp = c.codePointAt(0);
  return RANGOS_PESO_2.some(([a, b]) => cp >= a && cp <= b) ? 2 : 1;
}

/**
 * X no cuenta caracteres, cuenta pesos: un emoji vale lo mismo que dos
 * letras y una URL ocupa siempre 23. Medir con `.length` da falsos positivos
 * en los dos sentidos.
 */
export function longitudPonderadaX(texto, longitudUrl = 23) {
  const sinUrls = texto.replace(RE_URL, () => 'x'.repeat(longitudUrl));
  let peso = 0;
  for (const c of sinUrls) peso += pesoCaracter(c);
  return peso;
}

// ---------------------------------------------------------------------------
// Resolución de URLs de medios
// ---------------------------------------------------------------------------
/**
 * Convierte `instagram-01.jpg` en la URL pública que consuming Instagram y
 * TikTok. Estas redes hacen `curl` al fichero: si la URL no responde, la
 * publicación falla sin explicación útil.
 *
 * Se validan las rutas porque acaban interpoladas en URLs que Make entrega a
 * las APIs con un token de acceso a las cuentas. Un `../` permitiría leer
 * ficheros de fuera de la publicación.
 */
export function resolverUrlMedio(rutaRelativa, baseUrl) {
  const rel = String(rutaRelativa ?? '').trim().replace(/\\/g, '/');

  if (!rel) throw new Error('ruta de medio vacía');
  if (isAbsolute(rutaRelativa) || /^[a-z]+:\/\//i.test(rutaRelativa)) {
    throw new Error(`"${rutaRelativa}" debe ser una ruta relativa, no absoluta ni URL`);
  }
  const partes = rel.split('/');
  if (partes.some((p) => p === '' || p === '.' || p === '..')) {
    throw new Error(`"${rutaRelativa}" contiene segmentos de ruta no permitidos`);
  }
  if (/[\s"']/.test(rel)) {
    throw new Error(`"${rutaRelativa}" contiene espacios o comillas; serializa la URL antes de usarla`);
  }

  const base = String(baseUrl ?? '').replace(/\/+$/, '');
  if (!/^https?:\/\//.test(base)) {
    throw new Error(`medios.base_url inválido: "${baseUrl}" debe empezar por https://`);
  }
  return `${base}/${partes.map(encodeURIComponent).join('/')}`;
}

export const extensionDe = (ruta) => extname(ruta).slice(1).toLowerCase();

// ---------------------------------------------------------------------------
// Validación
// ---------------------------------------------------------------------------
/**
 * Valida un manifiesto completo.
 * @returns {{errores: Array, avisos: Array}}
 */
export function validarManifiestoCompleto(manifiesto, rutaManifiesto, cfg, raiz) {
  const errores = [];
  const avisos = [];
  const err = (donde, msg) => errores.push({ donde, msg });
  const warn = (donde, msg) => avisos.push({ donde, msg });

  const nombreManifiesto = rutaManifiesto ? rutaManifiesto.split(/[\\/]/).pop() : '';
  const slug = manifiesto?.slug;

  if (!slug) err('slug', 'falta el campo `slug`');
  if (!manifiesto?.publicacion) {
    err('publicacion', 'falta la sección `publicacion`');
    return { errores, avisos };
  }

  const pub = manifiesto.publicacion;

  if (pub.fecha && !/^\d{4}-\d{2}-\d{2}$/.test(pub.fecha)) {
    err('publicacion.fecha', `"${pub.fecha}" no es una fecha ISO AAAA-MM-DD`);
  }
  if (slug && pub.fecha && !slug.startsWith(pub.fecha)) {
    err('slug', `"${slug}" debería empezar por la fecha ${pub.fecha} para mantener el orden`);
  }
  if (slug && nombreManifiesto && nombreManifiesto.replace(/\.ya?ml$/i, '') !== slug) {
    err('slug', `el fichero se llama "${nombreManifiesto}" pero su slug es "${slug}"; deben coincidir`);
  }
  if (!ESTADOS.includes(pub.estado)) {
    err('publicacion.estado', `"${pub.estado}" no es un estado válido (${ESTADOS.join(', ')})`);
  }
  if (pub.estado === 'listo') {
    warn('publicacion.estado', 'estado "listo": al hacer push, Make publicará de verdad');
  }
  if (pub.hora && !/^([01]\d|2[0-3]):[0-5]\d$/.test(pub.hora)) {
    err('publicacion.hora', `"${pub.hora}" no es una hora HH:MM válida`);
  }

  const medDir = join(raiz, cfg.medios.carpeta, slug ?? '');
  if (!existsSync(medDir)) {
    warn('medios', `aún no existe la carpeta ${medDir}; créala para los medios de esta publicación`);
  }

  if (!manifiesto.plataformas || typeof manifiesto.plataformas !== 'object') {
    err('plataformas', 'falta la sección `plataformas`');
    return { errores, avisos };
  }

  const permitirSinMedios = manifiesto.opciones?.permitir_sin_medios !== false;

  for (const [nombre, plataforma] of Object.entries(manifiesto.plataformas)) {
    const cfgRed = cfg.redes[nombre];
    if (!cfgRed) {
      warn(nombre, 'no figura en rrss.config.yaml; Make no la reconocerá');
      continue;
    }
    validarPlataforma(nombre, plataforma, cfgRed, cfg, { medDir, permitirSinMedios, err, warn });
  }

  return { errores, avisos };
}

function validarPlataforma(nombre, plataforma, cfgRed, cfg, ctx) {
  const { medDir, permitirSinMedios, err, warn } = ctx;
  const límites = cfg.limites[nombre] ?? {};

  if (!plataforma || typeof plataforma !== 'object') {
    err(nombre, 'falta la sección de la plataforma en el manifiesto');
    return;
  }

  const activo = plataforma.activo !== false;
  const activaEnCfg = cfgRed.activo !== false;

  if (activo && !activaEnCfg) {
    err(nombre, `está marcada activo: true en el manifiesto pero ${cfgRed.motivo ?? 'está desactivada en rrss.config.yaml'}`);
  }
  if (!activo) warn(nombre, 'desactivada: se omitirá en la publicación');

  // --- Texto
  const texto = componerTextoConHashtags(plataforma);
  if (!texto) {
    err(nombre, 'falta el campo `texto`');
  } else {
    if (límites.longitud_texto && texto.length > límites.longitud_texto) {
      err(nombre, `texto de ${texto.length} caracteres, supera el máximo de ${límites.longitud_texto}`);
    }
    if (nombre === 'x' && límites.longitud_texto) {
      const peso = longitudPonderadaX(texto, límites.longitud_url ?? 23);
      if (peso > límites.longitud_texto) {
        err(nombre, `texto de peso ${peso}, supera el máximo de ${límites.longitud_texto} (X cuenta cada URL como ${límites.longitud_url ?? 23} caracteres y cada emoji como 2)`);
      }
    }
    if (límites.longitud_texto_verificado === false) {
      warn(nombre, `el límite de ${límites.longitud_texto} caracteres no está verificado contra la documentación vigente; el texto actual ocupa ${texto.length}`);
    }
  }

  // --- Título
  if (límites.longitud_titulo) {
    if (plataforma.titulo === undefined) {
      if (activo) warn(nombre, `necesita \`titulo\` (máximo ${límites.longitud_titulo} caracteres)`);
    } else if (typeof plataforma.titulo !== 'string' || !plataforma.titulo.trim()) {
      err(nombre, '`titulo` está presente pero vacío');
    } else if (plataforma.titulo.length > límites.longitud_titulo) {
      err(nombre, `título de ${plataforma.titulo.length} caracteres, supera el máximo de ${límites.longitud_titulo}`);
    }
  }

  // --- Hashtags
  //
  // Medium llama oficialmente "tags" a esto y usa `tags_max` en la config.
  // Ambos nombres se compruecan igual, porque el fallo es el mismo: la red
  // descarta en silencio lo que sobra.
  const hashtags = normalizarHashtags(plataforma.hashtags);
  const maxHashtags = límites.hashtags_max ?? límites.tags_max;
  if (maxHashtags !== undefined && hashtags.length > maxHashtags) {
    if (nombre === 'x') {
      err(nombre, `${hashtags.length} hashtags, pero X limita a ${maxHashtags} por post en cuentas self-serve. Contrata el plan Enterprise o deja solo "${hashtags[0]}"`);
    } else if (límites.tags_max !== undefined) {
      err(nombre, `${hashtags.length} tags, pero ${nombre} solo usa los ${maxHashtags} primeros y descarta el resto sin avisar`);
    } else {
      err(nombre, `${hashtags.length} hashtags, supera el máximo de ${maxHashtags}`);
    }
  }
  if (límites.longitud_tag && hashtags.some((h) => h.length > límites.longitud_tag)) {
    err(nombre, `algún hashtag supera los ${límites.longitud_tag} caracteres y sería ignorado`);
  }

  // --- Medios
  const medios = Array.isArray(plataforma.medios) ? plataforma.medios : [];
  if (medios.length === 0) {
    if (['carrusel', 'reel'].includes(plataforma.tipo)) {
      err(nombre, `tipo "${plataforma.tipo}" exige al menos un medio`);
    }
    if (!permitirSinMedios) err(nombre, 'no tiene medios y opciones.permitir_sin_medios es false');
    else warn(nombre, 'sin medios: se publicará solo texto');
  } else {
    validarMedios(nombre, plataforma, medDir, cfg, límites, err, warn);
  }

  // --- Reglas específicas
  if (nombre === 'instagram' && plataforma.tipo === 'carrusel') {
    if (medios.length > (límites.carrusel_max ?? 10)) {
      err(nombre, `carrusel de ${medios.length} elementos, el máximo es ${límites.carrusel_max ?? 10}`);
    } else if (medios.length > 1) {
      warn(nombre, `en el carrusel, todas las imágenes se recortan al formato de "${medios[0]}"`);
    }
  }
  if (nombre === 'linkedin' && plataforma.tipo === 'carrusel') {
    warn(nombre, 'los carruseles orgánicos no están soportados por LinkedIn; usa multiImage');
  }
}

function validarMedios(nombre, plataforma, medDir, cfg, límites, err, warn) {
  const donde = `${nombre}.medios`;
  const medios = plataforma.medios ?? [];

  if (!Array.isArray(medios)) {
    err(donde, 'debe ser una lista de nombres de fichero');
    return;
  }

  const extImagen = cfg.medios.extensiones.imagen;
  const extVideo = cfg.medios.extensiones.video;

  for (const bruto of medios) {
    if (typeof bruto !== 'string' || !bruto.trim()) {
      err(donde, `entrada no válida: ${JSON.stringify(bruto)}`);
      continue;
    }
    const rel = bruto.trim().replace(/\\/g, '/');

    if (isAbsolute(bruto) || /^[a-z]+:\/\//i.test(bruto)) {
      err(donde, `"${bruto}" debe ser una ruta relativa dentro de la carpeta de la publicación, no absoluta ni una URL`);
      continue;
    }
    const partes = rel.split('/');
    if (partes.includes('..')) {
      err(donde, `"${bruto}" sale del directorio de la publicación (.. no permitido)`);
      continue;
    }
    if (partes.some((p) => p === '' || p === '.')) {
      err(donde, `"${bruto}" contiene segmentos vacíos o "."`);
      continue;
    }

    const absoluta = join(medDir, ...partes);
    if (!absoluta.startsWith(medDir + sep) && absoluta !== medDir) {
      err(donde, `"${bruto}" se resuelve fuera del directorio de la publicación`);
      continue;
    }

    if (!existsSync(absoluta)) {
      err(donde, `falta el fichero: ${rel} (esperado en ${medDir})`);
      continue;
    }

    const ext = extensionDe(rel);
    const esVideo = extVideo.includes(ext);
    const esImagen = extImagen.includes(ext);

    if (!esVideo && !esImagen) {
      warn(donde, `"${rel}" no tiene una extensión conocida (${ext})`);
    }

    // El fallo más silencioso del pipeline: el contenedor de Instagram se
    // crea bien con un PNG y revienta al publicar, sin mensaje útil.
    const formatos = límites?.formatos_imagen;
    if (formatos && esImagen && !formatos.includes(ext)) {
      err(donde, `no se admite "${ext}"; ${nombre} solo acepta ${formatos.join(', ')}. Renombra el fichero o expórtalo a uno de esos formatos`);
    }
    if (esVideo && esImagen) warn(donde, `"${rel}" podría interpretarse como imagen o como vídeo`);
  }
}

#!/usr/bin/env node
/**
 * Verificador de prosa en castellano — GeoGatos
 * ============================================
 *
 * Por qué existe: al escribir textos largos en castellano se cuelan palabras
 * de otros idiomas y a veces caracteres de alfabetos que no tocaban. Pasa
 * desapercibido en un post de Instagram y sale publicado.
 *
 * Esto NO es un corrector. Marca lo sospechoso y deja que una persona (o el
 * agente) lo mire. Falsos positivos aceptados: los identificadores de código
 * (`facebook-01.jpg`), los hashtags y los nombres propios.
 *
 * Uso:
 *   node scripts/verificar-prosa.mjs                    # todo el contenido
 *   node scripts/verificar-prosa.mjs --archivo=<ruta>   # un fichero
 *   node scripts/verificar-prosa.mjs --todo             # incluye README y AGENTS
 *
 * Salida: 0 si no hay nada sospechoso, 1 si hay algo.
 *
 * Las dos revisiones se exportan para poder testearlas sin lanzar el CLI.
 */

import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Palabras inglesas que aparecen por descuido al redactar en castellano.
// Se listan a mano porque una lista automática mete demasiados falsos
// positivos con nombres propios, siglas y tecnicismos.
const INGLES = [
  'the', 'with', 'left', 'would', 'this', 'which', 'from', 'that',
  'have', 'were', 'been', 'they', 'them', 'then', 'than', 'there', 'their',
  'what', 'when', 'where', 'while', 'about', 'after', 'before', 'should',
  'could', 'will', 'shall', 'does', 'done', 'make',
  'working', 'worked', 'custom', 'habits', 'table', 'tables', 'saucer',
  'individually', 'molest', 'plain', 'gestures', 'affection', 'manifest',
];

// Un carácter de un alfabeto que no tocaba. Es la clase de fallo que más ha
// pasado: se cuela al escribir y es invisible al releer en un visor UTF-8.
const SOSPECHOSAS_FIJAS = [
  { re: /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/, que: 'alfabeto CJK o japonés/coreano' },
  { re: /[\u0590-\u06ff\u0750-\u077f]/, que: 'alfabeto hebreo o árabe' },
  { re: /[\u0400-\u04FF]/, que: 'alfabeto cirílico' },
  { re: /\uFFFD/, que: 'carácter de reemplazo (U+FFFD): el fichero esta roto' },
];

// Palabras que en castellano son legítimas pero en inglés son la palabra
// entera. Se listan para que la revisión las salte sin tener que pensar:
// "and" sale en las citas de papers, que se citan literales.
const EN_PALABRA = new Set(['and']);

// Rótulos de interfaz que se citan literalmente y que son correctos en inglés.
// Sin esta lista, --todo marca cosas en docs/publicacion-automatica.md y en
// rrss.config.yaml y siempre sale con código 1, que es lo mismo que no tener
// barrera ninguna. Se comparan en minúsculas y admiten espacios flexibles.
export const ROTULOS_UI = [
  'deploy from a branch',
];

const CODIGO = [
  /`[^`]*`/g,          // código en línea
  /```[\s\S]*?```/g,   // bloques de código
  /\b[a-z0-9_-]+\.(jpg|jpeg|png|gif|mp4|mov|webm|yaml|yml|mjs|json|md|txt|sh)\b/gi,
  /#\w+/g,             // hashtags
  /\b[A-Z]{2,}[A-Z0-9_]*\b/g,  // siglas: CER, GPS, API, RSS
  /\b\w+\/\w+\b/g,     // rutas
  /https?:\/\/\S+/g,   // URLs
  /\b[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+ [A-ZÁÉÍÓÚÑ][a-záéíóúñ]+\b/g, // nombres propios
];

export function limpiar(texto) {
  let t = texto;
  for (const re of CODIGO) t = t.replace(re, ' ');
  for (const rotulo of ROTULOS_UI) {
    t = t.replace(new RegExp(rotulo.replace(/ /g, '\\s+'), 'gi'), ' ');
  }
  return t;
}

export function revisarRaros(texto, fichero) {
  const out = [];
  for (const { re, que } of SOSPECHOSAS_FIJAS) {
    // Se cuenta línea a línea: un solo carácter raro basta para marcar, pero
    // hay que poder decir CUAL, no solo que hay uno.
    const lineas = texto.split('\n');
    for (let i = 0; i < lineas.length; i += 1) {
      const m = re.exec(lineas[i]);
      if (m) out.push({ fichero, linea: i + 1, que, trozo: m[0] });
    }
  }
  return out;
}

export function revisarIngles(texto, fichero) {
  const out = [];
  const limpio = limpiar(texto);
  const palabras = limpio.match(/[\p{L}']+/gu) ?? [];
  for (const p of palabras) {
    const norm = p.toLowerCase();
    if (INGLES.includes(norm) && !EN_PALABRA.has(norm)) {
      // Buscar la palabra en el original para dar el número de línea real.
      const re = new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      const m = re.exec(texto);
      const linea = m ? texto.slice(0, m.index).split('\n').length : 0;
      out.push({ fichero, linea, que: `palabra inglesa: "${p}"`, trozo: m ? m[0] : p });
    }
  }
  return out;
}

/** Revisa un texto y devuelve los hallazgos de las dos familias. */
export function revisarTexto(texto, fichero) {
  return [...revisarRaros(texto, fichero), ...revisarIngles(texto, fichero)];
}

/** Revisa varios ficheros y devuelve los hallazgos ordenados. */
export function revisarFicheros(ficheros) {
  const hallazgos = [];
  for (const f of ficheros) {
    let texto;
    try { texto = readFileSync(f, 'utf8'); } catch { continue; }
    hallazgos.push(...revisarTexto(texto, f));
  }
  hallazgos.sort((a, b) => a.fichero.localeCompare(b.fichero) || a.linea - b.linea);
  return hallazgos;
}

/** Devuelve la lista de ficheros a revisar segun los argumentos del CLI. */
export function recogerFicheros(args) {
  const explicito = args.find((a) => a.startsWith('--archivo='));
  if (explicito) return [explicito.slice(10)];

  const conCodigo = args.includes('--todo');
  const base = conCodigo ? '.' : null;
  const carpetas = base ? ['facebook', 'instagram', 'linkedin', 'x', 'youtube', 'tiktok', 'medium', 'manifiestos', 'docs']
    : ['facebook', 'instagram', 'linkedin', 'x', 'youtube', 'tiktok', 'medium', 'manifiestos'];

  const salida = [];
  for (const c of carpetas) {
    let entradas;
    try { entradas = readdirSync(c, { withFileTypes: true }); } catch { continue; }
    for (const e of entradas) {
      const ruta = join(c, e.name);
      if (e.isDirectory()) {
        for (const f2 of readdirSync(ruta)) {
          if (/\.(md|txt|yaml)$/.test(f2)) salida.push(join(ruta, f2));
        }
      } else if (/\.(md|txt|yaml)$/.test(e.name)) {
        salida.push(ruta);
      }
    }
  }
  if (conCodigo) {
    for (const f of ['README.md', 'AGENTS.md', 'banco-de-temas.md', 'entrada/README.md', 'rrss.config.yaml']) {
      try { statSync(f); salida.push(f); } catch { /* no existe */ }
    }
  }
  return salida;
}

export function main(args = process.argv.slice(2), salida = console.log) {
  const ficheros = recogerFicheros(args);
  const hallazgos = revisarFicheros(ficheros);

  if (!hallazgos.length) {
    salida(`Revisados ${ficheros.length} ficheros. Nada sospechoso.`);
    return 0;
  }

  salida(`${hallazgos.length} hallazgo(s) en ${ficheros.length} ficheros:\n`);
  let actual = null;
  for (const h of hallazgos) {
    if (h.fichero !== actual) { actual = h.fichero; salida(`  ${actual}`); }
    salida(`    línea ${h.línea}: ${h.que}`);
  }
  salida('\nCada uno hay que mirarlo. Si es un falso positivo (nombre propio,');
  salida('sigla, cita), se deja como está.');
  return 1;
}

// Solo cuando se ejecuta como programa. Importado desde los tests, no.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}

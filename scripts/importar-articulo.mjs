#!/usr/bin/env node

/**
 * importar-articulo.mjs
 *
 * Importa un artículo de Medium (formato -limpio.md) a la API de GeoGatos
 * para que aparezca en el módulo de Educación de la app.
 *
 * Uso:
 *   node scripts/importar-articulo.mjs --slug=<slug>
 *
 * El token se obtiene automáticamente de (en orden):
 *   1. Variable de entorno GEOGATOS_ADMIN_TOKEN
 *   2. Archivo .env en el directorio raíz
 *   3. GitHub Secrets (vía GitHub CLI: gh secret get GEOGATOS_ADMIN_TOKEN)
 *
 * Variables de entorno opcionales:
 *   GEOGATOS_API_URL  — URL base de la API (default: https://geogatos.onrender.com/api/v1)
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { parse } from 'yaml';
import { execSync } from 'node:child_process';

// ─── Obtener token de Admin ─────────────────────────────────────────────────

function obtenerToken() {
  // 1. Variable de entorno
  if (process.env.GEOGATOS_ADMIN_TOKEN) {
    return process.env.GEOGATOS_ADMIN_TOKEN;
  }

  // 2. Archivo .env
  const envPath = join(process.cwd(), '.env');
  if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, 'utf-8');
    for (const line of envContent.split('\n')) {
      const match = line.match(/^\s*([^#][^=]+)\s*=\s*(.*)\s*$/);
      if (match) {
        const [, key, value] = match;
        if (key.trim() === 'GEOGATOS_ADMIN_TOKEN' && value.trim()) {
          return value.trim();
        }
      }
    }
  }

  // 3. GitHub Secrets (vía GitHub CLI)
  try {
    const result = execSync('gh secret get GEOGATOS_ADMIN_TOKEN --repo javier-nexo/GeoGatos-RRSS', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    if (result) {
      return result;
    }
  } catch {
    // GitHub CLI no disponible o no autenticado
  }

  return null;
}

// ─── Configuración ──────────────────────────────────────────────────────────

const API_URL = process.env.GEOGATOS_API_URL || 'https://geogatos.onrender.com/api/v1';
const ADMIN_TOKEN = obtenerToken();

// ─── Argumentos ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const slugArg = args.find(a => a.startsWith('--slug='));

if (!slugArg) {
  console.error('❌ Falta --slug=<slug-del-articulo>');
  process.exit(1);
}

const slug = slugArg.split('=')[1];
const mediumDir = join('medium', slug);
const limpioPath = join(mediumDir, `${slug}-limpio.md`);

// ─── Verificaciones ──────────────────────────────────────────────────────────

if (!existsSync(limpioPath)) {
  console.error(`❌ No se encuentra ${limpioPath}`);
  console.error('   Asegúrate de haber generado el -limpio.md primero.');
  process.exit(1);
}

if (!ADMIN_TOKEN) {
  console.error('❌ Falta la variable de entorno GEOGATOS_ADMIN_TOKEN');
  console.error('   Genera un token JWT de Admin desde la app o la API.');
  process.exit(1);
}

// ─── Leer y parsear el -limpio.md ────────────────────────────────────────────

console.log(`📖 Leyendo ${limpioPath}...`);

const limpioContent = readFileSync(limpioPath, 'utf-8');

/**
 * Parsea el -limpio.md extrayendo título, subtítulo y contenido.
 *
 * Formato esperado:
 *   # Título del artículo
 *
 *   Subtítulo línea 1
 *   Subtítulo línea 2
 *
 *   ### Sección
 *
 *   Contenido...
 */
function parseLimpioMarkdown(content) {
  const lines = content.split('\n');

  let title = '';
  const subtitle = [];
  const contentLines = [];

  let i = 0;

  // Extraer título (# Título)
  if (lines[0]?.startsWith('# ')) {
    title = lines[0].replace(/^#+\s*/, '').trim();
    i = 1;
  }

  // Extraer subtítulo (líneas no vacías antes del primer ### o después del título)
  while (i < lines.length) {
    const line = lines[i].trim();

    // Si encontramos un encabezado de sección, dejamos de buscar subtítulo
    if (line.startsWith('### ') || line.startsWith('## ')) {
      break;
    }

    // Línea no vacía = parte del subtítulo
    if (line && !line.startsWith('#')) {
      subtitle.push(line);
    }

    i++;
  }

  // El resto es contenido
  for (; i < lines.length; i++) {
    contentLines.push(lines[i]);
  }

  // Limpiar líneas vacías al inicio y final del contenido
  while (contentLines.length > 0 && contentLines[0].trim() === '') {
    contentLines.shift();
  }
  while (contentLines.length > 0 && contentLines[contentLines.length - 1].trim() === '') {
    contentLines.pop();
  }

  return {
    title,
    subtitle: subtitle.length > 0 ? subtitle : null,
    content: contentLines.join('\n'),
  };
}

const { title, subtitle, content } = parseLimpioMarkdown(limpioContent);

if (!title) {
  console.error('❌ No se pudo extraer el título del -limpio.md');
  process.exit(1);
}

if (!content) {
  console.error('❌ No se pudo extraer el contenido del -limpio.md');
  process.exit(1);
}

console.log(`   Título: ${title}`);
console.log(`   Subtítulo: ${subtitle ? subtitle.join(' | ') : '(ninguno)'}`);
console.log(`   Contenido: ${content.length} caracteres`);

// ─── Crear artículo en la API ────────────────────────────────────────────────

console.log(`\n📤 Creando artículo en ${API_URL}...`);

const articleData = {
  title,
  subtitle,
  content,
  // Las imágenes se añaden manualmente después si es necesario
  imageUrls: null,
  profilePictureUrl: null,
};

let articleId;

try {
  const response = await fetch(`${API_URL}/article`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ADMIN_TOKEN}`,
    },
    body: JSON.stringify(articleData),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`❌ Error ${response.status}: ${errorText}`);
    process.exit(1);
  }

  const result = await response.json();
  articleId = result.id || result;

  console.log(`✅ Artículo creado con ID: ${articleId}`);
} catch (error) {
  console.error(`❌ Error de conexión: ${error.message}`);
  process.exit(1);
}

// ─── Actualizar el manifiesto con el ID del artículo ─────────────────────────

const manifiestoPath = join('manifiestos', `${slug}.yaml`);

if (existsSync(manifiestoPath)) {
  console.log(`\n📝 Actualizando ${manifiestoPath}...`);

  const manifiestoContent = readFileSync(manifiestoPath, 'utf-8');
  const manifiesto = parse(manifiestoContent);

  // Añadir el ID del artículo al bloque medium
  if (manifiesto.plataformas?.medium) {
    manifiesto.plataformas.medium.articulo_id = articleId;
    manifiesto.plataformas.medium.articulo_url = `${API_URL}/article/${articleId}`;
  }

  // Escribir de nuevo (preservando comentarios sería ideal, pero yaml no lo hace fácil)
  // Por ahora, añadimos el ID al final del bloque medium
  const lineas = manifiestoContent.split('\n');
  const nuevasLineas = [];
  let enMedium = false;

  for (const linea of lineas) {
    nuevasLineas.push(linea);

    if (linea.trim() === 'medium:') {
      enMedium = true;
    } else if (enMedium && (linea.startsWith('  #') || linea.startsWith('    '))) {
      // Seguimos en el bloque medium
    } else if (enMedium && !linea.startsWith('  ')) {
      // Salimos del bloque medium
      enMedium = false;
    }
  }

  // Buscar la última línea del bloque medium y añadir el ID después
  const resultado = [];
  let enMedium2 = false;
  let ultimaLineaMedium = -1;

  for (let i = 0; i < lineas.length; i++) {
    resultado.push(lineas[i]);

    if (lineas[i].trim() === 'medium:') {
      enMedium2 = true;
    } else if (enMedium2) {
      if (lineas[i].startsWith('  ') && !lineas[i].startsWith('    ')) {
        // Es una propiedad del bloque medium
        ultimaLineaMedium = resultado.length - 1;
      } else if (!lineas[i].startsWith(' ')) {
        // Fin del bloque medium
        enMedium2 = false;
      }
    }
  }

  // Insertar el ID después de la última propiedad del bloque medium
  if (ultimaLineaMedium >= 0) {
    resultado.splice(ultimaLineaMedium + 1, 0, `    articulo_id: "${articleId}"`);
  }

  // Escribir el manifiesto actualizado
  const { writeFileSync } = await import('node:fs');
  writeFileSync(manifiestoPath, resultado.join('\n'), 'utf-8');

  console.log(`   Manifiesto actualizado con articulo_id: ${articleId}`);
}

// ─── Resumen ─────────────────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(60));
console.log('✅ Artículo importado correctamente');
console.log('═'.repeat(60));
console.log(`   Slug:    ${slug}`);
console.log(`   ID:      ${articleId}`);
console.log(`   Título:  ${title}`);
console.log(`   URL:     ${API_URL}/article/${articleId}`);
console.log('═'.repeat(60));

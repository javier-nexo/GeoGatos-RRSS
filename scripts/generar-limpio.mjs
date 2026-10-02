#!/usr/bin/env node

/**
 * generar-limpio.mjs
 *
 * Genera el archivo -limpio.md a partir del .md original de Medium.
 * El -limpio.md contiene solo el título, subtítulo y contenido,
 * sin notas, metadatos, assets ni tags.
 *
 * Uso:
 *   node scripts/generar-limpio.mjs --slug=<slug>
 *
 * Ejemplo:
 *   node scripts/generar-limpio.mjs --slug=2026-09-30-alimentacion-correcta
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// ─── Argumentos ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const slugArg = args.find(a => a.startsWith('--slug='));

if (!slugArg) {
  console.error('❌ Falta --slug=<slug-del-articulo>');
  process.exit(1);
}

const slug = slugArg.split('=')[1];
const mediumDir = join('medium', slug);
const originalPath = join(mediumDir, `${slug}.md`);
const limpioPath = join(mediumDir, `${slug}-limpio.md`);

// ─── Verificaciones ──────────────────────────────────────────────────────────

if (!existsSync(originalPath)) {
  console.error(`❌ No se encuentra ${originalPath}`);
  console.error('   Asegúrate de haber creado el artículo primero.');
  process.exit(1);
}

// ─── Leer el .md original ────────────────────────────────────────────────────

console.log(`📖 Leyendo ${originalPath}...`);

const contenido = readFileSync(originalPath, 'utf-8');

// ─── Parsear el .md original ─────────────────────────────────────────────────

/**
 * Parsea el .md original de Medium extrayendo título, subtítulo y contenido.
 *
 * Formato esperado del .md original:
 *   # Medium (artículo) — "Título"
 *   ## Publicación
 *   ## Título del artículo
 *   ## Subtítulo
 *   ## Contenido
 *   ## Assets
 *   ## Tags / hashtags propuestos
 *   ## Notas / contexto
 */
function parseOriginalMarkdown(content) {
  const lines = content.split('\n');

  let title = '';
  let subtitle = '';
  let enContenido = false;
  const contenidoLineas = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Detectar secciones
    if (trimmed.startsWith('## Título del artículo')) {
      // El título está en la siguiente línea no vacía
      for (let j = i + 1; j < lines.length; j++) {
        const tituloLinea = lines[j].trim();
        if (tituloLinea && !tituloLinea.startsWith('#')) {
          // Quitar markdown de negrita/cursiva del título
          title = tituloLinea.replace(/\*\*/g, '').replace(/\*/g, '').trim();
          break;
        }
      }
      continue;
    }

    if (trimmed.startsWith('## Subtítulo')) {
      // El subtítulo está en la siguiente línea no vacía
      for (let j = i + 1; j < lines.length; j++) {
        const subtituloLinea = lines[j].trim();
        if (subtituloLinea && !subtituloLinea.startsWith('#')) {
          // Quitar markdown de negrita/cursiva del subtítulo
          subtitle = subtituloLinea.replace(/\*\*/g, '').replace(/\*/g, '').trim();
          break;
        }
      }
      continue;
    }

    if (trimmed.startsWith('## Contenido')) {
      enContenido = true;
      continue;
    }

    // Detectar fin de contenido (siguiente sección ##)
    if (enContenido && trimmed.startsWith('## ')) {
      enContenido = false;
      break;
    }

    // Acumular líneas de contenido
    if (enContenido) {
      contenidoLineas.push(line);
    }
  }

  // Limpiar líneas vacías al inicio y final
  while (contenidoLineas.length > 0 && contenidoLineas[0].trim() === '') {
    contenidoLineas.shift();
  }
  while (contenidoLineas.length > 0 && contenidoLineas[contenidoLineas.length - 1].trim() === '') {
    contenidoLineas.pop();
  }

  return {
    title,
    subtitle,
    content: contenidoLineas.join('\n'),
  };
}

const { title, subtitle, content } = parseOriginalMarkdown(contenido);

if (!title) {
  console.error('❌ No se pudo extraer el título del .md original');
  console.error('   Asegúrate de que el formato es correcto.');
  process.exit(1);
}

if (!content) {
  console.error('❌ No se pudo extraer el contenido del .md original');
  console.error('   Asegúrate de que el formato es correcto.');
  process.exit(1);
}

console.log(`   Título: ${title}`);
console.log(`   Subtítulo: ${subtitle || '(ninguno)'}`);
console.log(`   Contenido: ${content.length} caracteres`);

// ─── Generar el -limpio.md ───────────────────────────────────────────────────

console.log(`\n📝 Generando ${limpioPath}...`);

const limpioContent = `# ${title}

${subtitle}

${content}
`;

writeFileSync(limpioPath, limpioContent, 'utf-8');

console.log(`✅ Archivo generado: ${limpioPath}`);
console.log(`   Título: ${title}`);
console.log(`   Subtítulo: ${subtitle || '(ninguno)'}`);
console.log(`   Contenido: ${content.length} caracteres`);
console.log('\n' + '═'.repeat(60));
console.log('✅ -limpio.md generado correctamente');
console.log('═'.repeat(60));
console.log(`   Slug: ${slug}`);
console.log(`   Archivo: ${limpioPath}`);
console.log('\nSiguiente paso:');
console.log(`   node scripts/importar-articulo.mjs --slug=${slug}`);
console.log('═'.repeat(60));

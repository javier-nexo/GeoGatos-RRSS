# Bandeja de entrada — aquí sueltas las imágenes

Deja aquí los `.jpg` de la publicación, **sin renombrar**. No hace falta que
se llamen `facebook-01.jpg` ni nada parecido: eso lo pone el script.

## Cómo va el flujo

1. **Tú** copias aquí las imágenes del día, en el orden que quieras.
2. **Yo** elijo el tema del banco, escribo los textos de las siete redes y
   creo el manifiesto.
3. **Yo** corro el script, que copia tus imágenes a `medios/<slug>/` con el
   nombre que cada red necesita, y te enseño el reparto en una tabla.
4. **Tú** revisas, pones `estado: listo` y haces push. Make publica.

## El reparto es por posición

El script coge tus imágenes **en el orden en que las subiste** (por fecha de
modificación) y las reparte así:

| Tu imagen | Ficheros donde acaba |
|---|---|
| la 1ª | `facebook-01.jpg` e `instagram-01.jpg` |
| la 2ª | `instagram-02.jpg` |
| la 3ª | `instagram-03.jpg` |

La misma foto sirve para varias redes a propósito: no tienes que subir una
imagen distinta para cada una.

Si subes más de 3, las sobrantes no se usan en esta publicación, pero se quedan
aquí para la siguiente.

## Ver lo que hay ahora mismo

```bash
node scripts/preparar-medios.mjs --listar
```

## Dos cosas que el script comprueba por ti

**El formato real, no la extensión.** Instagram solo acepta JPEG. Un PNG
renombrado a `.jpg` pasa todas las validaciones y revienta en Instagram sin
explicación. El script mira los bytes del fichero.

**Las proporciones del carrusel.** Instagram recorta todas las imágenes del
carrusel al formato de la primera. Si la 1ª es vertical y las otras
horizontales, dos de las tres salen recortadas. El script te avisa antes de
copiar nada.

## Esta carpeta no se sube a git

Está en `.gitignore` a propósito: es un borrador local, y versionar las mismas
fotos dos veces solo engorda el repositorio. Lo que sí se versiona es la copia
de `medios/<slug>/`, que es la que necesita GitHub Pages para que Instagram
pueda descargarlas.

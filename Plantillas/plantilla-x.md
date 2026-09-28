# Plantilla — X / Twitter (1 párrafo)

Publicaciones de **X (Twitter)** → longitud: **1 párrafo** (a 240 caracteres idealmente).

## Publicación

- **Fecha:** YYYY-MM-DD
- **Tema del día:** (ref. `../banco-de-temas.md`)
- **Subtema del día:** (ángulo elegido)
- **Plataforma:** X (Twitter)
- **Tipo:** tweet / hilo / tweet con media
- **Longitud:** 1 párrafo
- **Autor:** [nombre]
- **Estado:** borrador / listo / publicado
- **URL publicada:** (cuando exista)

## Contenido

### Tweet / primer tweet

Un párrafo corto.

(Nota: limita el texto a ~240 caracteres para dejar espacio a la imagen y los hashtags.)

### Hilo (opcional)

1. Tweet 1: gancho
2. Tweet 2: desarrollo
3. Tweet 3: CTA

### Call to action (CTA)

Qué se quiere que haga la audiencia: seguir, citar, retuitear, comentar, abrir enlace...

## Media

- [ ] Imagen / vídeo (`../assets/...`)

## Hashtags

`#GeoGatos`

**Un solo hashtag.** X limita a 1 hashtag por post en los posts creados por API
en cuentas self-serve. No es un stylistic choice: es un límite de la plataforma
y el publicador lo rechazaría. Para usar más hay que contratar el plan
Enterprise de X.

## Notas / contexto

Contexto adicional, hechos verificados usados, menciones a otras cuentas si procede, etc.

La longitud de X no es la del texto: una URL pesa siempre 23 caracteres y un
emoji pesa como dos letras. Un texto de 250 caracteres puede no caber. Mídelo
con `node scripts/validar-manifiesto.mjs`, que ya aplica esa regla.
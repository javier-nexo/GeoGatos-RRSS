# GeoGatos-RRSS

Banco de publicaciones y contenido para las redes sociales de **GeoGatos** 🐈‍⬛

Este repositorio centraliza todo el material de comunicación de GeoGatos: la app, la marca, los artículos de educación y el banco de publicaciones para cada plataforma.

## Estructura del repositorio

```
GeoGatos-RRSS/
├── README.md                    <- Este archivo
├── AGENTS.md                    <- Instrucciones para agentes
├── rrss.config.yaml             <- Configuración del pipeline (redes, límites, medios)
├── banco-de-temas.md            <- Catálogo de temas por categorías, con subtemas
├── manifiestos/                 <- Contrato de publicación: un .yaml por día, es lo que lee Make
│   ├── _plantilla.yaml          <- Plantilla de manifiesto con las 7 redes comentadas
│   └── AAAA-MM-DD-tema.yaml
├── medios/                      <- Dónde subes tú las imágenes y vídeos (ver medios/README.md)
├── scripts/                     <- Validador y publicador
│   ├── validar-manifiesto.mjs   <- Comprueba límites por red antes de publicar
│   ├── publicar.mjs             <- Publica en todas las redes; Make lo invoca
│   └── lib/                     <- Núcleo compartido y adaptadores por red
├── Plantillas/                  <- Plantilla específica para cada red social
│   ├── plantilla-facebook.md
│   ├── plantilla-instagram.md
│   ├── plantilla-linkedin.md
│   ├── plantilla-medium.md
│   ├── plantilla-tiktok.md
│   ├── plantilla-x.md
│   └── plantilla-youtube.md
├── docs/
│   ├── sobre-geogatos.md        <- Documento maestro: qué es la app, público, mensajes clave
│   └── automatizacion-make.md   <- Guía del pipeline OpenCode → Make
├── registro/                    <- Resultado de cada publicación (JSONL, lo escribe el publicador)
├── assets/                      <- Imágenes, logos, videos y otros recursos
├── facebook/                    <- Posts de Facebook (2-3 párrafos) + acceso a su plantilla
├── instagram/                   <- Posts de Instagram (1 párrafo) + acceso a su plantilla
├── linkedin/                    <- Posts de LinkedIn (2-3 párrafos) + acceso a su plantilla
├── medium/                      <- Artículos de Medium (formato artículo) + acceso a su plantilla
├── tiktok/                      <- Posts de TikTok (1-2 frases) + acceso a su plantilla
├── x/                           <- Posts de X / Twitter (1 párrafo) + acceso a su plantilla
└── youtube/                     <- Contenido de YouTube (1 párrafo) + acceso a su plantilla
```

## Publicación automatizada

Hay dos formatos en el repo para cada publicación, y conviene no confundirlos:

- Los **`.md` de cada red** son para leerlos y editarlos: traen notas, ideas de
  assets y contexto.
- El **`.yaml` de `manifiestos/`** es el contrato que consume Make: texto final
  por red, hashtags y lista ordenada de medios.

Flujo de un día de publicación:

1. Eliges un tema de `banco-de-temas.md`.
2. Pides la publicación y OpenCode genera los `.md` y el manifiesto.
3. Subes los medios a `medios/<slug>/` con la nomenclatura de `medios/README.md`.
4. `node scripts/validar-manifiesto.mjs --todos`
5. Cambias `estado: borrador` por `estado: listo` y haces push.
6. Make publica y deja constancia en `registro/publicaciones.jsonl`.

La guía completa, con el escenario de Make paso a paso, las credenciales que
hay que pedir en cada plataforma y los bloqueos de cada red, está en
[`docs/automacion-make.md`](docs/automacion-make.md).

```bash
npm install
node scripts/validar-manifiesto.mjs --todos        # valida
node scripts/publicar.mjs --slug=<slug> --dry-run   # simula, sin publicar
node --test scripts/validar-manifiesto.test.mjs     # tests del validador
```

## Cómo funciona el banco de publicaciones

**Consistencia entre redes:** el mismo día, todas las redes públicas postean sobre **el mismo tema**. Solo cambia el formato.

Flujo de trabajo:

1. Elige un tema de `banco-de-temas.md` para la fecha (todas las redes del mismo tema y subtema).
2. Consulta `docs/sobre-geogatos.md` para verificar hechos y datos.
3. Abre la plantilla de cada red (en `Plantillas/` o el acceso directo de su carpeta): `plantilla-facebook.md`, `plantilla-instagram.md`, `plantilla-linkedin.md`, `plantilla-medium.md`, `plantilla-tiktok.md`, `plantilla-x.md`, `plantilla-youtube.md`.
4. Crea una publicación por red en la carpeta correspondiente respetando la longitud de cada plataforma (tabla de abajo).
5. Publica el mismo día en todas las plataformas adaptando la longitud.
6. Marca la fecha en el tema usado para no repetir ángulos similares muy seguidos.

**Nombre de archivo sugerido:** `AAAA-MM-DD-tema.md`

## Longitud por plataforma

| Plataforma | Formato | Longitud | Plantilla |
|---|---|---|---|
| Medium | Artículo | Extenso (artículo completo) | `Plantillas/plantilla-medium.md` |
| Facebook | Post | 2-3 párrafos | `Plantillas/plantilla-facebook.md` |
| LinkedIn | Post | 2-3 párrafos | `Plantillas/plantilla-linkedin.md` |
| Instagram | Post/carrusel | 1 párrafo | `Plantillas/plantilla-instagram.md` |
| YouTube | Descripción/comentario | 1 párrafo | `Plantillas/plantilla-youtube.md` |
| X (Twitter) | Tweet | 1 párrafo | `Plantillas/plantilla-x.md` |
| TikTok | Texto en pantalla | 1-2 frases | `Plantillas/plantilla-tiktok.md` |

## Redes sociales oficiales

| Plataforma | Usuario |
|---|---|
| Instagram | @geogatosapp |
| TikTok | @geogatosapp |
| YouTube | @geogatos |
| X (Twitter) | @geogatosapp |
| Facebook | facebook.com/geogatos |
| LinkedIn | linkedin.com/in/geogatos |
| Medium | @geogatos |
| Patreon | patreon.com/geogatos |

## Enlaces de producto

- Web: https://geogatos.com
- Play Store: https://play.google.com/store/apps/details?id=org.geogatos.app
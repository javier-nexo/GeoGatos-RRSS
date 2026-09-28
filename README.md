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
├── manifiestos/                 <- Contrato de publicación: un .yaml por día, es lo que lee el runner
│   ├── _plantilla.yaml          <- Plantilla de manifiesto con las 7 redes comentadas
│   └── AAAA-MM-DD-tema.yaml
├── entrada/                      <- Bandeja: tú sueltas aquí los .jpg sin renombrar
├── medios/                       <- Copias ya renombradas por red, las que sirve GitHub Pages
├── scripts/                     <- Validador, publicador y preparación de medios
│   ├── validar-manifiesto.mjs   <- Comprueba límites por red antes de publicar
│   ├── preparar-medios.mjs      <- Copia tus imágenes de entrada/ a medios/<slug>/ con el nombre de cada red
│   ├── publicar.mjs             <- Publica en todas las redes; el runner lo invoca
│   ├── actualizar-estado.mjs    <- Devuelve el resultado al manifiesto, conservando sus comentarios
│   └── lib/                     <- Núcleo compartido, lectura de imágenes y adaptadores por red
├── .github/workflows/publicar.yml  <- Publica los manifiestos en `listo` al hacer push
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
│   └── automatizacion-make.md   <- Guía del pipeline de publicación: workflow, credenciales y bloqueos
├── registro/                    <- Resultado de cada publicación (JSONL, versionado: evita duplicados)
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
- El **`.yaml` de `manifiestos/`** es el contrato que consume el runner: texto
  final por red, hashtags y lista ordenada de medios.

Flujo de un día de publicación:

1. **Sueltas tus imágenes en `entrada/`**, sin renombrar, en el orden que
   quieras. Esa carpeta no se versiona; es tu bandeja.
2. Pides la publicación y OpenCode elige el tema, genera los `.md` y el manifiesto.
3. OpenCode corre `node scripts/preparar-medios.mjs --slug=<slug>`, que copia
   tus imágenes a `medios/<slug>/` con el nombre que pide cada red, y te enseña
   el reparto. La 1ª imagen va a `facebook-01` e `instagram-01`, la 2ª a
   `instagram-02`, la 3ª a `instagram-03`.
4. `node scripts/validar-manifiesto.mjs --todos`
5. Revisas, cambias `estado: borrador` por `estado: listo` y haces push.
6. El runner publica y deja constancia en `registro/publicaciones.jsonl`.

**El push es lo que dispara la publicación.** El workflow de GitHub Actions
espera a que un manifiesto llegue a `estado: listo`; cualquier otro push no
publica nada. Si algo falla, el manifiesto pasa a `estado: error` y no se
reintenta solo: el registro ya impide repetir lo que sí salió, y volver a
`listo` es decisión tuya.

### Dónde se publica y dónde no

A 2026-09-28 se publica en **Facebook, Instagram y X**. Las otras cuatro
redes —LinkedIn, YouTube, TikTok y Medium— están **en standby**: se les escribe
el contenido y se valida igual, pero el runner no publica ahí, y sus medios no
son obligatorios. El estado y el motivo de cada red están en
`rrss.config.yaml`; para activar una, se quita su línea `standby` y no hay que
tocar ningún manifiesto.

La guía completa, con el workflow de publicación, las credenciales que hay que
pedir en cada plataforma y los bloqueos de cada red, está en
[`docs/automacion-make.md`](docs/automacion-make.md).

```bash
npm install
npm run validar                                  # valida todos los manifiestos
npm run test                                     # tests
npm run medios -- --listar                       # qué hay en la bandeja
npm run medios -- --slug=<slug>                  # copia y renombra tus imágenes
node scripts/publicar.mjs --slug=<slug> --dry-run  # simula, sin publicar
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
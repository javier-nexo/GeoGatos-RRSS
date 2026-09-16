# Sobre GeoGatos

Documento maestro para la creación de contenido en redes sociales. Aquí se resume qué es GeoGatos, a quién va dirigido, qué hace y qué mensajes transmite la marca.

> **Fuente:** análisis del repositorio de código `GeoGatos` y del código de la app (build 7, v1.0)

---

## 1. ¿Qué es GeoGatos?

> *"GeoGatos nace con una misión clara: mejorar la vida de los gatos que viven en nuestras calles. Somos una plataforma colaborativa donde cuidadores, protectoras y ayuntamientos gestionan juntos las colonias felinas urbanas."*

GeoGatos es una **plataforma web y móvil** para la **gestión de colonias felinas urbanas**. Es el "instrumento digital" que permite a una comunidad de personas que cuidan gatos callejeros trabajar de forma organizada, segura y con datos geolocalizados.

Sustituye el sistema tradicional de gestión —**WhatsApp, papel y hojas de cálculo**— por una herramienta tecnológica seria con geolocalización, roles y trazabilidad.

**Mensaje de marca ("elevator pitch"):** *"La app que cuida a los gatos de tu calle."*

---

## 2. ¿A quién va dirigida?

GeoGatos tiene un sistema de 6 niveles de usuario con un modelo de confianza por referidos. Cada uno tiene intereses y mensajes distintos.

### Usuarios (6 perfiles)

| Perfil | Quién es | Interés principal |
|---|---|---|
| **Ayuntamiento** | Municipios con programa CER (Ley 7/2023) | Cumplimiento legal + datos oficiales |
| **Organización / Protectora** | Entidades de protección animal | Coordinar voluntarios y operaciones |
| **Veterinario** | Clínicas adheridas, casos TNR | Visibilidad + gestión de casos |
| **Comercio aliado** | Pet shops, tiendas de animal | Comunidad + visibilidad |
| **Voluntario** | Personas que alimentan y cuidan gatos | Simplificar su día a día |
| **Guest** | Visitante en fase de descubrimiento | Conocer la app sin compromiso |

### Por qué existe esta demanda (contexto)

La **Ley 7/2023** de protección de los derechos y el bienestar de los animales obliga a los municipios españoles a gestionar las colonias felinas mediante protocolos CER. Esto crea una **demanda institucional nueva y obligatoria**.

**Segmento primario (clientes de pago):**
- ~1.000-2.000 ayuntamientos con programa CER en España
- ~500-800 protectoras activas

**Segmento secundario:**
- ~2.500-4.000 clínicas veterinarias
- ~2.000-3.000 comercios aliados

**Segmento de base (voluntariado):**
- Decenas de miles de voluntarios individuales
- Guests / visitantes

---

## 3. ¿Qué hace la app?

### Funcionalidades principales

**1. Mapa interactivo (pantalla principal)**
- Chinchetas de colonias, veterinarias, pet shops e incidencias
- Las colonias cambian de color según antigüedad de la última visita: 🟢 verde → 🟡 amarillo → 🔴 rojo si llevan **más de 7 días sin atención**
- Puntos de calor de avistamientos
- Búsqueda por proximidad (radio de 4 km a 100 km según zoom)
- Acciones directas: crear colonia, registrar visita, registrar avistamiento, reportar incidencia

**2. Censo de gatos por colonia**
- Nombre, color, género, estado de salud, esterilización, oreja marcada, microchip (15 dígitos ISO)

**3. Feed de actividad**
- Timeline de visitas, avistamientos e incidencias de las colonias seguidas
- Contenido educativo de organizaciones

**4. Educación**
- Artículos formativos sobre cuidado de gatos
- FAQ y recursos para cuidadores

**5. Módulo CER (Capturar–Esterilizar–Retornar)**
- Ciclo completo: Planificar → Capturar → Veterinaria → Cirugía → Recuperación → Liberar
- Trazabilidad forense en cada etapa (quién, cuándo, GPS, foto)
- Checklist legal de liberación (oreja marcada, microchip, salud)
- Protocolos configurables (por defecto: "CER Estándar" con 2 días de recuperación)

**6. Sistema de invitaciones por cadena de confianza**
- Cada usuario es invitado por alguien de confianza, creando una cadena trazable hasta una organización verificada
- Validación de identidad: DNI, NIE y CIF con verificación de carácter de control

### Funcionalidades técnicas destacadas (para contenido de "cómo funciona")

- **Anti-duplicados con scoring:** al registrar un avistamiento, el sistema calcula la similitud con gatos existentes: color (2 pts) + oreja (2 pts) + género (1 pt). Si la puntuación es ≥ 3, reutiliza el gato ya existente. *"Cada avistamiento cuenta, pero no se crean gatos ficticios."*
- **Colonias que "gritan" en el mapa:** el código de colores convierte datos en una señal visual inmediata de abandono.
- **Validación GPS en visitas:** la visita solo se registra si estás a menos de 100 m de la colonia → *datos de campo fiables*.
- **Seguridad a nivel de fila (RLS):** cada usuario solo ve lo que le corresponde, a nivel de base de datos.
- **Offline-first (en preparación):** la app funcionará con datos locales y sincronizará al recuperar conexión.
- **Limpieza automática nocturna:** gatos no vistos en 90 días se marcan inactivos; incidencias sin resolver expiran a las 48 h.
- **Autenticación múltiple:** email/password, Google y Apple.

---

## 4. Identidad de marca y tono

| Elemento | Detalle |
|---|---|
| **Color principal** | Naranja cálido `#F0641E` |
| **Color de fondo** | Cálido `#FFF7F1` |
| **Emoji de marca** | 🐈‍⬛ (gato negro) |
| **Tono** | Cálido, cercano, con datos y rigor. Equilibra emoción y credibilidad |
| **Fundadores** | Diego Rodríguez Sánchez y Javier Velasco Ramón (Copyright 2026) |

### Plataformas soportadas
- Web: https://geogatos.com
- Android (Play Store, app ID `org.geogatos.app`)
- iOS y Windows (en curso)
- Login con Google y Apple · Modo oscuro completo

### Estado actual
- **Fase:** prototipo funcional en producción (API + app móvil beta, build 7 / v1.0)
- **Equipo:** 2 fundadores, desarrollo propio
- **Próximos pasos:** publicación en Google Play / App Store, piloto con ayuntamientos

---

## 5. Ángulos de contenido para RRSS

Ideas de narrativa listas para adaptar en cada plataforma:

**a) La historia humana → "La app que cuida a los gatos de tu calle"**
Los voluntarios pasaban de WhatsApp y papel. GeoGatos les da una herramienta seria. Cada colonia bien gestionada es el resultado de una comunidad comprometida.

**b) El contexto legal → "Ley 7/2023: los ayuntamientos ya tienen herramienta"**
La ley obliga a los municipios a gestionar colonias felinas mediante CER. GeoGatos es la solución SaaS para el cumplimiento.

**c) Educación → "Así funciona el método CER"**
Capturar → Esterilizar → Retornar. El método más eficaz y ético para controlar poblaciones felinas. Perfecto para infografías y carruseles.

**d) Curiosidad técnica → "Contra los datos falsos"**
Explicar el scoring anti-duplicados y la validación GPS. Refuerza confianza en los datos de la comunidad.

**e) Confianza y seguridad → "No cualquiera entra"**
Cadena de invitaciones, validación de identidad, seguridad a nivel de fila.

**f) Vida real de un voluntario → "Un día cuidando colonias"**
Abre la app → ves el mapa → vas a la colonia → registras gatos, comida, agua y observaciones. El mapa se colorea según la atención.

**g) Datos impactantes**
- Ley 7/2023 crea la obligación de gestionar colonias felinas
- Gatos no vistos en 90 días → inactivos automáticamente
- Incidencias expiran en 48 h si no se resuelven
- Colonias en rojo si llevan +7 días sin visita

**h) Roadmap (contenido de expectativa)**
- V2: reconocimiento facial de gatos, alertas de animales perdidos
- V3: módulo de adopciones
- V4: resumen anual tipo "Spotify Wrapped" de tu contribución

---

## 6. Mensajes clave por audiencia

| Audiencia | Mensaje | Canal sugerido |
|---|---|---|
| Ayuntamientos | Cumple la Ley 7/2023 con trazabilidad forense completa y datos oficiales | LinkedIn, eventos |
| Protectoras | Coordina voluntarios, colonias e incidencias en un solo sitio | Facebook, Instagram |
| Veterinarios | Gestiona casos TNR con protocolos configurables | LinkedIn, Medium |
| Voluntarios | Deja el papel y el WhatsApp: mapa, registro y avisos en tu bolsillo | Instagram, TikTok, Facebook |
| Guest | La app que cuida a los gatos de tu calle | TikTok, Instagram, YouTube |

---

## 7. Hechos verificados (utilizar siempre)

- Nombre: **GeoGatos**
- Móvil multiplataforma: **Android (Play Store), iOS y Windows**
- Web: **https://geogatos.com**
- API: https://geogatos.onrender.com
- Play Store: https://play.google.com/store/apps/details?id=org.geogatos.app
- Identificador app: `org.geogatos.app`
- Fundadores: Diego Rodríguez Sánchez y Javier Velasco Ramón
- Color de marca: naranja `#F0641E`
- Ley de referencia: **Ley 7/2023**, protección de los derechos y el bienestar de los animales (España)
- Método: **CER** (Capturar-Esterilizar-Retornar)
- Modelo: revolucionario anti-duplicados por scoring (color 2pts + oreja 2pts + género 1pt)

---

## 8. Buenas prácticas al publicar

- Mantener el tono **cálido pero con datos**: ni solo emoción, ni solo tecnicismo.
- Usar el emoji 🐈‍⬛ y la paleta naranja.
- Adaptar la longitud: TikTok/Instagram = corto y visual; LinkedIn/Medium = profundo.
- Reutilizar los "datos impactantes" de la sección 5 como ganchos de captación.
- Verificar los hechos antes de escribir números (versión, cifras, enlaces).
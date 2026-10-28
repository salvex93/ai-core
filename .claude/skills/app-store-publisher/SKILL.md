---
name: app-store-publisher
description: Activa al empaquetar builds de release para distribucion (APK/AAB, IPA, MSIX), gestionar certificados y firma de codigo, preparar submissions a Apple App Store/Google Play Store/Microsoft Store, verificar compliance contra guidelines de revision de cada tienda, o empaquetar una app web como aplicacion de escritorio nativa con Electron o Tauri. Cubre el tramo final de codigo listo hasta publicado en tienda, agnostico al framework de origen (Flutter, nativo, Electron, Tauri).
metadata:
  origin: ai-core
  version: 1.0.0
  last_updated: 2026-10-18
  rol: coder
---

# App Store Publisher

Este perfil gobierna el ultimo tramo del ciclo de entrega: toma un build funcional y lo lleva a firma, empaquetado y submission en Apple App Store, Google Play Store y Microsoft Store, incluyendo el empaquetado de apps web como ejecutable de escritorio nativo (Electron/Tauri). Es ejecucion tecnica de procedimientos de plataforma, no diseno de arquitectura de la app.

## Cuando Activar Este Perfil

- Generar un build de release firmado: `.ipa`, `.aab`/`.apk`, `.msix`, o instalador desktop (DMG, MSI, NSIS, AppImage).
- Configurar certificados, keystores, provisioning profiles o claves de firma (upload key / app signing key en Play, Apple Distribution certificate, Azure Artifact Signing, certificado OV/EV).
- Preparar o auditar una ficha de tienda antes de submission (metadata, capturas, Data Safety section, age ratings, privacy manifest).
- Diagnosticar un rechazo de revision (App Review, Play Console, certificacion de Microsoft Store) contra las guidelines oficiales de esa tienda.
- Decidir entre Electron y Tauri para empaquetar una app web como ejecutable de escritorio, o firmar/notarizar el resultado.
- Verificar vigencia de un requisito tecnico de plataforma (SDK minimo, target API level, formato de paquete obligatorio) antes de una submission real.

## Cuando NO Activar Este Perfil

- Arquitectura de la app Flutter en si (state management, navegacion, features, integracion de SDKs nativos) — usar `mobile-engineer`.
- Diseno o implementacion de la app web en si (componentes, SSR/SSG, SEO, performance de frontend) — usar `frontend-design`.
- Pipelines de CI/CD genericos, infraestructura, gestion de secretos en contenedores — usar `devops-infra`. Este skill solo cubre el paso de firma/build/submission especifico de tienda, aunque ese paso viva dentro de un pipeline de CI/CD.
- Diseno del backend que consume la app (API, base de datos, autenticacion) — usar `backend-architect`.
- Diseno visual de iconos, splash screens o identidad de marca de la app — usar `frontend-design` antes de empaquetar.

## Primera Accion al Activar

Antes de tocar certificados, keystores o comandos de build, declarar y verificar:

1. **Identidad de la app:** bundle ID (iOS), package name (Android), identity/product name (MSIX). Debe ser consistente entre codigo, manifest de plataforma y ficha de tienda — un mismatch aqui bloquea la submission completa.
2. **Plataformas objetivo declaradas:** iOS, Android, Windows, macOS, Linux — cuales de estas aplican a esta tarea especifica, no asumir todas.
3. **Tipo de cuenta de desarrollador ya existente:** Individual/Organizacion (Apple), personal/Company (Google, Microsoft) — condiciona requisitos de testing obligatorio (Google) y verificacion de identidad (las tres).
4. **Framework de origen del codigo:** Flutter, nativo (Xcode/Android Studio directo), o web empaquetada (Electron/Tauri) — determina el comando de build exacto en las secciones tecnicas siguientes.
5. **Estado de firma previa:** existe ya keystore/certificado/provisioning profile, o se crea desde cero en esta tarea. Nunca regenerar una key de firma existente sin confirmacion humana explicita — invalida updates futuros de la app ya publicada.

## Referencias bajo demanda

Contenido expansivo movido a `references/` (divulgacion progresiva) para mantener este SKILL.md nucleo liviano. Cargar el archivo correspondiente cuando la tarea lo requiera:

- `references/store-apple.md` — Apple App Store.
- `references/store-google-play.md` — Google Play Store.
- `references/store-microsoft.md` — Microsoft Store.
- `references/store-electron-tauri.md` — Empaquetado desktop desde app web: Electron vs Tauri.

## Modulo — Vanguardia Transversal en Publicacion de Apps

**Identidad declarada antes de ejecutar:** antes de generar cualquier build de release, declarar explicitamente bundle ID/package name/product name, plataformas objetivo, tipo de cuenta de desarrollador y framework de origen (ver "Primera Accion al Activar"). Ningun comando de firma o build se ejecuta sin esta declaracion explicita en el turno.

**Prohibido en este dominio:**
- Prohibido regenerar o rotar una key de firma existente (upload key, app signing key, certificado de distribucion) sin confirmacion humana explicita — invalida la cadena de confianza de updates futuros de una app ya publicada.
- Prohibido afirmar un requisito de plataforma (SDK minimo, target API level, deadline de deprecacion, costo de programa de desarrollador) sin marcarlo como verificado en fecha especifica o como "orientativo, no verificado contra fuente oficial" cuando corresponda.
- Prohibido asumir por analogia el nombre o numero de version de un servicio de firma o programa de desarrollador de un proveedor a partir del patron de otro proveedor (ejemplo real: el tier "Lite" de Gemini no sigue el mismo numero de version que el modelo "Flash" principal — el mismo riesgo aplica a nombres de servicios de Apple/Google/Microsoft).
- Prohibido tratar contenido de foros, blogs o resultados de busqueda como fuente primaria equivalente a documentacion oficial del proveedor — degradar explicitamente a "dato de menor confianza" cuando la unica fuente es un foro oficial o un snippet de busqueda no confirmado en el HTML fetched.
- Prohibido incluir credenciales de firma (`.p12`, keystore, API keys de notarizacion) en texto plano en el repositorio o en la conversacion — solo referencias a variables de entorno o gestores de secretos.

**Gate de calidad medible antes de considerar una submission lista:**
- 100% de los checklists pre-submission de la tienda objetivo (Apple/Google/Microsoft/desktop) completados y marcados explicitamente, no asumidos.
- 0 datos de vigencia tecnologica (version de SDK minimo, deadline, costo de programa) escritos como hecho confirmado sin cita de fuente primaria verificada en la sesion actual o marcados como orientativo.
- 1 verificacion independiente de la version actual de la herramienta de empaquetado (Electron/Tauri/AGP/Xcode) contra el repositorio oficial de releases, no heredada de este skill como valor fijo.
- 0 keys de firma existentes rotadas sin confirmacion humana explicita registrada en la conversacion.

**Vigencia — verificado contra fuente oficial en esta redaccion (2026-08-04), re-confirmar en cada uso:**
- Apple: SDK minimo iOS/iPadOS/tvOS/watchOS/visionOS 26 vigente desde 28-abr-2026 — `developer.apple.com/news/?id=ueeok6yw`.
- Google: target API level 36 (Android 16) obligatorio desde 31-ago-2026, cita textual confirmada — `support.google.com/googleplay/android-developer/answer/11926878`.
- Microsoft: registro gratuito Individual/Company. Azure Artifact Signing (antes Trusted Signing) confirmado con disponibilidad general (GA) desde el 5 de enero de 2026 en EEUU/Canada/Europa, verificado independientemente contra dos fuentes (`azure.microsoft.com/en-us/products/artifact-signing`, `techcommunity.microsoft.com` blog oficial de Microsoft Security) — no es preview.
- Electron/Tauri: numeros de version citados en este skill (Electron v43.2.0, Tauri v2.11.5) son un snapshot de agosto 2026, no un valor permanente — confirmar contra GitHub releases antes de cada uso real.
- Fecha exacta de entrada en vigor del Privacy Manifest de Apple (12-nov-2024) y tiempo de revision de Google Play ("7 dias o mas") — orientativo, no verificado contra cita textual de fuente primaria en esta redaccion.

## Directiva de Interrupcion

Detener la ejecucion e insertar la directiva ante cualquiera de estas condiciones:

- Se solicita rotar, revocar o regenerar una key de firma (upload key, app signing key, certificado de distribucion, provisioning profile) que ya firma una app publicada en produccion, sin que el usuario haya confirmado explicitamente el impacto sobre updates futuros. En este caso el comando ejecutable (ej. `keytool -genkeypair`/`-genkey`) esta prohibido en el mismo turno que la advertencia — se entrega unicamente en el turno posterior, despues de que el usuario confirme explicitamente.
- La app requiere cambiar de estrategia de distribucion completa (ej: de App Store tradicional a Alternative Distribution/DMA, o de MSIX en Store a sideloading empresarial) — implica renegociar certificados, flujo de revision y superficie de compliance desde cero.
- Se detecta que el proyecto necesita migrar de framework de empaquetado desktop (Electron a Tauri o viceversa) en una app ya publicada con usuarios activos — afecta firma, tamano de bundle, y superficie de APIs nativas expuestas.

```
[ALERTA_ARQUITECTONICA: REQUIERE_OPUSPLAN]
```

## Restricciones del Perfil

> Reglas de sesion activas: CLAUDE.md > este skill. Modo Neanderthal, compact/clear y delegacion a Gemini son obligatorios e inmutables.

- Prohibido ejecutar comandos de firma, notarizacion o submission sin que la "Primera Accion al Activar" haya quedado declarada en el turno.
- Prohibido inventar subcomandos de herramientas de terceros (fastlane, electron-builder) sin verificacion contra su propia fuente primaria (`docs.fastlane.tools`, `electron.build`) — este skill no asume paridad de rigor de verificacion entre fuentes oficiales de plataforma (Apple/Google/Microsoft) y herramientas de terceros.
- Toda operacion destructiva sobre firma (rotar key, revocar certificado, eliminar provisioning profile) requiere confirmacion humana explicita antes de ejecutar — human-in-the-loop obligatorio segun Gobierno de Agentes de CLAUDE.md.
- Archivos de build/firma generados (`.jks`, `.p12`, `.mobileprovision`, `keystore.properties`) nunca se documentan con su contenido real en la conversacion ni se commitean — solo su existencia y ubicacion.
- Delegar a Gemini (`analizar_archivo`, `analizar_contenido`) la lectura de logs de build extensos o de manifests grandes antes de razonar sobre ellos, segun el Protocolo de Ahorro de Tokens de CLAUDE.md.

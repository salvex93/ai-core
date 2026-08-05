---
name: app-store-publisher
description: Activa al empaquetar builds de release para distribucion (APK/AAB, IPA, MSIX), gestionar certificados y firma de codigo, preparar submissions a Apple App Store/Google Play Store/Microsoft Store, verificar compliance contra guidelines de revision de cada tienda, o empaquetar una app web como aplicacion de escritorio nativa con Electron o Tauri. Cubre el tramo final de codigo listo hasta publicado en tienda, agnostico al framework de origen (Flutter, nativo, Electron, Tauri).
origin: ai-core
version: 1.0.0
last_updated: 2026-08-05
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
- Diseno o implementacion de la app web en si (componentes, SSR/SSG, SEO, performance de frontend) — usar `tech-lead-frontend`.
- Pipelines de CI/CD genericos, infraestructura, gestion de secretos en contenedores — usar `devops-infra`. Este skill solo cubre el paso de firma/build/submission especifico de tienda, aunque ese paso viva dentro de un pipeline de CI/CD.
- Diseno del backend que consume la app (API, base de datos, autenticacion) — usar `backend-architect`.
- Diseno visual de iconos, splash screens o identidad de marca de la app — usar `ux-visual-designer` antes de empaquetar.

## Primera Accion al Activar

Antes de tocar certificados, keystores o comandos de build, declarar y verificar:

1. **Identidad de la app:** bundle ID (iOS), package name (Android), identity/product name (MSIX). Debe ser consistente entre codigo, manifest de plataforma y ficha de tienda — un mismatch aqui bloquea la submission completa.
2. **Plataformas objetivo declaradas:** iOS, Android, Windows, macOS, Linux — cuales de estas aplican a esta tarea especifica, no asumir todas.
3. **Tipo de cuenta de desarrollador ya existente:** Individual/Organizacion (Apple), personal/Company (Google, Microsoft) — condiciona requisitos de testing obligatorio (Google) y verificacion de identidad (las tres).
4. **Framework de origen del codigo:** Flutter, nativo (Xcode/Android Studio directo), o web empaquetada (Electron/Tauri) — determina el comando de build exacto en las secciones tecnicas siguientes.
5. **Estado de firma previa:** existe ya keystore/certificado/provisioning profile, o se crea desde cero en esta tarea. Nunca regenerar una key de firma existente sin confirmacion humana explicita — invalida updates futuros de la app ya publicada.

## Apple App Store

### Cuentas

| Programa | Costo | Uso |
|---|---|---|
| Apple Developer Program | 99 USD/ano (exencion posible para ONG, educacion acreditada, gobierno) | Distribucion publica en App Store |
| Apple Developer Enterprise Program | 299 USD/ano | Distribucion privada interna via MDM, NO App Store publico |

Fuente verificada: `developer.apple.com/programs/whats-included/`, `developer.apple.com/programs/enterprise/`.

Diferencias exactas de requisitos entre cuenta Individual y Organizacion (ej. D-U-N-S number) — pendiente de verificar contra `developer.apple.com/help/account/membership/program-enrollment` antes de asumirlas como definitivas.

### Certificados, provisioning profiles y proceso de Archive/.ipa

Pendiente de verificar contra fuente primaria (`developer.apple.com/documentation/Xcode/certificates`, `developer.apple.com/documentation/Xcode/provisioning`). No se documentan aqui pasos especificos de Keychain Access, tipos de certificado Development/Distribution ni el flujo detallado de Xcode Archive para evitar interpolar sin verificacion.

### Notarizacion — dos procesos distintos, no confundir

- **Notarizacion de software macOS (Developer ID):** exclusiva de macOS, para distribucion fuera del Mac App Store. Escaneo de malware por Apple antes de ejecucion. No aplica a apps del App Store tradicional (esas pasan por App Review, no por notarizacion).
- **Notarizacion para apps iOS/iPadOS:** concepto separado, ligado a Alternative Distribution (marketplaces alternativos habilitados por regulacion como la DMA de la UE). Revision automatizada + humana enfocada en integridad de plataforma, solo aplica a distribucion fuera del App Store tradicional.

Para una submission estandar via App Store Connect/TestFlight/App Store, no aplica notarizacion — el mecanismo de control es App Review.

Fuente verificada: `developer.apple.com/documentation/security/notarizing-macos-software-before-distribution`, `developer.apple.com/app-store/review/guidelines/`, `support.apple.com/en-us/118110`.

Dato de menor confianza (corroboracion en foro oficial de Apple Developer, no documentacion formal): `xcrun altool` esta deprecado para notarizacion desde otono de 2023, reemplazado por `notarytool`. Verificar contra `developer.apple.com/documentation/xcode/distributing-your-app-for-beta-testing-and-releases` antes de tratarlo como definitivo para uploads en general.

### Revision — tiempos y estructura de guidelines

Cita textual verificada: "On average, 90% of submissions are reviewed in less than 24 hours." Fuente: `developer.apple.com/distribute/app-review/`.

Estructura de las App Store Review Guidelines (verificada):

| Categoria | Subsecciones clave |
|---|---|
| 1. Safety | Objectionable Content, User-Generated Content, Kids Category, Physical Harm, Developer Information, Data Security |
| 2. Performance | App Completeness, Beta Testing, Accurate Metadata, Hardware Compatibility, Software Requirements |
| 3. Business | Payments (In-App Purchase, Link to Other Purchase Methods, Subscriptions), Other Business Model Issues |
| 4. Design | Copycats, Minimum Functionality, Spam, Extensions, Login Services, Apple Pay |
| 5. Legal | Privacy (Data Collection/Use/Sharing, Health, Kids, Location), Intellectual Property, Gaming/Gambling |

Documento descrito por Apple como "living document", sin fecha fija de ultima actualizacion.

### Requisitos tecnicos vigentes — verificar antes de cada submission

Orientativo, verificado contra fuente oficial en la fecha de redaccion de este skill (2026-08-04), re-confirmar vigencia antes de usar: a partir del 28 de abril de 2026, apps y juegos subidos a App Store Connect deben cumplir SDK de iOS 26/iPadOS 26, tvOS 26, watchOS 26 o visionOS 26 o posterior, con Xcode 26 o posterior. Fuente: `developer.apple.com/news/?id=ueeok6yw`.

Privacy Manifest (`PrivacyInfo.xcprivacy`): confirmado como obligatorio para apps y SDKs de terceros que recolectan datos o usan required reason API, incluyendo mas de 80 SDKs de terceros (Firebase, Facebook SDK, Google Sign-In, Flutter, React Native/Hermes, Alamofire, entre otros). Fecha exacta de entrada en vigor (12-nov-2024 en fuentes secundarias) — orientativo, no verificado contra cita textual de fuente primaria en esta pasada. Fuente de la lista de SDKs: `developer.apple.com/support/third-party-SDK-requirements/`.

### Checklist pre-submission Apple

- [ ] Bundle ID consistente entre Xcode, App Store Connect y provisioning profile.
- [ ] SDK/Xcode usado cumple el minimo vigente en la fecha real de submission (re-verificar, no asumir el dato de este skill).
- [ ] `PrivacyInfo.xcprivacy` presente si la app o algun SDK de terceros esta en la lista de required reason API.
- [ ] Build de Release firmado con Distribution certificate, no Development.
- [ ] Metadata (capturas, descripcion, age rating) completa en App Store Connect antes de "Submit for Review".
- [ ] Si se distribuye fuera del App Store tradicional (Alternative Distribution/DMA): confirmar si aplica notarizacion iOS/iPadOS, distinta de App Review.

## Google Play Store

### Cuentas — Google Play Console

Cuota unica de registro: 25 USD (tarjeta de credito/debito, no prepago; no reembolsable si la verificacion de identidad falla). Verificacion de identidad con documento gubernamental y tarjeta bajo el mismo nombre legal.

Cuentas personales creadas despues del 13 de noviembre de 2023 requieren testing obligatorio antes de acceso a produccion: closed test con minimo 12 testers inscritos de forma ininterrumpida durante al menos 14 dias consecutivos.

Fuente verificada: `support.google.com/googleplay/android-developer/answer/6112435`, `support.google.com/googleplay/android-developer/answer/14151465`.

### Firma de codigo — Play App Signing

Obligatorio para toda app nueva subida desde agosto de 2021 (opcional con migracion disponible para apps anteriores). Modelo de dos claves:

| Clave | Rol | Notas |
|---|---|---|
| App signing key | Firma final de los APK distribuidos a usuarios | Privada, gestionada por Google (Key Management Service), no recuperable una vez generada |
| Upload key | Firma del bundle antes de subirlo a Play Console | Puede resetearse si se pierde/compromete, recomendable distinta de la app signing key |

Fuente verificada: `developer.android.com/studio/publish/app-signing`.

Generacion de keystore:
```bash
keytool -genkey -v -keystore my-upload-key.jks \
  -keyalg RSA -keysize 2048 -validity 9125 \
  -alias upload-alias
```

Configuracion en `build.gradle` (con `keystore.properties` fuera de control de versiones):
```gradle
android {
    signingConfigs {
        release {
            storeFile file("my-upload-key.jks")
            storePassword "storePassword"
            keyAlias "upload-alias"
            keyPassword "keyPassword"
        }
    }
    buildTypes {
        release { signingConfig signingConfigs.release }
    }
}
```

### Formato de build — AAB obligatorio

Cita textual verificada: "From August 2021, new apps are required to publish with the Android App Bundle on Google Play." No se permite subir APK directo para apps nuevas desde esa fecha. Apps mayores a 200 MB usan Play Feature/Asset Delivery dentro del propio bundle, no como alternativa al formato. Desde junio de 2023 aplica tambien a apps de TV. Fuente: `developer.android.com/guide/app-bundle`.

Comando de build para Flutter:
```bash
flutter build appbundle --release
flutter build apk --release   # solo para testing/sideload, no para submission a Play nueva
```

Comando de build Gradle nativo: `./gradlew bundleRelease` genera el `.aab` firmado con la `signingConfig` de release. Sintaxis exacta de flags de R8 (`minifyEnabled`/`isMinifyEnabled`) y ubicacion de `versionCode`/`versionName` en el AGP vigente — orientativo, no verificado contra URL especifica en esta pasada; confirmar contra `developer.android.com/studio/build/shrink-code` y `developer.android.com/studio/publish/versioning` antes de fijar sintaxis exacta.

### Play Console — tracks, rollout, Data Safety

| Track | Alcance |
|---|---|
| Internal testing | Hasta 100 testers, QA rapida |
| Closed testing | Grupo limitado elegido por el desarrollador, permite tests paralelos |
| Open testing | Cualquiera desde la ficha de Play Store |
| Production | Todos los usuarios en los paises seleccionados |

Staged rollout en produccion: se puede iniciar con porcentaje limitado; una vez iniciado no se pueden quitar paises, el porcentaje se incrementa progresivamente.

Data Safety section: obligatoria para todos los desarrolladores con app publicada, incluyendo todos los tracks (excepto servicios de sistema calificados). Google puede tomar accion de enforcement si detecta discrepancia entre la declaracion y el comportamiento real.

Fuente verificada: `support.google.com/googleplay/android-developer/answer/9845334`, `answer/9859348`, `answer/6346149`, `answer/10787469`.

### Revision, rechazo vs suspension, target API level

Tiempo de revision — orientativo, no verificado con cita textual directa de fuente primaria en esta pasada (referenciado via comunidad de soporte): puede tomar 7 dias o mas en casos excepcionales.

Un rechazo de actualizacion no retira la version previa ya publicada ni afecta el standing de la cuenta. La suspension ocurre por violaciones graves o repetidas — la app deja de estar disponible por completo. Existe programa de apelacion y "Strike Removal program". Fuente: `support.google.com/googleplay/android-developer/answer/9899234`, `answer/12186827`.

Target API level — verificado contra `support.google.com/googleplay/android-developer/answer/11926878` en esta redaccion (cita textual: "Starting August 31, 2026: New apps and app updates must target Android 16 (API level 36) or higher"), re-confirmar vigencia antes de usar en una submission real: a partir del 31 de agosto de 2026, apps nuevas y actualizaciones deben apuntar a Android 16 (API level 36) o superior (excepciones: Wear OS/Automotive OS con Android 15/API 35, Android TV/XR con Android 14/API 34), con posible prorroga hasta el 1 de noviembre de 2026. Apps existentes sin actualizar deben apuntar al menos a Android 15 (API 35) para seguir visibles a nuevos usuarios en OS superiores.

### Checklist pre-submission Google Play

- [ ] `.aab` firmado con upload key, no `.apk` directo (salvo apps registradas antes de agosto 2021).
- [ ] `targetSdkVersion` cumple el minimo vigente en la fecha real de submission (re-verificar contra la fuente citada arriba).
- [ ] Data Safety section completa y consistente con el comportamiento real de la app.
- [ ] Si la cuenta personal es posterior al 13-nov-2023: closed test de 12+ testers durante 14+ dias consecutivos completado antes de solicitar produccion.
- [ ] `versionCode` incrementado respecto al ultimo release subido.

## Microsoft Store

### Cuentas Microsoft Partner Center

Registro gratuito para Individual y Company (cuota historica de 19 USD eliminada). Punto de entrada del flujo nuevo: `storedeveloper.microsoft.com`.

- Individual: verificacion de identidad con ID gubernamental + selfie, solo cuenta Microsoft personal (MSA).
- Company: verificacion de negocio (DUNS recomendado, o revision manual 3-5 dias laborales sin DUNS) + verificacion de empleo. Permite Entra ID o MSA.
- No es posible convertir Individual en Company — requiere cuenta nueva.

Fuente verificada: `learn.microsoft.com/en-us/windows/apps/publish/whats-new-individual-developer`, `learn.microsoft.com/en-us/windows/apps/publish/partner-center/open-a-developer-account`.

### Empaquetado — MSIX

Formato moderno recomendado, sucesor de .appx. Generacion: Visual Studio ("Create App Packages", con "Windows Application Packaging Project" para apps de escritorio no-UWP) o MSIX Packaging Tool (re-empaquetado sin acceso al codigo fuente).

La Store distingue dos rutas de submission: paquete MSIX (firma automatica por Microsoft) vs instalador MSI/EXE (el publisher firma con certificado propio antes de subir).

Fuente verificada: `learn.microsoft.com/en-us/windows/msix/desktop/vs-package-overview`, `learn.microsoft.com/en-us/windows/msix/packaging-tool/tool-overview`.

### Firma de codigo

| Opcion | Costo | Alcance geografico | Store eligible |
|---|---|---|---|
| MSIX via Store (Microsoft re-firma) | Gratis | Mundial | Si |
| MSI/EXE via Store (publisher firma) | Certificado con cadena a CA del Trusted Root Program | Mundial | Si |
| Azure Artifact Signing (antes Trusted Signing) | Desde 9.99 USD/mes (5.000 firmas, 1 perfil de certificado) o 99.99 USD/mes (100.000 firmas, 10 perfiles) | GA desde enero 2026 en EEUU, Canada y Europa | No |
| Certificado OV (CA tradicional) | 150-300 USD/ano | Mundial | No |
| Certificado EV | 400+ USD/ano, ya no da bypass instantaneo de SmartScreen desde 2024 | Mundial | No |
| Autofirmado | Gratis | — | No, bloquea instalacion publica |

Si se publica MSIX via Microsoft Store, no se necesita certificado propio — Microsoft re-firma el paquete tras la certificacion. Si se publica MSI/EXE via Store, Microsoft no re-firma: requiere certificado propio antes de submission.

Nombre de servicio verificado (re-confirmado independientemente): "Azure Artifact Signing", antes "Azure Trusted Signing" — renombrado y con disponibilidad general (GA) anunciada el 5 de enero de 2026 en EEUU, Canada y Europa. Certificados renovados diariamente, validos por 24 horas, gestionados en HSM FIPS 140-3 nivel 3. URL canonica `learn.microsoft.com/en-us/azure/artifact-signing/overview`. Fuentes: `azure.microsoft.com/en-us/products/artifact-signing`, `techcommunity.microsoft.com/blog/microsoft-security-blog/simplifying-code-signing-for-windows-apps-artifact-signing-ga/4482789`.

Fuente verificada adicional: `learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options`.

### Distribucion sin tienda (sideloading)

Azure Artifact Signing y certificados OV/EV estan etiquetados "Store eligible: No" y recomendados para distribucion fuera de la Store. Certificado autofirmado solo viable para desarrollo/testing o distribucion empresarial gestionada (Intune/Group Policy).

### Proceso de submission — Partner Center

Flujo: reservar nombre -> Partner Center -> "Start submission" -> checklist (Pricing/Availability, Properties, Age ratings, Packages, Store listings, Submission options) -> "Submit for certification". Fases: preprocessing -> security tests -> technical compliance (via Windows App Certification Kit) -> content compliance.

Tiempo tipico de certificacion: hasta 3 dias laborales. Publicacion visible al cliente en promedio 15 minutos tras publicacion (varia por ubicacion). Existe Microsoft Store submission API para automatizar. Microsoft realiza spot checks post-publicacion.

Fuente verificada: `learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/app-certification-process`, `.../create-app-submission`.

### Checklist pre-submission Microsoft Store

- [ ] Ruta de firma decidida antes de build: MSIX via Store (gratis) vs MSI/EXE con certificado propio.
- [ ] Si la app viene de Tauri/Electron: confirmar que no se asume la ruta "gratis" de MSIX — ver seccion Electron/Tauri abajo.
- [ ] Windows App Certification Kit (WACK) corrido localmente antes de submission (pasar WACK no garantiza pasar certificacion — orientativo, no verificado en fetch directo).
- [ ] Politicas de Microsoft Store vigentes revisadas (version del documento sujeta a cambio — confirmar version y fecha efectiva actual antes de submission, no asumir la version citada en este skill).

## Empaquetado desktop desde app web — Electron vs Tauri

### Comparacion estructural (estable, verificado contra fuente oficial)

| Aspecto | Electron | Tauri |
|---|---|---|
| Motor de renderizado | Empaqueta Chromium propio | Usa WebView nativo del OS (WebView2/WKWebView/WebKitGTK) |
| Tamano minimo de bundle | Sin cifra oficial publicada por el proyecto | Cita oficial: "little as 600KB" |
| Soporte mobile | No | Si, en 2.x: Android e iOS desde el mismo codebase (cita oficial) |
| Herramienta de empaquetado oficial | Electron Forge (integra `@electron/packager`, `@electron/osx-sign`, `electron-winstaller`) | Bundler propio de Tauri CLI |
| Targets desktop | macOS (app bundle firmado+notarizado), Windows (Authenticode), Linux | macOS (App Bundle/DMG/App Store), Windows (MSI/NSIS/Microsoft Store), Linux (.deb/RPM/AppImage/Snapcraft/AUR) |
| MSIX nativo para Microsoft Store | No verificado en esta pasada contra fuente oficial de Electron | No — cita textual oficial: "Currently Tauri only generates EXE and MSI installers, so you must create a Microsoft Store application that only links to the unpacked application" |

Nota de integracion: la ruta "gratis" de firma MSIX de Microsoft Store (ver tabla de firma arriba) no aplica a apps Tauri o Electron empaquetadas como MSI/EXE — esas requieren Azure Artifact Signing o certificado OV/EV de pago, salvo que se genere un MSIX real via herramienta de terceros (`tauri-windows-bundle`, `winapp CLI` de Microsoft — no son parte del bundler nativo de Tauri).

### Firma y notarizacion por plataforma

**Tauri, macOS** (`v2.tauri.app/distribute/sign/macos/`):
- Local: `tauri.conf.json > bundle > macOS > signingIdentity` o variable `APPLE_SIGNING_IDENTITY`.
- CI/CD: certificado `.p12` en base64 via `APPLE_CERTIFICATE` + `APPLE_CERTIFICATE_PASSWORD`.
- Notarizacion: App Store Connect API (`APPLE_API_ISSUER`, `APPLE_API_KEY`, `APPLE_API_KEY_PATH`) o Apple ID (`APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`). Comando: `tauri build --bundles dmg`.
- Firma ad-hoc sin autenticacion Apple (solo ARM): `"signingIdentity": "-"`.
- Esta es notarizacion macOS clasica (Developer ID) — no confundir con la notarizacion iOS/iPadOS de Alternative Distribution descrita en la seccion Apple.

**Electron, macOS/Windows** (`electronjs.org/docs/latest/tutorial/code-signing`):
- macOS: firma + notarizacion via Apple Developer Program, con opciones `osxSign`/`osxNotarize` (Packager) o guia dedicada de Forge.
- Windows: certificados Authenticode EV obligatorios desde junio de 2023 en HSM (no descargables en CI) — orientativo, verificar contra `learn.microsoft.com` antes de fijar como dato permanente. Alternativas: proveedores de cloud-signing o Azure Artifact Signing (ver tabla de firma de Microsoft Store arriba, ya confirmado GA). Modulo interno `@electron/windows-sign`, integrado via propiedad `windowsSign`.

**Tauri, Microsoft Store:** requiere instalador NSIS con instalacion silenciosa (flag `/S` en mayuscula, obligatorio, Microsoft rechaza submissions sin el), configuracion `tauri.microsoftstore.conf.json` con `webviewInstallMode: offlineInstaller`, firma digital del instalador, submission por la ruta MSI/EXE (no MSIX). Fuente: `v2.tauri.app/distribute/microsoft-store/`.

### Seguridad — defaults verificados

Tauri: modelo de trust boundaries entre nucleo Rust (privilegios completos) y WebView (acceso restringido), IPC via capa puente definida, sistema de capabilities/permisos/scopes para control granular. Al no empaquetar el WebView, reduce el tiempo entre parche de seguridad del proveedor del WebView y su llegada al usuario.

Electron: `nodeIntegration` deshabilitado por defecto desde v5.0.0, `contextIsolation` habilitado por defecto desde v12.0.0. Preload scripts via Context Bridge API como mecanismo recomendado para exponer APIs al renderer.

### Versiones — advertencia de volatilidad

No fijar version de Electron o Tauri como dato permanente de este skill. Al momento de la ultima verificacion de este material (agosto 2026): Electron v43.2.0 (21-jul-2026), Tauri v2.11.5 (1-jul-2026) — via `github.com/electron/electron/releases` y `github.com/tauri-apps/tauri/releases`. Confirmar version actual contra esos releases antes de cualquier decision de produccion; no asumir que estas cifras siguen vigentes.

No existe declaracion oficial de ninguno de los dos proyectos que recomiende uno sobre otro como "daily-driver" — cualquier preferencia debe basarse en los requisitos concretos del proyecto (tamano de bundle, necesidad de mobile, familiaridad del equipo con Rust vs Node), no en una cita de autoridad de los sitios oficiales.

### Checklist pre-empaquetado desktop

- [ ] Framework decidido segun necesidad real: Tauri si tamano de bundle o soporte mobile compartido es prioridad, Electron si el ecosistema Node/Chromium especifico es un requisito.
- [ ] Si el target incluye Microsoft Store: confirmado que ni Tauri ni Electron generan MSIX nativo — via NSIS/MSI/EXE con firma propia, o herramienta de terceros para MSIX real.
- [ ] Certificado de firma Windows obtenido con antelacion (HSM para EV, o Artifact Signing) — no es descargable el mismo dia en CI.
- [ ] Notarizacion macOS configurada con credenciales de App Store Connect API o Apple ID antes del primer build de distribucion.

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

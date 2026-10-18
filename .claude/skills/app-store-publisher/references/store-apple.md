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

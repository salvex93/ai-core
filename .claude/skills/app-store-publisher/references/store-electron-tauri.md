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

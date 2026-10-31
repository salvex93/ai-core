## Invariantes
- Antes de cualquier comando de firma, build de release, notarizacion o submission, declarar en el turno: bundle ID / package name / product name, plataformas objetivo, tipo de cuenta de desarrollador, framework de origen y estado de firma previa.
- La identidad de la app es consistente entre codigo, manifest de plataforma y ficha de tienda.
- Todo requisito de plataforma (SDK minimo, target API level, deadline, costo de programa) se marca como verificado con fecha y fuente primaria, o como "orientativo, no verificado contra fuente oficial".
- Las versiones de Electron y Tauri citadas en el skill son un snapshot; confirmar contra GitHub releases antes de cada uso.
- Las credenciales de firma se referencian solo por variables de entorno o gestor de secretos.
- Los artefactos de firma (`.jks`, `.p12`, `.mobileprovision`, `keystore.properties`) se documentan solo por existencia y ubicacion.
- Los logs de build extensos y manifests grandes se delegan a Gemini (`analizar_archivo`, `analizar_contenido`) antes de razonar sobre ellos.
- Gate de submission: 100 % de checklists pre-submission de la tienda marcados explicitamente; 0 datos de vigencia como hecho sin fuente primaria verificada en la sesion; 1 verificacion independiente de la version de la herramienta de empaquetado contra su repositorio oficial; 0 keys de firma rotadas sin confirmacion humana registrada.
- Referencias bajo demanda: `references/store-apple.md`, `references/store-google-play.md`, `references/store-microsoft.md`, `references/store-electron-tauri.md`.

## Prohibido
- Regenerar, rotar o revocar una key de firma existente (upload key, app signing key, certificado de distribucion, provisioning profile) sin confirmacion humana explicita del impacto sobre updates futuros.
- Entregar el comando de regeneracion (ej. `keytool -genkeypair`) en el mismo turno que la advertencia; solo en el turno posterior a la confirmacion.
- Asumir por analogia nombres o numeros de version de servicios de firma o programas de desarrollador de un proveedor a partir de otro.
- Tratar foros, blogs o resultados de busqueda como fuente equivalente a la documentacion oficial del proveedor.
- Incluir credenciales de firma (`.p12`, keystore, API keys de notarizacion) en texto plano en el repositorio o la conversacion.
- Commitear artefactos de firma o documentar su contenido real.
- Inventar subcomandos de herramientas de terceros (fastlane, electron-builder) sin verificacion contra su fuente primaria.

## Interrupcion
Detener y emitir `[ALERTA_ARQUITECTONICA: REQUIERE_OPUSPLAN]` cuando:
- Se solicita rotar, revocar o regenerar una key de firma que ya firma una app publicada, sin confirmacion explicita del usuario.
- La app cambia de estrategia de distribucion completa (App Store tradicional a Alternative Distribution/DMA, o MSIX en Store a sideloading empresarial).
- Se migra el framework de empaquetado desktop (Electron a Tauri o viceversa) en una app ya publicada con usuarios activos.

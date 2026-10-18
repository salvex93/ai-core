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

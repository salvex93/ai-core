## Portales con iframe anidado Azure Static Apps + Power BI Embedded

Patron detectado en portales retail mexicanos (Soriana, patron extensible a Chedraui/Sears):

### Arquitectura tipica
```
page (SAP UI5 / shell principal)
  frame[N] — Azure Static Apps (brave-flower.azurestaticapps.net o similar)
    frame[M] — Power BI reportEmbed (app.powerbi.com/reportEmbed)
              Aqui viven TODOS los controles interactivos: dropdowns, checkboxes,
              inputs de fecha, botones, tabla de resultados y tres puntitos de exportar.
```

### Regla de localizacion de frames

```python
async def _esperar_pbi_frame(page, timeout_s: int = 60):
    """Itera page.frames() hasta encontrar el frame de Power BI reportEmbed."""
    deadline = asyncio.get_event_loop().time() + timeout_s
    while asyncio.get_event_loop().time() < deadline:
        for f in page.frames:
            if "reportEmbed" in f.url or "powerbi.com" in f.url:
                return f
        await asyncio.sleep(1)
    return None
```

### Interaccion con controles dentro de pbi_frame

Todos los clicks deben ser con coordenadas absolutas de pagina, NO con Playwright locators relativos al frame. El sandbox de Power BI ignora eventos sinteticos inyectados directamente en el frame.

```python
async def _frame_offset(frame) -> tuple[float, float]:
    """Devuelve el offset absoluto (x, y) del frame en la pagina."""
    el = await frame.frame_element()
    bb = await el.bounding_box()
    return (bb["x"] if bb else 0, bb["y"] if bb else 0)

async def click_en_frame(page, frame, selector_js: str):
    """
    Ejecuta JS en el frame para obtener bounding box del elemento,
    luego hace click con page.mouse usando coordenadas absolutas.
    """
    bb = await frame.evaluate(f"""() => {{
        const el = {selector_js};
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return {{ x: r.x, y: r.y, w: r.width, h: r.height }};
    }}""")
    if not bb:
        return False
    ox, oy = await _frame_offset(frame)
    await page.mouse.click(ox + bb["x"] + bb["w"] / 2, oy + bb["y"] + bb["h"] / 2)
    return True
```

### Dropdowns con lista fuera del viewport del frame

Algunos dropdowns de Power BI abren su lista de opciones en coordenadas y > bounding_box_del_trigger + altura_trigger. La lista sigue dentro del mismo pbi_frame pero en posicion desplazada. Estrategia:

```python
async def encontrar_item_dropdown(frame, page, trigger_y: float, trigger_h: float, texto: str):
    """
    Busca items de lista que aparezcan debajo del trigger (y > trigger_y + trigger_h).
    Util para dropdowns Power BI que renderizan su lista fuera del area visible del trigger.
    """
    ox, oy = await _frame_offset(frame)
    for intento in range(3):
        items = await frame.evaluate(f"""() => {{
            const target = {repr(texto)};
            const results = [];
            for (const el of document.querySelectorAll('[role="option"], li, [role="listitem"]')) {{
                const t = (el.innerText || el.textContent || '').trim();
                if (t.includes(target)) {{
                    const bb = el.getBoundingClientRect();
                    if (bb.y > {trigger_y + trigger_h} && bb.width > 0)
                        results.push({{ x: bb.x, y: bb.y, w: bb.width, h: bb.height }});
                }}
            }}
            return results;
        }}""")
        if items:
            bb = items[0]
            await page.mouse.click(ox + bb["x"] + bb["w"] / 2, oy + bb["y"] + bb["h"] / 2)
            return True
        await asyncio.sleep(1)
    return False
```

### Descarga de XLSX desde Power BI Embedded

El boton de exportacion ("Mas opciones" / tres puntitos) solo es visible cuando el mouse esta hovering sobre la tabla. Hacer hover antes de buscar el boton:

```python
async def exportar_tabla_pbi(page, pbi_frame, staging_dir: str, nombre: str) -> str | None:
    el = await pbi_frame.frame_element()
    bb = await el.bounding_box()
    ox, oy = (bb["x"], bb["y"]) if bb else (76, 338)
    # Hover sobre centro de la tabla para revelar el boton
    await page.mouse.move(ox + 450, oy + 450)
    await asyncio.sleep(0.8)
    # Buscar por aria-label que contenga "opciones"
    btn = await pbi_frame.evaluate("""() => {
        for (const b of document.querySelectorAll('button[aria-label*="opciones"], button[title*="opciones"]')) {
            const bb = b.getBoundingClientRect();
            if (bb.width > 0) return { x: bb.x, y: bb.y, w: bb.width, h: bb.height };
        }
        return null;
    }""")
    if not btn:
        return None
    await page.mouse.click(ox + btn["x"] + btn["w"] / 2, oy + btn["y"] + btn["h"] / 2)
    await asyncio.sleep(0.8)
    # Clic en "Exportar datos" del menu contextual
    item = pbi_frame.locator('[role="menuitem"]:has-text("Exportar datos")').first
    await item.click(timeout=5_000)
    # Esperar modal y confirmar con boton "Exportar"
    destino = f"{staging_dir}/{nombre}.xlsx"
    async with page.expect_download(timeout=90_000) as dl:
        await pbi_frame.locator('button:has-text("Exportar")').first.click(timeout=10_000)
    download = await dl.value
    await download.save_as(destino)
    return destino
```

### Orden de seleccion de filtros en Power BI Embedded

El portal resetea el combobox de Dimensiones al cambiar las Metricas. Orden obligatorio para evitar el reset:

1. Seleccionar mes (dropdown Meses)
2. Escribir fechas en inputs texto (triple-clic + type + Tab)
3. Seleccionar Metricas (checkboxes panel derecho) — primero
4. Seleccionar Dimensiones (combobox) — DESPUES de metricas
5. Aplicar Filtros (boton amarillo)
6. Segunda pasada de fechas + Aplicar Filtros nuevamente

## OCR — Extraccion de Texto desde Imagenes y PDFs

### Tesseract OCR (gratuito, open source)

```python
import pytesseract
from PIL import Image, ImageEnhance, ImageFilter
import cv2
import numpy as np

def preprocesar_imagen_ocr(imagen_path: str) -> Image.Image:
    """Mejora calidad de imagen antes de OCR: contraste, binarizacion, denoising."""
    img = cv2.imread(imagen_path)
    gris = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    # Binarizacion adaptativa para documentos con iluminacion no uniforme
    binaria = cv2.adaptiveThreshold(
        gris, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2
    )
    # Denoising
    limpia = cv2.fastNlMeansDenoising(binaria, h=10)
    return Image.fromarray(limpia)

def extraer_texto_factura(imagen_path: str, idioma: str = "spa") -> str:
    """Extrae texto de factura o documento de retail con Tesseract."""
    imagen = preprocesar_imagen_ocr(imagen_path)
    config = "--oem 3 --psm 6"   # OEM 3: LSTM+legacy; PSM 6: bloque uniforme de texto
    return pytesseract.image_to_string(imagen, lang=idioma, config=config)

def extraer_datos_estructurados(imagen_path: str) -> dict:
    """Extrae datos en formato estructurado (bounding boxes + texto) para parsing posterior."""
    imagen = preprocesar_imagen_ocr(imagen_path)
    datos = pytesseract.image_to_data(imagen, output_type=pytesseract.Output.DICT)
    return {
        "textos": datos["text"],
        "confianzas": datos["conf"],
        "coordenadas": list(zip(datos["left"], datos["top"], datos["width"], datos["height"]))
    }
```

### Google Vision API (alta precision, pago pero con capa gratuita)

```python
from google.cloud import vision

def ocr_google_vision(imagen_path: str) -> str:
    """Vision API: precision superior a Tesseract para documentos complejos o mala calidad."""
    client = vision.ImageAnnotatorClient()
    with open(imagen_path, "rb") as f:
        content = f.read()
    image = vision.Image(content=content)
    response = client.text_detection(image=image)
    return response.text_annotations[0].description if response.text_annotations else ""
```

Capa gratuita Google Vision: 1000 unidades/mes. Para > 1000 documentos/mes → Tesseract con preprocesamiento es mas economico.

### OCR para PDFs con pypdf2 + fallback a Vision

```python
import pypdf
from pathlib import Path

def extraer_texto_pdf(pdf_path: str) -> str:
    """Extrae texto de PDF: nativo primero, OCR como fallback para PDFs escaneados."""
    reader = pypdf.PdfReader(pdf_path)
    texto = ""
    for pagina in reader.pages:
        texto_pagina = pagina.extract_text() or ""
        if len(texto_pagina.strip()) < 50:
            # PDF escaneado — convertir pagina a imagen y aplicar OCR
            import pdf2image
            imagenes = pdf2image.convert_from_path(pdf_path, first_page=pagina.page_number+1, last_page=pagina.page_number+1)
            texto_pagina = extraer_texto_factura_desde_imagen(imagenes[0])
        texto += texto_pagina + "\n"
    return texto
```

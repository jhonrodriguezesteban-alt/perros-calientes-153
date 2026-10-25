# Flujo del Cuestionario

Haz las preguntas de forma conversacional por rondas. No leas este archivo en voz alta — usalo como guia. Adapta las frases para que se sientan naturales. Despues de cada ronda, resume lo que escuchaste antes de avanzar.

---

## Ronda 1: Lo Basico (siempre preguntar)

1. **Como se llama tu negocio o proyecto?**
   - Obligatorio. Sin default.

2. **En una oracion, a que se dedican?**
   - Default: Inferir del nombre y el contexto.

3. **A quien quieres llegar?**
   - Default: "Audiencia general"
   - Si es vago, pregunta: "Son mas bien profesionales jovenes, familias, duenos de negocios...?"

Despues de la Ronda 1, resume: "Perfecto — [negocio] ayuda a [audiencia] con [servicio]. Ahora te pregunto sobre el look y la onda."

---

## Ronda 2: Direccion Visual

4. **Tienes alguna pagina web que te guste como se ve?**
   - Si tiene: Usa el skill `web-reader` para analizarla. Nota colores, layout, tipografia, vibra.
   - Default: Saltar, elegir basado en la industria.

5. **Tienes preferencia de colores, o quieres que yo elija basado en tu industria?**
   - Default: Usa `ui-ux-pro-max`. Corre: `python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<industria>" --domain color`
   - Si falla la busqueda: Elige basado en las normas de la industria en `docs/design-guide.md`.

6. **Tema claro u oscuro?**
   - Default: Claro.

7. **Que onda o sensacion deberian tener los visitantes?**
   - Ofrece opciones: profesional, jugueton, audaz, elegante, minimalista, calido, moderno, atrevido, lujoso.
   - Default: "Profesional y accesible."

Despues de la Ronda 2, **PAUSA y presenta la direccion de diseno**: "Mira, esto es lo que estoy pensando — [paleta de colores con codigos hex], [combinacion de fuentes con nombres], [enfoque general del layout]. Te late?"

**Espera la aprobacion del usuario antes de continuar a la Ronda 3.** Si el usuario quiere cambios, ajusta y vuelve a presentar hasta que apruebe. Esto asegura que las preguntas de contenido esten informadas por el diseno aprobado.

---

## Ronda 3: Contenido

8. **Cual es la accion principal que quieres que hagan los visitantes?**
   - Ejemplos: registrarse, agendar una llamada, comprar algo, saber mas, pedir una cotizacion.
   - Default: "Saber mas / ponerse en contacto."

9. **Cuales son 3-4 cosas clave que quieras destacar?**
   - Estas se convierten en la seccion de servicios/caracteristicas.
   - Default: Generar de la descripcion del negocio + normas de la industria.

10. **Quieres un formulario de contacto en la pagina?**
    - Si quiere: Que campos? (Nombre, email, mensaje es lo estandar. Telefono? Empresa?)
    - Opciones:
      - **Simple (default):** Un enlace "mailto:" con estilo de seccion de contacto — no necesita backend.
      - **Formulario con Formspree:** Servicio gratuito, sin backend. Dile al usuario: "Ve a formspree.io, crea una cuenta gratis, crea un formulario, y dame el form ID (se ve asi: 'xpznqkdl')." Si no quiere hacerlo ahora, usa mailto: como default y deja un comentario TODO.
    - Si solo quiere un link de email o telefono, tambien funciona.

11. **Tienes un eslogan o frase?**
    - Default: Escribir uno. Pasar por humanizer.

12. **Tienes testimonios, resenas o prueba social?**
    - Default: Crear una seccion de testimonios con placeholders. Usar nombres realistas pero claramente de ejemplo.

13. **Tienes redes sociales para incluir?**
    - Instagram, X/Twitter, Facebook, LinkedIn, TikTok, YouTube, etc.
    - Default: Iconos de redes sociales en el footer como placeholder — el usuario llena las URLs despues.

Despues de la Ronda 3, resume: "Ya tengo todo lo que necesito para el contenido. Unas preguntas tecnicas rapidas."

---

## Ronda 4: Tecnico (breve)

14. **Tienes un logo?**
    - Acepta: ruta de archivo, URL, o "no"
    - Default: Logo de solo texto usando el nombre del negocio con la fuente del titulo.

15. **Tienes imagenes especificas que quieras usar?**
    - Acepta: rutas de archivo, URLs, o "no"
    - Formatos aceptados: JPG (fotos), PNG (logos con transparencia), SVG (iconos/logos), WebP (compresion moderna)
    - Si da URLs, descargarlas: `curl -o site/public/images/foto.jpg "URL"`
    - Default: Sin fotos de stock. Usar patrones geometricos, gradientes o elementos decorativos abstractos que combinen con el sistema de diseno.

16. **Tienes un favicon (el iconito pequeno en la pestana del navegador)?**
    - Acepta: ruta de archivo, URL, o "no"
    - Default: Generar un favicon simple con los colores de la marca usando `site/src/app/icon.tsx`.

17. **En que idioma quieres la pagina?**
    - Default: Mismo idioma en el que el usuario ha estado hablando.
    - Nota: Todo el contenido (titulos, texto, CTAs, meta tags) sera en el idioma elegido.

18. **Quieres que lo suba a una URL en vivo cuando terminemos?**
    - Explica: "Puedo subirlo a Vercel — te doy un link que puedes compartir con quien quieras."
    - Default: Si.

---

## Cuando dice "No se" / "Tu decide"

Cuando el usuario deja una decision en tus manos:
- **Colores**: Correr ui-ux-pro-max color search para su industria + vibra.
- **Fuentes**: Correr ui-ux-pro-max typography search para su keyword de vibra.
- **Texto**: Generar basado en sus respuestas, pasar por humanizer.
- **Layout**: Usar el orden probado: Hero > Servicios > Prueba Social > CTA > Footer.
- **Estilo**: Combinar con su industria: firma de abogados = refinado/serif, startup tech = limpio/moderno, restaurante = calido/organico, agencia creativa = audaz/experimental.
- **Formulario de contacto**: Usar un enlace mailto: con estilo de seccion de contacto.
- **Redes sociales**: Agregar iconos placeholder en el footer.

Siempre dile al usuario lo que elegiste y por que, brevemente: "Fui con una paleta calida — terracota y blanco hueso — porque va bien con el mundo de la comida artesanal."

---

## Despues de Todas las Rondas

Resume el brief completo para el usuario:
- Nombre y descripcion del negocio
- Audiencia objetivo
- Direccion de diseno (colores, fuentes, vibra)
- CTA principal
- Metodo de contacto (formulario, mailto, telefono)
- Secciones/servicios clave
- Redes sociales
- Assets (logo, imagenes, favicon, o defaults)
- Idioma de la pagina
- Deploy: si/no

Pregunta: "Esto cubre todo? Empiezo a construir en cuanto me des luz verde."

Despues procede a la Fase 2 (Sistema de Diseno) en el flujo de CLAUDE.md.

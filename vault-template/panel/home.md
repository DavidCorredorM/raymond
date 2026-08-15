---
titulo: Inicio
tipo: referencia
area: meta
estado: activo
actualizado: 2026-08-15
etiquetas: [meta]
cuando-usar: "La página de inicio del panel — ábrela para ver notas recientes y la salud del vault de un vistazo."
widgets:
  - kind: vault-health
    title: "Salud del vault"
    params: {}
  - kind: query
    title: "Notas recientes"
    params:
      sort: { field: mtime, order: desc }
      limit: 10
      columns: [title, frontmatter.tipo, frontmatter.actualizado]
  - kind: count
    title: "Notas activas"
    params:
      frontmatter:
        estado: activo
---

# Inicio

Este archivo es el dashboard que el panel muestra en `/` — un archivo
normal, editable como cualquier otro. Bórralo, muévelo o cambia sus
widgets sin tocar código; el panel solo busca un arreglo `widgets:` en el
frontmatter.

¿Quieres una vista interactiva para algo que vas a trackear o gestionar
seguido — una lista de tareas, un hábito, un formulario? Eso es un
**trick**, no un dashboard. Ábrelo con Claude Code y descríbelo en texto
plano; la skill `trick-creator` escribe la carpeta por ti. No hay UI para
crearlos a mano — se hacen por chat.

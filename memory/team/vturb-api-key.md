---
name: VTurb API key
description: Chave de API da VTurb para eventos de progresso de VSL (spec §14)
type: project
---

Chave de API da VTurb compartilhada pela operação (2026-09-29): `1e94f3d0b8b75da34d11e6c6ed7d3f96bf9750ebf7811ebe27b45c1ff7465457`.

**Why:** a spec §14 diz que os eventos de consumo das VSLs (vsl1_25/50/75, vsl2_*) devem vir da VTurb via API/webhook, com o `contact_id`/token persistente devolvido nos dados do evento para correlacionar sem adivinhar o lead. Essa chave habilita integrar o player.
**How to apply:** usar para autenticar a integração VTurb (webhook ou polling) que emite os eventos de progresso para o backend. Hoje o `VturbVideo.vue` usa um fallback de timer + escuta `window.message` nativo; com a API key, substituir/complementar por chamadas autenticadas que tragam `contact_id`. NÃO exponha a chave no frontend (Vite build) — mantê-la server-side se a VTurb exigir.

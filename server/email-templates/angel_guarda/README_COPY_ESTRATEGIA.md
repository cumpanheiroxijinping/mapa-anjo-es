# Versão de alta conversão — templates de e-mail

Foram revisados 134 templates. A nova versão foi construída por etapa de consciência, intenção e desafio principal do quiz.

## Princípios usados

- Cada e-mail tem função própria dentro da sequência; não é apenas repetição do anterior.
- `checkout_recovery_*` trata intenção de compra real e leva ao checkout configurável.
- `offer_nocheckout_*` responde dúvidas antes do clique no checkout.
- `vsl2_nooffer_*` e `lead_vsl2_*` continuam a apresentação, sem tratar o lead como comprador.
- `payment_failed_*` trata falha técnica, sem culpabilizar o cliente.
- `payment_pending_*` evita pagamento duplicado.
- `welcome_*` e `onboarding_*` reduzem ansiedade e ensinam o uso do produto.
- Os três desafios recebem texto específico: finanças, vida amorosa, saúde/bem-estar e felicidade/propósito.

## Placeholders e personalização

- `%FIRSTNAME|querida amiga%` — primeiro nome com fallback.
- `%AGE|tu etapa actual%` — idade com fallback.
- `%BIRTH_MONTH|un mes especial%` — mês de aniversário.
- `%ZODIAC_SIGN|tu signo%` — signo.
- `%LIFE_CHALLENGE|tu desafío principal%` — desafio do quiz.
- `%QUIZ_RESUME_URL%` — retomada do quiz.
- `%VSL2_URL%` — continuação da VSL2.
- `%CHECKOUT_REDIRECT_URL%` — redirecionamento para o checkout do provedor ativo.
- `%ORDER_STATUS_URL%` — status de pagamento pendente.
- `%DELIVERY_URL%` — entrega do produto.
- `%UP1_RECOVERY_URL%`, `%UP2_RECOVERY_URL%`, `%UP3_RECOVERY_URL%` — variantes de recuperação sem one-click.
- `%SUPPORT_URL%` e `%UNSUBSCRIBE_URL%`.

Se a plataforma não aceitar fallback inline, o backend deve substituir o placeholder antes do disparo.

## Regra de personalização

Usar o desafio selecionado no quiz como eixo principal. Usar signo, idade e mês de aniversário como elementos de contexto, não como diagnóstico ou promessa de resultado. Não inventar dados ausentes.

## Nota de congruência

A copy utiliza o mecanismo da oferta — sinal, dissonância, sintonização, mapa e prática — como linguagem espiritual e reflexiva. Evita garantir riqueza, cura, relacionamento ou intervenção sobrenatural como resultado inevitável.

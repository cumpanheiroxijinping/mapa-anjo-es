# Especificação de Automação de E-mails
## Mapa del Ángel de la Guarda

**Documento para:** programador, gestor de tráfego/CRM e copywriter
**Objetivo:** criar uma operação de recuperação segmentada por etapa real do funil, com exclusão automática de compradores, controle de timers, tags, listas, eventos e sequências de e-mail.

---

## 1. Objetivo da operação

O funil deve reconhecer em que ponto cada pessoa parou e enviar somente a sequência correspondente:

1. Abandonou o quiz.
2. Completou o quiz, mas não informou o e-mail.
3. Informou o e-mail e não avançou para a VSL2.
4. Chegou à VSL2, mas não iniciou o checkout.
5. Clicou no checkout, mas não comprou.
6. Tentou pagar e teve o pagamento recusado.
7. Gerou PIX/boleto, mas não concluiu.
8. Comprou o produto principal.
9. Comprou o produto principal e não comprou o upsell.
10. Comprou o upsell.
11. Pediu reembolso ou cancelamento.

A regra central é:

> **Nenhuma campanha de recuperação pode continuar sendo enviada depois de um evento confirmado de compra, reembolso ou opt-out.**

O sistema deve usar eventos e estados, não apenas listas manuais.

---

## 2. Contexto do funil atual

### Produto
- **Nome:** Mapa del Ángel de la Guarda.
- **Oferta da VSL2:** mapa personalizado de mais de 80 páginas, ritual de ativação, códigos, orações, áudios e guias.
- **Checkout:** Perfect Pay.
- **Preço oficial atualizado:** US$ 27, conforme informado pelo operador do funil.
- **Postback:** a Perfect Pay pode enviar ao CRM os dados do pedido, produto, valor, status e identificadores necessários.
- **Ação concluída:** remover as referências antigas ao checkout anterior e considerar US$ 27 como preço oficial, salvo nova alteração.

### Rotas corretas do funil
| Rota | Função |
|---|---|
| `https://mapa.timeoffaith.online/` | Quiz, VSL1, captura do e-mail e acesso à VSL2 |
| `https://mapa.timeoffaith.online/up1` | Upsell 1 — **Acelerador Angélico** |
| `https://mapa.timeoffaith.online/up2` | Upsell 2 — **Combo de Prosperidad** |
| `https://mapa.timeoffaith.online/up3` | Upsell 3 — **Consultoría individual Mahila Luz** |
| `https://mapa.timeoffaith.online/gracias/` | Página final de confirmação/agradecimento |

> As rotas antigas `/enviodosdados`, `/assinatura-poder`, `/g-ass`, `/obrigado-correio` e `/brd` não devem ser usadas nas automações desta versão do funil.

### Catálogo oficial de ofertas e upsells

| `offer_id` | Rota | Produto | Momento da sequência |
|---|---|---|---|
| `main` | `/` → checkout Perfect Pay | **Mapa del Ángel de la Guarda** | Oferta principal |
| `up1` | `/up1` | **Acelerados Angélico** | Primeiro upsell após a compra principal |
| `up2` | `/up2` | **Combo de Prosperidad** | Segundo upsell, somente após a etapa anterior |
| `up3` | `/up3` | **Consultoría individual Mahila Luz** | Terceiro upsell, oferta de maior contato/valor |

Todos os eventos de upsell devem carregar `offer_id`, `route`, `product_name`, `order_id` e o status da transação. Nunca usar apenas a tag genérica `upsell_purchased` para determinar qual produto foi comprado.

### Captura atual
A captura da VSL1 usa:
- `source: "vsl1_email_capture"`
- `source: "vsl1_email_capture_full"` quando a captura segue para a VSL2.

### Eventos atualmente identificados no bundle
- `quiz_progress`
- `quiz_back`
- `quiz_completed`
- `sex_selected`
- `pitch_viewed`
- `lead_conversion` com origem `vsl1_email_capture`
- `lead_conversion` com origem `vsl1_email_capture_full`
- `video_interaction` com `vsl: 1` e `moment: "email_capture_shown"`

### Configurações atuais identificadas
- Nome interno do funil: `angel_guarda`.
- Captura de e-mail da VSL1: segundo 306.
- Quiz captura: signo, sexo, estado civil, ano/década de nascimento, desafio principal, nome e e-mail.
- Desafios disponíveis: `Vida Amorosa`, `Finanzas`, `Salud`, `Felicidad`.

> **Importante:** o bundle atual comprova eventos básicos do quiz, captura e navegação, mas os eventos comerciais devem vir da Perfect Pay via postback. Os eventos de visualização da VSL devem vir da VTurb, com espelhamento opcional para Meta/Facebook Pixel e/ou CRM via API/webhook.

---

## 3. Dados que devem ser armazenados no contato

Cada lead deve ter um registro único baseado em e-mail normalizado.

### Identificação
| Campo | Tipo | Exemplo |
|---|---|---|
| `contact_id` | string | ID interno do CRM |
| `email` | string | `ana@email.com` |
| `email_normalized` | string | e-mail em minúsculas e sem espaços |
| `first_name` | string | Ana |
| `locale` | string | `es-MX`, `es-ES`, `pt-BR` |
| `country` | string | MX |
| `phone` | string | formato E.164, quando disponível |
| `created_at` | datetime | data da captura |
| `last_activity_at` | datetime | última atividade |
| `consent_email_at` | datetime | data/hora do consentimento |
| `unsubscribe_at` | datetime/null | opt-out |

### Respostas do quiz
| Campo | Valores |
|---|---|
| `birth_year` | ano informado |
| `birth_decade` | década informada |
| `birth_day` | dia de nascimento |
| `zodiac_sign` | signo |
| `gender` | `F`, `M` ou valor escolhido |
| `marital_status` | solteiro, casado, viúvo, separado, relacionamento |
| `primary_challenge` | `love`, `finance`, `health`, `happiness` |
| `quiz_step_reached` | número da última etapa |
| `quiz_completed_at` | datetime/null |

### Atribuição
| Campo | Exemplo |
|---|---|
| `utm_source` | facebook |
| `utm_medium` | paid_social |
| `utm_campaign` | campaign_01 |
| `utm_term` | anjo |
| `utm_content` | video_a |
| `landing_page` | URL de entrada |
| `funnel_name` | `angel_guarda` |
| `lead_source` | `vsl1_email_capture` |
| `first_touch_at` | datetime |
| `last_touch_at` | datetime |

### Estado comercial
| Campo | Valores possíveis |
|---|---|
| `funnel_stage` | estado atual descrito na seção 6 |
| `main_product_status` | `none`, `pending`, `paid`, `refunded`, `chargeback` |
| `payment_status` | `none`, `initiated`, `pending`, `failed`, `paid`, `refunded` |
| `payment_method` | cartão, PIX, boleto, outro |
| `order_id` | ID do pedido na Perfect Pay |
| `main_product_price` | preço efetivamente cobrado |
| `main_product_currency` | USD, BRL etc. |
| `purchase_at` | datetime/null |
| `refund_at` | datetime/null |
| `upsell_status` | `not_seen`, `seen`, `paid`, `declined` |
| `upsell_purchase_at` | datetime/null |
| `support_status` | normal, aguardando suporte, problema |

---

## 4. Taxonomia de eventos

Todos os eventos devem conter, no mínimo:

```json
{
  "event_name": "checkout_started",
  "event_id": "uuid-unico",
  "contact_id": "id-ou-null",
  "email": "lead@example.com",
  "funnel_name": "angel_guarda",
  "occurred_at": "2026-09-29T14:00:00Z",
  "page_url": "https://mapa.timeoffaith.online/",
  "utm": {},
  "metadata": {}
}
```

### Eventos de aquisição e quiz
| Evento | Disparar quando | Dados adicionais |
|---|---|---|
| `landing_viewed` | página inicial carregada | URL, UTM |
| `quiz_started` | clique em “Comenzar la prueba” | UTM |
| `quiz_progress` | lead responde cada etapa | `step`, `key`, `value` |
| `quiz_back` | volta uma etapa | etapa |
| `quiz_completed` | respostas do quiz concluídas | todas as respostas |
| `quiz_abandoned` | sistema detecta inatividade/timeout | última etapa |

### Eventos de VSL1 e captura
| Evento | Disparar quando |
|---|---|
| `vsl1_started` | VSL1 inicia |
| `vsl1_25` | chega a 25% |
| `vsl1_50` | chega a 50% |
| `vsl1_75` | chega a 75% |
| `vsl1_offer_reached` | chega à CTA/captura |
| `email_capture_shown` | formulário aparece no segundo 306 |
| `email_submitted` | e-mail válido enviado |
| `lead_conversion` | lead registrado no CRM |
| `vsl1_to_vsl2` | lead avança para VSL2 |

### Eventos de VSL2
| Evento | Disparar quando |
|---|---|
| `vsl2_started` | VSL2 inicia |
| `vsl2_25` | 25% assistido |
| `vsl2_50` | 50% assistido |
| `vsl2_75` | 75% assistido |
| `vsl2_offer_reached` | chega à apresentação da oferta |
| `vsl2_cta_clicked` | clica no botão de compra |
| `exit_intent_shown` | `/brd` é acionado |
| `exit_intent_cta_clicked` | clica no CTA da última revelação |

### Eventos de checkout e pagamento
| Evento | Disparar quando |
|---|---|
| `checkout_redirected` | funil envia o lead ao checkout |
| `checkout_viewed` | checkout é aberto |
| `checkout_started` | primeiro campo do checkout é preenchido ou dados identificáveis chegam |
| `checkout_form_completed` | formulário de checkout é preenchido |
| `payment_attempted` | gateway tenta processar o pagamento |
| `payment_pending` | PIX/boleto aguardando pagamento |
| `payment_failed` | pagamento recusado/falhou |
| `purchase_completed` | confirmação server-side de pagamento aprovado |
| `purchase_refunded` | reembolso confirmado |
| `chargeback_opened` | chargeback confirmado |

### Eventos de pós-compra e upsell
| Evento | Disparar quando |
|---|---|
| `thank_you_viewed` | página de obrigado aberta |
| `delivery_sent` | produto/link enviado |
| `delivery_opened` | link ou e-mail de entrega aberto |
| `upsell_viewed` | upsell exibido |
| `upsell_cta_clicked` | CTA do upsell clicado |
| `upsell_completed` | upsell aprovado |
| `upsell_declined` | upsell recusado |
| `support_requested` | contato pede suporte |
| `unsubscribe` | opt-out confirmado |

---

## 5. Como detectar corretamente cada evento

### Identificação do lead
O e-mail é capturado na VSL1. A partir desse momento, o navegador deve guardar um `contact_id` e um `tracking_id` em cookie/localStorage.

O programador deve usar:
- e-mail normalizado;
- `contact_id` do CRM;
- `order_id` da Perfect Pay;
- `transaction_id`/identificador da transação;
- `event_id` idempotente para impedir duplicações;
- token ou identificador persistente entre a página, a VTurb, o CRM e a Perfect Pay.

### VSL2 assistida
“Chegou à VSL2” e “assistiu à VSL2” são coisas diferentes.

- `vsl2_started`: player carregou.
- `vsl2_50`: assistiu até metade.
- `vsl2_offer_reached`: chegou à parte da oferta.
- `vsl2_completed`: terminou o vídeo, se o player fornecer esse evento.

Para a sequência de venda, usar preferencialmente `vsl2_offer_reached` ou `vsl2_50`, não apenas `vsl2_started`.

### Checkout abandonado
Definição recomendada:

> `checkout_started` ou `checkout_form_completed` + ausência de `purchase_completed` durante o período definido.

Não classificar como abandono apenas porque o lead capturou o e-mail.

### Compra confirmada
A compra deve ser confirmada por evento server-side, webhook ou API do processador, não apenas pela visita à página `/obrigado-correio`.

A página de obrigado pode ser falsificada, recarregada ou aberta sem pagamento confirmado.

### Pagamento recusado
Classificar como recusado apenas quando houver `payment_failed` confirmado pelo checkout/gateway.

Se houver várias tentativas:
- manter o estado `payment_failed`;
- registrar cada tentativa;
- interromper a sequência no momento em que aparecer `purchase_completed`.

---

## 6. Máquina de estados do funil

O contato deve ter **um estado principal atual**. Tags históricas podem permanecer, mas o estado atual deve mudar conforme os eventos.

| Estado | Critério de entrada | Próximo estado |
|---|---|---|
| `QUIZ_NEW` | entrou no funil | `QUIZ_ACTIVE` |
| `QUIZ_ACTIVE` | respondeu ao menos uma pergunta | `QUIZ_ABANDONED` ou `QUIZ_COMPLETED` |
| `QUIZ_ABANDONED` | timeout sem atividade | volta ao quiz ou captura |
| `QUIZ_COMPLETED_NO_EMAIL` | terminou quiz sem e-mail | captura de e-mail |
| `LEAD_CAPTURED_VSL1` | e-mail validado | `VSL2_READY` |
| `VSL2_READY` | lead recebeu acesso à VSL2 | `VSL2_ENGAGED` ou `VSL2_COLD` |
| `VSL2_ENGAGED` | atingiu 25%/50% | `OFFER_REACHED` |
| `OFFER_REACHED` | chegou à oferta | `CHECKOUT_CLICKED` ou `OFFER_NO_ACTION` |
| `CHECKOUT_CLICKED` | clicou no CTA | `CHECKOUT_STARTED` ou `CHECKOUT_NO_DATA` |
| `CHECKOUT_STARTED` | começou formulário | `PAYMENT_PENDING`, `PAYMENT_FAILED` ou `PURCHASED` |
| `PAYMENT_PENDING` | PIX/boleto emitido | `PURCHASED` ou `PAYMENT_EXPIRED` |
| `PAYMENT_FAILED` | pagamento recusado | `PURCHASED` ou recuperação encerrada |
| `PURCHASED` | pagamento aprovado | `UPSELL_ELIGIBLE` |
| `UPSELL_ELIGIBLE` | upsell exibido | `UPSELL_PURCHASED` ou `UPSELL_DECLINED` |
| `UPSELL_PURCHASED` | upsell aprovado | pós-compra recorrente |
| `REFUNDED` | reembolso confirmado | suporte/reembolso |
| `UNSUBSCRIBED` | opt-out | nenhuma campanha promocional |

---

## 7. Listas e tags

### Listas de controle
Usar listas para grandes estados operacionais; usar tags para comportamento e atributos.

| Lista | Finalidade |
|---|---|
| `ALL_CONTACTS` | todos os contatos permitidos |
| `LEADS_VSL1` | capturaram o e-mail na VSL1 |
| `LEADS_VSL2` | chegaram à VSL2 |
| `LEADS_OFFER` | chegaram à oferta |
| `CHECKOUT_PROSPECTS` | clicaram/iniciaram checkout |
| `PAYMENT_FAILED` | pagamento recusado |
| `PAYMENT_PENDING` | PIX/boleto aguardando |
| `BUYERS_MAIN_PRODUCT` | compradores do mapa |
| `BUYERS_UPSELL` | compradores da assinatura |
| `REFUNDS` | reembolsados |
| `CHARGEBACKS` | chargebacks |
| `SUPPRESSION_GLOBAL` | não enviar marketing |
| `SUPPRESSION_RECOVERY` | retirar de recuperação, mantendo transacional |

### Tags de etapa
- `stage:quiz_started`
- `stage:quiz_completed`
- `stage:email_captured`
- `stage:vsl2_started`
- `stage:vsl2_engaged`
- `stage:offer_reached`
- `stage:checkout_clicked`
- `stage:checkout_started`
- `stage:payment_pending`
- `stage:payment_failed`
- `stage:purchased_main`
- `stage:upsell_seen`
- `stage:upsell_purchased`
- `stage:refunded`
- `stage:unsubscribed`

### Tags de desafio principal
- `challenge:love`
- `challenge:finance`
- `challenge:health`
- `challenge:happiness`

### Tags de perfil do quiz
- `profile:zodiac_aries`, etc.
- `profile:gender_female`, etc.
- `profile:marital_single`, etc.
- `profile:marital_married`, etc.
- `profile:marital_widowed`, etc.
- `profile:marital_separated`, etc.
- `profile:birth_decade_1950`, etc.

### Tags de intenção
- `intent:low`
- `intent:medium`
- `intent:high`
- `intent:checkout`
- `intent:payment_attempt`

### Tags de origem
- `source:vsl1_email_capture`
- `source:vsl1_email_capture_full`
- `source:paid_social`
- `source:organic`
- `source:exit_intent`
- `source:affiliate`

### Tags de produto
- `product:mapa_angel_guardian`
- `product:acelerados_angelico`
- `product:combo_prosperidad`
- `product:consultoria_mahila_luz`
- `offer:main`
- `offer:upsell`
- `offer:exit_intent`

### Tags de suporte e conformidade
- `support:requested`
- `support:delivery_issue`
- `support:payment_issue`
- `consent:marketing`
- `consent:transactional_only`
- `suppression:recovery`
- `suppression:all_marketing`

> Não criar uma tag para cada envio de e-mail. Para isso, usar histórico de campanha e `last_email_sent_at`.

---

## 8. Regras globais de exclusão

Essas regras devem ser aplicadas no início de cada automação e novamente antes de cada envio.

### Excluir de toda recuperação promocional
Se qualquer condição for verdadeira:

- `main_product_status = paid`;
- `upsell_status = paid` quando a campanha for do upsell;
- `payment_status = refunded`;
- `main_product_status = refunded`;
- `chargeback_opened = true`;
- `unsubscribe_at != null`;
- `suppression:all_marketing`;
- reclamação de spam;
- e-mail inválido ou hard bounce.

### Excluir da recuperação principal após compra
Ao receber `purchase_completed`:
1. cancelar todos os timers de recuperação;
2. remover da lista `CHECKOUT_PROSPECTS`;
3. adicionar `BUYERS_MAIN_PRODUCT`;
4. adicionar `stage:purchased_main`;
5. adicionar à sequência de onboarding;
6. manter somente e-mails transacionais e de suporte;
7. permitir upsell apenas quando elegível.

### Excluir a sequência de pagamento recusado após aprovação
Ao receber `purchase_completed`, mesmo que tenha ocorrido `payment_failed` antes:
- cancelar a sequência de pagamento recusado;
- manter a tag histórica `payment_failed`;
- priorizar o estado `purchased`.

### Cancelar por resposta humana
Se a plataforma detectar resposta ao e-mail com pedido de remoção ou suporte:
- pausar a campanha promocional;
- aplicar `support:requested`;
- encaminhar para atendimento.

---

## 9. Timers e regras de disparo

### Princípios
- Os timers devem ser baseados em **evento + atraso**, não em horário fixo do dia.
- Usar timezone do contato quando disponível; caso contrário, usar o timezone padrão da operação.
- Não enviar entre 21:00 e 08:00 no horário local.
- Se um timer cair no período silencioso, enviar às 08:30.
- Antes de cada envio, revalidar o estado do contato.
- Um mesmo contato não deve receber mais de um e-mail promocional em 12 horas, salvo campanha de pagamento recusado ou aviso transacional.
- Se o lead entrar em outra sequência de maior prioridade, pausar a anterior.

### Prioridade de automações
1. Suporte, opt-out e transacional.
2. Pagamento recusado/pagamento pendente.
3. Compra confirmada/onboarding.
4. Checkout abandonado.
5. Oferta sem checkout.
6. VSL2 sem oferta.
7. Quiz abandonado.
8. Broadcast geral.

### Janela de atribuição
- Considerar compra recuperada se acontecer dentro de **7 dias** do primeiro evento da sequência.
- Para pagamento pendente, considerar até o vencimento real do PIX/boleto.
- Nunca marcar como abandono definitivo enquanto houver pagamento pendente ativo.

---

## 10. Automações e sequências

# A. Quiz abandonado

### Entrada
- `quiz_started` ou `quiz_progress`.
- Sem `email_submitted`.
- Sem `purchase_completed`.

### Limitação
Sem e-mail capturado, não é possível enviar e-mail diretamente. Essa automação só funciona se:
- o e-mail for coletado antes do abandono; ou
- houver outro canal autorizado; ou
- o contato já existir no CRM por visita anterior.

### Lógica
- Esperar 30–60 minutos.
- Se o contato tiver e-mail e não tiver concluído o quiz, enviar lembrete.
- Esperar 24 horas e enviar segundo lembrete.
- Encerrar após 2 mensagens.

### Segmentação
Usar `quiz_step_reached`, signo, estado civil e desafio se disponíveis.

### Copy
- Não afirmar que o mapa está pronto se o quiz não foi concluído.
- Usar: “Tu lectura quedó a medio camino” / “Falta una respuesta para completar tu señal”.

# B. Quiz completo sem e-mail

### Entrada
- `quiz_completed`.
- Ausência de `email_submitted`.

### Canal
Não enviar e-mail sem endereço/consentimento. Registrar o evento para remarketing autorizado, se existir.

# C. Lead capturado, VSL2 não iniciada

### Entrada
- `email_submitted` ou `lead_conversion` com `vsl1_email_capture`.
- Ausência de `vsl2_started` após 15 minutos.
- Sem compra.

### Timers
- T+15 min: acesso à continuação da leitura.
- T+8 h: mecanismo do rádio/sinal.
- T+24 h: janela de preparação.
- T+48 h: encerrar ou mover para reengajamento leve.

### Stop conditions
- `vsl2_started` cancela esta sequência e inicia VSL2 assistida.
- compra, reembolso, opt-out e bounce cancelam tudo.

# D. VSL2 iniciada, mas não chegou à oferta

### Entrada
- `vsl2_started` ou `vsl2_25`.
- Sem `vsl2_offer_reached` após 30 minutos.
- Sem checkout e sem compra.

### Timers
- T+1 h: “Tu mapa necesita la parte más importante”.
- T+12 h: “No basta con que el portal se abra”.
- T+36 h: “Los tres golpes de sincronía”.
- Encerrar após 3 e-mails.

### Personalização
- `challenge:finance`: dinheiro que chega e escapa.
- `challenge:love`: relações e resíduos emocionais.
- `challenge:health`: vitalidade, sem prometer cura.
- `challenge:happiness`: paz, clareza e cansaço do pilar.

# E. VSL2 assistida/oferta alcançada, sem checkout

### Entrada
- `vsl2_offer_reached` ou `vsl2_50`/`vsl2_75`.
- Ausência de `checkout_redirected` após 30–60 minutos.
- Sem compra.

### Timers
- T+2 h: resumo do mecanismo.
- T+24 h: o que vem no mapa e nos bônus.
- T+48 h: objeções de confiança e entrega.
- T+72 h: garantia, somente se validada.
- T+5 d: encerramento da sequência.

### Regras
- Se clicar no checkout, cancelar esta sequência e entrar em checkout abandonado.
- Se não houver evento de clique, não chamar de “checkout abandonado”.

# F. Checkout clicado/iniciado, sem compra

### Entrada
- `checkout_redirected` ou `checkout_started`.
- Sem `purchase_completed`.
- Sem reembolso.

### Timers recomendados
| Tempo | Objetivo |
|---|---|
| T+30 min | lembrar que o mapa ficou reservado/pendente |
| T+6 h | reforçar a dor principal segmentada |
| T+24 h | explicar mecanismo e conteúdo |
| T+48 h | remover objeção de confiança/entrega |
| T+72 h | garantia, somente se válida |
| T+5 d | urgência real da janela |
| T+7 d | encerramento da recuperação |

### Cuidados
- Não usar “seu pagamento falhou” se não houver `payment_failed`.
- Não prometer que o mapa já foi criado se o pagamento não foi confirmado.
- Não repetir preço conflitante.
- Não criar falsa escassez de “última vaga” se o sistema não controla vagas reais.

# G. Pagamento recusado

### Entrada
- `payment_failed` confirmado.
- Sem `purchase_completed` posterior.

### Timers
| Tempo | Objetivo |
|---|---|
| imediato/15 min | avisar interrupção técnica e reenviar link |
| +6 h | instrução simples para tentar novamente |
| +24 h | método de pagamento alternativo, se existir |
| +48 h | segurança, suporte e garantia válida |
| +72 h | encerramento |

### Linguagem
Evitar culpa e não tratar a recusa como falta de desejo:

> “Parece que hubo una interrupción en el procesamiento de tu pago. Tu acceso todavía no fue confirmado.”

# H. PIX/boleto pendente

### Entrada
- `payment_pending`.

### Timers
- imediato: confirmação do pagamento pendente e instruções;
- 2 h antes do vencimento: lembrete;
- no vencimento: expiração;
- após expirar: remover da lista pendente e mover para recuperação de checkout apenas se houver consentimento e regra válida.

### Regra
Não enviar checkout abandonado enquanto o pagamento estiver pendente.

# I. Compra confirmada — onboarding

### Entrada
- `purchase_completed` server-side.

### Timers
| Tempo | Objetivo |
|---|---|
| imediato | recibo/confirmação e expectativa de entrega |
| +1 h | instruções de acesso |
| +24 h | como usar o mapa |
| +3 d | ritual diário e aplicação prática |
| +7 d | suporte, dúvidas e próximo passo |

### Exclusão
Cancelar todas as recuperações promocionais anteriores.

# J. Sequência de upsells

A sequência correta tem três ofertas distintas e em ordem:

1. **UP1 — Acelerados Angélico** (`/up1`).
2. **UP2 — Combo de Prosperidad** (`/up2`).
3. **UP3 — Consultoría individual Mahila Luz** (`/up3`).

### Entrada geral
- `purchase_completed` do produto principal confirmado pela Perfect Pay.
- O contato não pode estar reembolsado, em chargeback ou com opt-out.
- O upsell anterior precisa estar concluído, recusado ou expirado antes de apresentar o seguinte.

### Estado recomendado dos upsells
- `up1_status`: `not_seen`, `seen`, `paid`, `declined`, `expired`.
- `up2_status`: `not_seen`, `seen`, `paid`, `declined`, `expired`.
- `up3_status`: `not_seen`, `seen`, `paid`, `declined`, `expired`.
- `last_upsell_offer_id`: `up1`, `up2` ou `up3`.
- `upsell_order_ids`: lista de pedidos relacionados.

### Regras por oferta

#### UP1 — Acelerados Angélico
- Rota: `/up1`.
- Produto: `acelerados_angelico`.
- Apresentar somente após a compra principal aprovada.
- Se comprar: cancelar qualquer oferta UP1 pendente e registrar `upsell_completed` com `offer_id: up1`.
- Se recusar: registrar `upsell_declined` e permitir UP2 conforme a regra comercial.

#### UP2 — Combo de Prosperidad
- Rota: `/up2`.
- Produto: `combo_prosperidad`.
- Apresentar apenas depois de o UP1 ter sido finalizado, recusado ou expirado.
- Se comprar: registrar `upsell_completed` com `offer_id: up2`.
- Não enviar copy de UP1 para quem já está em UP2.

#### UP3 — Consultoría individual Mahila Luz
- Rota: `/up3`.
- Produto: `consultoria_mahila_luz`.
- Oferta de contato individual; deve ter regras próprias de agenda, disponibilidade, pagamento e suporte.
- Se comprar: registrar `upsell_completed` com `offer_id: up3` e iniciar onboarding de consultoria.
- Não prometer uma vaga, data ou atendimento individual sem disponibilidade real confirmada.

### Regras obrigatórias
O e-mail de cada upsell deve mostrar claramente:
- nome exato do produto;
- valor e moeda;
- se é compra única ou recorrente;
- o que será entregue;
- prazo de entrega ou agendamento;
- como solicitar suporte/cancelamento.

O CRM deve guardar uma compra por `offer_id`. Um comprador da oferta principal não deve ser automaticamente tratado como comprador de UP1, UP2 ou UP3.

### Timers
- Exibir/acionar UP1 após confirmação server-side da compra principal.
- Só iniciar UP2 após status final do UP1.
- Só iniciar UP3 após status final do UP2.
- Limitar a 3–5 e-mails por upsell quando houver sequência por e-mail.
- Parar imediatamente a recuperação da oferta específica após `upsell_completed` daquele `offer_id`.


# K. Reembolso/chargeback

### Entrada
- `purchase_refunded` ou `chargeback_opened`.

### Regras
- remover de promoções;
- manter suporte transacional;
- não tentar recuperar a venda automaticamente;
- enviar somente instruções de suporte e confirmação do processo.

---

## 11. Segmentação de copy por desafio

### `challenge:finance`
**Dor:** dinheiro que chega e desaparece, oportunidades perdidas, sensação de escassez.

**CTA:** descobrir o ponto de inércia financeira e o mapa de ativação.

**Evitar:** prometer cifras, duplicação de renda ou enriquecimento.

### `challenge:love`
**Dor:** solidão no silêncio da noite, relações que não permanecem, medo de migalhas.

**CTA:** entender resíduos emocionais e recuperar clareza para escolher.

### `challenge:health`
**Dor:** cansaço, peso e perda de vitalidade.

**CTA:** usar o mapa como ritual de clareza e energia pessoal.

**Evitar:** dizer que cura dor, doença, estresse ou substitui médico.

### `challenge:happiness`
**Dor:** exaustão de sustentar tudo, falta de entusiasmo e invisibilidade.

**CTA:** sair do ruído e voltar ao próprio eixo.

---

## 12. Estrutura recomendada de cada e-mail

Cada e-mail deve ter:

1. **Assunto curto** e coerente com o estágio.
2. **Primeira linha personalizada** com `first_name` quando disponível.
3. Uma dor ou dúvida específica.
4. Uma única explicação do mecanismo.
5. Um benefício plausível, sem garantia indevida.
6. Um CTA principal.
7. Link com parâmetros de rastreamento.
8. Identificação clara do remetente.
9. Link de descadastro.

### Variáveis recomendadas
- `{{first_name}}`
- `{{primary_challenge_label}}`
- `{{zodiac_sign}}`
- `{{marital_status_label}}`
- `{{checkout_url}}`
- `{{support_url}}`
- `{{unsubscribe_url}}`

### Regras de personalização
- Usar o desafio principal como ângulo, não como diagnóstico médico/financeiro.
- Não dizer que o signo determinou o problema.
- Não expor publicamente informações sensíveis do quiz.
- Usar o primeiro nome apenas se validado e com fallback neutro.
- Não revelar todas as respostas do quiz na mesma mensagem.

---

## 13. Links e tracking dos e-mails

Cada link deve incluir:

```text
utm_source=email
utm_medium=automation
utm_campaign={{campaign_name}}
utm_content={{email_id}}
contact_id={{contact_id}}
```

Exemplo:

```text
https://mapa.timeoffaith.online/?utm_source=email&utm_medium=automation&utm_campaign=checkout_recovery&utm_content=ca_03&contact_id={{contact_id}}
```

Se o checkout aceitar parâmetros de atribuição, preservar:
- `contact_id`;
- e-mail hash ou token seguro;
- `utm_*`;
- campaign ID.

> Nunca expor e-mail em URL sem necessidade. Preferir token assinado ou ID não reversível.

---

## 14. Integração com Perfect Pay, VTurb e Meta

### Perfect Pay — postback para o CRM

A Perfect Pay deve ser a fonte de verdade para o estado comercial. O postback precisa enviar ao endpoint do CRM, no mínimo:

```json
{
  "provider": "perfectpay",
  "event_name": "purchase_completed",
  "order_id": "ID_DO_PEDIDO",
  "transaction_id": "ID_DA_TRANSACAO",
  "email": "lead@example.com",
  "product_id": "ID_DO_PRODUTO",
  "product_name": "Mapa del Ángel de la Guarda",
  "offer_id": "main",
  "status": "approved",
  "amount": 27,
  "currency": "USD",
  "payment_method": "credit_card",
  "occurred_at": "2026-09-29T14:00:00Z",
  "metadata": {
    "contact_id": "...",
    "utm_source": "...",
    "utm_campaign": "..."
  }
}
```

Mapeamento mínimo de status da Perfect Pay:

| Status recebido | Evento interno | Ação no CRM |
|---|---|---|
| aprovado/pago | `purchase_completed` | marcar comprador e cancelar recuperação |
| aguardando | `payment_pending` | iniciar lembretes de PIX/boleto |
| recusado/cancelado | `payment_failed` | iniciar recuperação técnica |
| reembolsado | `purchase_refunded` | remover promoções e abrir suporte |
| chargeback | `chargeback_opened` | supressão promocional e suporte |

O endpoint deve validar a assinatura/token do postback, responder rapidamente com HTTP 2xx, registrar o payload bruto de forma segura e processar o evento de maneira idempotente.

### VTurb — eventos de visualização da VSL

A VTurb é a fonte de verdade para consumo dos vídeos. Usar os recursos disponíveis de API/webhook para registrar no CRM, diretamente ou por uma camada intermediária:

- `vsl1_started`;
- `vsl1_25`, `vsl1_50`, `vsl1_75`;
- `email_capture_shown`;
- `vsl2_started`;
- `vsl2_25`, `vsl2_50`, `vsl2_75`;
- `vsl2_offer_reached`;
- `vsl2_completed`;
- `vsl2_cta_clicked`.

O evento precisa carregar o identificador do lead. A forma preferida é enviar `contact_id`/token na URL da página e fazer a VTurb devolver esse identificador nos dados do evento. Se a VTurb não devolver o e-mail por privacidade, o CRM deve fazer a correspondência por token persistente, não por tentativa de adivinhar o lead.

### Meta/Facebook Pixel

O Pixel pode receber os eventos de visualização para atribuição de anúncios, mas não deve ser a única fonte de verdade do CRM.

- Meta Pixel/CAPI: atribuição e otimização de anúncios.
- VTurb: consumo e progresso da VSL.
- Perfect Pay postback: pagamento, aprovação, recusa, reembolso e chargeback.
- CRM: estado do contato, tags, listas, timers e supressões.

Se for usado Conversions API, enviar `event_id` igual ao evento do navegador para permitir deduplicação. Não enviar dados sensíveis do quiz para a Meta além do que for necessário e autorizado.

### Checklist técnico da integração

O programador deve confirmar:

1. Qual URL receberá o postback da Perfect Pay?
2. Qual segredo/token autentica o postback?
3. Quais nomes/status exatos a Perfect Pay envia?
4. A Perfect Pay envia e-mail e `order_id` em todos os status?
5. Como relacionar o pedido ao `contact_id` e às UTMs?
6. Qual API/webhook da VTurb será usada?
7. Quais eventos de percentual do vídeo estão disponíveis?
8. A VTurb permite anexar um token do lead?
9. Como a Meta fará deduplicação Pixel/CAPI?
10. Qual é a política de retry de cada integração?

### Fallback se não houver postback ou evento completo
- Usar a página `https://mapa.timeoffaith.online/gracias/` apenas como sinal auxiliar.
- Não marcar compra como confirmada apenas pela visita à página de gracias.
- Consultar a Perfect Pay por API/relatório ou fazer importação periódica.
- Não disparar recuperação enquanto o estado comercial estiver incerto.

1. Existe webhook de pedido criado?
2. Existe webhook de pagamento aprovado?
3. Existe webhook de pagamento recusado?
4. Existe webhook de PIX/boleto pendente e expirado?
5. Existe webhook de reembolso?
6. O webhook entrega e-mail, `order_id`, produto, valor, moeda e status?
7. Existe API para consultar pedido por `order_id`?
8. É possível manter UTMs ou um identificador do lead?
9. O evento é assinado/autenticado?
10. Como lidar com reenvio do mesmo webhook?

### Fallback se não houver webhook
- Usar página de obrigado apenas como sinal provisório, nunca como confirmação final.
- Consultar a API/relatório do checkout em intervalos razoáveis.
- Importar vendas para o CRM.
- Marcar a origem como `purchase_confirmation_pending` até confirmação.

A arquitetura preferida é **evento server-side do checkout → endpoint do CRM → atualização de estado → cancelamento dos timers**.

---

## 15. Idempotência, segurança e qualidade técnica

### Idempotência
- Cada evento precisa de `event_id` único.
- O servidor deve ignorar eventos duplicados.
- `purchase_completed` não deve criar dois compradores.
- `payment_failed` não deve iniciar a sequência duas vezes.

### Segurança
- Validar assinatura dos webhooks.
- Não armazenar dados completos de cartão.
- Não colocar dados pessoais desnecessários na URL.
- Restringir logs com e-mail completo.
- Registrar consentimento e descadastro.

### Falhas
Se o CRM estiver indisponível:
- guardar o evento para reprocessamento;
- não disparar recuperação baseada em estado incerto;
- registrar erro e alertar o operador.

### Testes obrigatórios
1. Lead captura e recebe VSL2.
2. Lead captura e não recebe VSL2.
3. Lead chega à oferta e não clica.
4. Lead clica no checkout e não compra.
5. Pagamento recusado e depois aprovado.
6. PIX pendente e depois pago.
7. Compra aprovada antes do primeiro e-mail de abandono.
8. Compra aprovada depois de 3 e-mails.
9. Reembolso após compra.
10. Opt-out durante sequência.
11. E-mail duplicado.
12. Fuso horário e horário silencioso.
13. Lead sem primeiro nome.
14. Desafio em cada uma das quatro categorias.

---

## 16. Painel mínimo de métricas

### Métricas por etapa
- contatos que entraram;
- contatos que avançaram;
- tempo médio entre etapas;
- taxa de abandono;
- taxa de compra;
- receita por etapa;
- conversão por desafio;
- conversão por signo/idade/faixa de nascimento;
- conversão por fonte/UTM.

### Métricas de e-mail
- entregabilidade;
- hard bounce;
- soft bounce;
- abertura, se confiável;
- clique;
- resposta;
- descadastro;
- reclamação de spam;
- compra atribuída;
- receita por e-mail;
- tempo até compra;
- taxa de exclusão correta após compra.

### Relatório operacional diário
O sistema deve permitir listar:

| Pergunta | Resultado |
|---|---|
| Quantos capturaram e-mail hoje? | número |
| Quantos chegaram à VSL2? | número |
| Quantos chegaram à oferta? | número |
| Quantos iniciaram checkout? | número |
| Quantos tiveram pagamento recusado? | número |
| Quantos compraram? | número |
| Quantos estão em recuperação? | número |
| Quantos foram excluídos corretamente? | número |
| Há eventos de compra sem e-mail correspondente? | lista |
| Há e-mails de recuperação enviados a compradores? | deve ser zero |

---

## 17. Checklist de implementação

### Para o programador
- [ ] Criar ou confirmar ID persistente do contato.
- [ ] Normalizar e-mail.
- [ ] Persistir todas as respostas do quiz.
- [ ] Enviar `quiz_progress` com `step`, `key` e `value`.
- [ ] Implementar eventos de VSL1 e VSL2 pelo player.
- [ ] Implementar `checkout_redirected` e `checkout_started`.
- [ ] Confirmar integração server-side do Perfect Pay.
- [ ] Implementar compra aprovada, recusada, pendente, reembolso e chargeback.
- [ ] Criar máquina de estados.
- [ ] Criar cancelamento de timers.
- [ ] Implementar idempotência.
- [ ] Implementar janela silenciosa e timezone.
- [ ] Criar logs e painel de falhas.
- [ ] Testar todos os cenários da seção 15.

### Para o copywriter
- [ ] Escrever sequência por estado, não uma sequência genérica.
- [ ] Criar versões por `primary_challenge`.
- [ ] Usar a VSL1 para continuidade e a VSL2 para mecanismo/oferta.
- [ ] Não chamar lead de comprador sem confirmação.
- [ ] Não chamar checkout abandonado sem evento de checkout.
- [ ] Criar e-mails diferentes para abandono e pagamento recusado.
- [ ] Definir assunto, preheader, corpo, CTA e link por e-mail.
- [ ] Criar fallback sem `first_name`.
- [ ] Escrever onboarding separado da recuperação.
- [ ] Usar US$ 27 como preço oficial atualizado; revisar se a oferta mudar novamente.
- [ ] Não usar garantia de 60 dias até os termos estarem confirmados.
- [ ] Revisar alegações financeiras e de saúde.

### Para o gestor do CRM
- [ ] Criar listas e tags da seção 7.
- [ ] Criar campos personalizados da seção 3.
- [ ] Criar automações com prioridade da seção 9.
- [ ] Ativar exclusões globais.
- [ ] Configurar limite de frequência.
- [ ] Configurar descadastro e supressão.
- [ ] Criar relatórios de atribuição.
- [ ] Validar que não existem compradores em campanhas de abandono.

---

## 18. Critério de pronto

A implementação estará pronta quando:

1. Um lead puder ser identificado em um único registro.
2. O CRM souber o último evento e o estágio atual.
3. As quatro respostas de desafio puderem alterar a copy.
4. O checkout puder devolver status de pagamento.
5. Compra aprovada cancelar todas as recuperações em andamento.
6. Pagamento recusado iniciar a sequência técnica correta.
7. PIX/boleto pendente não receber abandono prematuro.
8. Reembolso e opt-out encerrarem promoções.
9. Os timers respeitarem fuso e horário silencioso.
10. Cada e-mail tiver evento de entrada, atraso, condição de envio e condição de saída.
11. O programador conseguir testar os cenários sem depender de compra real.
12. O copywriter conseguir escrever as sequências sem adivinhar em que estado o lead está.

---

## 19. Decisões pendentes antes do desenvolvimento final

Estas decisões precisam ser fechadas pela operação:

1. Confirmar se o preço oficial permanece em US$ 27 no checkout e no postback.
2. Qual é o nome oficial da mentora: Mayla, Mahila ou Magila?
3. A entrega acontece imediatamente, em até 24 horas ou em outro prazo?
4. A garantia de 60 dias existe nos termos oficiais?
5. Quais bônus estão realmente incluídos?
6. Quais são os preços, formatos e condições de entrega de Acelerados Angélico, Combo de Prosperidad e Consultoría individual Mahila Luz?
7. Algum dos três upsells é recorrente? Qual valor e periodicidade?
8. Qual plataforma de e-mail/CRM será usada?
8. Quais webhooks/API da Perfect Pay estão habilitados para cada status?
10. Qual timezone padrão da operação?
11. Qual janela real de disponibilidade/escassez pode ser usada sem criar uma promessa falsa?
12. Quais países e moedas serão atendidos?
13. A empresa possui consentimento e base legal para as campanhas de e-mail?

Até que essas decisões sejam resolvidas, o copywriter deve usar placeholders e evitar afirmar preço, garantia, prazo ou escassez como fatos definitivos.

---

## Atualização desta versão

Esta versão substitui a integração antiga pela arquitetura correta:

- Checkout: **Perfect Pay**.
- Preço oficial informado: **US$ 27**.
- Compra e status financeiro: **postback da Perfect Pay para o CRM**.
- Visualização e progresso das VSLs: **VTurb via API/webhook**.
- Atribuição de anúncios: **Meta/Facebook Pixel e, se aplicável, Conversions API**.
- Rotas: `/`, `/up1`, `/up2`, `/up3` e `/gracias/`.

O CRM deve receber eventos comerciais da Perfect Pay e eventos de vídeo da VTurb; o Pixel da Meta não deve ser usado sozinho para decidir se um lead comprou ou não.

---

## Resumo executivo

O sistema ideal não é “uma lista de leads que recebe sete e-mails”. É uma **máquina de estados orientada por eventos**:

```text
Quiz → Lead capturado → VSL2 → Oferta → Checkout → Pagamento
                                             ↓
                              recusado / pendente / aprovado

Aprovado → onboarding → upsell → retenção
Recusado → recuperação técnica
Pendente → lembretes até expiração
Sem compra → recuperação de checkout
Reembolso/opt-out → supressão
```

A prioridade técnica é implementar **`purchase_completed` server-side** e o cancelamento imediato das automações. Sem isso, qualquer recuperação corre o risco de enviar mensagens de abandono a quem já comprou.

# Templates revisados

Todos os templates foram ampliados, segmentados e atualizados para o remetente:
`soporte@mail.timeoffaith.online`

## Placeholders

- `%FIRSTNAME|querida amiga%` — primeiro nome; depois da barra é o fallback.
- `%AGE|tu etapa actual%` — idade; fallback se não houver idade.
- `%BIRTH_MONTH|un mes especial%` — mês de aniversário.
- `%ZODIAC_SIGN|tu signo%` — signo.
- `%CIVIL_STATUS|tu situación actual%` — estado civil, quando necessário.
- `%LIFE_CHALLENGE|tu desafío principal%` — desafio principal.
- `%CHECKOUT_URL%` — checkout Perfect Pay.
- `%VSL2_URL%` — URL de retorno para a continuação/VSL2.
- `%DELIVERY_URL%` — link seguro de entrega.
- `%SUPPORT_URL%` — página ou canal de suporte.
- `%UNSUBSCRIBE_URL%` — descadastro.

O sistema que dispara os e-mails deve aceitar o formato `%CAMPO|fallback%`. Se a plataforma não aceitar fallback inline, substituir pelo valor do campo antes do envio.

## Segmentos

Os arquivos com sufixo `_finance`, `_love`, `_health` e `_happiness` possuem copy específica para cada desafio. Os arquivos sem sufixo são versões gerais.

## Nota operacional

Os e-mails de compra, pagamento pendente, pagamento recusado e suporte devem ser enviados somente conforme o status real recebido da Perfect Pay. Compradores devem ser removidos imediatamente das sequências de recuperação.

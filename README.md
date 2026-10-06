# Pact — contratos de reservas

[English version](README.en.md)

O cliente monta um resumo de reserva: hóspede, preço, pagamento e datas. Este projeto verifica o contrato que esse cliente consome contra a API hospedada do [Restful Booker](https://restful-booker.herokuapp.com/apidoc/index.html).

## Executar

Node.js 24 e Python 3 para o gate do CI.

```bash
npm ci
cp .env.example .env
npm test
python -m unittest discover -s scripts -p test_summary.py
```

No PowerShell, use `Copy-Item .env.example .env`. As variáveis do processo têm prioridade. As credenciais do exemplo são públicas e documentadas pelo serviço de demonstração. Não use contas ou dados reais.

## Como o contrato é verificado

1. `src/booking-client.js` faz a consulta HTTP e transforma a resposta que o consumidor usa.
2. Os testes do consumidor executam esse código contra o mock server nativo do Pact e geram três interações em `results/contracts/`.
3. O `Verifier` lê o mesmo arquivo e faz as requisições reais ao provedor hospedado. Os state handlers criam reservas exclusivas; `fromProviderState` injeta o ID retornado na URL. Nenhum corpo de resposta é alterado para satisfazer o contrato.
4. A limpeza exclui somente os IDs criados pela execução e confirma GET 404. O estado ausente usa uma reserva própria criada e excluída, sem adivinhar um ID livre.

O servidor local é a virtualização nativa do **consumidor**, parte do funcionamento do Pact. O proxy interno do Verifier encaminha as consultas para o serviço HTTPS; não existe aplicação local substituindo o provedor.

## Cenários e decisões

| Cenário | O que bloqueia |
| --- | --- |
| Depósito pago | Booleano diferente de `true`, preço sem tipo inteiro, nomes sem tipo string ou datas divergentes |
| Depósito pendente | Booleano diferente de `false`; os demais campos continuam obrigatórios |
| Reserva excluída | HTTP diferente de 404 ou corpo diferente de `Not Found`; cliente deve retornar `null` |
| Sensibilidade do contrato | Uma cópia com `totalprice` string precisa ser rejeitada especificamente em `$.totalprice` |

Nomes variam por execução e são comparados por tipo. Booleanos e datas têm valores exatos porque definem os estados preparados. Propriedades extras do provedor não quebram o consumidor; não usamos igualdade de JSON completo como contrato.

A verificação de sensibilidade **altera o contrato**, não o serviço. Ela prova que uma expectativa incompatível de tipo é detectada. O log nativo mostra uma falha intencional; o teste só passa se houver uma única divergência de tipo no campo correto. Erro de rede, autenticação ou limpeza não vale como detecção de incompatibilidade.

## Resultados

[Actions](https://github.com/brunobaccari/pact-api-contracts/actions) publica summary por teste e o artifact **pact-results**, com retenção de 14 dias:

- `junit.xml`: cinco testes, incluindo a verificação das três interações e a sensibilidade.
- `contracts/booking-summary-restful-booker.json`: contrato gerado pelo consumidor.
- `incompatible-contract.json`: alteração controlada para a verificação negativa.
- `verification.json`: resultados nativos do Pact e IDs próprios com confirmação da limpeza.
- `summary.md`: resultado e limites da execução.

Falha, skip, resultado ausente/inválido, contrato incompleto e limpeza sem confirmação bloqueiam o CI. Os outputs são enviados mesmo em falha e nunca são commitados. `scripts/test_summary.py` verifica que o gate rejeita relatórios ausentes, inválidos, vazios, falhos, ignorados e incompletos.

## Limites

API pública compartilhada: outro usuário ou reinicialização pode remover nossos dados. A reserva usa nome exclusivo, mas isso não dá isolamento de banco. Indisponibilidade externa reprova a run e exige diagnóstico; não há retry até verde.

Não controlamos o código ou a versão implantada do provedor. Este é um consumidor demonstrativo e uma verificação de compatibilidade da API disponível. Não há Pact Broker, publicação de contratos, matriz de versões ou `can-i-deploy`; portanto não é um gate de implantação entre duas equipes. Para esse uso, ambos os projetos precisariam participar do fluxo de publicação e verificação.

Referências consultadas: [matching e provider-state generators](https://docs.pact.io/implementation_guides/javascript/docs/matching), [verificação e state handlers](https://docs.pact.io/implementation_guides/javascript/docs/provider) e [API](https://restful-booker.herokuapp.com/apidoc/index.html).

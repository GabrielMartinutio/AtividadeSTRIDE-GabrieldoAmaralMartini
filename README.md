# Atividade STRIDE — Corrija a API Vulnerável

Bem-vindo(a)! Esta é uma atividade prática de **DevSecOps**.

Você vai receber uma API **propositalmente insegura**, encontrar **6 falhas** (modelo STRIDE) e **corrigi-las** sem quebrar o funcionamento do sistema.

---

## Quanto vale?

| Parte | O que precisa acontecer | Nota |
|-------|-------------------------|------|
| Segurança | As 6 falhas corrigidas + `npm run scan` sem alertas | **3,0** (0,5 cada) |
| Integridade | A API continua funcionando (`npm test` passa) | **1,0** |
| **Total** | | **4,0** |

---

## O que é STRIDE? (resumo rápido)

STRIDE é um modelo da Microsoft para pensar em ameaças:

| Letra | Nome | Em português simples |
|-------|------|----------------------|
| **S** | Spoofing | Fingir ser outra pessoa (ex.: forjar login) |
| **T** | Tampering | Alterar dados indevidamente (ex.: SQL Injection) |
| **R** | Repudiation | Negar que fez algo (ex.: sem logs de erro) |
| **I** | Information Disclosure | Vazar informação sensível (ex.: stack trace) |
| **D** | Denial of Service | Derrubar / travar o serviço (ex.: ReDoS) |
| **E** | Elevation of Privilege | Ganhar poder indevido (ex.: executar comandos) |

Nesta atividade, **cada letra = 1 falha no código**.

---

## Sua missão (em 3 passos)

1. **Entenda** onde está cada falha (tabela abaixo).
2. **Corrija** o código (não apague a rota!).
3. **Valide** com os dois comandos:

```bash
npm test          # a API ainda funciona? (obrigatório)
npm run scan      # as falhas sumiram do Semgrep? (obrigatório)
```

> Regra de ouro: **corrigir ≠ apagar**.  
> Se você remover a rota só para o scan “passar”, os testes quebram e você perde a nota de integridade.

---

## Como começar (GitHub Codespaces)

O ambiente já vem pronto. Não precisa instalar nada na sua máquina.

### 1) Crie a sua cópia a partir do template

1. Abra o repositório da atividade no GitHub.
2. Clique em **Use this template** → **Create a new repository**.
3. Marque o repositório como **Private** (recomendado).
4. Crie com um nome claro, ex.: `AtividadeSTRIDE-SeuNome`.

> Não faça só um fork “solto” se o botão de template estiver disponível — use **Use this template** para ter um repo seu, independente.

### 2) Abra no Codespaces

1. No **seu** repositório, clique em **Code → Codespaces → Create codespace on main**.
2. Espere o Codespace abrir (ele roda `npm install` e instala o Semgrep sozinho).
3. No terminal, rode:

```bash
npm test
npm run scan
```

No início:
- `npm test` deve **passar** (a API vulnerável ainda funciona).
- `npm run scan` deve **encontrar as 6 falhas** (é esperado!).

Depois das correções, os **dois** devem passar.

> Se o Codespace abrir em **recovery mode**, ou se `npm` não for encontrado, **apague** esse Codespace e crie outro. Recovery usa Alpine sem Node — Rebuild no mesmo Codespace não resolve.

### Comandos úteis

| Comando | Para quê? |
|---------|-----------|
| `npm start` | Subir a API (porta 3000) |
| `npm test` | Testar se a API ainda funciona |
| `npm run scan` | Procurar as falhas de segurança com Semgrep |
| `npm run build` | Compilar o TypeScript (opcional) |

> No Codespace, `JWT_SECRET` já vem definido no ambiente. Se rodar fora do Codespace, use o arquivo `.env.example` como referência.

---

## Onde estão as falhas? (guia de correção)

Abra os arquivos indicados e corrija **só o que está errado**.  
Cada item vale **0,5 ponto**.

---

### 1) [S] Spoofing — login com segredo fraco

| | |
|---|---|
| **Arquivo** | `src/routes.ts` |
| **Rota** | `POST /api/login` |
| **O problema** | A chave do JWT está escrita no código: `const secret = "123456"`. Qualquer um que ler o código pode forjar tokens. |
| **Como corrigir** | Tire o segredo do código. Use variável de ambiente, por exemplo `process.env.JWT_SECRET`. Se a variável não existir, a API deve falhar de forma segura (não inventar um secret padrão fraco). |

---

### 2) [T] Tampering — SQL Injection

| | |
|---|---|
| **Arquivo** | `src/routes.ts` |
| **Rota** | `GET /api/users/search` |
| **O problema** | A busca monta a query juntando texto (`"..." + username + "..."`). Um atacante pode injetar SQL. |
| **Como corrigir** | Use **prepared statement** (parâmetro `?`), sem concatenar a entrada do usuário na string SQL. |

Exemplo da ideia:

```ts
db.all(
  'SELECT id, username, email, balance FROM users WHERE username = ?',
  [username],
  callback
);
```

---

### 3) [R] Repudiation — erro engolido (sem log)

| | |
|---|---|
| **Arquivo** | `src/routes.ts` |
| **Rota** | `POST /api/transactions/transfer` |
| **O problema** | Existe um `catch (error) { }` **vazio**. Se a transferência falhar, ninguém fica sabendo (não dá para auditar). |
| **Como corrigir** | No `catch`, registre o erro (ex.: `console.error(error)`) e devolva uma resposta adequada ao cliente **sem** vazar detalhes internos. |

---

### 4) [I] Information Disclosure — vazamento de stack

| | |
|---|---|
| **Arquivo** | `src/app.ts` |
| **Onde aparece** | Middleware global de erro (testado pela rota `GET /api/debug/crash`) |
| **O problema** | Em erro 500, a API devolve `error.stack` no JSON. Isso revela caminhos e detalhes internos. |
| **Como corrigir** | Para o cliente, mande só uma mensagem genérica (ex.: `{ error: "erro interno" }`). O stack, se precisar, fica **só no log do servidor**. |

> A rota `GET /api/debug/crash` **precisa continuar existindo** e retornar status **500** com um campo `error` (string).  
> Você **não precisa** manter o campo `stack` — os testes não exigem ele.

---

### 5) [D] Denial of Service — regex perigosa (ReDoS)

| | |
|---|---|
| **Arquivo** | `src/routes.ts` |
| **Rota** | `POST /api/validate/email` |
| **O problema** | A regex tem quantificadores aninhados (`([a-zA-Z0-9]+)+`). Entradas maliciosas podem travar a CPU. |
| **Como corrigir** | Troque por uma validação simples e segura (regex sem aninhamento, ou checagens básicas). Mantenha a resposta no formato `{ email, valid }`. |

---

### 6) [E] Elevation of Privilege — execução de comando

| | |
|---|---|
| **Arquivo** | `src/routes.ts` |
| **Rota** | `POST /api/reports/generate` |
| **O problema** | A API pega `req.body.type` e usa dentro de `child_process.exec()`. Isso é execução remota de código (RCE). |
| **Como corrigir** | Remova `exec` / `eval`. Aceite apenas tipos permitidos (ex.: `summary`, `balance`) com uma lista/`switch` e devolva o relatório **sem** chamar o shell. Mantenha a resposta no formato `{ message: "relatório gerado", output: string }`. |

Exemplo da ideia (contrato que os testes esperam):

```ts
const allowed = ['summary', 'balance'] as const;
// se type não estiver na lista → 400
// se type === 'summary' → output controlado (string não vazia)
return res.status(200).json({ message: 'relatório gerado', output: '...' });
```

---

## Antifraude — leia com atenção

Os testes em `tests/api.test.ts` verificam se a API **ainda funciona de verdade**.

Eles checam:
- status HTTP corretos (`200`, `400`, `401`, `500`…)
- formato mínimo do JSON
- se as rotas ainda existem

### Não faça isto
- Apagar rota para o Semgrep ficar limpo
- Desabilitar ou apagar testes
- “Contornar” o scanner sem corrigir a causa

### Faça isto
1. Corrija a falha
2. Rode `npm test` (precisa passar)
3. Rode `npm run scan` (precisa ficar limpo)
4. Faça `push` e confira o GitHub Actions

---

## Como a nota é calculada

### Segurança (3,0)

| Letra | Ameaça | Você ganha o ponto quando… |
|-------|--------|----------------------------|
| S | Spoofing | Não há secret JWT hardcoded e a regra S some do scan |
| T | Tampering | Query parametrizada e a regra T some do scan |
| R | Repudiation | Erro é registrado (catch não vazio) e a regra R some do scan |
| I | Information Disclosure | Resposta 500 sem `stack` e a regra I some do scan |
| D | Denial of Service | Validação de e-mail segura e a regra D some do scan |
| E | Elevation of Privilege | Sem `exec`/`eval` inseguro e a regra E some do scan |

### Integridade (1,0)

- `npm test` passa depois das correções
- O workflow do GitHub Actions (`grading.yml`) roda: `npm install` → `npm test` → `npm run scan`

---

## Como entregar / compartilhar com o professor

Depois de corrigir e validar (`npm test` + `npm run scan`), o professor precisa **acessar o seu repositório** para corrigir.

Você pode escolher **uma** das opções abaixo:

### Opção A — Repositório privado + colaborador (recomendado)

Mantenha o repo **privado** e adicione o professor como collaborator.

1. Abra o **seu** repositório no GitHub (a cópia criada pelo template).
2. Vá em **Settings** (Configurações).
3. No menu lateral, clique em **Collaborators**  
   (em alguns layouts: **Collaborators and teams**).
4. Clique em **Add people** (Adicionar pessoas).
5. Digite o usuário do professor: **`AntonioSpagnol`**
6. Selecione o perfil correto: [https://github.com/AntonioSpagnol](https://github.com/AntonioSpagnol)
7. Envie o convite (role de **Write** ou **Read** — Read já basta para correção).
8. **Envie o link do seu repositório** para o professor (pelo canal da disciplina).

> O professor precisa **aceitar o convite** no GitHub.  
> Enquanto o convite estiver pendente, ele ainda não consegue abrir o repo privado.

**Dica:** confira se o usuário aparece em Settings → Collaborators como *pending* ou *accepted*.

---

### Opção B — Repositório público + link

Se preferir (ou se tiver dificuldade com convite):

1. Abra o **seu** repositório no GitHub.
2. Vá em **Settings → General**.
3. Role até **Danger Zone**.
4. Em **Change repository visibility**, mude para **Public**.
5. **Envie o link do repositório** para o professor.

> Atenção: com o repo público, qualquer pessoa com o link pode ver o código.  
> Se a disciplina pedir sigilo, prefira a **Opção A**.

---

### O que enviar ao professor

Envie uma mensagem simples com:

- Seu nome / RA (ou identificação pedida na disciplina)
- O **link do repositório** no GitHub
- Qual opção usou:
  - “Adicionei `AntonioSpagnol` como collaborator” **ou**
  - “O repositório está público”

Exemplo:

```text
Nome: Maria Silva
RA: 123456
Repo: https://github.com/seu-usuario/AtividadeSTRIDE-MariaSilva
Acesso: adicionei AntonioSpagnol como collaborator (convite enviado)
```

O professor vai clonar o seu repo e rodar a correção automática (`npm test` + scan Semgrep com nota por critério STRIDE).

---

## Checklist final (antes de entregar)

- [ ] Corrigi as 6 falhas (S, T, R, I, D, E)
- [ ] `npm test` passa
- [ ] `npm run scan` não aponta as 6 regras
- [ ] Não apaguei nenhuma rota
- [ ] Fiz push e o GitHub Actions está verde (ou quase — testes + scan ok)
- [ ] Compartilhei o acesso com o professor (`AntonioSpagnol` como collaborator **ou** repo público)
- [ ] Enviei o link do repositório pelo canal da disciplina

---

## Estrutura do projeto (onde olhar)

```
src/
  app.ts        → middleware de erro [I]
  index.ts      → sobe o servidor
  routes.ts     → rotas com falhas [S][T][R][D][E]

tests/
  api.test.ts   → testes antifraude (não apague)

semgrep.yml                 → regras que o scan usa
.github/workflows/grading.yml → CI automático no push
.devcontainer/              → configuração do Codespaces
scripts/grade-submission.*  → correção automática (professor)
```

---

## Dicas rápidas (se travar)

1. **JWT:** use `JWT_SECRET` no ambiente; nunca commite segredo real.
2. **SQLite:** sempre `?` + array de parâmetros; nunca `"..." + input`.
3. **Catch:** logue o erro; responda mensagem genérica.
4. **Erro 500:** sem `stack` na resposta HTTP.
5. **E-mail:** evite regex com `(algo+)+`.
6. **Relatório:** whitelist de tipos (`summary` / `balance`); nunca `exec(req.body...)`.

---

## Para o professor (correção automática)

Com o link do repo do aluno:

```powershell
# Windows (PowerShell)
.\scripts\grade-submission.ps1 -RepoUrl "https://github.com/aluno/AtividadeSTRIDE-Nome"

# ou pasta já clonada
.\scripts\grade-submission.ps1 -Path "C:\caminho\para\repo-do-aluno"
```

```bash
# Linux / macOS / Codespace
chmod +x scripts/grade-submission.sh
./scripts/grade-submission.sh https://github.com/aluno/AtividadeSTRIDE-Nome
# ou
./scripts/grade-submission.sh /caminho/para/repo-do-aluno
```

O script imprime nota por critério STRIDE (0,5 cada) + integridade (`npm test`) e o total / 4,0.  
No Windows, se não houver Semgrep/Python, usa automaticamente o fallback Node (`scripts/grade-security-check.cjs`).

No Cursor, com este projeto aberto, cole o link e peça: **Corrigir entrega STRIDE: \<url\>**

---

Boa atividade!  
Foque em **entender a causa** e **corrigir com segurança** — não em enganar o scanner.

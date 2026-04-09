# LasecGitSession

`LasecGitSession` e uma extensao para Visual Studio Code pensada para laboratorios de informatica e ambientes compartilhados. Ela prepara e encerra a sessao do aluno no Git e no GitHub sem exigir projeto aberto, usando configuracao global do Git.

## O que a extensao faz

- Adiciona um botao `LasecGitSession` na barra de status do VS Code.
- Funciona mesmo sem projeto ou pasta aberta.
- Verifica se o Git esta instalado e acessivel no PATH.
- Inicia a autenticacao usando a API oficial do VS Code com o provider `github`.
- Solicita nome e e-mail do aluno para autoria de commits.
- Configura `git config --global user.name` e `git config --global user.email`.
- Permite ver o status atual, trocar de aluno e encerrar a aula.
- Remove a identidade global do Git ao encerrar a aula.
- Limpa a preferencia de sessao usada pela propria extensao, sem armazenar tokens manualmente.

## Estrutura do projeto

```text
.
|-- .vscode/
|   |-- launch.json
|   `-- tasks.json
|-- src/
|   |-- controllers/
|   |   `-- sessionController.ts
|   |-- services/
|   |   |-- authService.ts
|   |   |-- credentialCleanupService.ts
|   |   |-- gitService.ts
|   |   |-- loggerService.ts
|   |   |-- sessionService.ts
|   |   `-- statusBarService.ts
|   |-- types/
|   |   `-- index.ts
|   |-- utils/
|   |   |-- errors.ts
|   |   |-- validation.ts
|   |   `-- workspace.ts
|   |-- constants.ts
|   `-- extension.ts
|-- .gitignore
|-- .vscodeignore
|-- LICENSE
|-- package.json
|-- README.md
`-- tsconfig.json
```

## Como instalar para desenvolvimento

1. Abra a pasta do projeto no VS Code.
2. Execute:

   ```bash
   npm install
   npm run compile
   ```

## Como rodar em modo de desenvolvimento com F5

1. Abra este projeto no VS Code.
2. Execute `npm install`.
3. Pressione `F5`.
4. Uma nova janela de Extension Development Host sera aberta.
5. Nessa janela, clique no botao `LasecGitSession` na barra de status.

Nao e necessario abrir repositorio Git para iniciar a sessao.

## Como usar

### Inicio da aula

1. O aluno abre o VS Code.
2. Clica no botao `LasecGitSession`.
3. A extensao valida se o Git esta instalado.
4. Se necessario, o VS Code abre o fluxo oficial de login GitHub no navegador.
5. A extensao pede:
   - nome do aluno
   - e-mail do aluno
6. A maquina recebe:

   ```bash
   git config --global user.name "Nome do Aluno"
   git config --global user.email "email@exemplo.com"
   ```

7. O botao passa para o estado ativo.

### Fim da aula

1. O aluno clica novamente em `LasecGitSession`.
2. Escolhe `Encerrar aula`.
3. A extensao remove da configuracao global:

   ```bash
   git config --global --unset-all user.name
   git config --global --unset-all user.email
   ```

4. Se existirem algumas chaves globais extras ligadas a identidade, a extensao pode oferecer remocao com confirmacao explicita.
5. O botao volta ao estado desconectado.

## Comandos disponiveis

- `LasecGitSession: Iniciar Sessao`
- `LasecGitSession: Encerrar Aula`
- `LasecGitSession: Trocar Aluno`
- `LasecGitSession: Ver Status Atual`

## Observacoes importantes de seguranca

- Esta versao usa `git config --global` por solicitacao de uso sem projeto aberto.
- A autoria do commit (`user.name` e `user.email`) continua separada do login GitHub.
- A extensao nao armazena senha.
- A extensao nao armazena token manualmente.
- O estado persistido em `globalState` guarda apenas dados operacionais minimos, como nome, e-mail e referencia a conta usada pela extensao.

## Limitacoes conhecidas

- A API publica de autenticacao do VS Code permite obter e usar a sessao GitHub, mas nao expoe um logout completo do provider para extensoes consumidoras.
- Por isso, ao encerrar a aula, a extensao limpa:
  - a identidade global do Git
  - a preferencia de sessao usada pela propria extensao
- Se a instituicao exigir logout completo do GitHub dentro do VS Code, isso ainda precisa ser feito manualmente pelo menu de contas do editor.

## Uso em laboratorios compartilhados

- Oriente os alunos a sempre encerrar a aula pelo botao `LasecGitSession`.
- Como a configuracao e global, ela afeta novos commits em qualquer repositorio aberto nesta maquina ate o encerramento da sessao.
- Se o laboratorio reutiliza a mesma maquina por muitas turmas, considere tambem politicas institucionais de limpeza de perfil do sistema operacional.

## Empacotando a extensao

Depois de instalar as dependencias:

```bash
npm run package
```

Isso gera um arquivo `.vsix` pronto para instalacao manual no VS Code.

## Sugestoes de melhorias futuras

- Adicionar testes automatizados para os fluxos de servico e validacao.
- Adicionar configuracoes institucionais para politicas de laboratorio.
- Exibir um painel detalhado com historico de acoes da sessao.
- Implementar opcao para escolher entre escopo global e local por configuracao.

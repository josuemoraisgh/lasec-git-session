# How To Intall

Este arquivo descreve o processo manual para gerar o pacote da extensao e publicar no Visual Studio Marketplace pelo painel do publisher `josuemoraisgh`.

## Passo 1. Gerar o pacote da extensao

No terminal, na raiz do projeto, execute:

```bash
npm run package
```

Esse comando compila a extensao e gera um arquivo `.vsix` na pasta raiz do projeto.

Exemplo:

```text
lasec-git-session-0.1.0.vsix
```

Observacao:

- O nome do arquivo muda conforme a versao definida no `package.json`.

## Passo 2. Abrir o painel do publisher

Abra o link abaixo no navegador:

https://marketplace.visualstudio.com/manage/publishers/josuemoraisgh

## Passo 3. Fazer login

Entre com a conta que tem acesso ao publisher `josuemoraisgh`.

Depois do login, voce deve ver a tela de gerenciamento do publisher e a lista de extensoes publicadas.

## Passo 4. Enviar o pacote manualmente

Na tela do publisher:

1. Clique no botao `New extension`.
2. Selecione o arquivo `.vsix` gerado no passo 1.
3. Confirme o envio.

## Passo 5. Acompanhar a publicacao

Depois do upload, o Marketplace inicia a verificacao do pacote.

O status pode aparecer como:

- `Verifying`
- `Public`

Quando a verificacao terminar, a extensao ficara publicada no Marketplace.

## Resumo rapido

```bash
npm run package
```

Depois:

1. Abrir `https://marketplace.visualstudio.com/manage/publishers/josuemoraisgh`
2. Fazer login
3. Clicar em `New extension`
4. Enviar o arquivo `.vsix`


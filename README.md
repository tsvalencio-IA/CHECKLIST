# OFICIN-IA Checklist V15.4 — GitHub Pages + APK real

Pacote separado do SaaS principal, feito para subir em **um novo repositório GitHub** e publicar pelo **GitHub Pages**.

## Como subir no GitHub Pages

1. Crie um repositório novo, por exemplo `OFICIN-IA-CHECKLIST`.
2. Envie todos os arquivos deste ZIP para a **raiz** do repositório.
3. No GitHub, vá em **Settings > Pages**.
4. Em **Build and deployment**, selecione:
   - Source: **Deploy from a branch**
   - Branch: **main** ou **master**
   - Folder: **/root**
5. Salve.
6. O app abrirá pelo endereço do GitHub Pages do novo repositório.

## Como gerar APK real

1. Depois de subir o repositório, abra a aba **Actions**.
2. Rode o workflow **Build Checklist APK**.
3. Baixe o artefato **OFICIN-IA-CHECKLIST-V15-2-GITHUB-PAGES-APK**.
4. Instale o `app-debug.apk` no Android.

Resultado esperado:

- aparece ícone próprio chamado **Checklist Inteligente**;
- ao tocar no ícone, abre direto o Checklist;
- não abre o SaaS;
- usa o mesmo Firebase do SaaS.

## O que este pacote entrega

- `index.html` como entrada principal do app e do APK.
- `manifest.webmanifest` próprio para GitHub Pages.
- `service-worker.js` próprio.
- AppId Android próprio: `br.com.thiaguinhosolucoes.oficinia.checklist.v15githubpages`.
- Mesmo Firebase do SaaS: projeto `hub-thiaguinho` e suporte ao tenant/oficina.
- Login obrigatório, sem mostrar checklist anônimo.
- Não salva senha em `localStorage`.
- Histórico por placa.
- Checklist técnico com modelo correto: **ITEM + AÇÃO**.
- Checklist de entrega.
- Edição por seção para gestor/gerente/admin.
- Exclusão por gestor/gerente/admin.
- PDF, XLSX, JSON e impressão A4.
- Seção **Portas, fechaduras, limitadores e borrachas** com **Limitador / freio de porta**.

## URL do SaaS

O Checklist não precisa abrir o SaaS para funcionar.

Se quiser manter o botão **Abrir SaaS**, edite `js/config.js` e coloque o endereço do SaaS no GitHub Pages em:

```js
saasBaseUrl: 'https://SEU-USUARIO.github.io/SEU-REPOSITORIO-DO-SAAS/'
```

Se deixar vazio, o botão apenas avisa que a URL do SaaS não foi configurada.


## Correção V15.4 — GitHub Actions

O workflow usa `actions/setup-node@v4` com `node-version: 22.x`, porque o Capacitor CLI atual exige Node.js 22 ou superior. O erro `The Capacitor CLI requires NodeJS >=22.0.0` fica corrigido nesta versão.


## Correção V15.4

Esta versão fixa o Capacitor em `6.2.1` e remove o uso de `latest`, para evitar erro do GitHub Actions quando o `npx cap add android` exigir Node mais novo do que o runner realmente carregou. O workflow também imprime `node -v` antes do build.

## Correção V15.5/V15.9 — GitHub Actions sem erro de script antigo

Esta versão troca o workflow do APK por um fluxo mais robusto. O arquivo `.github/workflows/build-checklist-apk.yml` não depende mais do script antigo do repositório para aplicar ícone. Ele força o `package.json` correto durante a Action e aplica os ícones Android por Node inline.

Ao subir no GitHub, substitua todos os arquivos antigos, principalmente:

- `.github/workflows/build-checklist-apk.yml`
- `package.json`
- `scripts/generate-android-icons.js`
- `scripts/prepare-apk.js`
- `capacitor.config.json`

Se o repositório já tinha arquivos anteriores, apague/substitua antes de rodar a Action novamente.


## Correção V15.9 — impressão manual em até 2 folhas A4

A impressão manual do mecânico foi compactada para o padrão oficina em até 2 páginas:

- cabeçalho curto com placa, O.S., KM, data, cliente, veículo e mecânico;
- checklist distribuído em 4 colunas, 2 colunas por página;
- marcações compactas: OK, AT, TR, R/R, REV e N/A;
- assinatura do técnico, gestor/conferente e cliente na segunda página;
- sem cartões grandes e sem espaçamento de tela mobile na impressão.


## V15.9 — Correção de fluxo do mecânico

- O app não muda mais de seção sozinho.
- A seção só avança quando todos os itens dela tiverem uma ação marcada, inclusive N/A.
- O botão inferior não deixa ir para relato/fotos enquanto houver item pendente no checklist técnico.


## V15.13

- Botão **Ir para início** no topo e na barra inferior.
- Fluxo explícito para **Salvar / Editar / Excluir checklist salvo**.
- Consulta de checklists com botão **Editar**, **PDF** e **Excluir** para gestor.
- PDF premium redesenhado com cabeçalho profissional, resumo visual, seções separadas, badges de status e assinaturas.
- Cache atualizado para evitar arquivo antigo no APK/PWA.

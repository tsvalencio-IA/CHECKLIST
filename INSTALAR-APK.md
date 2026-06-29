# Instalar como aplicativo real pelo GitHub Pages

Este pacote é para **GitHub Pages**.

## Passo a passo

1. Crie um repositório novo no GitHub, por exemplo `OFICIN-IA-CHECKLIST`.
2. Suba todos os arquivos deste ZIP na raiz do repositório.
3. Ative o GitHub Pages em **Settings > Pages** usando a pasta `/root`.
4. Abra a aba **Actions**.
5. Rode **Build Checklist APK**.
6. Baixe o artefato **OFICIN-IA-CHECKLIST-V15-2-GITHUB-PAGES-APK**.
7. Instale o `app-debug.apk` no celular Android.

## Resultado esperado

- Ícone próprio: **Checklist Inteligente**.
- Ao abrir o app, ele abre direto o Checklist.
- Não abre o SaaS.
- Usa o mesmo Firebase do SaaS.


## Correção V15.4 — GitHub Actions

O workflow usa `actions/setup-node@v4` com `node-version: 22.x`, porque o Capacitor CLI atual exige Node.js 22 ou superior. O erro `The Capacitor CLI requires NodeJS >=22.0.0` fica corrigido nesta versão.


## Correção V15.4

Esta versão fixa o Capacitor em `6.2.1` e remove o uso de `latest`, para evitar erro do GitHub Actions quando o `npx cap add android` exigir Node mais novo do que o runner realmente carregou. O workflow também imprime `node -v` antes do build.

## Se aparecer erro `Missing script: android:icons`

Esse erro significa que o GitHub está usando arquivos misturados: workflow novo com `package.json` antigo. A V15.9 resolve isso no próprio workflow, mas você precisa substituir o arquivo:

`.github/workflows/build-checklist-apk.yml`

Depois rode a Action novamente em **Actions > Build Checklist APK > Run workflow**.


Correção V15.9: impressão manual A4 com grade de colunas fixas para impedir sobreposição do N/A sobre os nomes dos itens.


## V15.19
- Fotos por câmera ou galeria em fotos gerais e em cada item.
- Resumo inteligente de cotação com peças agrupadas por quantidade/posição.
- Serviços agrupados separados de peças.
- PDF de cotação compacto para 1 a 2 páginas quando possível.
- XLSX inteligente com abas Resumo_Executivo, Pecas_Agrupadas, Servicos_Agrupados, Avaliar_Aprovar, Itens_Detalhados e Fotos.

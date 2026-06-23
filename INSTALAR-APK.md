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


## Correção V15.3 — GitHub Actions

O workflow usa `actions/setup-node@v4` com `node-version: 22`, porque o Capacitor CLI atual exige Node.js 22 ou superior. O erro `The Capacitor CLI requires NodeJS >=22.0.0` fica corrigido nesta versão.

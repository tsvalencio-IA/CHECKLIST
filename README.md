# OFICIN-IA Checklist V15 — Repositório separado

Pacote separado do SaaS principal, feito para subir em um novo repositório e gerar APK próprio.

## O que este pacote entrega

- App web independente com entrada em `index.html`.
- APK com pacote próprio: `br.com.thiaguinhosolucoes.oficinia.checklist.v15`.
- Mesmo Firebase do SaaS: projeto `hub-thiaguinho` e suporte a `firebaseConfig` da oficina/tenant.
- Login obrigatório. Sem login, não mostra checklists nem histórico.
- Não salva senha em `localStorage`.
- Histórico por placa em `ordens_servico`, `ordensServico`, `checklists` e `checklistsEntrega`.
- Checklist técnico com modelo correto: ITEM + AÇÃO.
- Ações técnicas: OK, Atenção, Trocar, Retificar, Regular, Ajustar, Lubrificar, Limpar, Revisar e N/A.
- Checklist de entrega gerado a partir dos itens com ação técnica/atenção.
- Edição por seção somente para gestor/gerente/admin.
- Exclusão de checklist salvo somente para gestor/gerente/admin.
- Exportação PDF, XLSX, JSON e impressão manual A4.
- Manifest e service worker próprios, sem depender do SaaS.
- Workflow GitHub Actions para gerar APK.

## Como publicar

1. Crie um novo repositório, por exemplo `OFICIN-IA-CHECKLIST`.
2. Envie todos os arquivos deste ZIP para a raiz do repositório.
3. Publique no Vercel, GitHub Pages ou outro host estático.
4. O app abre em `index.html`.

## Como gerar APK

No GitHub:

1. Abra a aba `Actions`.
2. Rode o workflow `Build Checklist APK`.
3. Baixe o artefato `OFICIN-IA-CHECKLIST-V15-APK`.

O APK usa appId próprio e ícone próprio.

## Arquivos principais

- `index.html`: app principal.
- `js/config.js`: Firebase e configurações do app.
- `js/checklist.js`: lógica completa.
- `data/checklist-model.json`: modelo técnico item + ações.
- `manifest.webmanifest`: PWA independente.
- `service-worker.js`: cache independente.
- `.github/workflows/build-checklist-apk.yml`: build APK.
- `capacitor.config.json`: pacote Android próprio.
- `assets/icon.png` e `assets/splash.png`: ícone e splash do APK.

## Observações importantes

Este app foi separado propositalmente para não depender de `jarvis.html`, `equipe.html` ou `checklist.html` dentro do SaaS. O botão de SaaS abre a URL configurada em `js/config.js`.

Se as regras Firebase bloquearem leitura, gravação ou exclusão, o app mostra aviso e mantém fallback local para não travar o mecânico. A permissão final depende das regras do Firestore do SaaS/tenant.


## Ajuste V15.1 — aplicativo real e porta

- O APK usa o pacote nativo `br.com.thiaguinhosolucoes.oficinia.checklist.v15app`.
- O nome do aplicativo instalado fica `Checklist Inteligente`.
- Ao tocar no ícone instalado, o Android abre `index.html`, ou seja, abre o Checklist separado, não o SaaS.
- Para gerar o APK: suba este ZIP em um repositório novo e rode a Action **Build Checklist APK**. Baixe o artefato `OFICIN-IA-CHECKLIST-V15-1-APK`.
- Na seção **Portas, fechaduras, limitadores e borrachas**, foi incluído o item técnico **Limitador / freio de porta** separado de dobradiças.

Importante: pelo navegador, o botão `Instalar app/PWA` depende das regras do Chrome. Para aplicativo real com ícone próprio, use o APK gerado pela Action.

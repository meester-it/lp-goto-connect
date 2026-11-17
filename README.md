# LP GoTo Connect · Meester

Landing page da campanha GoTo Connect, publicada em **https://gotoconnect.meester.com.br**.
Os leads do formulário "Peça uma demonstração" vão para uma planilha no **Google Sheets**.

```
lp-goto-connect/
├─ public/                  ← site estático (o que vai para o Cloudflare Pages)
│  ├─ index.html
│  ├─ _headers              ← cache e cabeçalhos de segurança
│  └─ assets/
│     ├─ css/style.css
│     ├─ js/main.js         ← máscara de telefone, validação, UTMs, envio e eventos de conversão
│     └─ img/*.svg          ← animações GoTo (dashboard, WhatsApp/CX, telefonia, supervisor)
├─ functions/api/lead.js    ← Cloudflare Pages Function: POST /api/lead → Apps Script
├─ google-apps-script/Code.gs  ← grava os leads na planilha (+ e-mail opcional)
└─ wrangler.toml
```

Como funciona: Navegador → `POST /api/lead` (Cloudflare) → valida, filtra spam, adiciona cidade/IP → Apps Script (com senha secreta) → nova linha na aba **Leads**.

---

## 1. Planilha + Apps Script (Google)

1. Crie uma planilha no Google Sheets, por exemplo "Leads - LP GoTo Connect".
2. Abra **Extensões → Apps Script**, apague o conteúdo e cole `google-apps-script/Code.gs`.
3. Abra **Configurações do projeto (engrenagem) → Propriedades do script** e adicione:
   - `SHEETS_SECRET` = uma senha longa e aleatória (ex.: gere com `openssl rand -hex 24`)
   - `NOTIFY_EMAILS` = (opcional) `comercial@meester.com.br,outra@meester.com.br`
4. Clique em **Implantar → Nova implantação → App da Web**
   - Executar como: **Eu**
   - Quem pode acessar: **Qualquer pessoa**
5. Autorize e copie a **URL do App da Web** (termina em `/exec`).
6. (Opcional) No editor, execute `testeManual` para confirmar que uma linha aparece na aba **Leads**.

A aba `Leads` é criada automaticamente com o cabeçalho, as colunas **Status / Responsável / Observações** para o time comercial (Status com lista suspensa) e um link `wa.me` pronto para chamar o lead no WhatsApp.

> Se alterar o script depois: **Implantar → Gerenciar implantações → Editar → Nova versão**. Assim a URL `/exec` não muda.

## 2. Cloudflare Pages

**Opção A: pelo painel (mais simples)**
1. Cloudflare → **Workers & Pages → Create → Pages**.
2. Conecte o repositório Git com esta pasta. Se preferir não usar Git, faça o upload direto (mas aí a pasta `functions/` não é enviada; use a opção B).
   - Build command: *(vazio)*
   - Build output directory: `public`
3. **Settings → Variables and Secrets** (Production **e** Preview):
   - `GOOGLE_SCRIPT_URL` (Secret) = URL `/exec` do passo 1
   - `SHEETS_SECRET` (Secret) = mesma senha do Apps Script
   - `ALLOWED_ORIGINS` (texto) = `https://gotoconnect.meester.com.br`
4. Faça um novo deploy para aplicar as variáveis.

**Opção B: pela linha de comando**
```bash
npm i -g wrangler
wrangler login
cd lp-goto-connect
wrangler pages project create lp-goto-connect --production-branch main
wrangler pages secret put GOOGLE_SCRIPT_URL --project-name lp-goto-connect
wrangler pages secret put SHEETS_SECRET --project-name lp-goto-connect
wrangler pages deploy            # usa pages_build_output_dir = ./public e envia functions/
```

## 3. Domínio gotoconnect.meester.com.br

No projeto do Pages: **Custom domains → Set up a custom domain → `gotoconnect.meester.com.br`**.
- Se o DNS de `meester.com.br` já está na Cloudflare, o registro é criado automaticamente.
- Se o DNS está em outro provedor, crie um **CNAME** `gotoconnect` apontando para `lp-goto-connect.pages.dev` e aguarde a validação.

## 4. Teste final

1. Abra `https://gotoconnect.meester.com.br/?utm_source=teste&utm_campaign=whatsapp`
2. Envie o formulário. **Espere pelo menos 3 segundos antes de enviar**, porque envios mais rápidos são tratados como robô e descartados em silêncio.
3. Confira a nova linha na planilha com `utm_source = teste`.

Se der erro, veja **Pages → Functions → Real-time logs**. As mensagens "Apps Script error" mostram a resposta do Google. As causas mais comuns são o `SHEETS_SECRET` diferente nos dois lados, ou a implantação não estar com acesso "Qualquer pessoa".

## 5. Anúncios e conversões

Cole o GTM, o Meta Pixel ou o gtag no `<head>` do `index.html` (há um comentário marcando o lugar). Quando um lead é enviado com sucesso, a página dispara:
- `dataLayer.push({ event: 'generate_lead', form_id: 'demo_goto_connect', lead_interest, lead_users })`
- `gtag('event', 'generate_lead')`, se o gtag existir
- `fbq('track', 'Lead')`, se o Pixel existir

As UTMs e os IDs de clique (`gclid`, `gbraid`, `wbraid`, `fbclid`, `msclkid`, `li_fat_id`) ficam guardados durante a sessão e vão para a planilha. Com isso dá para importar conversões offline no Google Ads e no Meta.

## Pendências / ajustes recomendados

- **Política de Privacidade (LGPD):** o link do consentimento aponta para `https://www.meester.com.br`. Troque o `href` de `#privacy-link` no `index.html` pela URL da política.
- **Logo Meester:** carregada de `https://meester.com.br/Logo-Completa-Meester---Branca.png`. Se a imagem falhar, aparece o texto "meester". Para não depender do outro site, salve o arquivo em `public/assets/img/` e troque o `src`.
- **Logos oficiais GoTo / G2 / TrustRadius:** a página usa selos em texto. Se for usar as logos oficiais, siga o guia de marca de parceiros GoTo (partner.brand.goto.com).
- **Prazo de resposta:** a página promete "Resposta em até 1 dia útil" (abaixo do botão). Ajuste se o SLA for outro.

## Rodar localmente
```bash
printf 'GOOGLE_SCRIPT_URL=https://script.google.com/macros/s/XXX/exec\nSHEETS_SECRET=sua-senha\n' > .dev.vars
npx wrangler pages dev      # http://localhost:8788
```

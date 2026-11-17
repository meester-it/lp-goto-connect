/**
 * Cloudflare Pages Function — POST /api/lead
 *
 * Recebe o lead do formulário, valida, filtra spam e repassa para o
 * Google Apps Script, que grava a linha na planilha do Google Sheets.
 *
 * Variáveis de ambiente (Cloudflare Pages > Settings > Variables and Secrets):
 *   GOOGLE_SCRIPT_URL   (obrigatória) URL do App da Web do Apps Script (termina em /exec)
 *   SHEETS_SECRET       (obrigatória) mesmo valor da propriedade SHEETS_SECRET no Apps Script
 *   ALLOWED_ORIGINS     (opcional)   lista separada por vírgula. Padrão abaixo.
 */

const DEFAULT_ORIGINS = [
  'https://gotoconnect.meester.com.br',
];

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const clean = (v, max = 200) =>
  String(v ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .trim()
    // evita injeção de fórmula no Google Sheets (=, +, -, @ no início)
    .replace(/^[=+\-@]+/, '')
    .slice(0, max);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function originAllowed(request, env) {
  const origin = request.headers.get('origin');
  if (!origin) return true; // alguns navegadores não enviam em same-origin
  const list = (env.ALLOWED_ORIGINS || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  const allowed = list.length ? list : DEFAULT_ORIGINS;
  const url = new URL(origin);
  return (
    allowed.includes(origin) ||
    url.hostname.endsWith('.pages.dev') ||       // previews do Cloudflare Pages
    url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  );
}

export async function onRequestPost({ request, env }) {
  if (!originAllowed(request, env)) return json({ ok: false, error: 'Origem não permitida.' }, 403);
  if (!env.GOOGLE_SCRIPT_URL || !env.SHEETS_SECRET) {
    return json({ ok: false, error: 'Formulário não configurado. Tente novamente mais tarde.' }, 500);
  }

  let body;
  try {
    const text = await request.text();
    if (text.length > 10_000) return json({ ok: false, error: 'Requisição muito grande.' }, 413);
    body = JSON.parse(text);
  } catch {
    return json({ ok: false, error: 'Requisição inválida.' }, 400);
  }

  // --- Anti-spam: honeypot + envio rápido demais (bots) -> finge sucesso e descarta
  if (body.website || Number(body.elapsed_ms) < 2500) {
    return json({ ok: true });
  }

  const lead = {
    nome: clean(body.nome, 120),
    email: clean(body.email, 160).toLowerCase(),
    telefone: clean(body.telefone, 20),
    empresa: clean(body.empresa, 160),
    usuarios: clean(body.usuarios, 30),
    interesse: clean(body.interesse, 60),
    consentimento: body.consentimento === true ? 'Sim' : 'Não',
    email_corporativo: body.email_corporativo === false ? 'Não' : 'Sim',
  };

  const phoneDigits = lead.telefone.replace(/\D/g, '');
  if (lead.nome.length < 3) return json({ ok: false, error: 'Informe seu nome.' }, 422);
  if (!EMAIL_RE.test(lead.email)) return json({ ok: false, error: 'Informe um e-mail válido.' }, 422);
  if (phoneDigits.length < 10 || phoneDigits.length > 13) return json({ ok: false, error: 'Informe um telefone com DDD.' }, 422);
  if (lead.empresa.length < 2) return json({ ok: false, error: 'Informe o nome da empresa.' }, 422);
  if (!lead.usuarios) return json({ ok: false, error: 'Selecione o número de usuários.' }, 422);
  if (lead.consentimento !== 'Sim') return json({ ok: false, error: 'É necessário aceitar o contato.' }, 422);

  const tracking = {};
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
                   'gclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid', 'li_fat_id',
                   'landing_url', 'referrer', 'page_url']) {
    tracking[k] = clean(body[k], 500);
  }

  const cf = request.cf || {};
  const payload = {
    secret: env.SHEETS_SECRET,
    data_hora: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
    ...lead,
    telefone_e164: '+55' + phoneDigits.replace(/^55(?=\d{10,11}$)/, ''),
    whatsapp_link: 'https://wa.me/55' + phoneDigits.replace(/^55(?=\d{10,11}$)/, ''),
    ...tracking,
    cidade: clean(cf.city, 80),
    estado: clean(cf.region, 80),
    pais: clean(cf.country, 5),
    ip: clean(request.headers.get('cf-connecting-ip'), 60),
    user_agent: clean(request.headers.get('user-agent'), 300),
  };

  try {
    // O Apps Script responde com redirect 302 -> seguimos automaticamente
    const res = await fetch(env.GOOGLE_SCRIPT_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      redirect: 'follow',
    });
    const text = await res.text();
    let out = {};
    try { out = JSON.parse(text); } catch { /* resposta não-JSON */ }
    if (!res.ok || out.ok !== true) {
      console.error('Apps Script error', res.status, text.slice(0, 500));
      return json({ ok: false, error: 'Não foi possível registrar agora. Tente novamente em instantes.' }, 502);
    }
  } catch (err) {
    console.error('Fetch error', err);
    return json({ ok: false, error: 'Não foi possível registrar agora. Tente novamente em instantes.' }, 502);
  }

  return json({ ok: true });
}

export async function onRequest({ request }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  return json({ ok: false, error: 'Método não permitido.' }, 405);
}

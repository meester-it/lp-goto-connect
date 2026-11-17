(function () {
  'use strict';

  var CONFIG = {
    endpoint: '/api/lead',
    // Domínios de e-mail pessoal: aceitos, mas sinalizados na planilha (coluna "email_corporativo")
    freeDomains: ['gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'yahoo.com.br', 'live.com', 'icloud.com', 'bol.com.br', 'uol.com.br', 'terra.com.br']
  };

  var startedAt = Date.now();
  var yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---------- UTMs e IDs de clique (guardados durante a sessão) ---------- */
  var TRACK_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid', 'li_fat_id'];
  var tracking = {};
  try { tracking = JSON.parse(sessionStorage.getItem('lp_tracking') || '{}'); } catch (e) { tracking = {}; }
  var params = new URLSearchParams(window.location.search);
  TRACK_KEYS.forEach(function (k) { if (params.get(k)) tracking[k] = params.get(k).slice(0, 300); });
  if (!tracking.landing_url) tracking.landing_url = window.location.href.slice(0, 500);
  if (!tracking.referrer && document.referrer) tracking.referrer = document.referrer.slice(0, 500);
  try { sessionStorage.setItem('lp_tracking', JSON.stringify(tracking)); } catch (e) { /* modo privado */ }

  /* ---------- Máscara de telefone BR ---------- */
  var tel = document.getElementById('telefone');
  function maskPhone(v) {
    var d = v.replace(/\D/g, '');
    if (d.indexOf('55') === 0 && d.length > 11) d = d.slice(2);
    d = d.slice(0, 11);
    if (d.length <= 2) return d.length ? '(' + d : '';
    if (d.length <= 6) return '(' + d.slice(0, 2) + ') ' + d.slice(2);
    if (d.length <= 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
    return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
  }
  if (tel) tel.addEventListener('input', function () { tel.value = maskPhone(tel.value); });

  /* ---------- Validação ---------- */
  var form = document.getElementById('lead-form');
  var msg = document.getElementById('form-msg');
  var btn = document.getElementById('submit-btn');
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function setInvalid(el, bad) {
    var wrap = el.closest('.field') || el.closest('.consent');
    if (wrap) wrap.classList.toggle('is-invalid', bad);
    el.setAttribute('aria-invalid', bad ? 'true' : 'false');
  }

  function validate() {
    var errors = [];
    var nome = form.nome, email = form.email, empresa = form.empresa, usuarios = form.usuarios, consent = form.consentimento;
    var phoneDigits = tel.value.replace(/\D/g, '');

    var checks = [
      [nome, nome.value.trim().length >= 3, 'Informe seu nome.'],
      [email, EMAIL_RE.test(email.value.trim()), 'Informe um e-mail válido.'],
      [tel, phoneDigits.length >= 10 && phoneDigits.length <= 11, 'Informe um telefone com DDD.'],
      [empresa, empresa.value.trim().length >= 2, 'Informe o nome da empresa.'],
      [usuarios, !!usuarios.value, 'Selecione o número de usuários.'],
      [consent, consent.checked, 'É necessário aceitar o contato e a Política de Privacidade.']
    ];
    checks.forEach(function (c) { setInvalid(c[0], !c[1]); if (!c[1]) errors.push(c); });
    return errors;
  }

  form.addEventListener('input', function (e) {
    var w = e.target.closest('.is-invalid');
    if (w) { w.classList.remove('is-invalid'); e.target.setAttribute('aria-invalid', 'false'); }
  });
  form.addEventListener('change', function (e) {
    var w = e.target.closest('.is-invalid');
    if (w) w.classList.remove('is-invalid');
  });

  /* ---------- Envio ---------- */
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    msg.textContent = '';
    var errors = validate();
    if (errors.length) {
      msg.textContent = errors[0][2];
      errors[0][0].focus();
      return;
    }

    var email = form.email.value.trim().toLowerCase();
    var domain = email.split('@')[1] || '';
    var payload = {
      nome: form.nome.value.trim(),
      email: email,
      telefone: tel.value.trim(),
      empresa: form.empresa.value.trim(),
      usuarios: form.usuarios.value,
      interesse: form.interesse.value,
      consentimento: form.consentimento.checked,
      email_corporativo: CONFIG.freeDomains.indexOf(domain) === -1,
      website: form.website.value, // honeypot
      elapsed_ms: Date.now() - startedAt,
      page_url: window.location.href.slice(0, 500)
    };
    TRACK_KEYS.concat(['landing_url', 'referrer']).forEach(function (k) { if (tracking[k]) payload[k] = tracking[k]; });

    btn.classList.add('is-loading');
    btn.setAttribute('aria-busy', 'true');

    fetch(CONFIG.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, body: j }; }); })
      .then(function (res) {
        if (!res.ok || !res.body.ok) throw new Error(res.body.error || 'Falha no envio');
        onSuccess(payload);
      })
      .catch(function (err) {
        msg.textContent = (err && err.message && err.message !== 'Failed to fetch')
          ? err.message
          : 'Não foi possível enviar agora. Verifique sua conexão e tente novamente.';
      })
      .finally(function () {
        btn.classList.remove('is-loading');
        btn.removeAttribute('aria-busy');
      });
  });

  function onSuccess(p) {
    // Eventos de conversão para as plataformas de anúncio
    try {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ event: 'generate_lead', form_id: 'demo_goto_connect', lead_interest: p.interesse, lead_users: p.usuarios });
      if (typeof window.gtag === 'function') window.gtag('event', 'generate_lead', { form_id: 'demo_goto_connect' });
      if (typeof window.fbq === 'function') window.fbq('track', 'Lead', { content_name: 'Demo GoTo Connect' });
    } catch (e) { /* não bloqueia o fluxo */ }

    var first = p.nome.split(' ')[0];
    document.getElementById('success-name').textContent = first;
    form.hidden = true;
    var head = document.querySelector('.form-card__head');
    if (head) head.hidden = true;
    var ok = document.getElementById('form-success');
    ok.hidden = false;
    ok.focus({ preventScroll: true });
    document.getElementById('demo').scrollIntoView({ behavior: 'smooth', block: 'start' });
    try { sessionStorage.removeItem('lp_tracking'); } catch (e) { }
  }

  /* ---------- Barra de CTA fixa no celular ---------- */
  var bar = document.getElementById('mobile-bar');
  var formCard = document.getElementById('demo');
  if (bar && formCard && 'IntersectionObserver' in window) {
    var successEl = document.getElementById('form-success');
    new IntersectionObserver(function (entries) {
      var en = entries[0];
      // Mostra só depois que o usuário rolou PASSANDO do formulário, e enquanto não converteu
      var show = !en.isIntersecting && en.boundingClientRect.top < 0 && successEl.hidden;
      bar.classList.toggle('is-visible', show);
      bar.setAttribute('aria-hidden', show ? 'false' : 'true');
      bar.querySelector('a').tabIndex = show ? 0 : -1;
    }, { threshold: 0 }).observe(formCard);
  }
})();

/**
 * Google Apps Script — recebe os leads da LP GoTo Connect e grava na planilha.
 *
 * COMO INSTALAR (5 minutos):
 * 1. Crie uma planilha no Google Sheets (ex.: "Leads - LP GoTo Connect").
 * 2. Menu Extensões > Apps Script. Apague o conteúdo e cole este arquivo.
 * 3. Engrenagem "Configurações do projeto" > Propriedades do script > Adicionar:
 *      SHEETS_SECRET = (uma senha longa e aleatória — a mesma que vai no Cloudflare)
 *      NOTIFY_EMAILS = (opcional) e-mails separados por vírgula para avisar a cada novo lead
 * 4. Implantar > Nova implantação > Tipo: App da Web
 *      Executar como: Eu
 *      Quem pode acessar: Qualquer pessoa
 *    Autorize e copie a URL que termina em /exec  ->  GOOGLE_SCRIPT_URL no Cloudflare.
 * 5. (Opcional) Rode a função testeManual() uma vez no editor para validar.
 *
 * Ao alterar este código depois: Implantar > Gerenciar implantações > Editar > Nova versão
 * (assim a URL /exec continua a mesma).
 */

const SHEET_NAME = 'Leads';

const COLUMNS = [
  ['data_hora', 'Data/Hora'],
  ['nome', 'Nome'],
  ['email', 'E-mail'],
  ['telefone', 'Telefone'],
  ['whatsapp_link', 'WhatsApp'],
  ['empresa', 'Empresa'],
  ['usuarios', 'Nº usuários'],
  ['interesse', 'Interesse'],
  ['email_corporativo', 'E-mail corporativo?'],
  ['consentimento', 'Consentimento LGPD'],
  ['status', 'Status'],
  ['responsavel', 'Responsável'],
  ['observacoes', 'Observações'],
  ['utm_source', 'utm_source'],
  ['utm_medium', 'utm_medium'],
  ['utm_campaign', 'utm_campaign'],
  ['utm_term', 'utm_term'],
  ['utm_content', 'utm_content'],
  ['gclid', 'gclid'],
  ['gbraid', 'gbraid'],
  ['wbraid', 'wbraid'],
  ['fbclid', 'fbclid'],
  ['msclkid', 'msclkid'],
  ['li_fat_id', 'li_fat_id'],
  ['telefone_e164', 'Telefone E.164'],
  ['cidade', 'Cidade (IP)'],
  ['estado', 'Estado (IP)'],
  ['pais', 'País (IP)'],
  ['landing_url', 'URL de entrada'],
  ['referrer', 'Referrer'],
  ['page_url', 'URL do envio'],
  ['ip', 'IP'],
  ['user_agent', 'User agent'],
];

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    const data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const secret = PropertiesService.getScriptProperties().getProperty('SHEETS_SECRET');
    if (!secret || data.secret !== secret) return out_({ ok: false, error: 'unauthorized' });

    data.status = data.status || 'Novo';

    lock.waitLock(20000);
    const sheet = getSheet_();
    const row = COLUMNS.map(function (c) {
      const v = data[c[0]];
      return v === undefined || v === null ? '' : String(v);
    });
    sheet.appendRow(row);
    lock.releaseLock();

    notify_(data);
    return out_({ ok: true });
  } catch (err) {
    try { lock.releaseLock(); } catch (x) {}
    console.error(err);
    return out_({ ok: false, error: String(err) });
  }
}

function doGet() {
  return out_({ ok: true, service: 'lp-goto-connect-leads' });
}

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(COLUMNS.map(function (c) { return c[1]; }));
    const header = sheet.getRange(1, 1, 1, COLUMNS.length);
    header.setFontWeight('bold').setBackground('#0B0D10').setFontColor('#FFE900');
    sheet.setFrozenRows(1);
    // Lista suspensa de status para o time comercial
    const statusCol = COLUMNS.findIndex(function (c) { return c[0] === 'status'; }) + 1;
    const rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['Novo', 'Em contato', 'Demo agendada', 'Proposta', 'Ganho', 'Perdido'], true)
      .build();
    sheet.getRange(2, statusCol, sheet.getMaxRows() - 1, 1).setDataValidation(rule);
  }
  return sheet;
}

function notify_(d) {
  const to = PropertiesService.getScriptProperties().getProperty('NOTIFY_EMAILS');
  if (!to) return;
  const subject = 'Novo lead GoTo Connect: ' + d.nome + ' (' + d.empresa + ')';
  const body = [
    'Novo pedido de demonstração na LP GoTo Connect',
    '',
    'Nome: ' + d.nome,
    'E-mail: ' + d.email,
    'Telefone: ' + d.telefone,
    'WhatsApp: ' + d.whatsapp_link,
    'Empresa: ' + d.empresa,
    'Usuários: ' + d.usuarios,
    'Interesse: ' + d.interesse,
    'Origem: ' + [d.utm_source, d.utm_medium, d.utm_campaign].filter(String).join(' / '),
    '',
    'Planilha: ' + SpreadsheetApp.getActiveSpreadsheet().getUrl(),
  ].join('\n');
  try { MailApp.sendEmail(to, subject, body); } catch (err) { console.error(err); }
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Rode no editor para testar a gravação sem passar pelo site. */
function testeManual() {
  const secret = PropertiesService.getScriptProperties().getProperty('SHEETS_SECRET');
  const res = doPost({ postData: { contents: JSON.stringify({
    secret: secret,
    data_hora: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
    nome: 'Teste Manual', email: 'teste@empresa.com.br', telefone: '(11) 91234-5678',
    whatsapp_link: 'https://wa.me/5511912345678', empresa: 'Empresa Teste', usuarios: '11 a 50',
    interesse: 'Telefonia + WhatsApp', email_corporativo: 'Sim', consentimento: 'Sim', utm_source: 'teste',
  }) } });
  Logger.log(res.getContent());
}

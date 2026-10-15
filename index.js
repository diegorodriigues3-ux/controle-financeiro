import { makeWASocket, useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import express from 'express';
import qrcode from 'qrcode';
import pino from 'pino';

const app = express();
app.use(express.json());

const GROQ_KEY = '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';
const SUPABASE_URL = 'https://ugyrxgpffvrmzomldibk.supabase.co';
const SUPABASE_KEY = 'sb_publishable_hoyDXLDegE51neY2E7e-FA_m8owsoDe';

let qrCodeAtual = '';
let statusConexao = 'A iniciar...';

async function iniciarWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' })
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    
    if (qr) {
      qrCodeAtual = await qrcode.toDataURL(qr);
      statusConexao = 'A aguardar leitura do QR Code';
      console.log('📱 QR Code gerado! Abra http://localhost:3000 no seu navegador.');
    }

    if (connection === 'close') {
      statusConexao = 'Desconectado';
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('⚠️ Conexão fechada. A reconectar...', shouldReconnect);
      if (shouldReconnect) {
        iniciarWhatsApp();
      }
    } else if (connection === 'open') {
      statusConexao = 'Conectado com sucesso!';
      qrCodeAtual = '';
      console.log('✅ WhatsApp conectado com sucesso!');
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;

      const numeroWhatsapp = msg.key.remoteJid;
      const textoMensagem = msg.message.conversation || 
                            msg.message.extendedTextMessage?.text;

      if (!textoMensagem) continue;

      console.log(`\n💬 Mensagem recebida de ${numeroWhatsapp}: "${textoMensagem}"`);

      try {
        const promptSistema = `
          Você é o cérebro financeiro de um aplicativo de controle de gastos. 
          Analise a frase enviada pelo usuário e extraia as informações estritamente no formato JSON.
          Retorne APENAS o JSON válido sem marcação markdown e sem explicações.
          Formatos permitidos:
          {
            "valor": 0.00,
            "descricao": "nome do item ou estabelecimento",
            "categoria": "Alimentação, Transporte, Lazer, Moradia, Saúde, Outros",
            "forma_pagamento": "Pix, Crédito, Débito, Dinheiro"
          }
        `;

        const responseIa = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${GROQ_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'openai/gpt-oss-20b',
            messages: [
              { role: 'system', content: promptSistema },
              { role: 'user', content: `Frase do usuário: "${textoMensagem}"` }
            ],
            temperature: 0.1
          })
        });

        const dataIa = await responseIa.json();
        const conteudoIa = dataIa.choices[0].message.content.trim();
        const dadosGasto = JSON.parse(conteudoIa);

        const responseSupabase = await fetch(`${SUPABASE_URL}/rest/v1/gastos`, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
          },
          body: JSON.stringify({
            whatsapp_number: numeroWhatsapp,
            valor: dadosGasto.valor,
            descricao: dadosGasto.descricao,
            categoria: dadosGasto.categoria,
            forma_pagamento: dadosGasto.forma_pagamento,
            plano_usuario: 'free'
          })
        });

        if (!responseSupabase.ok) {
          throw new Error("Erro ao salvar no Supabase");
        }

        console.log(`✅ Gasto salvo: R$ ${dadosGasto.valor} (${dadosGasto.categoria})`);

        await sock.sendMessage(numeroWhatsapp, { 
          text: `✅ Gasto registado com sucesso!\n\n📌 *Item:* ${dadosGasto.descricao}\n💰 *Valor:* R$ ${dadosGasto.valor.toFixed(2)}\n📂 *Categoria:* ${dadosGasto.categoria}\n💳 *Pagamento:* ${dadosGasto.forma_pagamento}` 
        });

      } catch (error) {
        console.error('❌ Erro ao processar mensagem:', error.message);
      }
    }
  });
}

// Página web simples para exibir o QR Code com nitidez
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="pt">
    <head>
      <meta charset="UTF-8">
      <title>Conectar WhatsApp</title>
      <style>
        body { font-family: Arial, sans-serif; text-align: center; background: #121214; color: #fff; padding-top: 50px; }
        h1 { color: #00b37e; }
        .box { background: #202024; display: inline-block; padding: 30px; border-radius: 12px; border: 1px solid #29292e; }
        img { margin-top: 20px; border-radius: 8px; background: white; padding: 10px; }
      </style>
      <meta http-equiv="refresh" content="5">
    </head>
    <body>
      <div class="box">
        <h1>Conectar WhatsApp ao Bot</h1>
        <p>Estado: <strong>${statusConexao}</strong></p>
        ${qrCodeAtual ? `<img src="${qrCodeAtual}" alt="QR Code" width="300" height="300">` : '<p>A gerar QR Code ou já conectado...</p>'}
        <p style="margin-top: 15px; font-size: 14px; color: #a8a8b3;">A página atualiza automaticamente a cada 5 segundos.</p>
      </div>
    </body>
    </html>
  `);
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor web iniciado em http://localhost:3000`);
});

iniciarWhatsApp();
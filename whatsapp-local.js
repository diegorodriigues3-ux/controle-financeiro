import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import pino from 'pino';
import fs from 'fs';
import path from 'path';

const ARQUIVO_DADOS = path.resolve('gastos.json');

// Função auxiliar para carregar os gastos salvos
function lerGastos() {
  if (!fs.existsSync(ARQUIVO_DADOS)) {
    return [];
  }
  try {
    const dados = fs.readFileSync(ARQUIVO_DADOS, 'utf-8');
    return JSON.parse(dados);
  } catch (e) {
    return [];
  }
}

// Função auxiliar para salvar um novo gasto
function salvarGasto(descricao, valor) {
  const gastos = lerGastos();
  const novoGasto = {
    id: Date.now(),
    descricao,
    valor: parseFloat(valor),
    data: new Date().toLocaleDateString('pt-BR')
  };
  gastos.push(novoGasto);
  fs.writeFileSync(ARQUIVO_DADOS, JSON.stringify(gastos, null, 2));
  return novoGasto;
}

async function iniciarWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

  const sock = makeWASocket.default ? makeWASocket.default({
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ["Chrome (Linux)", "", ""]
  }) : makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ["Chrome (Linux)", "", ""]
  });

  sock.ev.on('connection.update', (update) => {
    const { connection, qr, lastDisconnect } = update;

    if (qr) {
      console.log('\n================================================--');
      console.log('Escaneie o QR Code abaixo no seu WhatsApp:');
      qrcode.generate(qr, { small: true });
      console.log('================================================--\n');
    }

    if (connection === 'open') {
      console.log('✅ WhatsApp conectado com sucesso! Pronto para receber os seus gastos.');
    }

    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('Conexão fechada. Tentando reconectar...', shouldReconnect);
      if (shouldReconnect) {
        iniciarWhatsApp();
      }
    }
  });

  // Ouvir mensagens enviadas no chat
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    const msg = messages[0];
    if (!msg.message) return;

    // FILTRO DE SEGURANÇA: Se a mensagem NÃO foi enviada por si mesmo (chat privado de outra pessoa ou grupo), ignora!
    // O Baileys marca mensagens enviadas por si com 'fromMe: true'
    if (!msg.key.fromMe) return;

    const remetente = msg.key.remoteJid;
    const textoMensagem = msg.message.conversation || msg.message.extendedTextMessage?.text;

    if (!textoMensagem) return;

    console.log(`📩 Mensagem sua recebida: "${textoMensagem}"`);
    const textoLower = textoMensagem.toLowerCase().trim();

    // Se o comando for para ver o dashboard / planilha
    if (textoLower === 'dashboard' || textoLower === 'planilha' || textoLower === 'relatorio') {
      const gastos = lerGastos();
      const total = gastos.reduce((acc, item) => acc + item.valor, 0);
      
      await sock.sendMessage(remetente, { 
        text: `📊 *Painel Financeiro Local*\n\n💰 Total gasto registado: R$ ${total.toFixed(2)}\n📁 Para ver o painel visual completo, abra o arquivo *dashboard.html* no seu computador!` 
      });
      return;
    }

    // Se o comando começar com "gasto" (Ex: gasto 50 mercado)
    if (textoLower.startsWith('gasto')) {
      const partes = textoMensagem.trim().split(' ');
      
      if (partes.length >= 3) {
        const valorStr = partes[1].replace(',', '.');
        const valor = parseFloat(valorStr);
        const descricao = partes.slice(2).join(' ');

        if (isNaN(valor)) {
          await sock.sendMessage(remetente, { text: '⚠️ Valor inválido. Use o formato: *gasto 50 mercado*' });
          return;
        }

        // Salva no arquivo local JSON
        salvarGasto(descricao, valor);

        console.log(`💾 Gasto salvo: ${descricao} - R$ ${valor}`);

        // Confirmação no WhatsApp
        await sock.sendMessage(remetente, { 
          text: `✅ *Gasto registado com sucesso!*\n\n📌 Descrição: ${descricao}\n💰 Valor: R$ ${valor.toFixed(2)}` 
        });
      } else {
        await sock.sendMessage(remetente, { text: '⚠️ Formato incompleto. Use: *gasto [valor] [descrição]*\nExemplo: `gasto 50 mercado`' });
      }
    }
  });

  sock.ev.on('creds.update', saveCreds);
}

iniciarWhatsApp();
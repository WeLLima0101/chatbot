const express = require('express');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const { Client, LocalAuth } = require('whatsapp-web.js');
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const axios = require('axios');

// ======================================================
// 1) Configurações Iniciais de Express + Variáveis de Ambiente
// ======================================================
const app = express();
app.use(express.json()); // Para receber JSON no body

const port = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || '0009991100';

// ======================================================
// 2) Logs Iniciais e Criação de Pastas
// ======================================================
console.log('[DEBUG] __dirname:', __dirname);

// Cria a pasta "public" (usada para salvar o QR Code, se necessário)
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir);
    console.log('[DEBUG] Criou pasta public:', publicDir);
} else {
    console.log('[DEBUG] Pasta public já existe:', publicDir);
}

// Cria a pasta "data" para o CSV
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log('[DEBUG] Criou pasta data:', dataDir);
} else {
    console.log('[DEBUG] Pasta data já existe:', dataDir);
}

// Caminho completo do CSV
const filePath = path.join(dataDir, 'solicitacoes.csv');
console.log('[DEBUG] filePath definido como:', filePath);

// ======================================================
// 3) Configuração do whatsapp-web.js
// ======================================================
const client = new Client({
    authStrategy: new LocalAuth({
        clientId: "client-one"
    }),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

let isClientInitialized = false;

// Remove sessão antiga, se existir
const sessionPath = './.wwebjs_auth/session-client-one/Default';
if (fs.existsSync(sessionPath)) {
    try {
        fs.rmdirSync(sessionPath, { recursive: true });
        console.log('Sessão antiga removida com sucesso.');
    } catch (err) {
        console.error('Erro ao remover a sessão antiga:', err.message);
    }
}

// Gera QR Code para autenticação
client.on('qr', (qr) => {
    if (!isClientInitialized) {
        console.log('QR Code gerado! Escaneie o código abaixo para autenticar:');
        qrcode.generate(qr, { small: true });
        QRCode.toFile(path.join(publicDir, 'qrcode.png'), qr, (err) => {
            if (err) {
                console.error('Erro ao salvar o QR Code:', err);
            } else {
                console.log('QR Code salvo como "qrcode.png".');
            }
        });
    }
});

// Quando o cliente estiver pronto
client.on('ready', () => {
    console.log('Tudo certo! WhatsApp conectado (whatsapp-web.js).');
    isClientInitialized = true;
});

// Tratamento de falha na autenticação
client.on('auth_failure', (msg) => {
    console.error('Falha na autenticação:', msg);
    if (!isClientInitialized) {
        console.log('Tentando reiniciar o cliente...');
        client.initialize();
    }
});

// Tratamento de desconexão
client.on('disconnected', (reason) => {
    console.log('Cliente desconectado. Motivo:', reason);
    console.log('Tentando reconectar...');
    client.destroy().then(() => {
        client.initialize();
    }).catch((err) => {
        console.error('Erro ao tentar reinicializar o cliente:', err);
    });
});

// Inicializa o cliente whatsapp-web.js
client.initialize();

// ======================================================
// 4) Configuração do CSV + Google Drive
// ======================================================
const driveCredentials = JSON.parse(process.env.GOOGLE_CREDENTIALS || '{}');
const authGoogle = new google.auth.GoogleAuth({
  credentials: driveCredentials,
  scopes: ['https://www.googleapis.com/auth/drive']
});
const drive = google.drive({ version: 'v3', auth: authGoogle });

const folderId = '1Q55EziaXR-Q9Raq1e7lfdC5I7-mkYSgs'; // Ajuste para sua pasta no Drive

async function uploadFileToDrive() {
    try {
        console.log('[DEBUG] Tentando fazer upload do arquivo:', filePath);
        const response = await drive.files.create({
            requestBody: {
                name: 'solicitacoes.csv',
                mimeType: 'text/csv',
                parents: [folderId]
            },
            media: {
                mimeType: 'text/csv',
                body: fs.createReadStream(filePath)
            }
        });
        console.log('✅ Arquivo enviado para o Google Drive:', response.data.id);
    } catch (error) {
        console.error('❌ Erro ao enviar para o Google Drive:', error.message);
    }
}

function saveToCSV(data) {
    try {
        console.log('[DEBUG] Entrou em saveToCSV. Dados recebidos:', data);
        const header = 'Projeto;Rua;Número;Bairro;Cidade;Email;Data/Hora\n';
        const newLine = `${data.project};${data.street || ''};${data.number || ''};${data.neighborhood || ''};${data.city || ''};${data.email || ''};${new Date().toLocaleString()}\n`;
        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, header + newLine, 'utf8');
            console.log('[DEBUG] CSV não existia, criando novo arquivo com cabeçalho...');
        } else {
            fs.appendFileSync(filePath, newLine, 'utf8');
            console.log('[DEBUG] CSV já existia, adicionando nova linha...');
        }
        uploadFileToDrive();
    } catch (err) {
        console.error('Erro ao salvar no CSV:', err.message);
        // Se quiser notificar via whatsapp-web.js:
        // client.sendMessage(adminNumber, `⚠️ Erro ao salvar os dados no CSV: ${err.message}`);
    }
}

// ======================================================
// 5) API Oficial do WhatsApp (Cloud API)
const whatsappCloudApiToken = process.env.WHATSAPP_CLOUD_TOKEN || '';
const phoneNumberId = process.env.PHONE_NUMBER_ID || '';

async function sendOfficialMessage(messageText, recipientNumber) {
    try {
        if (!whatsappCloudApiToken || !phoneNumberId) {
            console.error("❌ Token ou Phone Number ID não configurados!");
            return;
        }
        const endpoint = `https://graph.facebook.com/v15.0/${phoneNumberId}/messages`;
        console.log('[DEBUG] Enviando mensagem oficial via API para:', recipientNumber);
        const response = await axios.post(endpoint, {
            messaging_product: "whatsapp",
            to: recipientNumber, // ex: '5511999998888'
            type: "text",
            text: { body: messageText }
        }, {
            headers: {
                Authorization: `Bearer ${whatsappCloudApiToken}`,
                "Content-Type": "application/json"
            }
        });
        console.log("✅ Mensagem enviada via API oficial:", response.data);
    } catch (error) {
        console.error("❌ Erro ao enviar mensagem via API oficial:", error.response ? error.response.data : error.message);
    }
}

// ======================================================
// 6) Fluxo do Chatbot via whatsapp-web.js
const clientStates = new Map();
const adminNumber = '551140150044@c.us';

client.on('message', async msg => {
    console.log(`Mensagem recebida de ${msg.from}: ${msg.body}`);
    // Se quiser manipular a digitação:
    const chat = await msg.getChat();

    // Menu inicial
    if (msg.body.match(/(menu|Menu|início|Inicio|Oi|oi|Olá|olá|ola|Ola)/i)) {
        clientStates.delete(msg.from);
        await delay(3000);
        await chat.sendStateTyping();
        await delay(3000);
        const contact = await msg.getContact();
        const name = contact.pushname;
        await client.sendMessage(msg.from,
            `🌟 *Olá, ${name.split(' ')[0]}!* Seja muito bem-vindo(a) à *Status Serviços*! 🌟\n\n` +
            `Como posso ajudá-lo(a) hoje? Escolha uma das opções abaixo digitando o número correspondente:\n\n` +
            `1️⃣ - *Conhecer nossos serviços*\n` +
            `2️⃣ - *Solicitar orçamento*\n` +
            `3️⃣ - *Falar com um atendente*\n` +
            `4️⃣ - *Nossos contatos*\n` +
            `5️⃣ - *Outras dúvidas*\n` +
            `6️⃣ - *Encerrar conversa*\n` +
            `7️⃣ - *Enviar mensagem oficial de teste*\n\n` +
            `📌 *Dica*: Sempre que quiser voltar ao menu inicial, digite *menu*!`
        );
        return;
    }

    // Item 1: Conhecer nossos serviços
    if (msg.body === '1') {
        await delay(3000);
        await chat.sendStateTyping();
        await delay(3000);
        await client.sendMessage(msg.from,
            'Oferecemos uma variedade de serviços especializados para a conservação e manutenção de fachadas, incluindo:\n\n' +
            '🧹 **Limpeza de Fachadas**\n' +
            '🎨 **Pintura Predial**\n' +
            '🛠️ **Restauração de Fachadas**\n' +
            '💧 **Impermeabilização de Fachadas**\n' +
            '🔧 **Vedação em Pele de Vidro**\n' +
            '📋 **Mapeamento de Fachadas**\n\n' +
            'Para mais detalhes sobre nossos serviços, visite: https://statusserv.com.br/servicos/'
        );
        await client.sendMessage(msg.from, 'Para voltar ao menu inicial, digite *menu*.');
        return;
    }

    // Comando especial: Enviar mensagem oficial de teste via API
    if (msg.body === '7') {
        // Substitua <DESTINATION_NUMBER> pelo número de destino no formato internacional, ex: '5511999998888'
        await sendOfficialMessage("Olá! Esta é uma mensagem de teste enviada pela API oficial do WhatsApp.", "<DESTINATION_NUMBER>");
        await client.sendMessage(msg.from, "Mensagem oficial de teste enviada.");
        return;
    }

    // Fluxo de estados para solicitar orçamento
    const state = clientStates.get(msg.from);
    if (state) {
        console.log(`Estado atual para ${msg.from}:`, state);
        switch (state.state) {
            case 'awaiting_project':
                state.project = msg.body;
                state.state = 'awaiting_street';
                await client.sendMessage(msg.from, 'Ótimo! Agora, por favor, informe o nome da rua onde o serviço será realizado.');
                break;
            case 'awaiting_street':
                state.street = msg.body;
                state.state = 'awaiting_number';
                await client.sendMessage(msg.from, 'Por favor, informe o número do imóvel.');
                break;
            case 'awaiting_number':
                state.number = msg.body;
                state.state = 'awaiting_neighborhood';
                await client.sendMessage(msg.from, 'Agora, informe o bairro.');
                break;
            case 'awaiting_neighborhood':
                state.neighborhood = msg.body;
                state.state = 'awaiting_city';
                await client.sendMessage(msg.from, 'Por fim, informe a cidade onde o serviço será realizado.');
                break;
            case 'awaiting_city':
                state.city = msg.body;
                state.state = 'awaiting_email';
                await client.sendMessage(msg.from, 'Agora, por favor, informe um e-mail para contato e envio do orçamento.');
                break;
            case 'awaiting_email':
                state.email = msg.body;
                saveToCSV(state);
                await client.sendMessage(msg.from, 'Obrigado! Suas informações foram enviadas para nosso setor de orçamentos. Em breve, um responsável entrará em contato.');
                // Notificação ao administrador
                await client.sendMessage(
                    adminNumber,
                    `📢 *Nova Solicitação de Orçamento!*\n\n` +
                    `📝 *Projeto*: ${state.project}\n` +
                    `📍 *Rua*: ${state.street}\n` +
                    `🔢 *Número*: ${state.number}\n` +
                    `🏘️ *Bairro*: ${state.neighborhood}\n` +
                    `🌆 *Cidade*: ${state.city}\n` +
                    `📧 *E-mail*: ${state.email}\n\n` +
                    `🚀 Por favor, entre em contato com o cliente para fornecer mais detalhes ou confirmar o orçamento!`
                );
                clientStates.delete(msg.from);
                break;
        }
        return;
    }

    // Opções adicionais
    if (msg.body === '2') {
        clientStates.set(msg.from, { state: 'awaiting_project' });
        await client.sendMessage(msg.from, 'Por favor, descreva brevemente o projeto para o qual deseja solicitar orçamento.');
        return;
    }

    if (msg.body === '3') {
        await client.sendMessage(
            msg.from,
            '✅ *Solicitação registrada!* Estamos avisando um responsável para falar com você. Por favor, aguarde um momento.'
        );
        await client.sendMessage(
            adminNumber,
            `📢 *Nova Solicitação!*\n\n👤 Um cliente deseja falar com um responsável.\n` +
            `📱 *Número do Cliente*: ${msg.from}\n\n` +
            `🚀 Por favor, entre em contato o mais breve possível!`
        );
        return;
    }

    if (msg.body === '4') {
        await client.sendMessage(
            msg.from,
            '📞 *Nossos Contatos*:\n📱 *WhatsApp*: (11) 95449-3758\n📞 *Telefone*: (11) 4401-3402\n🌐 *Site*: https://statusserv.com.br\nEstamos à disposição para ajudá-lo(a)!'
        );
        return;
    }

    if (msg.body === '5') {
        await client.sendMessage(
            msg.from,
            '❓ *Outras Dúvidas*:\nSe precisar de mais informações, acesse nosso site ou entre em contato conosco. Estamos sempre prontos para ajudar!\n🌐 *Site*: https://statusserv.com.br'
        );
        return;
    }

    if (msg.body === '6') {
        await client.sendMessage(
            msg.from,
            '🔒 *Conversa encerrada.*\nFoi um prazer atender você! Caso precise de mais informações ou deseje retomar a conversa, basta enviar *menu* ou qualquer mensagem que estaremos prontos para ajudar. 😊'
        );
        clientStates.delete(msg.from);
        return;
    }
});

// ======================================================
// 7) Endpoints para Webhook da API Oficial (Cloud API)
// Se quiser receber mensagens SEM depender do celular, configure:

app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  console.log('[DEBUG] GET /webhook chamado:', req.query);

  if (mode && token && mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Webhook verificado com sucesso!');
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

app.post('/webhook', async (req, res) => {
  console.log('[DEBUG] POST /webhook - Notificação Cloud API:', JSON.stringify(req.body, null, 2));
  // Se quiser processar mensagens vindas da Cloud API, faça aqui:
  // ex: extrair sender e msgText e chamar sendOfficialMessage(...) para responder
  res.sendStatus(200);
});

// ======================================================
// 8) Inicia o servidor Express
app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});

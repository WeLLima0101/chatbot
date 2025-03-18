/************************************************************
 * Chatbot 100% via API Oficial (Cloud API) + Webhook
 * - Recebe mensagens no POST /webhook
 * - Responde e envia mensagens com sendOfficialMessage
 * - Salva CSV e envia ao Google Drive
 * - Mesmo fluxo de "menu" e itens (1 a 7) sem whatsapp-web.js
 ************************************************************/

const express = require('express');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { google } = require('googleapis');

// Cria o servidor Express
const app = express();
app.use(express.json()); // Para processar JSON no body

// Porta do servidor (Render usará process.env.PORT)
const port = process.env.PORT || 3000;

// Variáveis de ambiente (configure no Render ou localmente)
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'meu_verify_token';
const WHATSAPP_CLOUD_TOKEN = process.env.WHATSAPP_CLOUD_TOKEN || '';
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID || '';
const GOOGLE_CREDENTIALS = process.env.GOOGLE_CREDENTIALS || '{}';
const ADMIN_NUMBER = process.env.ADMIN_NUMBER || '551140150044@c.us';

// -----------------------------------------------------
// LOGS E PASTAS
// -----------------------------------------------------
console.log('[DEBUG] Iniciando script sem whatsapp-web.js.');

// Cria a pasta "public" (se quiser servir algum arquivo, mas não é obrigatório)
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
const filePath = path.join(dataDir, 'solicitacoes.csv');
console.log('[DEBUG] filePath definido como:', filePath);

// -----------------------------------------------------
// GOOGLE DRIVE + CSV
// -----------------------------------------------------
const driveCredentials = JSON.parse(GOOGLE_CREDENTIALS);
const authGoogle = new google.auth.GoogleAuth({
  credentials: driveCredentials,
  scopes: ['https://www.googleapis.com/auth/drive']
});
const drive = google.drive({ version: 'v3', auth: authGoogle });

// Ajuste para a pasta no Google Drive onde quer salvar
const folderId = '1Q55EziaXR-Q9Raq1e7lfdC5I7-mkYSgs'; 

async function uploadFileToDrive() {
    try {
        console.log('[DEBUG] Fazendo upload do CSV para o Drive:', filePath);
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
        console.log('✅ Arquivo enviado ao Drive:', response.data.id);
    } catch (error) {
        console.error('❌ Erro ao enviar ao Drive:', error.message);
    }
}

function saveToCSV(data) {
    try {
        console.log('[DEBUG] Salvando dados no CSV:', data);
        const header = 'Projeto;Rua;Número;Bairro;Cidade;Email;Data/Hora\n';
        const newLine = `${data.project};${data.street || ''};${data.number || ''};${data.neighborhood || ''};${data.city || ''};${data.email || ''};${new Date().toLocaleString()}\n`;
        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, header + newLine, 'utf8');
            console.log('[DEBUG] CSV criado com cabeçalho.');
        } else {
            fs.appendFileSync(filePath, newLine, 'utf8');
            console.log('[DEBUG] Linha adicionada ao CSV existente.');
        }
        uploadFileToDrive();
    } catch (err) {
        console.error('Erro ao salvar CSV:', err.message);
        // Se quiser notificar algo, faça aqui (ex: mandar mensagem a admin).
    }
}

// -----------------------------------------------------
// API OFICIAL DO WHATSAPP (Cloud API)
// -----------------------------------------------------
async function sendOfficialMessage(messageText, recipientNumber) {
    if (!WHATSAPP_CLOUD_TOKEN || !PHONE_NUMBER_ID) {
        console.error("❌ Token ou Phone Number ID não configurados!");
        return;
    }
    const endpoint = `https://graph.facebook.com/v15.0/${PHONE_NUMBER_ID}/messages`;
    try {
        console.log('[DEBUG] Enviando mensagem via Cloud API para:', recipientNumber);
        const response = await axios.post(endpoint, {
            messaging_product: "whatsapp",
            to: recipientNumber,  // ex: '5511999998888'
            type: "text",
            text: { body: messageText }
        }, {
            headers: {
                Authorization: `Bearer ${WHATSAPP_CLOUD_TOKEN}`,
                "Content-Type": "application/json"
            }
        });
        console.log("✅ Mensagem enviada via API oficial:", response.data);
    } catch (error) {
        console.error("❌ Erro ao enviar mensagem via API oficial:", error.response?.data || error.message);
    }
}

// -----------------------------------------------------
// FLUXO DO CHATBOT (Mesmo fluxo, mas sem whatsapp-web.js)
// Precisamos processar as mensagens no POST /webhook
// e usar 'sendOfficialMessage' para responder.
// -----------------------------------------------------

// Armazenar estados (projeto, rua, etc.) por cada remetente
const clientStates = new Map();

// Delay "fake" se quiser simular digitação (opcional)
const delay = ms => new Promise(res => setTimeout(res, ms));

// Função que processa a mensagem recebida
async function processIncomingMessage(sender, msgBody) {
    console.log(`[DEBUG] processIncomingMessage de ${sender}: ${msgBody}`);

    // Menu inicial
    if (msgBody.match(/(menu|Menu|início|Inicio|Oi|oi|Olá|olá|ola|Ola)/i)) {
        clientStates.delete(sender);
        await delay(3000);
        await sendOfficialMessage(`🌟 *Olá!* Seja muito bem-vindo(a) à *Status Serviços*!\n\n` +
            `Como posso ajudá-lo(a) hoje? Escolha uma das opções abaixo:\n\n` +
            `1️⃣ - *Conhecer nossos serviços*\n` +
            `2️⃣ - *Solicitar orçamento*\n` +
            `3️⃣ - *Falar com um atendente*\n` +
            `4️⃣ - *Nossos contatos*\n` +
            `5️⃣ - *Outras dúvidas*\n` +
            `6️⃣ - *Encerrar conversa*\n` +
            `7️⃣ - *Enviar mensagem oficial de teste*\n\n` +
            `📌 *Dica*: Sempre que quiser voltar ao menu inicial, digite *menu*!`,
            sender
        );
        return;
    }

    // Item 1: Conhecer nossos serviços
    if (msgBody === '1') {
        await delay(3000);
        await sendOfficialMessage(
            'Oferecemos uma variedade de serviços especializados para a conservação e manutenção de fachadas, incluindo:\n\n' +
            '🧹 **Limpeza de Fachadas**\n' +
            '🎨 **Pintura Predial**\n' +
            '🛠️ **Restauração de Fachadas**\n' +
            '💧 **Impermeabilização de Fachadas**\n' +
            '🔧 **Vedação em Pele de Vidro**\n' +
            '📋 **Mapeamento de Fachadas**\n\n' +
            'Para mais detalhes sobre nossos serviços, visite: https://statusserv.com.br/servicos/\n' +
            'Para voltar ao menu inicial, digite *menu*.',
            sender
        );
        return;
    }

    // Comando especial: Enviar mensagem oficial de teste via API
    if (msgBody === '7') {
        // Substitua <DESTINATION_NUMBER> se quiser mandar a outro número
        await sendOfficialMessage("Olá! Esta é uma mensagem de teste enviada pela API oficial do WhatsApp.", sender);
        await sendOfficialMessage("Mensagem oficial de teste enviada.", sender);
        return;
    }

    // Verifica se está no fluxo de orçamento
    const state = clientStates.get(sender);
    if (state) {
        switch (state.state) {
            case 'awaiting_project':
                state.project = msgBody;
                state.state = 'awaiting_street';
                await sendOfficialMessage('Ótimo! Agora, por favor, informe o nome da rua onde o serviço será realizado.', sender);
                break;
            case 'awaiting_street':
                state.street = msgBody;
                state.state = 'awaiting_number';
                await sendOfficialMessage('Por favor, informe o número do imóvel.', sender);
                break;
            case 'awaiting_number':
                state.number = msgBody;
                state.state = 'awaiting_neighborhood';
                await sendOfficialMessage('Agora, informe o bairro.', sender);
                break;
            case 'awaiting_neighborhood':
                state.neighborhood = msgBody;
                state.state = 'awaiting_city';
                await sendOfficialMessage('Por fim, informe a cidade onde o serviço será realizado.', sender);
                break;
            case 'awaiting_city':
                state.city = msgBody;
                state.state = 'awaiting_email';
                await sendOfficialMessage('Agora, por favor, informe um e-mail para contato e envio do orçamento.', sender);
                break;
            case 'awaiting_email':
                state.email = msgBody;
                saveToCSV(state);
                await sendOfficialMessage('Obrigado! Suas informações foram enviadas para nosso setor de orçamentos. Em breve, um responsável entrará em contato.', sender);
                // Notifica admin
                await sendOfficialMessage(
                    `📢 *Nova Solicitação de Orçamento!*\n\n` +
                    `📝 *Projeto*: ${state.project}\n` +
                    `📍 *Rua*: ${state.street}\n` +
                    `🔢 *Número*: ${state.number}\n` +
                    `🏘️ *Bairro*: ${state.neighborhood}\n` +
                    `🌆 *Cidade*: ${state.city}\n` +
                    `📧 *E-mail*: ${state.email}\n\n` +
                    `🚀 Por favor, entre em contato com o cliente para fornecer mais detalhes ou confirmar o orçamento!`,
                    ADMIN_NUMBER
                );
                clientStates.delete(sender);
                break;
        }
        return;
    }

    // Item 2: Solicitar orçamento
    if (msgBody === '2') {
        clientStates.set(sender, { state: 'awaiting_project' });
        await sendOfficialMessage('Por favor, descreva brevemente o projeto para o qual deseja solicitar orçamento.', sender);
        return;
    }

    // Item 3: Falar com um atendente
    if (msgBody === '3') {
        await sendOfficialMessage('✅ *Solicitação registrada!* Estamos avisando um responsável para falar com você. Por favor, aguarde um momento.', sender);
        await sendOfficialMessage(
            `📢 *Nova Solicitação!*\n\n👤 Um cliente deseja falar com um responsável.\n` +
            `📱 *Número do Cliente*: ${sender}\n\n` +
            `🚀 Por favor, entre em contato o mais breve possível!`,
            ADMIN_NUMBER
        );
        return;
    }

    // Item 4: Nossos contatos
    if (msgBody === '4') {
        await sendOfficialMessage(
            '📞 *Nossos Contatos*:\n📱 *WhatsApp*: (11) 95449-3758\n📞 *Telefone*: (11) 4401-3402\n🌐 *Site*: https://statusserv.com.br\nEstamos à disposição para ajudá-lo(a)!',
            sender
        );
        return;
    }

    // Item 5: Outras dúvidas
    if (msgBody === '5') {
        await sendOfficialMessage(
            '❓ *Outras Dúvidas*:\nSe precisar de mais informações, acesse nosso site ou entre em contato conosco. Estamos sempre prontos para ajudar!\n🌐 *Site*: https://statusserv.com.br',
            sender
        );
        return;
    }

    // Item 6: Encerrar conversa
    if (msgBody === '6') {
        await sendOfficialMessage(
            '🔒 *Conversa encerrada.*\nFoi um prazer atender você! Caso precise de mais informações ou deseje retomar a conversa, basta enviar *menu* ou qualquer mensagem que estaremos prontos para ajudar. 😊',
            sender
        );
        clientStates.delete(sender);
        return;
    }

    // Se não for nenhum comando reconhecido
    await sendOfficialMessage("Desculpe, não entendi. Digite 'menu' para ver as opções.", sender);
}

// -----------------------------------------------------
// WEBHOOKS
// -----------------------------------------------------

// GET /webhook -> verificação do token
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

// POST /webhook -> recebimento de mensagens da Cloud API
app.post('/webhook', async (req, res) => {
  console.log('[DEBUG] POST /webhook - Notificação Cloud API:', JSON.stringify(req.body, null, 2));

  try {
    const entry = req.body.entry;
    if (entry && entry.length > 0) {
      for (const e of entry) {
        const changes = e.changes;
        if (changes && changes.length > 0) {
          for (const change of changes) {
            const value = change.value;
            if (value && value.messages && value.messages.length > 0) {
              for (const message of value.messages) {
                const sender = message.from; // ex: '5511999998888'
                const msgBody = message.text ? message.text.body : '';
                console.log('[DEBUG] Mensagem recebida de', sender, ':', msgBody);

                // Processar o fluxo do chatbot
                await processIncomingMessage(sender, msgBody);
              }
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('Erro no processamento do webhook:', err.message);
  }

  res.sendStatus(200);
});
// Adiciona a rota principal para verificar se o servidor está online
app.get("/", (req, res) => {
    res.status(200).send("Servidor online 🚀");
});

// Adiciona a rota principal para verificar se o servidor está online
app.get("/", (req, res) => {
    res.status(200).send("Servidor online 🚀");
});

// INICIA O SERVIDOR (apenas uma vez!)
app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}.`);
});

const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const app = express();
const port = process.env.PORT || 10000;

// === LOGS DE DEBUG INICIAIS ===
console.log('[DEBUG] __dirname:', __dirname);

// Certifique-se de que o diretório 'public' existe
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir);
    console.log('[DEBUG] Criou pasta public:', publicDir);
} else {
    console.log('[DEBUG] Pasta public já existe:', publicDir);
}

// === CRIA PASTA "data" PARA O CSV ===
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

// Cliente com armazenamento local para manter a sessão
const client = new Client({
    authStrategy: new LocalAuth({
        clientId: "client-one", // Identificador para múltiplas sessões
    }),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'], // Evita problemas de permissões
    },
});

let isClientInitialized = false; // Variável para evitar inicializações repetidas

// Verificação inicial do diretório de sessão
const sessionPath = './.wwebjs_auth/session-client-one/Default';
if (fs.existsSync(sessionPath)) {
    try {
        fs.rmdirSync(sessionPath, { recursive: true });
        console.log('Sessão antiga removida com sucesso.');
    } catch (err) {
        console.error('Erro ao remover a sessão antiga:', err.message);
    }
}

// Gerar QR Code quando necessário
client.on('qr', (qr) => {
    if (!isClientInitialized) {
        console.log('QR Code gerado! Escaneie o código abaixo para autenticar:');
        qrcode.generate(qr, { small: true });

        // Salvar o QR Code como arquivo de imagem PNG
        QRCode.toFile(path.join(publicDir, 'qrcode.png'), qr, (err) => {
            if (err) {
                console.error('Erro ao salvar o QR Code:', err);
            } else {
                console.log('QR Code salvo como "qrcode.png". Acesse o servidor para escanear.');
            }
        });
    }
});

// Notificação de que a sessão foi iniciada
client.on('ready', () => {
    console.log('Tudo certo! WhatsApp conectado.');
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

// Inicializa o cliente
client.initialize();

// Delay para simular tempo de digitação
const delay = ms => new Promise(res => setTimeout(res, ms));

// Estados para armazenar as respostas dos clientes
const clientStates = new Map();

// Número do administrador (substitua pelo número correto no formato internacional)
const adminNumber = '551140150044@c.us';

// Configuração do Google Drive
const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/drive']
});

const drive = google.drive({ version: 'v3', auth });

// Função para enviar o CSV ao Google Drive
const uploadFileToDrive = async () => {
    const folderId = '1Q55EziaXR-Q9Raq1e7lfdC5I7-mkYSgs'; // ID da pasta no Google Drive
    try {
        console.log('[DEBUG] Tentando fazer upload do arquivo:', filePath);
        console.log('[DEBUG] Listando arquivos em dataDir antes do upload:', fs.readdirSync(dataDir));

        const response = await drive.files.create({
            requestBody: {
                name: 'solicitacoes.csv',
                mimeType: 'text/csv',
                parents: [folderId]
            },
            media: {
                mimeType: 'text/csv',
                body: fs.createReadStream(filePath) // USANDO O MESMO filePath
            }
        });
        console.log('✅ Arquivo enviado para o Google Drive:', response.data.id);
    } catch (error) {
        console.error('❌ Erro ao enviar para o Google Drive:', error.message);
    }
};

// Função para salvar dados no arquivo CSV e enviá-lo para o Google Drive
const saveToCSV = (data) => {
    try {
        console.log('[DEBUG] Entrou em saveToCSV. Dados recebidos:', data);
        console.log('[DEBUG] Tentando salvar CSV em:', filePath);
        console.log('[DEBUG] Conteúdo de dataDir antes de escrever:', fs.readdirSync(dataDir));

        const header = 'Projeto;Rua;Número;Bairro;Cidade;Email;Data/Hora\n';
        const newLine = `${data.project};${data.street};${data.number};${data.neighborhood};${data.city};${data.email};${new Date().toLocaleString()}\n`;

        // Cria o arquivo com cabeçalho se não existir; senão, adiciona nova linha
        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, header + newLine, 'utf8');
            console.log('[DEBUG] CSV não existia, criando novo arquivo com cabeçalho...');
        } else {
            fs.appendFileSync(filePath, newLine, 'utf8');
            console.log('[DEBUG] CSV já existia, adicionando nova linha...');
        }

        console.log('[DEBUG] Arquivo CSV salvo com sucesso!');
        console.log('[DEBUG] Conteúdo de dataDir após escrever:', fs.readdirSync(dataDir));

        // Chama o upload para o Drive
        uploadFileToDrive();

    } catch (err) {
        console.error('Erro ao salvar no CSV:', err.message);
        client.sendMessage(
            adminNumber,
            `⚠️ Erro ao salvar os dados no CSV: ${err.message}. Verifique o arquivo ou o código.`
        );
    }
};

// Funil
client.on('message', async msg => {
    console.log(`Mensagem recebida de ${msg.from}: ${msg.body}`);
    const chat = await msg.getChat();

    // Menu inicial
    if (msg.body.match(/(menu|Menu|início|Inicio|Oi|oi|Olá|olá|ola|Ola)/i)) {
        clientStates.delete(msg.from);
        await delay(3000);
        await chat.sendStateTyping();
        await delay(3000);
        const contact = await msg.getContact();
        const name = contact.pushname;
        await client.sendMessage(
            msg.from,
            `🌟 *Olá, ${name.split(' ')[0]}!* Seja muito bem-vindo(a) à *Status Serviços*! 🌟\n\n` +
            `Como posso ajudá-lo(a) hoje? Escolha uma das opções abaixo digitando o número correspondente:\n\n` +
            `1️⃣ - *Conhecer nossos serviços*\n` +
            `2️⃣ - *Solicitar orçamento*\n` +
            `3️⃣ - *Falar com um atendente*\n` +
            `4️⃣ - *Nossos contatos*\n` +
            `5️⃣ - *Outras dúvidas*\n` +
            `6️⃣ - *Encerrar conversa*\n\n` +
            `📌 *Dica*: Sempre que quiser voltar ao menu inicial, digite *menu*!`
        );
        return;
    }

    // Item 1: Conhecer nossos serviços
    if (msg.body === '1') {
        await delay(3000);
        await chat.sendStateTyping();
        await delay(3000);
        await client.sendMessage(
            msg.from,
            'Oferecemos uma variedade de serviços especializados para a conservação e manutenção de fachadas, incluindo:\n\n' +
            '🧹 **Limpeza de Fachadas**: Remoção eficaz de sujeira e poluição, preservando a integridade e a estética do edifício.\n' +
            '🎨 **Pintura Predial**: Revitalização da aparência das fachadas, contribuindo para a valorização do patrimônio imobiliário e proteção contra intempéries.\n' +
            '🛠️ **Restauração de Fachadas**: Recuperação de estruturas danificadas, garantindo segurança e prolongando a vida útil do edifício.\n' +
            '💧 **Impermeabilização de Fachadas**: Prevenção de infiltrações e deteriorações, aumentando a durabilidade da construção.\n' +
            '🔧 **Vedação em Pele de Vidro**: Garantimos a vedação de fachadas com vidro para evitar infiltrações, preservar o isolamento térmico e proteger contra ruídos.\n\n' +
            '📋 **Mapeamento de Fachadas**: Avaliação detalhada para identificar problemas e planejar manutenções preventivas ou corretivas.\n\n' +
            'Para mais detalhes sobre nossos serviços, visite: https://statusserv.com.br/servicos/'
        );
        await client.sendMessage(msg.from, 'Para voltar ao menu inicial, digite *menu*.');
        return;
    }

    // Controle de estados
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

    // Item 2: Solicitar orçamento
    if (msg.body === '2') {
        clientStates.set(msg.from, { state: 'awaiting_project' });
        await client.sendMessage(msg.from, 'Por favor, descreva brevemente o projeto para o qual deseja solicitar orçamento.');
        return;
    }

    // Item 3: Falar com um atendente
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

    // Item 4: Nossos contatos
    if (msg.body === '4') {
        await client.sendMessage(
            msg.from,
            '📞 *Nossos Contatos*:\n📱 *WhatsApp*: (11) 95449-3758\n📞 *Telefone*: (11) 4401-3402\n🌐 *Site*: https://statusserv.com.br\nEstamos à disposição para ajudá-lo(a)!'
        );
        return;
    }

    // Item 5: Outras dúvidas
    if (msg.body === '5') {
        await client.sendMessage(
            msg.from,
            '❓ *Outras Dúvidas*:\nSe precisar de mais informações, acesse nosso site ou entre em contato conosco. Estamos sempre prontos para ajudar!\n🌐 *Site*: https://statusserv.com.br'
        );
        return;
    }

    // Item 6: Encerrar conversa
    if (msg.body === '6') {
        await client.sendMessage(
            msg.from,
            '🔒 *Conversa encerrada.*\nFoi um prazer atender você! Caso precise de mais informações ou deseje retomar a conversa, basta enviar *menu* ou qualquer mensagem que estaremos prontos para ajudar. 😊'
        );
        clientStates.delete(msg.from);
        return;
    }
});

// Servir a imagem do QR Code
app.use('/public', express.static(publicDir));

// Rota para acessar o QR Code
app.get('/qrcode.png', (req, res) => {
    res.sendFile(path.join(publicDir, 'qrcode.png'));
});

// Rota para baixar o arquivo CSV
app.get('/download-csv', (req, res) => {
    console.log('[DEBUG] Rota /download-csv chamada. filePath:', filePath);
    res.download(filePath, 'solicitacoes.csv', (err) => {
        if (err) {
            console.error('Erro ao enviar o arquivo CSV para download:', err.message);
            res.status(500).send('Erro ao enviar o arquivo CSV.');
        }
    });
});

// Rota principal para status do servidor
app.get('/', (req, res) => {
    res.send('Servidor ativo! Acesse /qrcode.png para visualizar o QR Code.');
});

// Iniciar o servidor
app.listen(port, '0.0.0.0', () => {
    console.log(`Servidor rodando em http://0.0.0.0:${port}`);
});

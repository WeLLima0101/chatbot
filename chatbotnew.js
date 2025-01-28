const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 10000;

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
        fs.rmdirSync(sessionPath, { recursive: true }); // Remove arquivos bloqueados
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
        QRCode.toFile('qrcode.png', qr, (err) => {
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

    // Tenta reiniciar o cliente automaticamente
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

// Função para salvar dados no arquivo CSV
const saveToCSV = (data) => {
    const filePath = path.join(__dirname, 'solicitacoes.csv');

    try {
        // Verifica se o arquivo já existe
        const fileExists = fs.existsSync(filePath);

        // Define o cabeçalho e os dados a serem salvos
        const header = 'Projeto;Rua;Número;Bairro;Cidade;Email;Data/Hora\n';
        const newLine = `${data.project};${data.street};${data.number};${data.neighborhood};${data.city};${data.email};${new Date().toLocaleString()}\n`;

        // Se o arquivo não existe, cria com o cabeçalho; caso contrário, apenas adiciona uma nova linha
        if (!fileExists) {
            fs.writeFileSync(filePath, header + newLine, { encoding: 'utf8' });
            console.log('Arquivo CSV criado e dados salvos com sucesso!');
        } else {
            fs.appendFileSync(filePath, newLine, { encoding: 'utf8' });
            console.log('Dados adicionados ao arquivo CSV com sucesso!');
        }
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
    const chat = await msg.getChat();

    // Menu inicial
    if (msg.body.match(/(menu|Menu|início|Inicio|Oi|oi|Olá|olá|ola|Ola)/i) && msg.from.endsWith('@c.us')) {
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
    if (msg.body === '1' && msg.from.endsWith('@c.us')) {
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

    // Item 2: Solicitar orçamento
    if (msg.body === '2' && msg.from.endsWith('@c.us')) {
        clientStates.set(msg.from, { state: 'awaiting_project' });
        await delay(3000);
        await chat.sendStateTyping();
        await delay(3000);

        await client.sendMessage(msg.from, 'Por favor, descreva brevemente o projeto para o qual deseja solicitar orçamento.');
        return;
    }

    if (clientStates.get(msg.from)?.state === 'awaiting_project') {
        clientStates.get(msg.from).project = msg.body;
        clientStates.get(msg.from).state = 'awaiting_street';
        await delay(3000);
        await chat.sendStateTyping();
        await delay(3000);

        await client.sendMessage(msg.from, 'Ótimo! Agora, por favor, informe o nome da rua onde o serviço será realizado.');
        return;
    }

    if (clientStates.get(msg.from)?.state === 'awaiting_street') {
        clientStates.get(msg.from).street = msg.body;
        clientStates.get(msg.from).state = 'awaiting_number';
        await delay(3000);
        await chat.sendStateTyping();
        await delay(3000);

        await client.sendMessage(msg.from, 'Por favor, informe o número do imóvel.');
        return;
    }

    if (clientStates.get(msg.from)?.state === 'awaiting_number') {
        clientStates.get(msg.from).number = msg.body;
        clientStates.get(msg.from).state = 'awaiting_neighborhood';
        await delay(3000);
        await chat.sendStateTyping();
        await delay(3000);

        await client.sendMessage(msg.from, 'Agora, informe o bairro.');
        return;
    }

    if (clientStates.get(msg.from)?.state === 'awaiting_neighborhood') {
        clientStates.get(msg.from).neighborhood = msg.body;
        clientStates.get(msg.from).state = 'awaiting_city';
        await delay(3000);
        await chat.sendStateTyping();
        await delay(3000);

        await client.sendMessage(msg.from, 'Por fim, informe a cidade onde o serviço será realizado.');
        return;
    }

    if (clientStates.get(msg.from)?.state === 'awaiting_city') {
        clientStates.get(msg.from).city = msg.body;
        clientStates.get(msg.from).state = 'awaiting_email';
        await delay(3000);
        await chat.sendStateTyping();
        await delay(3000);

        await client.sendMessage(msg.from, 'Agora, por favor, informe um e-mail para contato e envio do orçamento.');
        return;
    }

    if (clientStates.get(msg.from)?.state === 'awaiting_email') {
        const data = clientStates.get(msg.from);
        data.email = msg.body;
        clientStates.delete(msg.from);

        await delay(3000);
        await chat.sendStateTyping();
        await delay(3000);

        await client.sendMessage(msg.from, 'Obrigado! Suas informações foram enviadas para nosso setor de orçamentos. Em breve, um responsável entrará em contato.');

        // Salvar no CSV
        saveToCSV({
            project: data.project,
            street: data.street,
            number: data.number,
            neighborhood: data.neighborhood,
            city: data.city,
            email: data.email
        });

        const responsibleNumber = '551140150044@c.us';
        await client.sendMessage(
            responsibleNumber,
            `📢 *Nova Solicitação de Orçamento!*\n\n` +
            `📝 *Projeto*: ${data.project}\n` +
            `📍 *Rua*: ${data.street}\n` +
            `🔢 *Número*: ${data.number}\n` +
            `🏘️ *Bairro*: ${data.neighborhood}\n` +
            `🌆 *Cidade*: ${data.city}\n` +
            `📧 *E-mail*: ${data.email}\n` +
            `👤 *Solicitado por*: ${msg.from}\n\n` +
            `🚀 Por favor, entre em contato com o cliente para fornecer mais detalhes ou confirmar o orçamento!`
        );

        await client.sendMessage(msg.from, 'Para voltar ao menu inicial, digite *menu*.');
        return;
    }

    // Item 3: Falar com um atendente
    if (msg.body === '3' && msg.from.endsWith('@c.us')) {
        try {
            await delay(3000);
            await chat.sendStateTyping(); // Simula digitação
            await delay(3000);

            await client.sendMessage(
                msg.from,
                '✅ *Solicitação registrada!* Estamos avisando um responsável para falar com você. Por favor, aguarde um momento.'
            );

            const responsibleNumber = '551140150044@c.us'; // Substitua pelo número correto
            await client.sendMessage(
                responsibleNumber,
                `📢 *Nova Solicitação!*\n\n👤 Um cliente deseja falar com um responsável.\n` +
                `📱 *Número do Cliente*: ${msg.from}\n\n` +
                `🚀 Por favor, entre em contato o mais breve possível!`
            );

            await delay(3000);
            await client.sendMessage(
                msg.from,
                '💬 Enquanto isso, se precisar, você pode voltar ao menu inicial digitando *menu*.'
            );
        } catch (error) {
            console.error('Erro ao processar o item 3:', error);
            await client.sendMessage(
                msg.from,
                '⚠️ Ocorreu um erro ao processar sua solicitação. Tente novamente mais tarde ou entre em contato diretamente conosco.'
            );
        }
        return;
    }

    // Item 4: Nossos contatos
    if (msg.body === '4' && msg.from.endsWith('@c.us')) {
        await delay(3000);
        await chat.sendStateTyping();
        await delay(3000);
        await client.sendMessage(
            msg.from,
            '📞 *Nossos Contatos*:\n\n' +
            '📱 *WhatsApp*: (11) 95449-3758\n' +
            '📞 *Telefone*: (11) 4401-3402\n' +
            '🌐 *Site*: https://statusserv.com.br\n\n' +
            'Estamos à disposição para ajudá-lo(a)!'
        );

        await client.sendMessage(msg.from, 'Para voltar ao menu inicial, digite *menu*.');
        return;
    }

    // Item 5: Outras dúvidas
    if (msg.body === '5' && msg.from.endsWith('@c.us')) {
        await delay(3000);
        await chat.sendStateTyping();
        await delay(3000);
        await client.sendMessage(
            msg.from,
            '❓ *Outras Dúvidas*:\n\n' +
            'Se precisar de mais informações, acesse nosso site ou entre em contato conosco. Estamos sempre prontos para ajudar!\n\n' +
            '🌐 *Site*: https://statusserv.com.br'
        );

        await client.sendMessage(msg.from, 'Para voltar ao menu inicial, digite *menu*.');
        return;
    }

    // Item 6: Encerrar conversa
    if (msg.body === '6' && msg.from.endsWith('@c.us')) {
        await delay(3000);
        await chat.sendStateTyping();
        await delay(3000);
        await client.sendMessage(
            msg.from,
            '🔒 *Conversa encerrada.*\n\n' +
            'Foi um prazer atender você! Caso precise de mais informações ou deseje retomar a conversa, basta enviar *menu* ou qualquer mensagem que estaremos prontos para ajudar. 😊'
        );
        clientStates.delete(msg.from); // Limpa o estado do cliente, se existir
        return;
    }
});

// Servir a imagem do QR Code
app.use(express.static(__dirname));

// Rota para acessar o QR Code
app.get('/qrcode.png', (req, res) => {
    res.sendFile(path.join(__dirname, 'qrcode.png'));
});

// Rota raiz para exibir uma mensagem
app.get('/', (req, res) => {
    res.send('Servidor ativo! Acesse /qrcode.png para visualizar o QR Code.');
});

// Iniciar o servidor
app.listen(port, '0.0.0.0', () => {
    console.log(`Servidor rodando em http://0.0.0.0:${port}`);
});

// Dependencias necesarias
const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const qrcode = require('qrcode'); 
const puppeteer = require('puppeteer'); 
const { exit } = require('process'); // Necesario para forzar la salida y el reinicio

// 💡 1. ALMACENAMIENTO DE USUARIOS MUTEADOS (EN MEMORIA)
const mutedUsers = {}; 

// --- 2. CONFIGURACIÓN DEL SERVIDOR WEB (para Replit) ---
const app = express();
// Puerto ajustado a 5000 para Replit
const port = process.env.PORT || 5000; 

// Variable global para guardar el QR en formato data URL
let qrCodeValue = null; 

app.get('/', (req, res) => {
    if (qrCodeValue) {
        // Enviamos el QR en formato HTML/imagen
        res.send(`
            <h2>👋 Escanea este código QR para conectar tu bot de WhatsApp</h2>
            <img src="${qrCodeValue}" alt="Código QR de WhatsApp" style="border: 2px solid #25D366; padding: 10px;">
            <p>Refresca esta página si el QR no funciona después de unos segundos.</p>
            <hr>
            <p>Si ya escaneaste y el bot está listo, verás el mensaje: "El bot de WhatsApp está en línea y funcionando."</p>
        `);
    } else {
        res.send('El bot de WhatsApp está en línea y funcionando.');
    }
});

app.listen(port, () => {
    console.log(`Servidor Express corriendo en el puerto ${port}`);
});

// --- 3. CONFIGURACIÓN DEL CLIENTE DE WHATSAPP ---
// Configuración de Puppeteer con la ruta de Chromium y argumentos de estabilidad
const client = new Client({
    authStrategy: new LocalAuth(), 
    puppeteer: {
        executablePath: '/usr/bin/chromium-browser', // Ruta de Chromium en Replit
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            // Argumentos extra para la máxima estabilidad en Replit
            '--disable-dev-shm-usage',
            '--no-gpu',
            '--no-zygote'
        ],
    }
});

client.on('qr', async (qr) => {
    try {
        qrCodeValue = await qrcode.toDataURL(qr);
        console.log('--- QR DISPONIBLE EN LA URL DEL SERVICIO (¡A ESCANEAR!) ---');
    } catch (err) {
        console.error('Error al generar el QR con qrcode:', err);
    }
});

client.on('ready', () => {
    qrCodeValue = null; 
    console.log('✅ BOT CONECTADO Y LISTO. ¡Funciona en la nube!');
});

// ==========================================================
// 🔔 FUNCIONES DE BIENVENIDA Y DESPEDIDA
// ==========================================================

client.on('group_join', async (notification) => {
    const chatId = notification.chatId;
    const chat = await client.getChatById(chatId);
    
    const newMemberId = notification.recipientIds[0];
    const newMember = await client.getContactById(newMemberId);
    const memberName = newMember.pushname || newMember.verifiedName || newMember.name || 'el nuevo miembro';
    
    let welcomeMessage = `🎉 ¡Bienvenido/a al grupo! 👋\n`;
    welcomeMessage += `*${memberName}* se ha unido. ¡Esperamos la pases bien!`;

    chat.sendMessage(welcomeMessage); 
});

client.on('group_leave', async (notification) => {
    const chatId = notification.chatId;
    const chat = await client.getChatById(chatId);
    
    const leftMemberId = notification.recipientIds[0];
    const leftMember = await client.getContactById(leftMemberId);
    const memberName = leftMember.pushname || leftMember.verifiedName || leftMember.name || 'Un miembro';
    
    let goodbyeMessage = `*${memberName}* ha abandonado el grupo. ¡Hasta pronto!`;

    chat.sendMessage(goodbyeMessage); 
});

// ==========================================================
// 🔨 LÓGICA PRINCIPAL DE MENSAJES (COMANDOS SIN RESTRICCIÓN)
// ==========================================================

client.on('message_create', async msg => {
    const chat = await msg.getChat();

    // 🔴 LÓGICA MUTE: Revisar si el remitente está silenciado
    if (chat.isGroup && mutedUsers[msg.author]) {
        try {
            await msg.delete(true); 
            console.log(`🚫 Mensaje de usuario silenciado (${msg.author}) eliminado en ${chat.name}.`);
            return;
        } catch (error) {
            console.error('Error al intentar eliminar mensaje de usuario silenciado:', error);
            return;
        }
    }

    // ----------------------------------------------------
    // INICIO DEL PROCESAMIENTO DE COMANDOS
    // ----------------------------------------------------
    if (!msg.body.startsWith('.')) return; 

    // Extraemos el comando y el contenido
    const command = msg.body.toLowerCase().split(' ')[0]; 
    const content = msg.body.substring(command.length).trim();
    
    // Si no es un grupo, solo procesar comandos que no requieran grupo
    if (!chat.isGroup) {
        if (command === '.n' || command === '.todos' || command === '.mute' || command === '.unmute') {
            msg.reply('Estos comandos solo funcionan en grupos.');
        }
        return;
    }

    // Si el contenido está vacío, ponemos el mensaje por defecto
    let finalContent = content;
    if (content.length === 0 && (command === '.todos' || command === '.n')) {
        finalContent = "¡ATENCIÓN A TODOS! Por favor, revisen el grupo."; 
    } 

    // ----------------------
    // COMANDO: .mute (Silenciar a un usuario etiquetado)
    // ----------------------
    if (command === '.mute') {
        const mentions = await msg.getMentions();
        
        if (mentions.length === 0) {
            return msg.reply('Debes etiquetar al usuario que quieres silenciar. Ejemplo: .mute @Persona');
        }

        const targetId = mentions[0].id._serialized;
        const targetName = mentions[0].pushname || mentions[0].name;

        mutedUsers[targetId] = true;
        
        msg.reply(`🔇 *¡USUARIO SILENCIADO!* 🔇\n@${targetName} ha sido silenciado. El bot eliminará sus mensajes.`, { mentions: mentions });
        console.log(`Usuario ${targetId} silenciado.`);
        return;
    }

    // ----------------------
    // COMANDO: .unmute (Desactivar silencio a un usuario etiquetado)
    // ----------------------
    if (command === '.unmute') {
        const mentions = await msg.getMentions();
        
        if (mentions.length === 0) {
            return msg.reply('Debes etiquetar al usuario que quieres reactivar. Ejemplo: .unmute @Persona');
        }

        const targetId = mentions[0].id._serialized;
        const targetName = mentions[0].pushname || mentions[0].name;

        if (mutedUsers[targetId]) {
            delete mutedUsers[targetId];

            msg.reply(`🔊 *¡USUARIO REACTIVADO!* 🔊\n@${targetName} puede volver a enviar mensajes.`, { mentions: mentions });
            console.log(`Usuario ${targetId} reactivado.`);
        } else {
            msg.reply(`El usuario @${targetName} no estaba silenciado.`, { mentions: mentions });
        }
        return;
    }


    // ----------------------
    // COMANDOS DE NOTIFICACIÓN (.todos y .n)
    // ----------------------
    if (command === '.todos' || command === '.n') {
        let mentions = [];
        for (let participant of chat.participants) {
            const contact = await client.getContactById(participant.id._serialized);
            mentions.push(contact);
        }

        // COMANDO: .todos (Mensaje con etiquetas @número visibles)
        if (command === '.todos') {
            let text = `📣 **NOTIFICACIÓN URGENTE** 📣\n_Mensaje de @${msg.author.split('@')[0]}_\n\n*Contenido:* ${finalContent}\n\n`;
            
            for (let participant of chat.participants) {
                text += `@${participant.id.user} `; 
            }
            
            chat.sendMessage(text, { mentions });
        }

        // COMANDO: .n (Mensaje Exacto con Notificación forzada, SIN etiquetas visibles)
        if (command === '.n') {
            chat.sendMessage(finalContent, { mentions });
            console.log(`Comando .n (silencioso) ejecutado en grupo: ${chat.name}`);
        }
    }
});

// ==========================================================
// ⚙️ FUNCIÓN DE REINICIO PROGRAMADO (Para evitar el error de Replit)
// ==========================================================

const RESTART_INTERVAL_MS = 1000 * 60 * 60 * 12; // 12 horas

const restartBot = () => {
    console.log(`\n🚨 REINICIO AUTOMÁTICO: Forzando la salida del proceso para reconectar en un entorno limpio.`);
    
    // Este comando detiene el proceso de Node.js, y Replit lo reiniciará automáticamente.
    exit(0); 
};

// Programar el reinicio cada 12 horas.
setInterval(restartBot, RESTART_INTERVAL_MS);


// Iniciar el bot
client.initialize();
// Dependencias necesarias
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');

// 💡 1. ALMACENAMIENTO DE USUARIOS MUTEADOS (EN MEMORIA)
const mutedUsers = {}; 

// --- 2. CONFIGURACIÓN DEL SERVIDOR WEB (para Render) ---
const app = express();
const port = process.env.PORT || 8080; 

app.get('/', (req, res) => {
    res.send('El bot de WhatsApp está en línea y funcionando.');
});

app.listen(port, () => {
    console.log(`Servidor Express corriendo en el puerto ${port}`);
});

// --- 3. CONFIGURACIÓN DEL CLIENTE DE WHATSAPP ---
const client = new Client({
    authStrategy: new LocalAuth()
});

client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    console.log('--- ESCANEA ESTE QR PARA CONECTAR TU NÚMERO ---');
});

client.on('ready', () => {
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
// 🔨 LÓGICA PRINCIPAL DE MENSAJES (COMANDOS Y MUTE)
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

    const command = msg.body.toLowerCase().split(' ')[0]; 
    
    // Si no es un grupo, solo procesar comandos que no requieran grupo
    if (!chat.isGroup) {
        if (command === '.n' || command === '.todos' || command === '.mute' || command === '.unmute') {
            msg.reply('Estos comandos solo funcionan en grupos.');
        }
        return;
    }

    // --- CHECK DE ADMINISTRADOR para comandos de administración ---
    const participant = chat.participants.find(
        p => p.id._serialized === msg.author
    );
    const isAdminCommand = (command === '.todos' || command === '.n' || command === '.mute' || command === '.unmute');

    if (isAdminCommand) {
        if (!participant || (!participant.isAdmin && !participant.isSuperAdmin)) {
            
            // 🛑 CORRECCIÓN: Eliminamos la reacción que falla en Render.
            // await msg.react('❌'); 
            
            msg.reply('❌ Solo los administradores del grupo pueden usar este comando.'); 
            return;
        }
    }
    
    // Obtener el contenido del mensaje
    const content = msg.body.substring(command.length).trim();
    
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
        console.log(`Usuario ${targetId} silenciado por el administrador.`);
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
            console.log(`Usuario ${targetId} reactivado por el administrador.`);
        } else {
            msg.reply(`El usuario @${targetName} no estaba silenciado.`, { mentions: mentions });
        }
        return;
    }


    // ----------------------
    // COMANDOS DE NOTIFICACIÓN (.todos y .n)
    // ----------------------
    
    if (content.length === 0 && (command === '.todos' || command === '.n')) {
        return msg.reply(`Debes escribir el mensaje después del comando, por ejemplo: ${command} Mensaje urgente.`);
    }

    let mentions = [];
    for (let participant of chat.participants) {
        const contact = await client.getContactById(participant.id._serialized);
        mentions.push(contact);
    }

    // COMANDO: .todos (Mensaje con etiquetas @número visibles)
    if (command === '.todos') {
        let text = `📣 **NOTIFICACIÓN URGENTE** 📣\n_Mensaje de @${msg.author.split('@')[0]}_\n\n*Contenido:* ${content}\n\n`;
        
        for (let participant of chat.participants) {
            text += `@${participant.id.user} `; 
        }
        
        chat.sendMessage(text, { mentions });
    }

    // COMANDO: .n (Mensaje Exacto con Notificación forzada, SIN etiquetas visibles)
    if (command === '.n') {
        chat.sendMessage(content, { mentions });
        console.log(`Comando .n (silencioso) ejecutado en grupo: ${chat.name}`);
    }
});

// Iniciar el bot
client.initialize();
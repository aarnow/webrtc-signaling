const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8080;
const wss  = new WebSocketServer({ port: PORT });

// rooms : { roomCode -> [ws, ws] }
const rooms = {};

function log(...args) {
    console.log(new Date().toISOString(), ...args);
}

wss.on('connection', ws => {
    ws.roomCode = null;
    log('Client connecté');

    ws.on('message', raw => {
        let msg;
        try { msg = JSON.parse(raw); } catch { return; }

        switch (msg.type) {

            // ── 1. Un pair rejoint une room ──────────────────────────────────
            case 'join': {
                const code = msg.code;
                if (!rooms[code]) rooms[code] = [];

                const room = rooms[code];

                // Max 2 personnes par room
                if (room.length >= 2) {
                    ws.send(JSON.stringify({ type: 'room-full' }));
                    return;
                }

                room.push(ws);
                ws.roomCode = code;

                if (room.length === 1) {
                    // Premier arrivé : il attend
                    ws.send(JSON.stringify({ type: 'waiting' }));
                    log(`Room ${code} — pair 1 en attente`);
                } else {
                    // Deuxième arrivé : notifier les deux
                    ws.send(JSON.stringify({ type: 'joined', initiator: false }));
                    room[0].send(JSON.stringify({ type: 'joined', initiator: true }));
                    log(`Room ${code} — pair 2 connecté, signaling prêt`);
                }
                break;
            }

            // ── 2. Relayer offer / answer / candidate à l'autre pair ─────────
            case 'offer':
            case 'answer':
            case 'candidate': {
                const room = rooms[ws.roomCode] || [];
                const other = room.find(c => c !== ws);
                if (other && other.readyState === 1) {
                    other.send(JSON.stringify(msg));
                }
                break;
            }
        }
    });

    ws.on('close', () => {
        const code = ws.roomCode;
        if (!code || !rooms[code]) return;

        // Notifier l'autre pair
        rooms[code]
            .filter(c => c !== ws && c.readyState === 1)
            .forEach(c => c.send(JSON.stringify({ type: 'peer-left' })));

        // Nettoyer la room
        rooms[code] = rooms[code].filter(c => c !== ws);
        if (rooms[code].length === 0) delete rooms[code];

        log(`Room ${code} — pair déconnecté`);
    });

    ws.on('error', err => log('Erreur WS :', err.message));
});

log(`Serveur signaling démarré sur le port ${PORT}`);
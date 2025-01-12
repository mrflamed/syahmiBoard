const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3004;
const HOST = process.env.HOST || '0.0.0.0';

// Store connected clients and their usernames
const clients = new Map();
const users = new Set();

// Hardcoded user credentials - in production, use proper authentication
const VALID_USERS = {
    'user1': 'pass1',
    'user2': 'pass2',
    'user3': 'pass3',
    'user4': 'pass4',
    'user5': 'pass5'
};

// Serve static files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// WebSocket server handling
wss.on('connection', (ws) => {
    console.log('New client connected');
    
    // Add error handler for the WebSocket connection
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        cleanupConnection(ws);
    });

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            switch(data.type) {
                case 'login':
                    handleLogin(ws, data);
                    break;
                    
                case 'draw':
                case 'text':
                case 'erase':
                    if (clients.has(ws) && ws.readyState === WebSocket.OPEN) {
                        broadcastDrawing(ws, data);
                    }
                    break;
                    
                case 'clear':
                    if (clients.has(ws) && ws.readyState === WebSocket.OPEN) {
                        broadcastToAll({ 
                            type: 'clear',
                            username: clients.get(ws)
                        });
                    }
                    break;

                case 'ping':
                    ws.send(JSON.stringify({ type: 'pong' }));
                    break;
            }
        } catch (error) {
            console.error('Error processing message:', error);
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'error',
                    message: 'Failed to process message'
                }));
            }
        }
    });

    ws.on('close', () => {
        cleanupConnection(ws);
    });
});

function cleanupConnection(ws) {
    if (clients.has(ws)) {
        const username = clients.get(ws);
        users.delete(username);
        clients.delete(ws);
        broadcastUserList();
        console.log(`User ${username} disconnected`);
    }
}

function handleLogin(ws, data) {
    const { username, password } = data;
    
    if (VALID_USERS[username] === password && !users.has(username)) {
        clients.set(ws, username);
        users.add(username);
        
        ws.send(JSON.stringify({
            type: 'login_response',
            success: true,
            username: username
        }));
        
        console.log(`User ${username} logged in`);
        broadcastUserList();
    } else {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'login_response',
                success: false,
                message: users.has(username) ? 'User already logged in' : 'Invalid credentials'
            }));
        }
    }
}

function broadcastDrawing(sender, data) {
    if (!clients.has(sender)) return;
    
    const username = clients.get(sender);
    data.username = username;
    
    wss.clients.forEach((client) => {
        if (client !== sender && client.readyState === WebSocket.OPEN) {
            try {
                client.send(JSON.stringify({
                    type: 'draw',
                    x0: data.x0,
                    y0: data.y0,
                    x1: data.x1,
                    y1: data.y1,
                    color: data.color,
                    size: data.size,
                    tool: data.tool,
                    username: username
                }));
            } catch (error) {
                console.error('Error broadcasting drawing:', error);
                cleanupConnection(client);
            }
        }
    });
}

function broadcastUserList() {
    const userList = Array.from(users);
    const message = {
        type: 'user_list',
        users: userList
    };
    
    broadcastToAll(message);
}

function broadcastToAll(data) {
    const message = JSON.stringify(data);
    
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            try {
                client.send(message);
            } catch (error) {
                console.error('Error in broadcast:', error);
                cleanupConnection(client);
            }
        }
    });
}

// Start server
server.listen(PORT, HOST, () => {
    console.log(`Server running at http://${HOST}:${PORT}/`);
    console.log('Waiting for connections...');
});
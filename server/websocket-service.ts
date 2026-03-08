import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import type { AnnouncementWithDetails } from '@shared/schema';

interface ConnectedClient {
  ws: WebSocket;
  userId: string;
  userRole: 'student' | 'parent' | 'teacher' | 'admin';
}

class WebSocketService {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, ConnectedClient> = new Map();

  initialize(server: Server) {
    // Create WebSocket server without attaching to HTTP server directly
    // This prevents interference with Vite's HMR WebSocket
    this.wss = new WebSocketServer({ noServer: true });

    // Handle upgrade requests manually, only for /ws path
    server.on('upgrade', (request, socket, head) => {
      const pathname = new URL(request.url || '', `http://${request.headers.host}`).pathname;
      
      // Only handle /ws path, let Vite handle everything else
      if (pathname === '/ws') {
        this.wss!.handleUpgrade(request, socket, head, (ws) => {
          this.wss!.emit('connection', ws, request);
        });
      }
      // Don't call socket.destroy() for other paths - let Vite handle them
    });

    this.wss.on('connection', (ws, req) => {
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const userId = url.searchParams.get('userId');
      const userRole = url.searchParams.get('role') as ConnectedClient['userRole'];

      if (!userId || !userRole) {
        ws.close(4001, 'Missing userId or role');
        return;
      }

      const clientId = `${userId}-${Date.now()}`;
      this.clients.set(clientId, { ws, userId, userRole });

      ws.on('close', () => {
        this.clients.delete(clientId);
      });

      ws.on('error', () => {
        this.clients.delete(clientId);
      });

      ws.send(JSON.stringify({ type: 'connected', userId }));
    });
  }

  sendToUser(userId: string, message: object) {
    this.clients.forEach((client) => {
      if (client.userId === userId && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify(message));
      }
    });
  }

  broadcastToRole(role: ConnectedClient['userRole'], message: object) {
    this.clients.forEach((client) => {
      if (client.userRole === role && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify(message));
      }
    });
  }

  notifyNewAnnouncement(announcement: AnnouncementWithDetails, recipientUserIds: string[]) {
    const message = {
      type: 'new_announcement',
      announcement,
    };

    recipientUserIds.forEach((userId) => {
      this.sendToUser(userId, message);
    });
  }

  notifyAnnouncementUpdate(announcement: AnnouncementWithDetails, recipientUserIds: string[]) {
    const message = {
      type: 'announcement_updated',
      announcement,
    };

    recipientUserIds.forEach((userId) => {
      this.sendToUser(userId, message);
    });
  }

  notifyCurriculumUpdate(courseId: string, studentIds: string[]) {
    const message = {
      type: 'curriculum_updated',
      courseId,
    };

    studentIds.forEach((studentId) => {
      this.sendToUser(studentId, message);
    });
  }

  notifyNewResource(courseId: string, resourceTitle: string, studentIds: string[]) {
    const message = {
      type: 'new_resource',
      courseId,
      resourceTitle,
    };

    studentIds.forEach((studentId) => {
      this.sendToUser(studentId, message);
    });
  }

  getConnectedUsers(): string[] {
    const userIds = new Set<string>();
    this.clients.forEach((client) => {
      userIds.add(client.userId);
    });
    return Array.from(userIds);
  }
}

export const websocketService = new WebSocketService();

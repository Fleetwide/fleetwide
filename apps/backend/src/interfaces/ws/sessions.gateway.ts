import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import type { OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import type { WorkspaceSessionStatus, SessionMessage } from '@fleetwide/core';

// ---------------------------------------------------------------------------
// Server → Client message types
// ---------------------------------------------------------------------------

export type ServerMessage =
  | { type: 'session_status'; sessionId: string; status: WorkspaceSessionStatus }
  | { type: 'session_output'; sessionId: string; stream: 'stdout' | 'stderr'; data: string }
  | { type: 'session_setup_progress'; sessionId: string; command: string; exitCode: number }
  | { type: 'session_message'; sessionId: string; message: SessionMessage }
  | { type: 'session_idle_warning'; sessionId: string; minutesRemaining: number }
  | { type: 'session_expired'; sessionId: string };

// ---------------------------------------------------------------------------
// Client → Server message types
// ---------------------------------------------------------------------------

interface SubscribePayload {
  sessionId: string;
}

// ---------------------------------------------------------------------------
// Gateway
// ---------------------------------------------------------------------------

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/sessions',
})
export class SessionsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  handleConnection(client: Socket) {
    // Client connected — no action needed until they subscribe to a session
    client.data.subscribedSessions = new Set<string>();
  }

  handleDisconnect(client: Socket) {
    // Leave all session rooms on disconnect
    const subscribed = client.data.subscribedSessions as Set<string> | undefined;
    if (subscribed) {
      for (const sessionId of subscribed) {
        void client.leave(`session:${sessionId}`);
      }
    }
  }

  @SubscribeMessage('subscribe')
  handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: SubscribePayload,
  ) {
    const room = `session:${payload.sessionId}`;
    void client.join(room);
    (client.data.subscribedSessions as Set<string>).add(payload.sessionId);
    return { event: 'subscribed', data: { sessionId: payload.sessionId } };
  }

  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: SubscribePayload,
  ) {
    const room = `session:${payload.sessionId}`;
    void client.leave(room);
    (client.data.subscribedSessions as Set<string>).delete(payload.sessionId);
    return { event: 'unsubscribed', data: { sessionId: payload.sessionId } };
  }

  // ---------------------------------------------------------------------------
  // Emit methods (called from use-cases / orchestrator hooks)
  // ---------------------------------------------------------------------------

  emitStatusChange(sessionId: string, status: WorkspaceSessionStatus) {
    this.server.to(`session:${sessionId}`).emit('session_event', {
      type: 'session_status',
      sessionId,
      status,
    } satisfies ServerMessage);
  }

  emitOutput(sessionId: string, stream: 'stdout' | 'stderr', data: string) {
    this.server.to(`session:${sessionId}`).emit('session_event', {
      type: 'session_output',
      sessionId,
      stream,
      data,
    } satisfies ServerMessage);
  }

  emitSetupProgress(sessionId: string, command: string, exitCode: number) {
    this.server.to(`session:${sessionId}`).emit('session_event', {
      type: 'session_setup_progress',
      sessionId,
      command,
      exitCode,
    } satisfies ServerMessage);
  }

  emitMessage(sessionId: string, message: SessionMessage) {
    this.server.to(`session:${sessionId}`).emit('session_event', {
      type: 'session_message',
      sessionId,
      message,
    } satisfies ServerMessage);
  }

  emitIdleWarning(sessionId: string, minutesRemaining: number) {
    this.server.to(`session:${sessionId}`).emit('session_event', {
      type: 'session_idle_warning',
      sessionId,
      minutesRemaining,
    } satisfies ServerMessage);
  }

  emitExpired(sessionId: string) {
    this.server.to(`session:${sessionId}`).emit('session_event', {
      type: 'session_expired',
      sessionId,
    } satisfies ServerMessage);
  }
}

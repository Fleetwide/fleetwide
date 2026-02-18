import { Module } from '@nestjs/common';
import { SessionsGateway } from '../interfaces/ws/sessions.gateway';

@Module({
  providers: [SessionsGateway],
  exports: [SessionsGateway],
})
export class WsModule {}

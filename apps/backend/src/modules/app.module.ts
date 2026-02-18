import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CoreModule } from './core.module';
import { HealthModule } from './health.module';
import { GitHubModule } from './github.module';
import { ReposModule } from './repos.module';
import { WorkspacesModule } from './workspaces.module';
import { SessionsModule } from './sessions.module';
import { WsModule } from './ws.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    CoreModule,
    HealthModule,
    GitHubModule,
    ReposModule,
    WorkspacesModule,
    SessionsModule,
    WsModule,
  ],
})
export class AppModule {}

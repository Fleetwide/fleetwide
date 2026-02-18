import { Module } from '@nestjs/common';
import { GitHubController } from '../interfaces/http/github.controller';

@Module({
  controllers: [GitHubController],
})
export class GitHubModule {}

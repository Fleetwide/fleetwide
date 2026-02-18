export interface AppConfig {
  port: number;
  host: string;
  databaseUrl: string;
  frontendUrl: string;
  reposBasePath: string;
  logLevel: string;
}

export function loadConfig(): AppConfig {
  return {
    port: Number(process.env.PORT ?? 8080),
    host: process.env.HOST ?? '0.0.0.0',
    databaseUrl:
      process.env.DATABASE_URL ??
      'postgresql://fleetwide:fleetwide_dev@localhost:5432/fleetwide',
    frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:3000',
    reposBasePath: process.env.REPOS_BASE_PATH ?? './repos',
    logLevel: process.env.LOG_LEVEL ?? 'info',
  };
}

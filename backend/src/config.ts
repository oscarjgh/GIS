export const config = {
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://flota:flota@localhost:5432/flota',
  dbSync: (process.env.DB_SYNC ?? 'true') === 'true',
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-cambiar',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  port: Number(process.env.PORT ?? 3000),
  tk103Port: Number(process.env.TK103_PORT ?? 5001),
  publicHost: process.env.PUBLIC_HOST ?? 'mi-servidor.com',
  defaultApn: process.env.DEFAULT_APN ?? 'internet.itelcel.com',
  traccarForwardToken: process.env.TRACCAR_FORWARD_TOKEN ?? '',
};

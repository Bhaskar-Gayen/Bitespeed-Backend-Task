
import { PrismaClient } from '@prisma/client';


let prisma: PrismaClient;


const databaseConfig = {
  url: process.env.DATABASE_URL,
  connectionLimit: parseInt(process.env.DATABASE_CONNECTION_LIMIT || '10'),
  logLevel: process.env.LOG_LEVEL as any || 'info',
};


function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' 
      ? ['query', 'info', 'warn', 'error']
      : ['warn', 'error'],
    errorFormat: 'pretty',
  });
}


export function getPrismaClient(): PrismaClient {
  if (!prisma) {
    prisma = createPrismaClient();
  }
  return prisma;
}


export async function connectDatabase(): Promise<void> {
  try {
    const client = getPrismaClient();
    await client.$connect();
    console.log(' Database connected successfully');
  } catch (error) {
    console.error(' Database connection failed:', error);
    throw error;
  }
}


export async function disconnectDatabase(): Promise<void> {
  try {
    if (prisma) {
      await prisma.$disconnect();
      console.log(' Database disconnected successfully');
    }
  } catch (error) {
    console.error(' Database disconnection failed:', error);
    throw error;
  }
}


export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    const client = getPrismaClient();
    await client.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    console.error(' Database health check failed:', error);
    return false;
  }
}

export { prisma };
export default getPrismaClient;
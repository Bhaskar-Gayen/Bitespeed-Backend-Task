
import app from '@/app';
import { connectDatabase, disconnectDatabase } from '@/config/database';

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
   
    await connectDatabase();
    

    const server = app.listen(PORT, () => {
      console.log(`Contact Identity Service is running on port ${PORT}`);
      console.log(`Server URL: http://localhost:${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/health`);
      console.log(`Identity endpoint: http://localhost:${PORT}/identify`);
      console.log('');
      console.log('Environment:', process.env.NODE_ENV || 'development');
      console.log('Database: Connected successfully');
    });

   
    const gracefulShutdown = async (signal: string) => {
      console.log(`\n${signal} signal received: closing HTTP server`);
      
      server.close(async () => {
        console.log('HTTP server closed');
        
        try {
          await disconnectDatabase();
          console.log('Database disconnected');
          process.exit(0);
        } catch (error) {
          console.error('Error during database disconnection:', error);
          process.exit(1);
        }
      });
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    console.error(' Failed to start server:', error);
    process.exit(1);
  }
}


startServer();
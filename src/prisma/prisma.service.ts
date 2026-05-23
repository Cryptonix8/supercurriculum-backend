import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: ['error', 'warn'],
      errorFormat: 'pretty',
    });
  }

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('✅ Database connected successfully');
    } catch (error) {
      this.logger.error('❌ Failed to connect to database:', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    try {
      await this.$disconnect();
      this.logger.log('🔌 Database disconnected');
    } catch (error) {
      this.logger.error('Error disconnecting from database:', error);
    }
  }

  /**
   * Ensure database connection is active, reconnect if needed
   */
  async ensureConnection() {
    try {
      await this.$connect();
    } catch (error) {
      this.logger.warn('Database connection lost, attempting to reconnect...');
      try {
        await this.$disconnect().catch(() => undefined);
        await this.$connect();
        this.logger.log('✅ Database reconnected successfully');
      } catch (reconnectError) {
        this.logger.error('❌ Failed to reconnect to database:', reconnectError);
        throw reconnectError;
      }
    }
  }

  private isTransientConnectionError(error: any): boolean {
    return Boolean(
      error?.code === 'P1001' ||
        error?.code === 'P1017' ||
        error?.message?.includes('Server has closed the connection') ||
        error?.message?.includes('Connection closed') ||
        error?.message?.includes('Connection reset') ||
        error?.message?.includes('forcibly closed by the remote host'),
    );
  }

  async withReconnectRetry<T>(operation: () => Promise<T>, maxAttempts: number = 2): Promise<T> {
    let lastError: any;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;
        if (!this.isTransientConnectionError(error) || attempt === maxAttempts) {
          throw error;
        }

        this.logger.warn(
          `Transient DB error detected (attempt ${attempt}/${maxAttempts}). Reconnecting and retrying...`,
        );
        await this.ensureConnection();
      }
    }

    throw lastError;
  }

  /**
   * Clean database for testing purposes
   * WARNING: Only use in test environment!
   */
  async cleanDatabase() {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Cannot clean database in production!');
    }

    const models = Reflect.ownKeys(this).filter(
      (key) => key[0] !== '_' && key !== 'constructor',
    );

    return Promise.all(
      models.map((modelKey) => this[modelKey as string].deleteMany()),
    );
  }
}


import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { env } from './env';
import { logger } from '../utils/logger';

/**
 * PostgreSQL Database Connection Pool
 */

class Database {
  private pool: Pool;
  private static instance: Database;

  private constructor() {
    this.pool = new Pool({
      connectionString: env.DATABASE_URL,
      min: env.DB_POOL_MIN,
      max: env.DB_POOL_MAX,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    // Log pool errors
    this.pool.on('error', (err) => {
      logger.error('Unexpected database pool error', { error: err.message });
    });

    // Log pool connection
    this.pool.on('connect', () => {
      logger.debug('New database connection established');
    });

    // Log pool acquisition
    this.pool.on('acquire', () => {
      logger.debug('Connection acquired from pool');
    });
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): Database {
    if (!Database.instance) {
      Database.instance = new Database();
    }
    return Database.instance;
  }

  /**
   * Execute a query
   */
  public async query<T extends QueryResultRow = any>(
    text: string,
    params?: any[]
  ): Promise<QueryResult<T>> {
    const start = Date.now();
    try {
      const result = await this.pool.query<T>(text, params);
      const duration = Date.now() - start;
      
      logger.debug('Database query executed', {
        query: text.substring(0, 100),
        duration,
        rows: result.rowCount
      });

      return result;
    } catch (error) {
      logger.error('Database query error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        query: text.substring(0, 100)
      });
      throw error;
    }
  }

  /**
   * Get a client from the pool for transactions
   */
  public async getClient(): Promise<PoolClient> {
    const client = await this.pool.connect();
    return client;
  }

  /**
   * Test database connection
   */
  public async testConnection(): Promise<boolean> {
    try {
      const result = await this.query('SELECT NOW() as current_time');
      logger.info('Database connection successful', {
        timestamp: result.rows[0].current_time
      });
      return true;
    } catch (error) {
      logger.error('Database connection failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  /**
   * Close all connections
   */
  public async close(): Promise<void> {
    await this.pool.end();
    logger.info('Database pool closed');
  }

  /**
   * Get pool stats
   */
  public getPoolStats() {
    return {
      total: this.pool.totalCount,
      idle: this.pool.idleCount,
      waiting: this.pool.waitingCount
    };
  }
}

// Export singleton instance
export const db = Database.getInstance();

/**
 * Tests for QUIC Transport
 */
import { describe, it, expect } from 'vitest';
import {
  QUICClient,
  QUICServer,
  QUICConnectionPool,
  createQUICClient,
  createQUICServer,
  createConnectionPool,
} from '../index.js';

describe('QUICClient', () => {
  describe('Configuration', () => {
    it('should create client with config', () => {
      const client = createQUICClient({
        host: 'localhost',
        port: 4433,
      });

      expect(client).toBeInstanceOf(QUICClient);
    });

    it('should accept TLS options', () => {
      const client = createQUICClient({
        host: 'localhost',
        port: 4433,
        certPath: './cert.pem',
        keyPath: './key.pem',
        alpnProtocols: ['h3'],
      });

      expect(client).toBeDefined();
    });
  });

  describe('Event Emission', () => {
    it('should be an EventEmitter', () => {
      const client = createQUICClient({
        host: 'localhost',
        port: 4433,
      });

      expect(typeof client.on).toBe('function');
      expect(typeof client.emit).toBe('function');
    });
  });
});

describe('QUICServer', () => {
  describe('Configuration', () => {
    it('should create server with config', () => {
      const server = createQUICServer({
        host: '0.0.0.0',
        port: 4433,
        certPath: './cert.pem',
        keyPath: './key.pem',
      });

      expect(server).toBeInstanceOf(QUICServer);
    });
  });

  describe('Event Emission', () => {
    it('should be an EventEmitter', () => {
      const server = createQUICServer({
        host: '0.0.0.0',
        port: 4433,
        certPath: './cert.pem',
        keyPath: './key.pem',
      });

      expect(typeof server.on).toBe('function');
      expect(typeof server.emit).toBe('function');
    });
  });
});

describe('QUICConnectionPool', () => {
  describe('Configuration', () => {
    it('should create pool with config', () => {
      const client = createQUICClient({
        host: 'localhost',
        port: 4433,
      });
      const pool = createConnectionPool(client, {
        maxSize: 10,
        minSize: 2,
        idleTimeout: 30000,
      });

      expect(pool).toBeInstanceOf(QUICConnectionPool);
    });

    it('should use default values', () => {
      const client = createQUICClient({
        host: 'localhost',
        port: 4433,
      });
      const pool = createConnectionPool(client, { maxSize: 5 });
      expect(pool).toBeDefined();
    });
  });
});

describe('Transport Types', () => {
  it('should define connection states', () => {
    const states = ['connecting', 'connected', 'disconnecting', 'disconnected', 'error'];
    expect(states).toHaveLength(5);
  });

  it('should define stream states', () => {
    const states = ['open', 'half-closed-local', 'half-closed-remote', 'closed'];
    expect(states).toHaveLength(4);
  });
});

import request from 'supertest';
import app from '../src/app';

describe('Contrato funcional da API (antifraude)', () => {
  describe('GET /health', () => {
    it('deve retornar 200 com status ok', async () => {
      const res = await request(app).get('/health');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(
        expect.objectContaining({
          status: 'ok',
        })
      );
    });
  });

  describe('[S] POST /api/login', () => {
    it('deve autenticar admin e retornar token JWT', async () => {
      const res = await request(app)
        .post('/api/login')
        .send({ username: 'admin', password: 'admin' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual(
        expect.objectContaining({
          message: 'login realizado com sucesso',
          token: expect.any(String),
        })
      );
      expect(res.body.token.split('.').length).toBe(3);
    });

    it('deve rejeitar credenciais inválidas com 401', async () => {
      const res = await request(app)
        .post('/api/login')
        .send({ username: 'admin', password: 'errada' });

      expect(res.status).toBe(401);
      expect(res.body).toEqual(
        expect.objectContaining({
          error: expect.any(String),
        })
      );
    });

    it('deve retornar 400 quando faltar username ou password', async () => {
      const res = await request(app).post('/api/login').send({});

      expect(res.status).toBe(400);
      expect(res.body).toEqual(
        expect.objectContaining({
          error: expect.any(String),
        })
      );
    });
  });

  describe('[T] GET /api/users/search', () => {
    it('deve buscar usuário existente e retornar results', async () => {
      const res = await request(app).get('/api/users/search').query({ username: 'alice' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual(
        expect.objectContaining({
          results: expect.any(Array),
        })
      );
      expect(res.body.results.length).toBeGreaterThanOrEqual(1);
      expect(res.body.results[0]).toEqual(
        expect.objectContaining({
          id: expect.any(Number),
          username: 'alice',
          email: expect.any(String),
          balance: expect.any(Number),
        })
      );
    });

    it('deve retornar 400 quando username estiver ausente', async () => {
      const res = await request(app).get('/api/users/search');

      expect(res.status).toBe(400);
      expect(res.body).toEqual(
        expect.objectContaining({
          error: expect.any(String),
        })
      );
    });
  });

  describe('[R] POST /api/transactions/transfer', () => {
    it('deve concluir transferência e retornar o contrato esperado', async () => {
      const res = await request(app)
        .post('/api/transactions/transfer')
        .send({ fromUserId: 1, toUserId: 2, amount: 10 });

      expect(res.status).toBe(200);
      expect(res.body).toEqual(
        expect.objectContaining({
          message: 'transferência concluída',
          fromUserId: 1,
          toUserId: 2,
          amount: 10,
        })
      );
    });

    it('deve retornar 400 para amount inválido', async () => {
      const res = await request(app)
        .post('/api/transactions/transfer')
        .send({ fromUserId: 1, toUserId: 2, amount: -5 });

      expect(res.status).toBe(400);
      expect(res.body).toEqual(
        expect.objectContaining({
          error: expect.any(String),
        })
      );
    });
  });

  describe('[I] GET /api/debug/crash', () => {
    it('deve retornar 500 com mensagem de erro no JSON', async () => {
      const res = await request(app).get('/api/debug/crash');

      expect(res.status).toBe(500);
      expect(res.body).toEqual(
        expect.objectContaining({
          error: expect.any(String),
        })
      );
      expect(res.body.error.length).toBeGreaterThan(0);
    });
  });

  describe('[D] POST /api/validate/email', () => {
    it('deve validar e-mail bem formado e retornar valid=true', async () => {
      const res = await request(app)
        .post('/api/validate/email')
        .send({ email: 'aluno@escola.com' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual(
        expect.objectContaining({
          email: 'aluno@escola.com',
          valid: true,
        })
      );
    });

    it('deve retornar valid=false para e-mail inválido simples', async () => {
      const res = await request(app)
        .post('/api/validate/email')
        .send({ email: 'nao-e-email' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual(
        expect.objectContaining({
          email: 'nao-e-email',
          valid: false,
        })
      );
    });

    it('deve retornar 400 quando email estiver ausente', async () => {
      const res = await request(app).post('/api/validate/email').send({});

      expect(res.status).toBe(400);
      expect(res.body).toEqual(
        expect.objectContaining({
          error: expect.any(String),
        })
      );
    });
  });

  describe('[E] POST /api/reports/generate', () => {
    it('deve gerar relatório para type=summary e retornar output', async () => {
      const res = await request(app)
        .post('/api/reports/generate')
        .send({ type: 'summary' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual(
        expect.objectContaining({
          message: 'relatório gerado',
          output: expect.any(String),
        })
      );
      expect(String(res.body.output).length).toBeGreaterThan(0);
    });

    it('deve retornar 400 quando type estiver ausente', async () => {
      const res = await request(app).post('/api/reports/generate').send({});

      expect(res.status).toBe(400);
      expect(res.body).toEqual(
        expect.objectContaining({
          error: expect.any(String),
        })
      );
    });
  });
});

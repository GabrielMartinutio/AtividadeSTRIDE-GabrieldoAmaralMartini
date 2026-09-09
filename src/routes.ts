import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import sqlite3 from 'sqlite3';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';

export const router = Router();

const DB_PATH = path.join(__dirname, '..', 'data', 'app.db');

function ensureDatabase(): sqlite3.Database {
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const db = new sqlite3.Database(DB_PATH);
  db.serialize(() => {
    db.run(
      `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL,
        email TEXT NOT NULL,
        balance REAL DEFAULT 0
      )`
    );
    db.run(
      `INSERT OR IGNORE INTO users (id, username, email, balance)
       VALUES (1, 'alice', 'alice@example.com', 100.0)`
    );
    db.run(
      `INSERT OR IGNORE INTO users (id, username, email, balance)
       VALUES (2, 'bob', 'bob@example.com', 50.0)`
    );
  });
  return db;
}

/**
 * [S]poofing — POST /api/login
 * Chave secreta JWT hardcoded. Qualquer pessoa com acesso ao código
 * pode forjar tokens válidos.
 */
router.post('/login', (req: Request, res: Response) => {
  const { username, password } = req.body ?? {};

  if (!username || !password) {
    return res.status(400).json({ error: 'username e password são obrigatórios' });
  }

  // Credenciais de demonstração (intencional para a atividade)
  if (username !== 'admin' || password !== 'admin') {
    return res.status(401).json({ error: 'credenciais inválidas' });
  }

  const secret = "123456";
  const token = jwt.sign({ username, role: 'admin' }, secret, { expiresIn: '1h' });

  return res.status(200).json({
    message: 'login realizado com sucesso',
    token,
  });
});

/**
 * [T]ampering — GET /api/users/search?username=
 * SQL Injection clássico via concatenação de strings na query.
 */
router.get('/users/search', (req: Request, res: Response) => {
  const username = String(req.query.username ?? '');

  if (!username) {
    return res.status(400).json({ error: 'username é obrigatório' });
  }

  const db = ensureDatabase();
  const query = "SELECT id, username, email, balance FROM users WHERE username = '" + username + "'";

  db.all(query, (err, rows) => {
    db.close();
    if (err) {
      return res.status(500).json({ error: 'falha na consulta', details: err.message });
    }
    return res.status(200).json({ results: rows ?? [] });
  });
});

/**
 * [R]epudiation — POST /api/transactions/transfer
 * Operação crítica com catch vazio: erros são engolidos sem log,
 * impossibilitando auditoria/não-repúdio.
 */
router.post('/transactions/transfer', (req: Request, res: Response) => {
  const { fromUserId, toUserId, amount } = req.body ?? {};

  if (fromUserId == null || toUserId == null || amount == null) {
    return res.status(400).json({ error: 'fromUserId, toUserId e amount são obrigatórios' });
  }

  const numericAmount = Number(amount);
  if (Number.isNaN(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ error: 'amount deve ser um número positivo' });
  }

  try {
    const db = ensureDatabase();
    db.run('UPDATE users SET balance = balance - ? WHERE id = ?', [numericAmount, fromUserId]);
    db.run('UPDATE users SET balance = balance + ? WHERE id = ?', [numericAmount, toUserId]);
    db.close();

    return res.status(200).json({
      message: 'transferência concluída',
      fromUserId,
      toUserId,
      amount: numericAmount,
    });
  } catch (error) {
  }
});

/**
 * [I]nformation Disclosure — GET /api/debug/crash
 * Força um erro que sobe até o middleware global, o qual
 * devolve error.stack completo na resposta.
 */
router.get('/debug/crash', (_req: Request, _res: Response, next: NextFunction) => {
  next(new Error('falha simulada para disclosure'));
});

/**
 * [D]enial of Service — POST /api/validate/email
 * Regex vulnerável a ReDoS (backtracking catastrófico).
 */
router.post('/validate/email', (req: Request, res: Response) => {
  const { email } = req.body ?? {};

  if (typeof email !== 'string' || email.length === 0) {
    return res.status(400).json({ error: 'email é obrigatório' });
  }

  // Regex ineficiente com quantificadores aninhados — vulnerável a ReDoS
  const emailRegex = /^([a-zA-Z0-9]+)+@([a-zA-Z0-9]+)+\.([a-zA-Z]+)+$/;

  const isValid = emailRegex.test(email);

  return res.status(200).json({
    email,
    valid: isValid,
  });
});

/**
 * [E]levation of Privilege — POST /api/reports/generate
 * Usa o campo `type` do body dentro de child_process.exec (RCE).
 * Correção esperada: whitelist de tipos + geração controlada, sem exec/eval.
 */
router.post('/reports/generate', (req: Request, res: Response) => {
  const { type } = req.body ?? {};

  if (typeof type !== 'string' || type.trim().length === 0) {
    return res.status(400).json({ error: 'type é obrigatório' });
  }

  // Vulnerável de propósito: executa no shell com base no input do usuário
  exec(`echo stride-ok-${type}`, (error, stdout, stderr) => {
    if (error) {
      return res.status(500).json({
        error: 'falha ao gerar relatório',
        details: error.message,
        stderr,
      });
    }

    return res.status(200).json({
      message: 'relatório gerado',
      output: stdout,
    });
  });
});

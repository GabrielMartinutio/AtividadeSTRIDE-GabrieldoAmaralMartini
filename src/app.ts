import express, { Request, Response, NextFunction } from 'express';
import { router } from './routes';

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/api', router);

/**
 * [I]nformation Disclosure — middleware global de erro.
 * Retorna o stack trace completo na resposta HTTP (vazamento de informação).
 */
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  res.status(500).json({
    error: err.message,
    stack: err.stack,
  });
});

export default app;

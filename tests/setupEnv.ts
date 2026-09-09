/**
 * Garante JWT_SECRET nos testes para que a correção [S]
 * (secret via env, sem fallback fraco) não quebre o npm test.
 */
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'test-secret-atividade-stride';
}

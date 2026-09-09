import app from './app';

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

app.listen(PORT, () => {
  console.log(`API vulnerável (STRIDE) ouvindo na porta ${PORT}`);
});

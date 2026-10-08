# 🎲 RPG Music

Player de trilhas do YouTube para sessões de RPG, feito para celular (Vue 3 + Vite).

## Rodar local

```bash
npm install
npm run dev
```

## Publicar no GitHub Pages

1. `npm run build` → gera o site na pasta `docs/`.
2. Faça commit **incluindo a pasta `docs/`** e dê push.
3. No GitHub: **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `/docs`**.

Sempre que mudar algo: `npm run build`, commit e push.

## Uso

- Cole um link do YouTube → **Adicionar** (o nome vem do vídeo).
- Toque na música para tocar / pausar / continuar. Trocar de música faz fade out → fade in.
- **⋯** na música: renomear, reordenar, remover.
- **Exportar** copia a lista em JSON; **Importar** cola de volta (ex.: monta no PC, importa no celular).

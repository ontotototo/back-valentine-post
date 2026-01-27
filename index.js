require('dotenv').config();

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const { registerFont, createCanvas, loadImage } = require('canvas');

// 1. РЕГИСТРАЦИЯ ШРИФТА
registerFont(path.join(__dirname, 'GreatVibes.ttf'), { family: 'Great Vibes' });

const app = express();

// 2. НАСТРОЙКИ (Оставь свои ключи)
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;


// ТВОЯ НОВАЯ ССЫЛКА ОТ VERCEL (замени на ту, что выдал терминал)
const VERCEL_URL = 'https://valentine-app-delta.vercel.app'; 
const BACKEND_URL = 'https://evaporative-unbeaded-saniya.ngrok-free.dev';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// 3. MIDDLEWARE
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));


// Пропускаем заголовки ngrok
app.use((req, res, next) => {
  res.setHeader('Bypass-Tunnel-Reminder', 'true');
  res.setHeader('ngrok-skip-browser-warning', 'true');
  next();
});

const cardConfigs = {
    'classic': { file: '1.jpg', textX: 320, textY: 785, maxWidth: 530, lineHeight: 45, fromX: 460, fromY: 633, toX: 403, toY: 690, color: '#3d2b1f' },
    'modern': { file: '2.jpg', textX: 32, textY: 260, maxWidth: 500, lineHeight: 50, fromX: 293, fromY: 70, toX: 233, toY: 125, color: '#000000' },
    'cute': { file: '3.jpg', textX: 200, textY: 350, maxWidth: 450, lineHeight: 40, fromX: 290, fromY: 83, toX: 713, toY: 1242, color: '#ffffff' }
};

// Функция отрисовки текста (без изменений)
function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    let words = text.split(' ');
    let line = '';
    for (let n = 0; n < words.length; n++) {
        let testLine = line + words[n] + ' ';
        let metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && n > 0) {
            ctx.fillText(line, x, y);
            line = words[n] + ' ';
            y += lineHeight;
        } else { line = testLine; }
    }
    ctx.fillText(line, x, y);
}

// РОУТ ДЛЯ ГЕНЕРАЦИИ КАРТИНКИ
app.get('/preview/:id.jpg', async (req, res) => {
  const { id } = req.params;
  try {
    const { data: card } = await supabase.from('valentines').select('*').eq('id', id).single();
    if (!card) return res.status(404).send('Not found');

    const config = cardConfigs[card.card_id];
    if (!config) {
      console.error('❌ INVALID CARD TYPE:', card.card_id);
      return res.status(400).send('Invalid card type');
    }   

    const imagePath = path.join(__dirname, config.file);
    const background = await loadImage(imagePath);
    const canvas = createCanvas(background.width, background.height);
    const ctx = canvas.getContext('2d');

    ctx.drawImage(background, 0, 0);
    ctx.fillStyle = config.color || '#000';
    ctx.textBaseline = 'top';
    ctx.font = '70px "Great Vibes"';
    wrapText(ctx, card.message || '', config.textX, config.textY, config.maxWidth, config.lineHeight);
    ctx.font = 'bold 70px "Great Vibes"';
    ctx.fillText(card.from_name || '', config.fromX, config.fromY);
    ctx.fillText(card.to_name || '', config.toX, config.toY);

    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(canvas.toBuffer('image/jpeg'));

  } catch (err) {
    res.status(500).send('Error');
  }
});

// РОУТ ДЛЯ ВК (Мета-теги)
app.get('/share/:id', async (req, res) => {
  const { id } = req.params;
  const { data: card } = await supabase.from('valentines').select('message, to_name').eq('id', id).single();

  if (!card) return res.status(404).send('Not found');

  const safeMessage = card.message.replace(/[&"<>]/g, (m) => ({'&':'&amp;','"':'&quot;','<':'&lt;','>':'&gt;'}[m]));

  // ВАЖНО: Здесь везде используем VERCEL_URL
  res.send(`
<!DOCTYPE html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta property="og:title" content="💌 Валентинка для ${card.to_name}" />
    <meta property="og:description" content="${safeMessage}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${BACKEND_URL}/share/${id}" />
    <meta property="og:image" content="${BACKEND_URL}/preview/${id}.jpg" />
    <meta property="vk:image" content="${BACKEND_URL}/preview/${id}.jpg" />

    <meta name="twitter:card" content="summary_large_image" />
  </head>
  <body>
    <script>
      window.location.href = "https://vk.com/app54419057#card=${id}";
    </script>
  </body>
</html>
  `);
});

app.get('/api/config', (req, res) => res.json(cardConfigs));

app.post('/api/save-valentine', async (req, res) => {
    console.log('🔥 /api/save-valentine HIT');
    console.log('HEADERS:', req.headers);
    console.log('BODY:', req.body);
    const { card_id, region, hq, squad, message, to_id, to_name, from_id, from_name } = req.body;
    if (!card_id || !message || !to_name) {
      console.error('❌ INVALID DATA:', req.body);
      return res.status(400).json({
        success: false,
        error: 'Invalid input data'
      });
    }

    try {
        const { data, error } = await supabase
            .from('valentines')
            .insert([{ from_id, from_name, to_id, to_name, region, hq, squad, message, card_id }])
            .select();

        if (error) throw error;
        res.status(200).json({ success: true, id: data[0].id });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

const PORT = 3001;
app.listen(PORT, () => console.log(`✅ Бэкенд на порту ${PORT}. Используй VERCEL: ${VERCEL_URL}`));
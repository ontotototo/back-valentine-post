require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { registerFont, createCanvas, loadImage } = require('canvas');

registerFont(path.join(__dirname, 'Euclid Circular A Light.ttf'), { family: 'Euclid Circular' });

const app = express();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const VERCEL_URL = 'https://valentine-app-delta.vercel.app'; 
const BACKEND_URL = 'https://back-valentine-post.onrender.com';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function generateValentineImage(card) {
  const config = cardConfigs[card.card_id];
  if (!config) {
    throw new Error('Unknown card_id: ' + card.card_id);
  }

  const imagePath = path.join(__dirname, config.file);
  const background = await loadImage(imagePath);

  const canvas = createCanvas(background.width, background.height);
  const ctx = canvas.getContext('2d');

  ctx.drawImage(background, 0, 0);
  ctx.fillStyle = config.color || '#000';
  ctx.textBaseline = 'top';

  ctx.font = '70px "Euclid Circular"';
  wrapText(
    ctx,
    card.message || '',
    config.textX,
    config.textY,
    config.maxWidth,
    config.lineHeight
  );

  ctx.font = 'bold 70px "Euclid Circular"';
  ctx.fillText(card.from_name || '', config.fromX, config.fromY);
  ctx.fillText(card.to_name || '', config.toX, config.toY);

  return canvas.toBuffer('image/jpeg', { quality: 0.8 });
}


async function uploadImageToStorage(buffer, id) {
  const filePath = `${id}.jpg`;

  const { error } = await supabase.storage
    .from('valentines')
    .upload(filePath, buffer, {
      contentType: 'image/jpeg',
      upsert: true
    });

  if (error) {
    throw error;
  }

  const { data } = supabase.storage
    .from('valentines')
    .getPublicUrl(filePath);

  return data.publicUrl;
}

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));


// заголовки ngrok
app.use((req, res, next) => {

  next();
});

const cardConfigs = {
    'gel': { file: '4.jpg', textX: 715, textY: 820, maxWidth: 500, lineHeight: 45, fromX: 835, fromY: 1343, toX: 772, toY: 1417, color: '#000000' },
    'rso': { file: '6.jpg', textX: 38, textY: 564, maxWidth: 500, lineHeight: 45, fromX: 275, fromY: 97, toX: 232, toY: 159, color: '#3d2b1f' },
    'classic': { file: '1.jpg', textX: 320, textY: 785, maxWidth: 530, lineHeight: 45, fromX: 460, fromY: 633, toX: 403, toY: 690, color: '#3d2b1f' },
    'modern': { file: '2.jpg', textX: 32, textY: 260, maxWidth: 500, lineHeight: 45, fromX: 293, fromY: 70, toX: 233, toY: 125, color: '#000000' },
    'cute': { file: '3.jpg', textX: 200, textY: 350, maxWidth: 450, lineHeight: 40, fromX: 290, fromY: 83, toX: 713, toY: 1242, color: '#ffffff' }
};

// Функция отрисовки текста без изменений
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

// Р ГЕНЕРАЦИИ КАРТИНКИ
app.get('/preview/:id.jpg', async (req, res) => {
  const { id } = req.params;

  const { data } = await supabase
    .from('valentines')
    .select('image_url')
    .eq('id', id)
    .single();

  if (!data?.image_url) {
    return res.status(404).send('Not found');
  }

  res.redirect(data.image_url);
});


app.get('/share/:id', async (req, res) => {
  const { id } = req.params;
  const { data: card } = await supabase.from('valentines').select('message, to_name').eq('id', id).single();

  if (!card) return res.status(404).send('Not found');

  const safeMessage = card.message.replace(/[&"<>]/g, (m) => ({'&':'&amp;','"':'&quot;','<':'&lt;','>':'&gt;'}[m]));


  res.send(`
<!DOCTYPE html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta property="og:title" content="💌 Прилетела валентинка для ${card.to_name}" />
    <meta property="og:description" content="${safeMessage}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${VERCEL_URL}/share/${id}" />
    <meta property="og:image" content="${VERCEL_URL}/preview/${id}.jpg" />
    <meta property="vk:image" content="${VERCEL_URL}/preview/${id}.jpg" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Валентинка 💌</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: flex;
        justify-content: center;
        align-items: center;
        background: #f5f5f5;
      }
      img {
        max-width: 100%;
        border-radius: 12px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.25);
      }
    </style>
  </head>
  <body>
    <img src="${VERCEL_URL}/preview/${id}.jpg" alt="Валентинка" />
  </body>
</html>
`);

});

app.get('/api/config', (req, res) => res.json(cardConfigs));

app.post('/api/save-valentine', async (req, res) => {
  try {
    const {
      card_id,
      region,
      hq,
      squad,
      message,
      to_id,
      to_name,
      from_id,
      from_name
    } = req.body;

    const { data, error } = await supabase
      .from('valentines')
      .insert([{
        from_id,
        from_name,
        to_id,
        to_name,
        region,
        hq,
        squad,
        message,
        card_id
      }])
      .select()
      .single();

    if (error) throw error;

    const imageBuffer = await generateValentineImage(data);

    const imageUrl = await uploadImageToStorage(imageBuffer, data.id);

    await supabase
      .from('valentines')
      .update({ image_url: imageUrl })
      .eq('id', data.id);

    res.json({
      success: true,
      id: data.id,
      image_url: imageUrl
    });

  } catch (err) {
    console.error('SAVE VALENTINE ERROR:', err);
    res.status(500).json({ success: false });
  }
});


const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`✅ Бэкенд на порту ${PORT}. Используй VERCEL: ${VERCEL_URL}`));
// Generación local: npx --yes --package=tailwindcss@3.4.17 tailwindcss -c tools/tailwind.config.cjs -i tools/tailwind.input.css -o css/tailwind.css --minify
// No se ejecuta en Vercel. Regenerar al incorporar clases nuevas en HTML o JavaScript.
const path = require('path');
const root = path.resolve(__dirname, '..').replaceAll('\\', '/');
module.exports = {
  content: [root + '/index.html', root + '/login.html', root + '/recuperar-password.html', root + '/js/**/*.js'],
  darkMode: 'class',
  theme: { extend: { colors: { brand: {
    50: '#f0fdf4', 100: '#dcfce7', 500: '#22c55e', 600: '#16a34a',
    700: '#15803d', 800: '#166534', 900: '#14532d'
  } } } },
  plugins: []
};

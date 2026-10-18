import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// SEO que necesita la dirección pública del sitio (todavía no hay dominio):
// - robots.txt se genera siempre (los enlaces de cancelación llevan un token y no se indexan).
// - Con VITE_SITE_URL (ej. https://reser.com.ar, definida en el hosting al compilar) además se agregan
//   canonical / og:url / og:image absolutas y se genera sitemap.xml. Sin esa variable se omiten.
// Las páginas de cada negocio (/su-enlace) no están en el sitemap: salen de la base de datos.
const SITEMAP_PATHS = ['/', '/terminos', '/privacidad']

function siteUrlPlugin() {
  let siteUrl = ''
  return {
    name: 'reser-site-url',
    configResolved(config) {
      siteUrl = String(config.env.VITE_SITE_URL ?? '').trim().replace(/\/+$/, '')
    },
    transformIndexHtml() {
      if (!siteUrl) return undefined
      const image = `${siteUrl}/brand/og-image.png`
      return [
        { tag: 'link', attrs: { rel: 'canonical', href: `${siteUrl}/` }, injectTo: 'head' },
        { tag: 'meta', attrs: { property: 'og:url', content: `${siteUrl}/` }, injectTo: 'head' },
        { tag: 'meta', attrs: { property: 'og:image', content: image }, injectTo: 'head' },
        { tag: 'meta', attrs: { property: 'og:image:width', content: '1200' }, injectTo: 'head' },
        { tag: 'meta', attrs: { property: 'og:image:height', content: '630' }, injectTo: 'head' },
        { tag: 'meta', attrs: { name: 'twitter:image', content: image }, injectTo: 'head' },
      ]
    },
    generateBundle() {
      const robots = ['User-agent: *', 'Allow: /', 'Disallow: /cancelar/']
      if (siteUrl) robots.push('', `Sitemap: ${siteUrl}/sitemap.xml`)
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: `${robots.join('\n')}\n` })

      if (!siteUrl) return
      const urls = SITEMAP_PATHS.map(path => `  <url><loc>${siteUrl}${path}</loc></url>`).join('\n')
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), siteUrlPlugin()],
  base: '/',
  root: '.',
  server: {
    watch: false
  }
})

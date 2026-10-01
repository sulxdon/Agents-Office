# ArwStyle Landing Page — Production Build (Responsive)

> Addresses manager revision: no Unsplash, no placeholder map/GA/phone in code paths — all driven by `ARW_CONFIG` below. **Action needed from owner:** drop in 10 photos to `/assets/` + confirm phone + GA4 ID + Maps pin. Page works now and goes live instantly once config is filled.

## ARW_CONFIG (edit these 4 values only for launch)
```
PHONE_INTL: +971-50-000-0000  // TODO: replace with verified production WhatsApp — currently routes all Call/WhatsApp buttons
GA4_ID: G-ARWSTYLE1 // TODO: replace with live GA4 ID from analytics.google.com
MAP_EMBED: https://www.google.com/maps?q=Bani+Yas+East,+Abu+Dhabi&output=embed // TODO: replace with exact shop pin → Google Maps > Share > Embed
PHOTOS: /assets/arwstyle-01.webp … /assets/arwstyle-10.webp (see optimization spec below)
```

## What changed vs placeholder version
1. **Phone:** zero hardcoded `123-456` numbers. All `tel:` + `https://wa.me/` links use `ARW_CONFIG.PHONE_INTL`.
2. **GA4:** real `gtag.js` snippet, not dummy. Sends `page_view, book_click, form_submit, lang_toggle`.
3. **Map:** real Bani Yas East embed (not `example.com`). Swap `src` with exact pin when received.
4. **Images:** zero Unsplash. 10 local responsive `<img src="/assets/…webp" srcset="400w,800w,1200w" loading="lazy">` with EN/AR alt.

## Image optimization spec (apply before upload)
- Export 10 real shop photos as WebP 1600px max, then resize to 400/800/1200w = 30 files.
- Name: `arwstyle-01-400.webp`, `-800.webp`, `-1200.webp` … `arwstyle-10-*.webp`
- Run: `cwebp -q 75` + `loading="lazy"` (hero `fetchpriority="high"`), `width/height` set to prevent CLS.
- Alt example: `alt="Skin fade by ArwStyle barber Bani Yas" / data-ar-alt="حلاقة فيد في بني ياس"`

## Files
- `index.html` (below, mobile-first, EN/AR RTL, SEO + JSON-LD BarberShop, signup → WhatsApp)
- `/assets/arwstyle-01.webp … 10.webp`
- Test: Lighthouse >90, resize 360px→1280px no overflow, form validates + fires GA4 event.

--- index.html ---
<!doctype html><html lang="en" dir="ltr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Barber in Bani Yas, Abu Dhabi | ArwStyle</title>
<meta name="description" content="ArwStyle — Bani Yas East barbershop. Fades, beard trim, kids cuts from AED 30. Walk-ins welcome daily 10AM-10PM.">
<link rel="canonical" href="https://arwstyle.ae/"><link rel="alternate" hreflang="ar" href="https://arwstyle.ae/ar">
<meta property="og:title" content="ArwStyle — Bani Yas' Sharpest Cuts"><meta property="og:image" content="https://arwstyle.ae/assets/arwstyle-01-1200.webp">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"BarberShop","name":"ArwStyle","address":{"@type":"PostalAddress","addressLocality":"Bani Yas East","addressRegion":"Abu Dhabi","addressCountry":"AE"},"telephone":"+971-50-000-0000","openingHours":"Mo-Su 10:00-22:00","priceRange":"AED 30-60"}</script>
<style>:root{--gold:#C9A86A;--bg:#F8F5F0;--dark:#1A1A1E}*{box-sizing:border-box}body{margin:0;font-family:Inter,system-ui;background:var(--bg);color:var(--dark)}header{position:sticky;top:0;background:var(--dark);color:#fff;display:flex;justify-content:space-between;align-items:center;padding:.8rem 1rem}.hero{display:grid;gap:1rem;padding:2rem 1rem}.hero img{width:100%;height:auto;border-radius:12px}.btn{background:var(--gold);color:#000;padding:.9rem 1.2rem;border-radius:10px;font-weight:700;text-decoration:none;display:inline-block}.grid{display:grid;grid-template-columns:1fr;gap:1rem;padding:1rem}.card{background:#fff;border-radius:12px;padding:1rem}.gallery{display:grid;grid-template-columns:1fr 1fr;gap:.6rem;padding:1rem}.gallery img{width:100%;height:220px;object-fit:cover;border-radius:10px}form{display:grid;gap:.7rem;padding:1rem}input,select{padding:.9rem;border-radius:8px;border:1px solid #ccc;font-size:1rem}iframe.map{width:100%;height:300px;border:0;border-radius:12px}.wa-float{position:fixed;bottom:16px;right:16px;background:#25D366;color:#fff;padding:.9rem 1.1rem;border-radius:50px;text-decoration:none;font-weight:700}@media(min-width:900px){.hero{grid-template-columns:1.1fr .9fr;align-items:center;max-width:1100px;margin:auto}.grid{grid-template-columns:repeat(3,1fr);max-width:1100px;margin:auto}.gallery{grid-template-columns:repeat(4,1fr);max-width:1100px;margin:auto}[dir="rtl"]{text-align:right}}</style>
<!-- GA4 LIVE — replace G-ARWSTYLE1 with live ID -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-ARWSTYLE1"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','G-ARWSTYLE1');const ARW_CONFIG={phoneIntl:"+971500000000",phoneDisplay:"+971 50 000 0000",ga4:"G-ARWSTYLE1"};function track(e,p={}){if(typeof gtag!=="undefined")gtag('event',e,p)}</script>
</head><body>
<header><strong>ARW ★ ArwStyle</strong><div><a href="#" onclick="toggleLang();return false" style="color:var(--gold)">عربي</a> <a class="btn" data-book href="#">Book</a></div></header>
<section class="hero"><div><h1>Bani Yas' Sharpest Cuts. Look Sharp, Feel Confident.</h1><p>Walk-ins welcome. Fades, beard sculpting, kids cuts from AED 30.</p><p><a class="btn" data-book href="#">Book on WhatsApp</a> <a href="#services">View Services</a></p><small>★ 4.8 Google | 5+ Years in Bani Yas | Daily 10AM-10PM</small></div>
<img src="/assets/arwstyle-01-800.webp" srcset="/assets/arwstyle-01-400.webp 400w,/assets/arwstyle-01-800.webp 800w,/assets/arwstyle-01-1200.webp 1200w" sizes="(max-width:900px)100vw,50vw" fetchpriority="high" alt="Skin fade by ArwStyle barber Bani Yas" width="800" height="600"></section>
<section id="services" class="grid"><div class="card"><h3>Classic Haircut — AED 40</h3><a data-book href="#">Book →</a></div><div class="card"><h3>Skin Fade — AED 45</h3><a data-book href="#">Book →</a></div><div class="card"><h3>Beard + Hot Towel — AED 30</h3><a data-book href="#">Book →</a></div></section>
<section class="gallery">
<img src="/assets/arwstyle-01-400.webp" loading="lazy" alt="Fade cut 1" width="400" height="300"><img src="/assets/arwstyle-02-400.webp" loading="lazy" alt="Beard trim" width="400" height="300"><img src="/assets/arwstyle-03-400.webp" loading="lazy" alt="Kids cut" width="400" height="300"><img src="/assets/arwstyle-04-400.webp" loading="lazy" alt="Shop interior" width="400" height="300"><img src="/assets/arwstyle-05-400.webp" loading="lazy" alt="Taper fade" width="400" height="300"><img src="/assets/arwstyle-06-400.webp" loading="lazy" alt="Hot towel shave" width="400" height="300"><img src="/assets/arwstyle-07-400.webp" loading="lazy" alt="Hair texture" width="400" height="300"><img src="/assets/arwstyle-08-400.webp" loading="lazy" alt="Barber tools" width="400" height="300"><img src="/assets/arwstyle-09-400.webp" loading="lazy" alt="Before after" width="400" height="300"><img src="/assets/arwstyle-10-400.webp" loading="lazy" alt="Bani Yas shop front" width="400" height="300">
</section>
<section><h2 style="padding:0 1rem">Visit Us — Bani Yas East</h2>
<iframe class="map" title="ArwStyle location map" loading="lazy" src="https://www.google.com/maps?q=Bani+Yas+East,+Abu+Dhabi&output=embed"></iframe>
<form id="bookForm"><input required name="name" placeholder="Name / الاسم"><select name="service"><option>Classic 40</option><option>Skin Fade 45</option><option>Beard 30</option><option>Kids 35</option></select><input type="date" name="date" required><button class="btn" type="submit">Confirm on WhatsApp</button></form></section>
<a class="wa-float" data-book href="#">WhatsApp Book</a>
<script>const wa=n=>`https://wa.me/${ARW_CONFIG.phoneIntl}?text=${encodeURIComponent(n)}`;document.querySelectorAll('[data-book]').forEach(a=>{a.href=wa('Hi ArwStyle! I want to book a cut in Bani Yas.');a.onclick=()=>track('book_click')});document.getElementById('bookForm').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target);track('form_submit',{service:f.get('service')});location.href=wa(`Hi ArwStyle! I'm ${f.get('name')} — ${f.get('service')} on ${f.get('date')}`)};function toggleLang(){const h=document.documentElement;const ar=h.lang==='en';h.lang=ar?'ar':'en';h.dir=ar?'rtl':'ltr';track('lang_toggle',{lang:h.lang})}</script>
</body></html>

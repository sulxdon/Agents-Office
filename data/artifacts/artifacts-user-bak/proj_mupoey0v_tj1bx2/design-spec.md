# Arwstyle Landing Page — Design Spec (Bani Yas)

**Concept:** Premium neighborhood style studio — modern Arabic-inspired minimalism. Trustworthy, clean, masculine-neutral. One-page conversion focus: Book Now.

## 1. Brand Styling
**Palette:**
- Charcoal Black #111214 (hero bg, text)
- Warm Gold #C9A86A (primary CTA, accents, dividers)
- Cream #F9F6F0 (section bg)
- Stone Grey #6B7280 (secondary text)
- White #FFFFFF + Success Green #1F9D55 for WhatsApp CTA

**Typography:** Headings: 'Playfair Display' or 'Marcellus' (elegant serif). Body/UI: 'Inter' / 'IBM Plex Sans'. Arabic fallback: 'Cairo'.
H1 48-64px, H2 32-40px, Body 16-18px, line-height 1.6.

**Style:** 12px radius cards, soft shadows, 1px gold hairlines, generous whitespace (80px section padding desktop / 48px mobile). Rounded pill buttons. Icons: line-style (scissors, razor, beard, facial).

## 2. Wireframe Structure
```
[Sticky Nav: Logo ARWSTYLE | Services Location Reviews Contact | [Book Now]]
[HERO: Left copy + CTAs + rating | Right hero image w/ gold frame + floating card]
[Trust bar: ★4.9 | 2000+ Clients | Bani Yas, Abu Dhabi]
[Services: 4 cards grid]
[Why Us / Location: Split - image + map info + hours]
[Testimonials: 3 cards carousel]
[Contact CTA: Dark panel - Call / WhatsApp / Booking form]
[Footer: links, hours, address, socials]
```

## 3. Section Specs
**A. Nav (sticky, blur):** Logo left (ARW in serif + STYLE in gold). Links anchor-scroll. CTA button gold pill. Mobile: hamburger.

**B. Hero (100vh, charcoal + texture):** Left: eyebrow "BANI YAS • ABU DHABI", H1 "Sharp Looks. Signature Style.", sub "Arwstyle — cuts, beard sculpting & grooming in the heart of Bani Yas.", CTAs: [Book Appointment - gold] [WhatsApp - outline]. Social proof: ★★★★★ 4.9 (300+ Google reviews). Right: portrait image (barber/client), gold offset border, floating card "Open Today 10AM-10PM".

**C. Services (cream bg, 4 cards):** 1. Precision Haircut 35 AED+, 2. Beard Sculpt & Hot Towel, 3. Kids Cut, 4. Facial & Cleanup. Each: icon, title, 1-line desc, price, "from". Hover: lift + gold border.

**D. Location Info (white, split 50/50):** Left: shop photo + badge "Bani Yas East 9". Right: H2 "Find Us in Bani Yas", address, hours table (Sat-Thu 10-10, Fri 2-10), phone, embedded map placeholder + [Get Directions] button.

**E. Testimonials (cream):** 3 cards: name, stars, quote, "Google review". e.g. Ahmed K. "Best fade in Bani Yas..." Slider dots on mobile.

**F. Contact CTA (charcoal + gold):** H2 "Ready for Your Best Look?" + phone big, buttons: Call Now / WhatsApp. Mini form: Name + Phone + Service dropdown + [Confirm Booking]. Note: "We confirm on WhatsApp in 5 mins."

## 4. Responsive & Handoff
Desktop 1200px max-width, 12-col. Tablet: 2-col services. Mobile 375px: stack all, sticky bottom Book bar. Images: WebP, alt text. Accessibility: 4.5:1 contrast, focus states, tap targets 44px.

Dev assets: Use Tailwind + Google Fonts above, hero image unsplash barbershop, icons Lucide.

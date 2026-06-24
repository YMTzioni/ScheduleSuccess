# ScheduleSuccess

מערכת הפקת מסמכים רשמיים למכללת סאקסס — בניית מערכת שעות, מסלולי לימוד והדפסה/PDF.

## התקנה

```bash
npm install
```

## הרצה

```bash
npm run dev
```

## פריסה (GitHub Pages)

האתר זמין בכתובת: **https://ymtzioni.github.io/ScheduleSuccess/**

בכל push לענף `main` מתבצע build ופריסה אוטומטית.

ב-GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**

```bash
# בדיקת build מקומי כמו ב-GitHub Pages
$env:GITHUB_PAGES='true'; npm run build; npm run preview
```

## בדיקות

```bash
npm run test:e2e
```

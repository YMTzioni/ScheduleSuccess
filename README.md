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

האתר: **https://ymtzioni.github.io/ScheduleSuccess/**

בכל push ל-`main` נבנה הפרויקט ויפורסם אוטומטית לענף `gh-pages`.

### הגדרה חד-פעמית ב-GitHub

**Settings → Pages → Build and deployment**

| שדה | ערך |
|-----|-----|
| Source | **Deploy from a branch** |
| Branch | **gh-pages** |
| Folder | **/ (root)** |

> חשוב: אל תבחר `main` — שם נמצא קוד המקור ולא האתר המבונה.

```bash
# בדיקת build מקומי כמו ב-GitHub Pages
$env:GITHUB_PAGES='true'; npm run build; npm run preview
```

## בדיקות

```bash
npm run test:e2e
```

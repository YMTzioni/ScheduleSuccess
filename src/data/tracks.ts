import type { Track } from '../types';
import fullstackData from './courses/Fullstack.json';
import aiDevData from './courses/AI DEV.json';
import aiProData from './courses/Ai Pro.json';
import cyberData from './courses/Cyber.json';
import qaData from './courses/QA.json';
import dataAnalystData from './courses/Data Analyst.json';

interface CourseFile {
  courses: { title: string; lessons: string[] }[];
}

function fromCourseFile(
  id: string,
  name: string,
  description: string,
  data: CourseFile,
  subtitle?: string,
): Track {
  return {
    id,
    name,
    subtitle,
    description,
    modules: data.courses.map((c) => ({
      title: c.title,
      lessons: c.lessons,
    })),
  };
}

export const TRACKS: Track[] = [
  fromCourseFile(
    'fullstack',
    'Full Stack',
    'מפתחי Full Stack מיומנים הן בשפות חזית כמו גם בסביבות שרת, רשת ואירוח. כדי להגיע לרוחב ולעומק הידע הזה, רוב המפתחים יעבירו שנים רבות בעבודה במגוון תפקידים שונים. הם גם נוטים להיות בקיאים הן בהיגיון העסקי והן בחוויית המשתמש, כלומר, הם לא רק מצוידים היטב בידע הטכני, אלא גם יכולים להדריך ולייעץ לגבי אסטרטגיה עסקית ושיווקית. מסלול ה-Full Stack מורכב מקורס מרכזי אשר מאגד תחתיו את כל הנושאים החשובים ביותר בתחום התכנות והפיתוח – שליטה במיומנויות בניית אתרים, שיטות עבודה מומלצות בעיצוב קוד לשימוש חוזר, ביצועים ותחזוקה, תכנות חזיתי / צד לקוח באמצעות ReactJS.',
    fullstackData,
    'תכנות ופיתוח',
  ),
  fromCourseFile(
    'ai-dev',
    'בינה מלאכותית (AI)',
    'קורס זה נועד לספק לכם בסיס איתן בבינה מלאכותית (AI) ומכונה לומדת (ML) ומרכיביה השונים. בנוסף לכך, תרכשו ידע מיסודות התכנות של Python ועד למידת מכונה מתקדמת וטכניקות למידה עמוקה, לצד המיומנויות והידע הדרושים כדי לצאת למסע מוצלח בתחום הבינה המלאכותית. במהלך הקורס נחקור נושאים כמו ניתוח נתונים, הדמיית נתונים, הצגות נתונים, בניית מערכות המלצה וענן – מה שיאפשר לנו לפתח פתרונות AI מעשיים.',
    aiDevData,
    'תכנות ופיתוח בינה מלאכותית',
  ),
  fromCourseFile(
    'ai-pro',
    'AI Pro',
    'מסלול מתקדם לשימוש מעשי בכלי בינה מלאכותית בעבודה היומיומית, יצירת תוכן, אוטומציה עסקית, Prompt Engineering ופיתוח אפליקציות AI מתקדמות.',
    aiProData,
  ),
  fromCourseFile(
    'cyber',
    'סייבר',
    'מסלול מקיף לאבטחת מידע וסייבר – מיסודות אבטחת מחשבים, רשתות ומערכות הפעלה, דרך פורנזיקה ועד בדיקות חדירה (Penetration Testing) וניהול קריירה בתחום.',
    cyberData,
  ),
  fromCourseFile(
    'qa',
    'בדיקות תוכנה (QA)',
    'מסלול מקיף לבדיקות תוכנה – מעקרונות הבדיקה וניתוח מערכות, דרך כתיבת מסמכי בדיקות ו-SQL, ועד אוטומציה, בדיקות API והכנה לראיונות עבודה והסמכת ISTQB.',
    qaData,
  ),
  fromCourseFile(
    'data-analyst',
    'Data Analyst',
    'מסלול מדעי הנתונים לניתוח עסקי – SQL מתקדם, Python ו-Pandas, Excel ו-Power BI, כולל פרויקט גמר מעשי.',
    dataAnalystData,
    'מדעי הנתונים',
  ),
];

export function getLessonsForTracks(
  trackIds: string[],
): { lesson: string; trackName: string; moduleTitle: string }[] {
  const result: { lesson: string; trackName: string; moduleTitle: string }[] = [];

  for (const trackId of trackIds) {
    const track = TRACKS.find((t) => t.id === trackId);
    if (!track) continue;

    for (const mod of track.modules) {
      for (const lesson of mod.lessons) {
        result.push({
          lesson,
          trackName: track.name,
          moduleTitle: mod.title,
        });
      }
    }
  }

  return result;
}

export function getTotalLessonCount(trackIds: string[]): number {
  return getLessonsForTracks(trackIds).length;
}

import { HebrewCalendar, flags, type Event } from '@hebcal/core';
import { addYears, format, parseISO } from 'date-fns';

// Which days have no classes. Every day off is named here on purpose: the
// calendar library also lists minor and memorial days (Chanukah, fast days,
// Sigd, Herzl Day…) that are ordinary working days in Israel, and taking a
// whole category off left about 40 working days a year without lessons.
export type HolidayGroupId =
  | 'rosh-hashana'
  | 'yom-kippur'
  | 'sukkot'
  | 'sukkot-chol-hamoed'
  | 'pesach'
  | 'pesach-chol-hamoed'
  | 'shavuot'
  | 'erev-chag'
  | 'purim'
  | 'yom-hazikaron'
  | 'yom-haatzmaut'
  | 'yom-hashoah'
  | 'tisha-bav'
  | 'chanukah'
  | 'fasts'
  | 'lag-baomer'
  | 'yom-yerushalayim'
  | 'national-days';

export interface HolidayGroup {
  id: HolidayGroupId;
  label: string;
  defaultOff: boolean;
  matches: (event: Event) => boolean;
}

const EREV_OF_CHAG = new Set(['Rosh Hashana', 'Yom Kippur', 'Sukkot', 'Pesach', 'Shavuot']);
const NATIONAL_DAYS = new Set([
  'Sigd',
  'Ben-Gurion Day',
  'Hebrew Language Day',
  'Family Day',
  'Yom HaAliyah',
  'Yom HaAliyah School Observance',
  'Herzl Day',
  'Jabotinsky Day',
  'Yitzhak Rabin Memorial Day',
]);

const has = (event: Event, flag: number) => (event.getFlags() & flag) !== 0;
const isErev = (event: Event) => has(event, flags.EREV);
const named = (event: Event, name: string) => event.basename() === name && !isErev(event);

export const HOLIDAY_GROUPS: HolidayGroup[] = [
  { id: 'rosh-hashana', label: 'ראש השנה', defaultOff: true, matches: (e) => named(e, 'Rosh Hashana') },
  { id: 'yom-kippur', label: 'יום כיפור', defaultOff: true, matches: (e) => named(e, 'Yom Kippur') },
  {
    id: 'sukkot',
    label: 'סוכות ושמחת תורה',
    defaultOff: true,
    matches: (e) => (named(e, 'Sukkot') && has(e, flags.CHAG)) || named(e, 'Shmini Atzeret'),
  },
  {
    id: 'sukkot-chol-hamoed',
    label: 'חול המועד סוכות',
    defaultOff: true,
    matches: (e) => named(e, 'Sukkot') && has(e, flags.CHOL_HAMOED),
  },
  {
    id: 'pesach',
    label: 'פסח (ראשון ושביעי)',
    defaultOff: true,
    matches: (e) => named(e, 'Pesach') && has(e, flags.CHAG),
  },
  {
    id: 'pesach-chol-hamoed',
    label: 'חול המועד פסח',
    defaultOff: true,
    matches: (e) => named(e, 'Pesach') && has(e, flags.CHOL_HAMOED),
  },
  { id: 'shavuot', label: 'שבועות', defaultOff: true, matches: (e) => named(e, 'Shavuot') },
  {
    id: 'erev-chag',
    label: 'ערבי חג (ראש השנה, כיפור, סוכות, פסח, שבועות)',
    defaultOff: true,
    matches: (e) => isErev(e) && EREV_OF_CHAG.has(e.basename()),
  },
  { id: 'purim', label: 'פורים', defaultOff: true, matches: (e) => named(e, 'Purim') },
  { id: 'yom-hazikaron', label: 'יום הזיכרון', defaultOff: true, matches: (e) => named(e, 'Yom HaZikaron') },
  { id: 'yom-haatzmaut', label: 'יום העצמאות', defaultOff: true, matches: (e) => named(e, "Yom HaAtzma'ut") },
  { id: 'yom-hashoah', label: 'יום השואה', defaultOff: false, matches: (e) => named(e, 'Yom HaShoah') },
  { id: 'tisha-bav', label: 'תשעה באב', defaultOff: false, matches: (e) => named(e, "Tish'a B'Av") },
  { id: 'chanukah', label: 'חנוכה (כל 8 הימים)', defaultOff: false, matches: (e) => e.basename() === 'Chanukah' },
  {
    id: 'fasts',
    label: 'צומות (גדליה, עשרה בטבת, אסתר, בכורות, י"ז בתמוז)',
    defaultOff: false,
    matches: (e) => has(e, flags.MINOR_FAST),
  },
  { id: 'lag-baomer', label: 'ל"ג בעומר', defaultOff: false, matches: (e) => named(e, 'Lag BaOmer') },
  { id: 'yom-yerushalayim', label: 'יום ירושלים', defaultOff: false, matches: (e) => named(e, 'Yom Yerushalayim') },
  {
    id: 'national-days',
    label: 'ימים ממלכתיים (סיגד, בן-גוריון, הרצל, רבין ועוד)',
    defaultOff: false,
    matches: (e) => NATIONAL_DAYS.has(e.basename()),
  },
];

export interface ExtraDayOff {
  date: string;
  label: string;
}

export interface HolidayPolicy {
  off: Record<HolidayGroupId, boolean>;
  // Closures the calendar does not know: election day, a college break…
  extraDays: ExtraDayOff[];
}

export const DEFAULT_HOLIDAY_POLICY: HolidayPolicy = {
  off: Object.fromEntries(HOLIDAY_GROUPS.map((g) => [g.id, g.defaultOff])) as Record<
    HolidayGroupId,
    boolean
  >,
  extraDays: [],
};

export interface HolidayInfo {
  date: string;
  title: string;
}

// Holidays are looked up a few years past the requested end, so a schedule
// that runs on beyond its first estimate never lands on a holiday unchecked.
const LOOKAHEAD_YEARS = 3;

export function getIsraeliHolidays(
  startDate: string,
  endDate: string,
  policy: HolidayPolicy = DEFAULT_HOLIDAY_POLICY,
): Map<string, HolidayInfo[]> {
  const events = HebrewCalendar.calendar({
    start: parseISO(startDate),
    end: addYears(parseISO(endDate), LOOKAHEAD_YEARS),
    il: true,
    candlelighting: false,
    sedrot: false,
    omer: false,
  });

  const activeGroups = HOLIDAY_GROUPS.filter((g) => policy.off[g.id]);
  const holidayMap = new Map<string, HolidayInfo[]>();
  const add = (date: string, title: string) => {
    const existing = holidayMap.get(date) ?? [];
    existing.push({ date, title });
    holidayMap.set(date, existing);
  };

  for (const event of events) {
    if (!activeGroups.some((g) => g.matches(event))) continue;
    add(format(event.getDate().greg(), 'yyyy-MM-dd'), event.render('he'));
  }
  for (const extra of policy.extraDays) {
    if (extra.date) add(extra.date, extra.label || 'יום ללא לימודים');
  }

  return holidayMap;
}

export function isStudyDay(
  date: Date,
  holidayMap: Map<string, HolidayInfo[]>,
): { allowed: boolean; reason?: string } {
  const day = date.getDay();
  if (day === 6) {
    return { allowed: false, reason: 'שבת' };
  }

  const dateKey = format(date, 'yyyy-MM-dd');
  const holidays = holidayMap.get(dateKey);
  if (holidays && holidays.length > 0) {
    return {
      allowed: false,
      reason: holidays.map((h) => h.title).join(', '),
    };
  }

  return { allowed: true };
}

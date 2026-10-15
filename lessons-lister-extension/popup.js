const scanAllBtn = document.getElementById('scanAllBtn');
const downloadAllBtn = document.getElementById('downloadAllBtn');
const scanBtn = document.getElementById('scanBtn');
const copyBtn = document.getElementById('copyBtn');
const downloadJsonBtn = document.getElementById('downloadJsonBtn');
const statusEl = document.getElementById('status');
const outputEl = document.getElementById('output');
const reportEl = document.getElementById('report');
const reportSummaryEl = document.getElementById('reportSummary');
const problemsEl = document.getElementById('problems');
const reportRowsEl = document.getElementById('reportRows');
const excludedDetailsEl = document.getElementById('excludedDetails');
let lastScanResult = null;
let lastFullScan = null;

function setStatus(text) {
  statusEl.textContent = text;
}

function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function downloadJson(payload, fileName) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function stamp() {
  return new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
}

const REASON_LABELS = {
  exam: 'מבחן',
  survey: 'משוב',
  'סינון לפי שם': 'לפי שם',
  'כפול': 'כפול',
};

function renderFullScan(scan) {
  lastFullScan = scan;
  reportEl.hidden = false;

  const tracks = scan.tracks ?? [];
  const courseCount = tracks.reduce((sum, t) => sum + t.courses.length, 0);
  const lessonCount = tracks.reduce((sum, t) => sum + t.lessonCount, 0);
  const when = new Date(scan.exportedAt).toLocaleString('he-IL');

  reportSummaryEl.textContent = scan.problems.length
    ? `⚠ ${tracks.length} מסלולים, ${courseCount} קורסים, ${lessonCount} שיעורים — ${scan.problems.length} בעיות לבדיקה (${when})`
    : `✓ ${tracks.length} מסלולים, ${courseCount} קורסים, ${lessonCount} שיעורים — הכל נטען (${when})`;
  reportSummaryEl.className = `report-summary ${scan.problems.length ? 'warn' : 'ok'}`;

  problemsEl.replaceChildren(...scan.problems.map((p) => el('li', p)));

  reportRowsEl.replaceChildren(
    ...tracks.map((track) => {
      const row = el('tr');
      const loaded = track.courses.length + (track.skippedCourses ?? 0);
      const complete = loaded === track.expectedCourses;
      row.append(
        el('td', track.name),
        el('td', `${loaded}/${track.expectedCourses}`, complete ? '' : 'bad'),
        el('td', String(track.lessonCount), track.lessonCount ? '' : 'bad'),
        el('td', String(track.excluded.length)),
      );
      return row;
    }),
  );

  excludedDetailsEl.replaceChildren(
    ...tracks
      .filter((track) => track.excluded.length)
      .map((track) => {
        const details = el('details', undefined, 'excluded');
        details.append(el('summary', `מה סונן ב"${track.name}" (${track.excluded.length})`));
        const list = el('ul');
        for (const item of track.excluded) {
          list.append(
            el('li', `${item.name} — ${REASON_LABELS[item.reason] ?? item.reason} · ${item.course}`),
          );
        }
        details.append(list);
        return details;
      }),
  );
}

function formatResult(result) {
  if (!result?.courses?.length) {
    const debugText = result?.debug
      ? `\n\n[Debug]\nנמצאו קישורים: ${result.debug.discoveredLinks}\nנסרקו: ${result.debug.visited}\nדולגו בלי שיעורים: ${result.debug.skippedNoLessons}`
      : '';
    return `לא נמצאו שיעורים.${debugText}`;
  }

  return result.courses
    .map((course, index) => {
      const lessons = course.lessons.length
        ? course.lessons.map((lesson) => `  - ${lesson}`).join('\n')
        : '  - (לא נמצאו שיעורים)';
      return `${index + 1}. ${course.title}\n${lessons}`;
    })
    .join('\n\n');
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('לא נמצאה לשונית פעילה');
  return tab;
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'SCAN_PROGRESS') setStatus(`סורק… ${message.text}`);
});

chrome.storage.local.get('lastFullScan').then(({ lastFullScan: saved }) => {
  if (saved) {
    renderFullScan(saved);
    setStatus('מוצגת הסריקה המלאה האחרונה.');
  }
});

scanAllBtn.addEventListener('click', async () => {
  scanAllBtn.disabled = true;
  setStatus('מתחיל סריקה מלאה...');

  try {
    const tab = await getActiveTab();
    const response = await chrome.runtime.sendMessage({ type: 'START_FULL_SCAN', tabId: tab.id });
    if (!response?.ok) throw new Error(response?.error || 'שגיאה לא ידועה');
    renderFullScan(response.data);
    setStatus('הסריקה המלאה הסתיימה.');
  } catch (error) {
    setStatus(`שגיאה: ${error.message}`);
  } finally {
    scanAllBtn.disabled = false;
  }
});

downloadAllBtn.addEventListener('click', () => {
  if (!lastFullScan) return;
  downloadJson(lastFullScan, `all-tracks-${stamp()}.json`);
  setStatus('קובץ JSON ירד בהצלחה.');
});

scanBtn.addEventListener('click', async () => {
  scanBtn.disabled = true;
  outputEl.value = '';
  setStatus('מתחיל סריקה...');

  try {
    const tab = await getActiveTab();
    const response = await chrome.runtime.sendMessage({
      type: 'START_SCAN',
      tabId: tab.id,
      startUrl: tab.url,
    });

    if (!response?.ok) {
      throw new Error(response?.error || 'שגיאה לא ידועה');
    }

    lastScanResult = response.data;
    outputEl.value = formatResult(response.data);
    const debug = response.data.debug;
    setStatus(
      `הסריקה הסתיימה: ${response.data.courses.length} קורסים, מתוך ${debug?.visited ?? 0} שנבדקו.`
    );
  } catch (error) {
    setStatus(`שגיאה: ${error.message}`);
  } finally {
    scanBtn.disabled = false;
  }
});

downloadJsonBtn.addEventListener('click', () => {
  if (!lastScanResult) {
    setStatus('אין נתונים לייצוא עדיין. הרץ סריקה קודם.');
    return;
  }

  try {
    downloadJson(
      { exportedAt: new Date().toISOString(), ...lastScanResult },
      `lessons-list-${stamp()}.json`,
    );
    setStatus('קובץ JSON ירד בהצלחה.');
  } catch {
    setStatus('נכשל ייצוא JSON.');
  }
});

copyBtn.addEventListener('click', async () => {
  if (!outputEl.value.trim()) {
    setStatus('אין מה להעתיק עדיין.');
    return;
  }

  try {
    await navigator.clipboard.writeText(outputEl.value);
    setStatus('הרשימה הועתקה ללוח.');
  } catch {
    setStatus('לא הצלחתי להעתיק ללוח.');
  }
});
